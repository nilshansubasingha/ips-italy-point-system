-- IPS Project 6.23 — explicit Owner/Admin force deletion for match, tournament and team records.
begin;

create or replace function public.ips_delete_match(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_code text;
  v_status text;
  v_tournament_id uuid;
  v_home uuid;
  v_away uuid;
begin
  if not public.ips_can_global_registry_delete() then
    raise exception 'Only a GLOBAL OWNER or GLOBAL ADMIN can permanently delete a match.';
  end if;

  select match_code,status::text,tournament_id,home_team_id,away_team_id
  into v_code,v_status,v_tournament_id,v_home,v_away
  from public.matches where id=p_match_id;

  if not found then raise exception 'Match not found.'; end if;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(
    auth.uid(),'MATCH_FORCE_DELETED','MATCH',p_match_id,
    jsonb_build_object(
      'match_code',v_code,
      'status',v_status,
      'tournament_id',v_tournament_id,
      'home_team_id',v_home,
      'away_team_id',v_away,
      'force_delete',true
    )
  );

  -- These two tables intentionally use RESTRICT so historical data cannot
  -- disappear accidentally. Explicit Owner/Admin force-delete removes them first.
  delete from public.player_match_stats where match_id=p_match_id;
  delete from public.match_archives where match_id=p_match_id;

  -- Match-owned scoring, innings, lineups, roles, officials, grants and
  -- broadcast state cascade from the match record.
  delete from public.matches where id=p_match_id;
end
$$;

revoke all on function public.ips_delete_match(uuid) from public;
grant execute on function public.ips_delete_match(uuid) to authenticated;

create or replace function public.ips_delete_tournament(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_name text;
  v_match_count integer;
  v_team_count integer;
  v_match_id uuid;
begin
  if not public.ips_can_global_registry_delete() then
    raise exception 'Only a GLOBAL OWNER or GLOBAL ADMIN can delete a tournament.';
  end if;

  select name into v_name from public.tournaments where id=p_tournament_id;
  if not found then raise exception 'Tournament not found.'; end if;

  select count(*) into v_match_count from public.matches where tournament_id=p_tournament_id;
  select count(*) into v_team_count from public.tournament_teams where tournament_id=p_tournament_id;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(
    auth.uid(),'TOURNAMENT_FORCE_DELETED','TOURNAMENT',p_tournament_id,
    jsonb_build_object(
      'name',v_name,
      'removed_matches',v_match_count,
      'removed_team_entries',v_team_count,
      'force_delete',true
    )
  );

  for v_match_id in select id from public.matches where tournament_id=p_tournament_id
  loop
    delete from public.player_match_stats where match_id=v_match_id;
    delete from public.match_archives where match_id=v_match_id;
    delete from public.matches where id=v_match_id;
  end loop;

  -- Tournament-owned teams/squads/replacements/grants/broadcast packages cascade.
  delete from public.tournaments where id=p_tournament_id;
end
$$;

create or replace function public.ips_delete_team(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_name text;
  v_member_count integer;
  v_fixture_count integer;
  v_match_id uuid;
begin
  if not public.ips_can_global_registry_delete() then
    raise exception 'Only a GLOBAL OWNER or GLOBAL ADMIN can delete a team.';
  end if;

  select name into v_name from public.teams where id=p_team_id;
  if not found then raise exception 'Team not found.'; end if;

  select count(*) into v_member_count from public.team_memberships where team_id=p_team_id;
  select count(*) into v_fixture_count from public.matches where home_team_id=p_team_id or away_team_id=p_team_id;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(
    auth.uid(),'TEAM_FORCE_DELETED','TEAM',p_team_id,
    jsonb_build_object(
      'name',v_name,
      'removed_memberships',v_member_count,
      'removed_matches',v_fixture_count,
      'force_delete',true
    )
  );

  for v_match_id in
    select id from public.matches where home_team_id=p_team_id or away_team_id=p_team_id
  loop
    delete from public.player_match_stats where match_id=v_match_id;
    delete from public.match_archives where match_id=v_match_id;
    delete from public.matches where id=v_match_id;
  end loop;

  -- Remove workflow references that intentionally restrict permanent team deletion.
  delete from public.player_team_requests
  where from_side_id=p_team_id or to_side_id=p_team_id;

  delete from public.player_transfer_requests
  where from_side_id=p_team_id or to_side_id=p_team_id;

  delete from public.tournament_teams where team_id=p_team_id;
  delete from public.team_memberships where team_id=p_team_id;
  delete from public.teams where id=p_team_id;
end
$$;

create or replace function public.ips_delete_team_identity(p_team_identity_id uuid)
returns void
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_name text;
  v_fixture_count integer;
  v_side_count integer;
  v_match_id uuid;
begin
  if not public.ips_can_global_registry_delete() then
    raise exception 'Only a GLOBAL OWNER or GLOBAL ADMIN can delete a team.';
  end if;

  select name into v_name from public.clubs where id=p_team_identity_id;
  if not found then raise exception 'Team not found.'; end if;

  select count(*) into v_side_count from public.teams where club_id=p_team_identity_id;
  select count(*) into v_fixture_count
  from public.matches m
  where exists(
    select 1 from public.teams t
    where t.club_id=p_team_identity_id
      and (t.id=m.home_team_id or t.id=m.away_team_id)
  );

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(
    auth.uid(),'TEAM_IDENTITY_FORCE_DELETED','TEAM_IDENTITY',p_team_identity_id,
    jsonb_build_object(
      'name',v_name,
      'removed_sides',v_side_count,
      'removed_matches',v_fixture_count,
      'force_delete',true
    )
  );

  for v_match_id in
    select m.id
    from public.matches m
    where exists(
      select 1 from public.teams t
      where t.club_id=p_team_identity_id
        and (t.id=m.home_team_id or t.id=m.away_team_id)
    )
  loop
    delete from public.player_match_stats where match_id=v_match_id;
    delete from public.match_archives where match_id=v_match_id;
    delete from public.matches where id=v_match_id;
  end loop;

  -- Clear request/transfer workflow rows that would otherwise RESTRICT deletion.
  delete from public.player_team_requests
  where from_team_identity_id=p_team_identity_id
     or to_team_identity_id=p_team_identity_id
     or from_side_id in (select id from public.teams where club_id=p_team_identity_id)
     or to_side_id in (select id from public.teams where club_id=p_team_identity_id);

  delete from public.player_transfer_requests
  where from_team_identity_id=p_team_identity_id
     or to_team_identity_id=p_team_identity_id
     or from_side_id in (select id from public.teams where club_id=p_team_identity_id)
     or to_side_id in (select id from public.teams where club_id=p_team_identity_id);

  delete from public.tournament_teams tt
  where tt.team_id in (select id from public.teams where club_id=p_team_identity_id);

  delete from public.team_memberships tm
  where tm.team_id in (select id from public.teams where club_id=p_team_identity_id);

  delete from public.teams where club_id=p_team_identity_id;
  delete from public.clubs where id=p_team_identity_id;
end
$$;

notify pgrst,'reload schema';

commit;
