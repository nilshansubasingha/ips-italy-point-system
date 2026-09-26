-- IPS Project 6.7 — public-safe live Match Centre summaries.
begin;

create or replace function public.ips_public_match_live_summaries()
returns table(
  match_id uuid,
  started boolean,
  innings_no smallint,
  innings_complete boolean,
  match_complete boolean,
  batting_team_id uuid,
  batting_team_name text,
  bowling_team_id uuid,
  bowling_team_name text,
  next_batting_team_id uuid,
  next_batting_team_name text,
  runs integer,
  wickets smallint,
  legal_balls integer,
  balls_per_over smallint,
  overs_text text,
  target_runs integer,
  striker_name text,
  striker_runs integer,
  striker_balls integer,
  non_striker_name text,
  non_striker_runs integer,
  non_striker_balls integer,
  bowler_name text,
  bowler_wickets integer,
  bowler_runs integer,
  bowler_overs text,
  first_innings_runs integer,
  first_innings_wickets smallint,
  second_innings_runs integer,
  second_innings_wickets smallint,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path=public,auth
as $$
  with active_deliveries as (
    select e.*
    from public.match_scoring_events e
    where e.event_type='DELIVERY'
      and not exists (
        select 1
        from public.match_scoring_events r
        where r.event_type='REVERSAL'
          and r.reverses_event_id=e.id
      )
  )
  select
    m.id as match_id,
    (ls.innings_id is not null) as started,
    ls.innings_no,
    coalesce(ls.innings_complete,false) as innings_complete,
    (m.status in ('COMPLETED','AWAITING_CERTIFICATION','OFFICIAL','LOCKED')) as match_complete,
    ls.batting_team_id,
    bt.name as batting_team_name,
    ls.bowling_team_id,
    bw.name as bowling_team_name,
    case when ls.innings_no=1 and ls.innings_complete then ls.bowling_team_id else null end as next_batting_team_id,
    case when ls.innings_no=1 and ls.innings_complete then bw.name else null end as next_batting_team_name,
    coalesce(ls.total_runs,0) as runs,
    coalesce(ls.wickets,0) as wickets,
    coalesce(ls.legal_balls,0) as legal_balls,
    m.format_balls_per_over as balls_per_over,
    (coalesce(ls.legal_balls,0)/greatest(m.format_balls_per_over,1))::text||'.'||(coalesce(ls.legal_balls,0)%greatest(m.format_balls_per_over,1))::text as overs_text,
    ls.target_runs,
    sp.display_name as striker_name,
    coalesce((
      select sum(ad.runs_off_bat)::integer
      from active_deliveries ad
      where ad.innings_id=ls.innings_id and ad.striker_id=ls.striker_id
    ),0) as striker_runs,
    coalesce((
      select count(*)::integer
      from active_deliveries ad
      where ad.innings_id=ls.innings_id and ad.striker_id=ls.striker_id and ad.legal_delivery
    ),0) as striker_balls,
    nsp.display_name as non_striker_name,
    coalesce((
      select sum(ad.runs_off_bat)::integer
      from active_deliveries ad
      where ad.innings_id=ls.innings_id and ad.striker_id=ls.non_striker_id
    ),0) as non_striker_runs,
    coalesce((
      select count(*)::integer
      from active_deliveries ad
      where ad.innings_id=ls.innings_id and ad.striker_id=ls.non_striker_id and ad.legal_delivery
    ),0) as non_striker_balls,
    bp.display_name as bowler_name,
    coalesce((
      select count(*)::integer
      from active_deliveries ad
      where ad.innings_id=ls.innings_id
        and ad.bowler_id=ls.bowler_id
        and ad.is_wicket
        and ad.wicket_kind in ('BOWLED','CAUGHT','HIT_WICKET')
    ),0) as bowler_wickets,
    coalesce((
      select sum(ad.runs_off_bat+ad.wide_runs+ad.no_ball_runs)::integer
      from active_deliveries ad
      where ad.innings_id=ls.innings_id and ad.bowler_id=ls.bowler_id
    ),0) as bowler_runs,
    (
      coalesce((
        select count(*)::integer
        from active_deliveries ad
        where ad.innings_id=ls.innings_id and ad.bowler_id=ls.bowler_id and ad.legal_delivery
      ),0)/greatest(m.format_balls_per_over,1)
    )::text||'.'||(
      coalesce((
        select count(*)::integer
        from active_deliveries ad
        where ad.innings_id=ls.innings_id and ad.bowler_id=ls.bowler_id and ad.legal_delivery
      ),0)%greatest(m.format_balls_per_over,1)
    )::text as bowler_overs,
    i1.total_runs as first_innings_runs,
    i1.wickets as first_innings_wickets,
    i2.total_runs as second_innings_runs,
    i2.wickets as second_innings_wickets,
    ls.updated_at
  from public.matches m
  left join public.match_live_state ls on ls.match_id=m.id
  left join public.teams bt on bt.id=ls.batting_team_id
  left join public.teams bw on bw.id=ls.bowling_team_id
  left join public.players sp on sp.id=ls.striker_id
  left join public.players nsp on nsp.id=ls.non_striker_id
  left join public.players bp on bp.id=ls.bowler_id
  left join public.match_innings i1 on i1.match_id=m.id and i1.innings_no=1
  left join public.match_innings i2 on i2.match_id=m.id and i2.innings_no=2
  where m.status not in ('CANCELLED');
$$;

revoke all on function public.ips_public_match_live_summaries() from public;
grant execute on function public.ips_public_match_live_summaries() to anon,authenticated,service_role;

notify pgrst,'reload schema';

commit;
