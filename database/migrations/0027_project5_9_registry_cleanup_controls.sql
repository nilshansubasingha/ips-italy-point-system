-- IPS Project 5.9 — registry cleanup controls.
-- Global Owner/Admin can remove unstarted test/setup tournament data while
-- started/completed/official match history remains protected.

begin;

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
begin
  if not public.ips_can_global_registry_delete() then
    raise exception 'Only a GLOBAL OWNER or GLOBAL ADMIN can delete a tournament.';
  end if;

  select name into v_name from public.tournaments where id=p_tournament_id;
  if not found then raise exception 'Tournament not found.'; end if;

  if exists(
    select 1 from public.matches
    where tournament_id=p_tournament_id
      and status::text not in ('SCHEDULED','READY','CANCELLED')
  ) then
    raise exception 'This tournament contains started, completed or official match history and cannot be permanently deleted.';
  end if;

  select count(*) into v_match_count from public.matches where tournament_id=p_tournament_id;
  select count(*) into v_team_count from public.tournament_teams where tournament_id=p_tournament_id;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(
    auth.uid(),'TOURNAMENT_DELETED','TOURNAMENT',p_tournament_id,
    jsonb_build_object('name',v_name,'removed_matches',v_match_count,'removed_team_entries',v_team_count)
  );

  delete from public.matches where tournament_id=p_tournament_id;
  delete from public.tournaments where id=p_tournament_id;
end;
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
begin
  if not public.ips_can_global_registry_delete() then
    raise exception 'Only a GLOBAL OWNER or GLOBAL ADMIN can delete a team.';
  end if;

  select name into v_name from public.teams where id=p_team_id;
  if not found then raise exception 'Team not found.'; end if;

  if exists(
    select 1 from public.matches
    where (home_team_id=p_team_id or away_team_id=p_team_id)
      and status::text not in ('SCHEDULED','READY','CANCELLED')
  ) then
    raise exception 'This team has started, completed or official match history and cannot be permanently deleted.';
  end if;

  if exists(select 1 from public.player_transfer_requests where to_side_id=p_team_id) then
    raise exception 'This team is referenced by a transfer request. Resolve or remove the transfer request first.';
  end if;

  select count(*) into v_member_count from public.team_memberships where team_id=p_team_id;
  select count(*) into v_fixture_count from public.matches where home_team_id=p_team_id or away_team_id=p_team_id;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(
    auth.uid(),'TEAM_DELETED','TEAM',p_team_id,
    jsonb_build_object('name',v_name,'removed_memberships',v_member_count,'removed_unstarted_fixtures',v_fixture_count)
  );

  delete from public.matches where home_team_id=p_team_id or away_team_id=p_team_id;
  delete from public.tournament_teams where team_id=p_team_id;
  delete from public.team_memberships where team_id=p_team_id;
  delete from public.teams where id=p_team_id;
end;
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
begin
  if not public.ips_can_global_registry_delete() then
    raise exception 'Only a GLOBAL OWNER or GLOBAL ADMIN can delete a team.';
  end if;

  select name into v_name from public.clubs where id=p_team_identity_id;
  if not found then raise exception 'Team not found.'; end if;

  if exists(
    select 1
    from public.matches m
    where (
      exists(select 1 from public.teams t where t.club_id=p_team_identity_id and t.id=m.home_team_id)
      or exists(select 1 from public.teams t where t.club_id=p_team_identity_id and t.id=m.away_team_id)
    )
    and m.status::text not in ('SCHEDULED','READY','CANCELLED')
  ) then
    raise exception 'This team has started, completed or official match history and cannot be permanently deleted.';
  end if;

  if exists(
    select 1
    from public.player_transfer_requests ptr
    where ptr.from_team_identity_id=p_team_identity_id
       or ptr.to_team_identity_id=p_team_identity_id
       or exists(
         select 1 from public.teams t
         where t.club_id=p_team_identity_id
           and (t.id=ptr.from_side_id or t.id=ptr.to_side_id)
       )
  ) then
    raise exception 'This team is referenced by a transfer request. Resolve or remove the transfer request first.';
  end if;

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
    auth.uid(),'TEAM_IDENTITY_DELETED','TEAM_IDENTITY',p_team_identity_id,
    jsonb_build_object('name',v_name,'removed_sides',v_side_count,'removed_unstarted_fixtures',v_fixture_count)
  );

  delete from public.matches m
  where exists(
    select 1 from public.teams t
    where t.club_id=p_team_identity_id
      and (t.id=m.home_team_id or t.id=m.away_team_id)
  );

  delete from public.tournament_teams tt
  where exists(
    select 1 from public.teams t
    where t.club_id=p_team_identity_id and t.id=tt.team_id
  );

  delete from public.team_memberships tm
  using public.teams t
  where tm.team_id=t.id and t.club_id=p_team_identity_id;

  delete from public.teams where club_id=p_team_identity_id;
  delete from public.clubs where id=p_team_identity_id;
end;
$$;

revoke all on function public.ips_delete_tournament(uuid) from public,anon;
revoke all on function public.ips_delete_team(uuid) from public,anon;
revoke all on function public.ips_delete_team_identity(uuid) from public,anon;

grant execute on function public.ips_delete_tournament(uuid) to authenticated;
grant execute on function public.ips_delete_team(uuid) to authenticated;
grant execute on function public.ips_delete_team_identity(uuid) to authenticated;

commit;
