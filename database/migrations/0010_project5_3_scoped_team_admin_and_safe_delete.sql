-- IPS Project 5.3 — Scoped team admins, safe registry deletion, and player registry visibility.
-- Team admins may manage only their granted team. Permanent deletion remains GLOBAL OWNER/ADMIN only.

begin;

create or replace function public.ips_can_manage_team(p_team_id uuid)
returns boolean
language sql stable security definer
set search_path=public,auth as $$
  select public.ips_is_owner()
    or public.ips_has_role('ADMIN','GLOBAL',null)
    or public.ips_has_role('ADMIN','TEAM',p_team_id)
    or public.ips_has_role('LEADER','TEAM',p_team_id)
    or exists (
      select 1
      from public.teams tm
      join public.clubs c on c.id=tm.club_id
      where tm.id=p_team_id
        and (
          public.ips_has_role('ADMIN','CITY',c.city_id)
          or public.ips_has_role('LEADER','CLUB',c.id)
        )
    );
$$;

create or replace function public.ips_can_global_registry_delete()
returns boolean
language sql stable security definer
set search_path=public,auth as $$
  select public.ips_is_owner()
    or public.ips_has_role('ADMIN','GLOBAL',null);
$$;

create or replace function public.ips_delete_team(p_team_id uuid)
returns void
language plpgsql security definer
set search_path=public,auth as $$
declare
  v_name text;
  v_member_count integer;
begin
  if not public.ips_can_global_registry_delete() then
    raise exception 'Only a GLOBAL OWNER or GLOBAL ADMIN can delete a team.';
  end if;

  select name into v_name from public.teams where id=p_team_id;
  if not found then raise exception 'Team not found.'; end if;

  if exists(select 1 from public.tournament_teams where team_id=p_team_id)
     or exists(select 1 from public.match_playing_xi where team_id=p_team_id)
     or exists(select 1 from public.match_team_roles where team_id=p_team_id) then
    raise exception 'This team already has competition or match history and cannot be permanently deleted.';
  end if;

  select count(*) into v_member_count from public.team_memberships where team_id=p_team_id;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(
    auth.uid(),'TEAM_DELETED','TEAM',p_team_id,
    jsonb_build_object('name',v_name,'removed_memberships',v_member_count)
  );

  delete from public.team_memberships where team_id=p_team_id;
  delete from public.teams where id=p_team_id;
end $$;

create or replace function public.ips_delete_player(p_player_id uuid)
returns void
language plpgsql security definer
set search_path=public,auth as $$
declare
  v_name text;
  v_code text;
  v_membership_count integer;
begin
  if not public.ips_can_global_registry_delete() then
    raise exception 'Only a GLOBAL OWNER or GLOBAL ADMIN can delete a player.';
  end if;

  select display_name,ips_code into v_name,v_code from public.players where id=p_player_id;
  if not found then raise exception 'Player not found.'; end if;

  if exists(select 1 from public.tournament_squad_players where player_id=p_player_id)
     or exists(select 1 from public.match_playing_xi where player_id=p_player_id)
     or exists(select 1 from public.match_team_roles where player_id=p_player_id)
     or exists(select 1 from public.squad_change_requests where outgoing_player_id=p_player_id or incoming_player_id=p_player_id) then
    raise exception 'This player already has tournament or match history and cannot be permanently deleted.';
  end if;

  select count(*) into v_membership_count from public.team_memberships where player_id=p_player_id;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(
    auth.uid(),'PLAYER_DELETED','PLAYER',p_player_id,
    jsonb_build_object('name',v_name,'ips_code',v_code,'removed_memberships',v_membership_count)
  );

  delete from public.team_memberships where player_id=p_player_id;
  delete from public.players where id=p_player_id;
end $$;

create or replace function public.ips_registry_players(p_query text default null)
returns table(
  id uuid, ips_code text, display_name text, primary_role text, profile_image_url text, status public.ips_entity_status,
  team_id uuid, team_name text, club_id uuid, club_name text, city_id uuid, city_name text, has_account boolean
)
language sql stable security definer
set search_path=public,auth as $$
  select p.id,p.ips_code,p.display_name,p.primary_role,p.profile_image_url,p.status,
    cur.team_id,cur.team_name,cur.club_id,cur.club_name,cur.city_id,cur.city_name,
    exists(select 1 from public.profiles pr where pr.linked_player_id=p.id) as has_account
  from public.players p
  left join lateral (
    select tm.team_id,t.name team_name,c.id club_id,c.name club_name,ci.id city_id,ci.name city_name
    from public.team_memberships tm
    join public.teams t on t.id=tm.team_id
    join public.clubs c on c.id=t.club_id
    join public.cities ci on ci.id=c.city_id
    where tm.player_id=p.id and tm.status='ACTIVE' and tm.end_on is null
    order by tm.is_primary desc,tm.start_on desc limit 1
  ) cur on true
  where p.status='ACTIVE'
    and (coalesce(trim(p_query),'')='' or p.display_name ilike '%'||trim(p_query)||'%' or p.ips_code ilike '%'||trim(p_query)||'%')
    and (
      public.ips_is_owner()
      or public.ips_has_role('ADMIN','GLOBAL',null)
      or (cur.city_id is not null and public.ips_has_role('ADMIN','CITY',cur.city_id))
      or (cur.club_id is not null and public.ips_has_role('LEADER','CLUB',cur.club_id))
      or (cur.team_id is not null and public.ips_has_role('ADMIN','TEAM',cur.team_id))
      or (cur.team_id is not null and public.ips_has_role('LEADER','TEAM',cur.team_id))
    )
  order by p.display_name;
$$;

revoke all on function public.ips_can_global_registry_delete() from public,anon;
grant execute on function public.ips_can_global_registry_delete() to authenticated;

revoke all on function public.ips_delete_team(uuid) from public,anon;
grant execute on function public.ips_delete_team(uuid) to authenticated;

revoke all on function public.ips_delete_player(uuid) from public,anon;
grant execute on function public.ips_delete_player(uuid) to authenticated;

notify pgrst,'reload schema';

commit;
