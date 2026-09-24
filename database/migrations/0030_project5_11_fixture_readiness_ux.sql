-- IPS Project 5.11 — fixture readiness UX.
-- 1) tournament format changes automatically sync to unstarted tournament-snapshot fixtures
-- 2) fixtures may have a date with time TBC
-- 3) both playing sides can be saved atomically for one match

begin;

alter table public.matches
  add column if not exists scheduled_time_tbc boolean not null default false;

create or replace function public.ips_sync_unstarted_match_format_from_tournament()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.matches m
  set format_players_per_side = new.players_per_side,
      format_overs_per_innings = new.overs_per_innings,
      format_balls_per_over = new.balls_per_over,
      format_wicket_limit = new.wicket_limit,
      format_max_overs_per_bowler = new.tournament_max_overs_per_bowler
  where m.tournament_id = new.id
    and m.format_source = 'TOURNAMENT'
    and m.status::text in ('SCHEDULED','READY','CANCELLED')
    and (
      m.format_players_per_side is distinct from new.players_per_side
      or m.format_overs_per_innings is distinct from new.overs_per_innings
      or m.format_balls_per_over is distinct from new.balls_per_over
      or m.format_wicket_limit is distinct from new.wicket_limit
      or m.format_max_overs_per_bowler is distinct from new.tournament_max_overs_per_bowler
    );

  return new;
end;
$$;

revoke all on function public.ips_sync_unstarted_match_format_from_tournament() from public,anon,authenticated;

drop trigger if exists sync_unstarted_match_format_from_tournament on public.tournaments;
create trigger sync_unstarted_match_format_from_tournament
after update of players_per_side,overs_per_innings,balls_per_over,wicket_limit,tournament_max_overs_per_bowler
on public.tournaments
for each row
when (
  old.players_per_side is distinct from new.players_per_side
  or old.overs_per_innings is distinct from new.overs_per_innings
  or old.balls_per_over is distinct from new.balls_per_over
  or old.wicket_limit is distinct from new.wicket_limit
  or old.tournament_max_overs_per_bowler is distinct from new.tournament_max_overs_per_bowler
)
execute function public.ips_sync_unstarted_match_format_from_tournament();

create or replace function public.ips_set_match_playing_sides(
  p_match_id uuid,
  p_home_player_ids uuid[] default null,
  p_away_player_ids uuid[] default null
)
returns void
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_home_team_id uuid;
  v_away_team_id uuid;
begin
  select home_team_id,away_team_id
  into v_home_team_id,v_away_team_id
  from public.matches
  where id=p_match_id;

  if not found then
    raise exception 'Match not found.';
  end if;

  if p_home_player_ids is null and p_away_player_ids is null then
    raise exception 'Choose at least one playing side to save.';
  end if;

  if p_home_player_ids is not null then
    perform public.ips_set_match_playing_xi(p_match_id,v_home_team_id,p_home_player_ids);
  end if;

  if p_away_player_ids is not null then
    perform public.ips_set_match_playing_xi(p_match_id,v_away_team_id,p_away_player_ids);
  end if;
end;
$$;

revoke all on function public.ips_set_match_playing_sides(uuid,uuid[],uuid[]) from public,anon;
grant execute on function public.ips_set_match_playing_sides(uuid,uuid[],uuid[]) to authenticated,service_role;

drop function if exists public.ips_controller_available_matches();

create function public.ips_controller_available_matches()
returns table(
  match_id uuid,
  match_code text,
  match_number integer,
  match_status public.ips_match_status,
  scheduled_at timestamptz,
  scheduled_time_tbc boolean,
  tournament_name text,
  home_team_name text,
  away_team_name text,
  venue_name text
)
language sql
stable
security definer
set search_path=public,auth
as $$
  select m.id,m.match_code,m.match_number,m.status,m.scheduled_at,m.scheduled_time_tbc,
         t.name,ht.name,at.name,v.name
  from public.matches m
  join public.tournaments t on t.id=m.tournament_id
  join public.teams ht on ht.id=m.home_team_id
  join public.teams at on at.id=m.away_team_id
  left join public.venues v on v.id=m.venue_id
  where public.ips_can_score_match(m.id)
    and m.status not in ('LOCKED','CANCELLED')
  order by
    case when m.status='LIVE' then 0 when m.status='READY' then 1 else 2 end,
    m.scheduled_at;
$$;

revoke all on function public.ips_controller_available_matches() from public,anon;
grant execute on function public.ips_controller_available_matches() to authenticated,service_role;

create or replace function public.ips_controller_match_context(p_match_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth
as $$
declare
  ctx jsonb;
begin
  if not public.ips_can_score_match(p_match_id) then
    raise exception 'You are not assigned to score/manage this match.';
  end if;

  select jsonb_build_object(
    'match', jsonb_build_object(
      'id',m.id,'code',m.match_code,'number',m.match_number,'status',m.status,
      'scheduled_at',m.scheduled_at,'scheduled_time_tbc',m.scheduled_time_tbc,
      'stage',m.stage,'round_label',m.round_label
    ),
    'tournament', jsonb_build_object(
      'id',t.id,'code',t.code,'name',t.name,'format_label',t.format_label,
      'city',jsonb_build_object('id',c.id,'code',c.code,'name',c.name)
    ),
    'venue', case when v.id is null then null else jsonb_build_object(
      'id',v.id,'name',v.name,'address',v.address_text
    ) end,
    'match_format', jsonb_build_object(
      'players_per_side',m.format_players_per_side,
      'overs_per_innings',m.format_overs_per_innings,
      'balls_per_over',m.format_balls_per_over,
      'wicket_limit',m.format_wicket_limit,
      'max_overs_per_bowler',m.format_max_overs_per_bowler,
      'source',m.format_source,
      'override_reason',m.format_override_reason,
      'overridden_at',m.format_overridden_at
    ),
    'rules', jsonb_build_object(
      'id',r.id,'name',r.name,'version',r.version,
      'free_hit_on_no_ball',r.free_hit_on_no_ball,
      'consecutive_overs_by_same_bowler_allowed',r.consecutive_overs_by_same_bowler_allowed,
      'retirement_runs',r.retirement_runs,'retirement_mode',r.retirement_mode,
      'extras_rules',r.extras_rules,'additional_rules',r.additional_rules
    ),
    'home', jsonb_build_object(
      'team',jsonb_build_object('id',ht.id,'name',ht.name,'short_name',ht.short_name,'logo_url',ht.logo_url),
      'squad_locked',public.ips_match_team_squad_ready(m.id,ht.id),
      'squad',coalesce((
        select jsonb_agg(jsonb_build_object(
          'player_id',p.id,'ips_code',p.ips_code,'name',p.display_name,
          'primary_role',p.primary_role,'batting_style',p.batting_style,'bowling_style',p.bowling_style
        ) order by p.display_name)
        from public.tournament_squads s
        join public.tournament_squad_players sp on sp.squad_id=s.id and sp.removed_at is null
        join public.players p on p.id=sp.player_id
        where s.tournament_id=m.tournament_id and s.team_id=ht.id
      ),'[]'::jsonb),
      'playing_side',coalesce((
        select jsonb_agg(jsonb_build_object(
          'player_id',p.id,'ips_code',p.ips_code,'name',p.display_name,
          'primary_role',p.primary_role,'batting_style',p.batting_style,'bowling_style',p.bowling_style,
          'order',xi.lineup_order
        ) order by xi.lineup_order)
        from public.match_playing_xi xi join public.players p on p.id=xi.player_id
        where xi.match_id=m.id and xi.team_id=ht.id
      ),'[]'::jsonb),
      'roles',coalesce((
        select jsonb_object_agg(mtr.role::text,jsonb_build_object('player_id',p.id,'ips_code',p.ips_code,'name',p.display_name))
        from public.match_team_roles mtr join public.players p on p.id=mtr.player_id
        where mtr.match_id=m.id and mtr.team_id=ht.id
      ),'{}'::jsonb)
    ),
    'away', jsonb_build_object(
      'team',jsonb_build_object('id',at.id,'name',at.name,'short_name',at.short_name,'logo_url',at.logo_url),
      'squad_locked',public.ips_match_team_squad_ready(m.id,at.id),
      'squad',coalesce((
        select jsonb_agg(jsonb_build_object(
          'player_id',p.id,'ips_code',p.ips_code,'name',p.display_name,
          'primary_role',p.primary_role,'batting_style',p.batting_style,'bowling_style',p.bowling_style
        ) order by p.display_name)
        from public.tournament_squads s
        join public.tournament_squad_players sp on sp.squad_id=s.id and sp.removed_at is null
        join public.players p on p.id=sp.player_id
        where s.tournament_id=m.tournament_id and s.team_id=at.id
      ),'[]'::jsonb),
      'playing_side',coalesce((
        select jsonb_agg(jsonb_build_object(
          'player_id',p.id,'ips_code',p.ips_code,'name',p.display_name,
          'primary_role',p.primary_role,'batting_style',p.batting_style,'bowling_style',p.bowling_style,
          'order',xi.lineup_order
        ) order by xi.lineup_order)
        from public.match_playing_xi xi join public.players p on p.id=xi.player_id
        where xi.match_id=m.id and xi.team_id=at.id
      ),'[]'::jsonb),
      'roles',coalesce((
        select jsonb_object_agg(mtr.role::text,jsonb_build_object('player_id',p.id,'ips_code',p.ips_code,'name',p.display_name))
        from public.match_team_roles mtr join public.players p on p.id=mtr.player_id
        where mtr.match_id=m.id and mtr.team_id=at.id
      ),'{}'::jsonb)
    ),
    'officials',coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id',a.user_id,'role',a.role,'designation',a.designation,
        'display_name',pr.display_name
      ) order by a.role,a.designation)
      from public.match_official_assignments a
      left join public.profiles pr on pr.id=a.user_id
      where a.match_id=m.id
    ),'[]'::jsonb)
  ) into ctx
  from public.matches m
  join public.tournaments t on t.id=m.tournament_id
  join public.cities c on c.id=t.city_id
  join public.competition_rulesets r on r.id=t.ruleset_id
  join public.teams ht on ht.id=m.home_team_id
  join public.teams at on at.id=m.away_team_id
  left join public.venues v on v.id=m.venue_id
  where m.id=p_match_id;

  if ctx is null then raise exception 'Match not found.'; end if;
  return ctx;
end;
$$;

revoke all on function public.ips_controller_match_context(uuid) from public,anon;
grant execute on function public.ips_controller_match_context(uuid) to authenticated,service_role;

commit;
