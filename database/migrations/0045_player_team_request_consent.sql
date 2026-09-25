-- IPS player recruitment consent workflow.
-- Team managers may search any registered player but cannot place them on a roster directly.

begin;

create table if not exists public.player_team_requests(
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete restrict,
  from_team_identity_id uuid references public.clubs(id) on delete restrict,
  from_side_id uuid references public.teams(id) on delete set null,
  to_team_identity_id uuid not null references public.clubs(id) on delete restrict,
  to_side_id uuid not null references public.teams(id) on delete restrict,
  requested_by uuid references auth.users(id) on delete set null,
  requested_shirt_number smallint check(requested_shirt_number is null or requested_shirt_number between 0 and 999),
  request_type text not null check(request_type in ('JOIN','TRANSFER','SIDE_MOVE')),
  status text not null default 'PENDING' check(status in ('PENDING','APPROVED','REJECTED','CANCELLED')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  decision_actor_type text check(decision_actor_type is null or decision_actor_type in ('PLAYER','CURRENT_TEAM','CITY_ADMIN','GLOBAL_ADMIN','OWNER')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_open_player_team_request
on public.player_team_requests(player_id,to_team_identity_id)
where status='PENDING';
create index if not exists ix_player_team_requests_player_status on public.player_team_requests(player_id,status);
create index if not exists ix_player_team_requests_from_team_status on public.player_team_requests(from_team_identity_id,status);
create index if not exists ix_player_team_requests_to_team_status on public.player_team_requests(to_team_identity_id,status);

alter table public.player_team_requests enable row level security;
revoke all on table public.player_team_requests from anon,authenticated;
grant select on table public.player_team_requests to service_role;

create or replace function public.ips_request_existing_player_for_team(
  p_team_id uuid,
  p_player_id uuid,
  p_shirt_number smallint default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_target_team_identity uuid;
  v_current_team_identity uuid;
  v_current_side uuid;
  v_request_type text;
  v_request_id uuid;
  v_current_team_name text;
begin
  if not public.ips_can_manage_team(p_team_id) then
    raise exception 'Not authorised to manage this competitive side.';
  end if;
  if p_shirt_number is not null and (p_shirt_number<0 or p_shirt_number>999) then
    raise exception 'Shirt number must be between 0 and 999.';
  end if;
  if not exists(select 1 from public.players p where p.id=p_player_id and p.status='ACTIVE') then
    raise exception 'Player not found.';
  end if;

  select t.club_id into v_target_team_identity
  from public.teams t
  where t.id=p_team_id and t.status='ACTIVE';
  if v_target_team_identity is null then raise exception 'Target competitive side not found.'; end if;

  if exists(
    select 1 from public.team_memberships tm
    where tm.player_id=p_player_id and tm.team_id=p_team_id and tm.status='ACTIVE' and tm.end_on is null
  ) then
    raise exception 'This player is already active on this side.';
  end if;

  select t.club_id,tm.team_id,c.name
  into v_current_team_identity,v_current_side,v_current_team_name
  from public.team_memberships tm
  join public.teams t on t.id=tm.team_id
  join public.clubs c on c.id=t.club_id
  where tm.player_id=p_player_id and tm.status='ACTIVE' and tm.end_on is null
  order by tm.is_primary desc,tm.start_on desc
  limit 1;

  v_request_type:=case
    when v_current_team_identity is null then 'JOIN'
    when v_current_team_identity=v_target_team_identity then 'SIDE_MOVE'
    else 'TRANSFER'
  end;

  insert into public.player_team_requests(
    player_id,from_team_identity_id,from_side_id,to_team_identity_id,to_side_id,
    requested_by,requested_shirt_number,request_type,status,note
  )
  values(
    p_player_id,v_current_team_identity,v_current_side,v_target_team_identity,p_team_id,
    auth.uid(),p_shirt_number,v_request_type,'PENDING','Requested from Team roster management'
  )
  on conflict (player_id,to_team_identity_id) where status='PENDING'
  do update set
    from_team_identity_id=excluded.from_team_identity_id,
    from_side_id=excluded.from_side_id,
    to_side_id=excluded.to_side_id,
    requested_by=excluded.requested_by,
    requested_shirt_number=excluded.requested_shirt_number,
    request_type=excluded.request_type,
    updated_at=now()
  returning id into v_request_id;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(auth.uid(),'PLAYER_TEAM_REQUESTED','PLAYER',p_player_id,
    jsonb_build_object(
      'request_id',v_request_id,'request_type',v_request_type,
      'from_team',v_current_team_identity,'to_team',v_target_team_identity,'to_side',p_team_id
    ));

  return jsonb_build_object(
    'status',case when v_request_type='JOIN' then 'REQUESTED_FREE' else 'REQUESTED_TRANSFER' end,
    'request_id',v_request_id,
    'request_type',v_request_type,
    'current_team_name',v_current_team_name
  );
end
$$;

revoke all on function public.ips_request_existing_player_for_team(uuid,uuid,smallint) from public,anon;
grant execute on function public.ips_request_existing_player_for_team(uuid,uuid,smallint) to authenticated,service_role;

create or replace function public.ips_decide_player_team_request(
  p_request_id uuid,
  p_approve boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  r public.player_team_requests;
  v_is_player boolean:=false;
  v_is_owner boolean:=false;
  v_is_global boolean:=false;
  v_is_current_team boolean:=false;
  v_is_city boolean:=false;
  v_actor text;
  v_current_team_identity uuid;
  v_current_side uuid;
  v_target_city uuid;
  v_from_city uuid;
  v_membership uuid;
begin
  select * into r from public.player_team_requests where id=p_request_id for update;
  if not found then raise exception 'Player request not found.'; end if;
  if r.status<>'PENDING' then raise exception 'This request has already been decided.'; end if;

  select exists(select 1 from public.profiles p where p.id=auth.uid() and p.linked_player_id=r.player_id) into v_is_player;
  v_is_owner:=public.ips_is_owner();
  v_is_global:=public.ips_has_role('ADMIN','GLOBAL',null);

  select c.city_id into v_target_city from public.clubs c where c.id=r.to_team_identity_id;
  if r.from_team_identity_id is not null then
    select c.city_id into v_from_city from public.clubs c where c.id=r.from_team_identity_id;
    v_is_current_team:=public.ips_has_role('ADMIN','CLUB',r.from_team_identity_id)
      or public.ips_has_role('LEADER','CLUB',r.from_team_identity_id)
      or exists(
        select 1 from public.teams t
        where t.club_id=r.from_team_identity_id
          and (public.ips_has_role('ADMIN','TEAM',t.id) or public.ips_has_role('LEADER','TEAM',t.id))
      );
  end if;
  v_is_city:=(v_target_city is not null and public.ips_has_role('ADMIN','CITY',v_target_city))
    or (v_from_city is not null and public.ips_has_role('ADMIN','CITY',v_from_city));

  if not (v_is_player or v_is_owner or v_is_global or v_is_current_team or v_is_city) then
    raise exception 'Only the player, their current Team, or an authorised City/Global administrator can decide this request.';
  end if;

  v_actor:=case
    when v_is_player then 'PLAYER'
    when v_is_owner then 'OWNER'
    when v_is_global then 'GLOBAL_ADMIN'
    when v_is_current_team then 'CURRENT_TEAM'
    else 'CITY_ADMIN'
  end;

  if not p_approve then
    update public.player_team_requests
      set status='REJECTED',decided_by=auth.uid(),decided_at=now(),decision_actor_type=v_actor,
          note=coalesce(nullif(trim(coalesce(p_note,'')),''),note),updated_at=now()
    where id=p_request_id;
    insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
    values(auth.uid(),'PLAYER_TEAM_REQUEST_REJECTED','PLAYER',r.player_id,
      jsonb_build_object('request_id',r.id,'actor',v_actor,'to_team',r.to_team_identity_id));
    return jsonb_build_object('status','REJECTED','actor',v_actor);
  end if;

  select t.club_id,tm.team_id
  into v_current_team_identity,v_current_side
  from public.team_memberships tm
  join public.teams t on t.id=tm.team_id
  where tm.player_id=r.player_id and tm.status='ACTIVE' and tm.end_on is null
  order by tm.is_primary desc,tm.start_on desc
  limit 1;

  if r.from_team_identity_id is null then
    if v_current_team_identity is not null and v_current_team_identity<>r.to_team_identity_id then
      raise exception 'The player joined another Team after this request. Send a new transfer request.';
    end if;
  elsif v_current_team_identity is distinct from r.from_team_identity_id and v_current_team_identity is distinct from r.to_team_identity_id then
    raise exception 'The player Team changed after this request. Send a new request.';
  end if;

  update public.team_memberships tm
  set end_on=current_date,status='FORMER',is_primary=false,updated_at=now()
  where tm.player_id=r.player_id
    and tm.status='ACTIVE' and tm.end_on is null
    and tm.team_id<>r.to_side_id;

  if not exists(
    select 1 from public.team_memberships tm
    where tm.player_id=r.player_id and tm.team_id=r.to_side_id and tm.status='ACTIVE' and tm.end_on is null
  ) then
    insert into public.team_memberships(player_id,team_id,start_on,shirt_number,status,is_primary,team_role)
    select r.player_id,r.to_side_id,current_date,r.requested_shirt_number,'ACTIVE',true,
           coalesce(nullif(trim(p.primary_role),''),'Player')
    from public.players p where p.id=r.player_id
    returning id into v_membership;
  end if;

  update public.player_team_requests
    set status='APPROVED',decided_by=auth.uid(),decided_at=now(),decision_actor_type=v_actor,
        note=coalesce(nullif(trim(coalesce(p_note,'')),''),note),updated_at=now()
  where id=p_request_id;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(auth.uid(),'PLAYER_TEAM_REQUEST_APPROVED','PLAYER',r.player_id,
    jsonb_build_object(
      'request_id',r.id,'actor',v_actor,'request_type',r.request_type,
      'from_team',r.from_team_identity_id,'to_team',r.to_team_identity_id,'to_side',r.to_side_id,
      'membership_id',v_membership
    ));

  return jsonb_build_object('status','APPROVED','actor',v_actor,'membership_id',v_membership);
end
$$;

revoke all on function public.ips_decide_player_team_request(uuid,boolean,text) from public,anon;
grant execute on function public.ips_decide_player_team_request(uuid,boolean,text) to authenticated,service_role;

create or replace function public.ips_my_player_team_requests()
returns jsonb
language plpgsql
stable security definer
set search_path=public,auth
as $$
declare v_player uuid;
begin
  select p.linked_player_id into v_player from public.profiles p where p.id=auth.uid();
  if v_player is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',r.id,'status',r.status,'request_type',r.request_type,'created_at',r.created_at,
      'player_id',r.player_id,
      'from_team_name',fc.name,'from_side_name',fs.name,
      'to_team_name',tc.name,'to_side_name',ts.name,
      'requested_shirt_number',r.requested_shirt_number,
      'can_decide',r.status='PENDING'
    ) order by r.created_at desc)
    from public.player_team_requests r
    left join public.clubs fc on fc.id=r.from_team_identity_id
    left join public.teams fs on fs.id=r.from_side_id
    join public.clubs tc on tc.id=r.to_team_identity_id
    join public.teams ts on ts.id=r.to_side_id
    where r.player_id=v_player
  ),'[]'::jsonb);
end
$$;

revoke all on function public.ips_my_player_team_requests() from public,anon;
grant execute on function public.ips_my_player_team_requests() to authenticated,service_role;

create or replace function public.ips_player_team_request_queue()
returns jsonb
language plpgsql
stable security definer
set search_path=public,auth
as $$
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',r.id,'status',r.status,'request_type',r.request_type,'created_at',r.created_at,
      'player_id',p.id,'player_name',p.display_name,'ips_code',p.ips_code,
      'from_team_name',fc.name,'from_side_name',fs.name,
      'to_team_name',tc.name,'to_side_name',ts.name,
      'requested_shirt_number',r.requested_shirt_number
    ) order by r.created_at asc)
    from public.player_team_requests r
    join public.players p on p.id=r.player_id
    left join public.clubs fc on fc.id=r.from_team_identity_id
    left join public.teams fs on fs.id=r.from_side_id
    join public.clubs tc on tc.id=r.to_team_identity_id
    join public.teams ts on ts.id=r.to_side_id
    where r.status='PENDING'
      and (
        public.ips_is_owner()
        or public.ips_has_role('ADMIN','GLOBAL',null)
        or (r.from_team_identity_id is not null and (
          public.ips_has_role('ADMIN','CLUB',r.from_team_identity_id)
          or public.ips_has_role('LEADER','CLUB',r.from_team_identity_id)
          or exists(select 1 from public.teams x where x.club_id=r.from_team_identity_id and (
            public.ips_has_role('ADMIN','TEAM',x.id) or public.ips_has_role('LEADER','TEAM',x.id)
          ))
        ))
        or exists(select 1 from public.clubs c where c.id=coalesce(r.from_team_identity_id,r.to_team_identity_id) and public.ips_has_role('ADMIN','CITY',c.city_id))
      )
  ),'[]'::jsonb);
end
$$;

revoke all on function public.ips_player_team_request_queue() from public,anon;
grant execute on function public.ips_player_team_request_queue() to authenticated,service_role;

create or replace function public.ips_team_player_requests(p_team_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path=public,auth
as $$
declare v_club uuid;
begin
  if not public.ips_can_manage_team(p_team_id) then raise exception 'Not authorised to manage this Team.'; end if;
  select t.club_id into v_club from public.teams t where t.id=p_team_id;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',r.id,'player_id',r.player_id,'status',r.status,'request_type',r.request_type,
      'to_side_id',r.to_side_id,'created_at',r.created_at
    ) order by r.created_at desc)
    from public.player_team_requests r
    where r.to_team_identity_id=v_club and r.status='PENDING'
  ),'[]'::jsonb);
end
$$;

revoke all on function public.ips_team_player_requests(uuid) from public,anon;
grant execute on function public.ips_team_player_requests(uuid) to authenticated,service_role;

-- Team-scoped managers cannot mint a new permanent player identity directly.
create or replace function public.ips_create_player_for_team_v2(
  p_team_id uuid,
  p_full_name text,
  p_display_name text,
  p_date_of_birth date default null,
  p_primary_role text default null,
  p_batting_style text default null,
  p_bowling_style text default null,
  p_shirt_number smallint default null,
  p_email text default null,
  p_phone text default null,
  p_whatsapp_consent boolean default false
)
returns public.players
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_player public.players;
  v_code text;
  v_slug text;
  v_email text;
  v_phone text;
  v_role text;
  v_city uuid;
begin
  select c.city_id into v_city
  from public.teams t join public.clubs c on c.id=t.club_id
  where t.id=p_team_id and t.status='ACTIVE';
  if v_city is null then raise exception 'Target Team not found.'; end if;

  if not (
    public.ips_is_owner()
    or public.ips_has_role('ADMIN','GLOBAL',null)
    or public.ips_has_role('ADMIN','CITY',v_city)
  ) then
    raise exception 'Team managers cannot create or directly add permanent player identities. Search IPS and send a roster request instead.';
  end if;

  if coalesce(trim(p_full_name),'')='' then raise exception 'Full name is required.'; end if;
  if coalesce(trim(p_display_name),'')='' then raise exception 'Display name is required.'; end if;
  if p_shirt_number is not null and (p_shirt_number<0 or p_shirt_number>999) then raise exception 'Shirt number must be between 0 and 999.'; end if;

  v_role:=coalesce(nullif(trim(p_primary_role),''),'Player');
  v_email:=nullif(lower(trim(coalesce(p_email,''))),'');
  if v_email is not null and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid email address.'; end if;
  v_phone:=case when nullif(trim(coalesce(p_phone,'')),'') is null then null else public.ips_normalize_phone(p_phone) end;

  if exists(
    select 1 from public.players p
    left join public.player_private_identities pi on pi.player_id=p.id
    where p.status='ACTIVE' and (
      (v_email is not null and exists(select 1 from public.player_contacts pc where pc.player_id=p.id and pc.contact_type='EMAIL' and pc.is_login_identifier and lower(pc.value_normalized)=v_email))
      or (v_phone is not null and exists(select 1 from public.player_contacts pc where pc.player_id=p.id and pc.contact_type='PHONE' and pc.is_login_identifier and pc.value_normalized=v_phone))
      or (p_date_of_birth is not null and pi.date_of_birth=p_date_of_birth and lower(coalesce(pi.full_name,''))=lower(trim(p_full_name)))
    )
  ) then
    raise exception 'A strong existing IPS identity match was found. Search and request the existing player instead of creating a duplicate.';
  end if;

  v_code:=public.ips_next_player_code();
  v_slug:=public.ips_slug_base(p_display_name)||'-'||lower(replace(v_code,'-',''));
  if v_slug='' or v_slug ~ '^-|-$' then v_slug:=lower(replace(v_code,'-','')); end if;

  insert into public.players(ips_code,slug,display_name,primary_role,batting_style,bowling_style,status)
  values(v_code,v_slug,trim(p_display_name),nullif(trim(p_primary_role),''),nullif(trim(p_batting_style),''),nullif(trim(p_bowling_style),''),'ACTIVE')
  returning * into v_player;

  insert into public.player_private_identities(player_id,full_name,date_of_birth)
  values(v_player.id,trim(p_full_name),p_date_of_birth);

  insert into public.team_memberships(player_id,team_id,start_on,shirt_number,status,is_primary,team_role)
  values(v_player.id,p_team_id,current_date,p_shirt_number,'ACTIVE',true,v_role);

  if v_email is not null then
    insert into public.player_contacts(player_id,contact_type,value_original,value_normalized,is_login_identifier,created_by)
    values(v_player.id,'EMAIL',v_email,v_email,true,auth.uid());
  end if;
  if v_phone is not null then
    insert into public.player_contacts(player_id,contact_type,value_original,value_normalized,is_login_identifier,is_whatsapp,notification_consent,consent_at,created_by)
    values(v_player.id,'PHONE',p_phone,v_phone,true,true,p_whatsapp_consent,case when p_whatsapp_consent then now() else null end,auth.uid());
  end if;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(auth.uid(),'PLAYER_CREATED','PLAYER',v_player.id,
    jsonb_build_object('team_id',p_team_id,'ips_code',v_player.ips_code,'team_role',v_role,'source','CITY_OR_GLOBAL_ADMIN'));

  return v_player;
end
$$;

commit;
