-- IPS Project 5.6.2 — enforce one active top-level Team in direct roster operations.

begin;

alter table public.player_transfer_requests
  add column if not exists requested_shirt_number smallint
  check (requested_shirt_number is null or (requested_shirt_number between 0 and 999));

create or replace function public.ips_request_existing_player_for_team(
  p_team_id uuid,
  p_player_id uuid,
  p_shirt_number smallint default null
)
returns jsonb
language plpgsql security definer
set search_path=public,auth as $$
declare
  v_target_team_identity uuid;
  v_current_team_identity uuid;
  v_current_side uuid;
  v_transfer uuid;
  v_membership uuid;
begin
  if not public.ips_can_manage_team(p_team_id) then
    raise exception 'Not authorised to manage this competitive side.';
  end if;
  if p_shirt_number is not null and (p_shirt_number<0 or p_shirt_number>999) then
    raise exception 'Shirt number must be between 0 and 999.';
  end if;
  if not exists(select 1 from public.players where id=p_player_id and status='ACTIVE') then
    raise exception 'Player not found.';
  end if;

  select club_id into v_target_team_identity
  from public.teams
  where id=p_team_id and status='ACTIVE';
  if v_target_team_identity is null then raise exception 'Target competitive side not found.'; end if;

  if exists(
    select 1 from public.team_memberships
    where player_id=p_player_id and team_id=p_team_id and status='ACTIVE' and end_on is null
  ) then
    raise exception 'This player is already active on this side.';
  end if;

  select t.club_id,tm.team_id
  into v_current_team_identity,v_current_side
  from public.team_memberships tm
  join public.teams t on t.id=tm.team_id
  where tm.player_id=p_player_id and tm.status='ACTIVE' and tm.end_on is null
  order by tm.is_primary desc,tm.start_on desc
  limit 1;

  if v_current_team_identity is null then
    insert into public.team_memberships(player_id,team_id,start_on,shirt_number,status,is_primary,team_role)
    select p_player_id,p_team_id,current_date,p_shirt_number,'ACTIVE',true,coalesce(nullif(trim(p.primary_role),''),'Player')
    from public.players p where p.id=p_player_id
    returning id into v_membership;

    insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
    values(auth.uid(),'TEAM_MEMBERSHIP_ADDED','PLAYER',p_player_id,
      jsonb_build_object('team_id',p_team_id,'membership_id',v_membership,'source','DIRECT_ROSTER'));

    return jsonb_build_object('status','ADDED','membership_id',v_membership);
  end if;

  if v_current_team_identity=v_target_team_identity then
    -- Moving between A/B/C is an internal side move. A side-only admin cannot take
    -- a player from another side unless they also control the current side or whole Team.
    if not (
      public.ips_can_manage_club(v_target_team_identity)
      or public.ips_can_manage_team(v_current_side)
    ) then
      raise exception 'This player is active on another side of the same Team. A Team-level admin or the current side admin must move them.';
    end if;

    update public.team_memberships
      set end_on=current_date,status='FORMER',is_primary=false,updated_at=now()
    where player_id=p_player_id and team_id=v_current_side and status='ACTIVE' and end_on is null;

    insert into public.team_memberships(player_id,team_id,start_on,shirt_number,status,is_primary,team_role)
    select p_player_id,p_team_id,current_date,p_shirt_number,'ACTIVE',true,coalesce(nullif(trim(p.primary_role),''),'Player')
    from public.players p where p.id=p_player_id
    returning id into v_membership;

    insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
    values(auth.uid(),'PLAYER_SIDE_MOVED','PLAYER',p_player_id,
      jsonb_build_object('from_side_id',v_current_side,'to_side_id',p_team_id,'membership_id',v_membership));

    return jsonb_build_object('status','SIDE_MOVED','membership_id',v_membership);
  end if;

  insert into public.player_transfer_requests(
    player_id,from_team_identity_id,from_side_id,to_team_identity_id,to_side_id,
    requested_by,status,note,requested_shirt_number
  )
  values(
    p_player_id,v_current_team_identity,v_current_side,v_target_team_identity,p_team_id,
    auth.uid(),'REQUESTED','Requested from Team roster management',p_shirt_number
  )
  on conflict (player_id,to_team_identity_id) where status in ('REQUESTED','RELEASED')
  do update set
    to_side_id=excluded.to_side_id,
    requested_by=excluded.requested_by,
    requested_shirt_number=excluded.requested_shirt_number,
    updated_at=now()
  returning id into v_transfer;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(auth.uid(),'PLAYER_TRANSFER_REQUESTED','PLAYER',p_player_id,
    jsonb_build_object('transfer_id',v_transfer,'from_team',v_current_team_identity,'to_team',v_target_team_identity,'to_side',p_team_id));

  return jsonb_build_object('status','TRANSFER_REQUIRED','transfer_id',v_transfer);
end $$;

-- Final transfer uses the shirt number requested by the destination roster manager.
create or replace function public.ips_finalize_transfer(p_transfer_id uuid,p_approve boolean,p_note text default null)
returns void
language plpgsql security definer
set search_path=public,auth as $$
declare tr public.player_transfer_requests; v_allowed boolean;
begin
  select * into tr from public.player_transfer_requests where id=p_transfer_id for update;
  if not found then raise exception 'Transfer not found.'; end if;
  v_allowed:=public.ips_is_owner() or public.ips_has_role('ADMIN','GLOBAL',null)
    or exists(select 1 from public.clubs c where c.id=tr.to_team_identity_id and public.ips_has_role('ADMIN','CITY',c.city_id));
  if not v_allowed then raise exception 'A destination City Admin or Global Admin must finalise this transfer.'; end if;
  if tr.status<>'RELEASED' and not (public.ips_is_owner() or public.ips_has_role('ADMIN','GLOBAL',null)) then
    raise exception 'The current Team must release the player first.';
  end if;

  if not p_approve then
    update public.player_transfer_requests set status='REJECTED',final_review_by=auth.uid(),final_review_at=now(),
      note=coalesce(nullif(trim(coalesce(p_note,'')),''),note),updated_at=now()
    where id=p_transfer_id;
    return;
  end if;

  update public.team_memberships tm
  set end_on=current_date,status='FORMER',is_primary=false,updated_at=now()
  from public.teams t
  where tm.team_id=t.id and tm.player_id=tr.player_id and tm.status='ACTIVE' and tm.end_on is null and t.club_id<>tr.to_team_identity_id;

  update public.team_memberships tm
  set end_on=current_date,status='FORMER',is_primary=false,updated_at=now()
  from public.teams t
  where tm.team_id=t.id and tm.player_id=tr.player_id and tm.status='ACTIVE' and tm.end_on is null
    and t.club_id=tr.to_team_identity_id and tm.team_id<>tr.to_side_id;

  if not exists(select 1 from public.team_memberships where player_id=tr.player_id and team_id=tr.to_side_id and status='ACTIVE' and end_on is null) then
    insert into public.team_memberships(player_id,team_id,start_on,shirt_number,status,is_primary,team_role)
    select tr.player_id,tr.to_side_id,current_date,tr.requested_shirt_number,'ACTIVE',true,coalesce(nullif(trim(p.primary_role),''),'Player')
    from public.players p where p.id=tr.player_id;
  end if;

  update public.player_transfer_requests
  set status='APPROVED',final_review_by=auth.uid(),final_review_at=now(),
      note=coalesce(nullif(trim(coalesce(p_note,'')),''),note),updated_at=now()
  where id=p_transfer_id;

  if tr.player_registration_request_id is not null then
    update public.player_registration_requests set status='APPROVED',updated_at=now()
    where id=tr.player_registration_request_id;
  end if;
  if tr.team_request_member_id is not null then
    update public.team_request_members set status='APPROVED',updated_at=now()
    where id=tr.team_request_member_id;
  end if;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(auth.uid(),'PLAYER_TRANSFER_APPROVED','PLAYER',tr.player_id,
    jsonb_build_object('transfer_id',tr.id,'from_team',tr.from_team_identity_id,'to_team',tr.to_team_identity_id,'to_side',tr.to_side_id));
end $$;

revoke all on function public.ips_request_existing_player_for_team(uuid,uuid,smallint) from public,anon;
grant execute on function public.ips_request_existing_player_for_team(uuid,uuid,smallint) to authenticated;

-- Prevent bypass of the one-active-Team rule through the older direct-add RPC.
revoke execute on function public.ips_add_existing_player_to_team(uuid,uuid,smallint) from authenticated;

notify pgrst,'reload schema';
commit;
