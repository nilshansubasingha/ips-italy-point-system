-- IPS Project 1 acceptance checks
-- Run AFTER the optional demo seed. This script should complete without raising an exception.

do $$
declare
  player_count integer;
  fixture_count integer;
  current_team_count integer;
begin
  select count(*) into player_count from public.players;
  if player_count < 1 then
    raise exception 'Project 1 acceptance failed: no players exist';
  end if;

  select count(*) into fixture_count from public.v_fixture_context;
  if fixture_count < 1 then
    raise exception 'Project 1 acceptance failed: fixture context view is empty';
  end if;

  select count(*) into current_team_count from public.v_player_current_teams;
  if current_team_count < 1 then
    raise exception 'Project 1 acceptance failed: no active player/team membership is visible';
  end if;
end $$;

-- Permanent player code protection: changing the code must fail.
do $$
declare
  demo_player uuid;
begin
  select id into demo_player from public.players order by created_at asc limit 1;
  begin
    update public.players set ips_code = 'ITA-9999999' where id = demo_player;
    raise exception 'Project 1 acceptance failed: player code update unexpectedly succeeded';
  exception
    when others then
      if sqlerrm = 'Project 1 acceptance failed: player code update unexpectedly succeeded' then
        raise;
      end if;
      -- Expected: trigger blocks the permanent identity change.
      null;
  end;
end $$;

-- Fixture must reference teams registered in that tournament.
do $$
declare
  tournament uuid;
  valid_home uuid;
  valid_away uuid;
  outsider uuid;
  venue uuid;
begin
  select id into tournament from public.tournaments order by created_at asc limit 1;
  select team_id into valid_home from public.tournament_teams where tournament_id = tournament order by created_at asc limit 1;
  select team_id into valid_away from public.tournament_teams where tournament_id = tournament and team_id <> valid_home order by created_at asc limit 1;
  select id into outsider from public.teams where id not in (select team_id from public.tournament_teams where tournament_id = tournament) order by created_at asc limit 1;
  select id into venue from public.venues order by created_at asc limit 1;

  if outsider is not null and valid_home is not null then
    begin
      insert into public.matches (tournament_id, match_code, match_number, home_team_id, away_team_id, venue_id, scheduled_at)
      values (tournament, 'SHOULD-FAIL-TEAM-SCOPE', 999999, valid_home, outsider, venue, timezone('utc', now()));
      raise exception 'Project 1 acceptance failed: outsider team fixture unexpectedly succeeded';
    exception
      when foreign_key_violation then null; -- expected
    end;
  end if;
end $$;

select 'PROJECT 1 ACCEPTANCE PASSED' as result;
