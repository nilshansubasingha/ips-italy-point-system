-- IPS Project 5.4 — team-specific roster roles and roster-side editing.
-- Permanent player identity remains canonical; team_role belongs to the team membership.

begin;

alter table public.team_memberships
  add column if not exists team_role text;

update public.team_memberships tm
set team_role = coalesce(nullif(trim(p.primary_role),''),'Player')
from public.players p
where p.id=tm.player_id
  and (tm.team_role is null or trim(tm.team_role)='');

alter table public.team_memberships
  alter column team_role set default 'Player';

create or replace function public.ips_create_player_for_team(
  p_team_id uuid,
  p_display_name text,
  p_given_name text default null,
  p_family_name text default null,
  p_primary_role text default null,
  p_batting_style text default null,
  p_bowling_style text default null,
  p_shirt_number smallint default null,
  p_email text default null,
  p_phone text default null,
  p_whatsapp_consent boolean default false
)
returns public.players
language plpgsql security definer
set search_path=public,auth as $$
declare
  v_player public.players;
  v_code text;
  v_slug text;
  v_email text;
  v_phone text;
  v_role text;
begin
  if not public.ips_can_manage_team(p_team_id) then raise exception 'Not authorised to add players to this team.'; end if;
  if coalesce(trim(p_display_name),'')='' then raise exception 'Player name is required.'; end if;
  if p_shirt_number is not null and (p_shirt_number<0 or p_shirt_number>999) then raise exception 'Shirt number must be between 0 and 999.'; end if;

  v_role := coalesce(nullif(trim(p_primary_role),''),'Player');
  v_email := nullif(lower(trim(coalesce(p_email,''))), '');
  if v_email is not null and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid email address.'; end if;
  v_phone := case when nullif(trim(coalesce(p_phone,'')),'') is null then null else public.ips_normalize_phone(p_phone) end;

  if v_email is not null and exists(select 1 from public.player_contacts where contact_type='EMAIL' and is_login_identifier and lower(value_normalized)=v_email) then
    raise exception 'That email is already linked to an IPS player. Search for the existing player instead.';
  end if;
  if v_phone is not null and exists(select 1 from public.player_contacts where contact_type='PHONE' and is_login_identifier and value_normalized=v_phone) then
    raise exception 'That phone number is already linked to an IPS player. Search for the existing player instead.';
  end if;

  v_code := public.ips_next_player_code();
  v_slug := public.ips_slug_base(p_display_name) || '-' || lower(replace(v_code,'-',''));
  if v_slug ~ '^-|-$' or v_slug='' then v_slug := lower(replace(v_code,'-','')); end if;

  insert into public.players(ips_code,slug,display_name,given_name,family_name,primary_role,batting_style,bowling_style,status)
  values(v_code,v_slug,trim(p_display_name),nullif(trim(p_given_name),''),nullif(trim(p_family_name),''),nullif(trim(p_primary_role),''),nullif(trim(p_batting_style),''),nullif(trim(p_bowling_style),''),'ACTIVE')
  returning * into v_player;

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
  values(auth.uid(),'PLAYER_CREATED','PLAYER',v_player.id,jsonb_build_object('team_id',p_team_id,'ips_code',v_player.ips_code,'team_role',v_role));

  return v_player;
end $$;

create or replace function public.ips_add_existing_player_to_team(
  p_team_id uuid,
  p_player_id uuid,
  p_shirt_number smallint default null
)
returns public.team_memberships
language plpgsql security definer
set search_path=public,auth as $$
declare v public.team_memberships; v_primary boolean; v_role text;
begin
  if not public.ips_can_manage_team(p_team_id) then raise exception 'Not authorised to manage this team.'; end if;
  select coalesce(nullif(trim(primary_role),''),'Player') into v_role from public.players where id=p_player_id and status='ACTIVE';
  if not found then raise exception 'Player not found.'; end if;
  if exists(select 1 from public.team_memberships where team_id=p_team_id and player_id=p_player_id and status='ACTIVE' and end_on is null) then
    raise exception 'This player is already an active member of the team.';
  end if;
  v_primary := not exists(select 1 from public.team_memberships where player_id=p_player_id and status='ACTIVE' and end_on is null and is_primary);
  insert into public.team_memberships(player_id,team_id,start_on,shirt_number,status,is_primary,team_role)
  values(p_player_id,p_team_id,current_date,p_shirt_number,'ACTIVE',v_primary,v_role)
  returning * into v;
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(auth.uid(),'TEAM_MEMBERSHIP_ADDED','PLAYER',p_player_id,jsonb_build_object('team_id',p_team_id,'membership_id',v.id,'is_primary',v_primary,'team_role',v_role));
  return v;
end $$;

create or replace function public.ips_update_team_roster_player(
  p_membership_id uuid,
  p_shirt_number smallint default null,
  p_team_role text default 'Player'
)
returns public.team_memberships
language plpgsql security definer
set search_path=public,auth as $$
declare v public.team_memberships; v_role text;
begin
  select * into v from public.team_memberships where id=p_membership_id for update;
  if not found then raise exception 'Membership not found.'; end if;
  if not public.ips_can_manage_team(v.team_id) then raise exception 'Not authorised to manage this roster.'; end if;
  if p_shirt_number is not null and (p_shirt_number<0 or p_shirt_number>999) then raise exception 'Shirt number must be between 0 and 999.'; end if;
  v_role := coalesce(nullif(trim(p_team_role),''),'Player');

  update public.team_memberships
  set shirt_number=p_shirt_number,team_role=v_role,updated_at=now()
  where id=p_membership_id
  returning * into v;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(auth.uid(),'TEAM_ROSTER_PLAYER_UPDATED','PLAYER',v.player_id,jsonb_build_object('team_id',v.team_id,'membership_id',v.id,'team_role',v.team_role,'shirt_number',v.shirt_number));

  return v;
end $$;

revoke all on function public.ips_update_team_roster_player(uuid,smallint,text) from public,anon;
grant execute on function public.ips_update_team_roster_player(uuid,smallint,text) to authenticated;

notify pgrst,'reload schema';

commit;
