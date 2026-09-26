-- IPS Project 6.18 — fastest fifty and hat-trick ranking facts.
begin;

drop function if exists public.ips_public_player_rankings(smallint);

create function public.ips_public_player_rankings(p_overs smallint default null)
returns table(
  player_id uuid,
  ips_code text,
  slug text,
  display_name text,
  profile_image_url text,
  team_id uuid,
  team_name text,
  team_short_name text,
  city_id uuid,
  city_name text,
  matches integer,
  runs integer,
  balls integer,
  fours integer,
  sixes integer,
  wickets integer,
  bowling_runs integer,
  bowling_balls integer,
  strike_rate numeric,
  economy numeric,
  fifties integer,
  hundreds integer,
  three_wicket_hauls integer,
  five_wicket_hauls integer,
  best_bowling_wickets integer,
  best_bowling_runs integer,
  fastest_fifty_balls integer,
  fastest_fifty_score integer,
  fastest_fifty_fours integer,
  fastest_fifty_sixes integer,
  hat_tricks integer,
  batting_points numeric,
  bowling_points numeric,
  all_rounder_points numeric
)
language sql
stable
security definer
set search_path=public
as $$
with formula as (
  select *
  from public.ranking_formula_versions
  where active
  order by version desc
  limit 1
),
eligible as (
  select s.*
  from public.player_match_stats s
  where s.is_official
    and s.ranking_eligible
    and (p_overs is null or s.overs_format=p_overs)
),
eligible_matches as (
  select distinct match_id from eligible
),
agg as (
  select
    s.player_id,
    count(*)::integer as matches,
    sum(s.runs)::integer as runs,
    sum(s.balls)::integer as balls,
    sum(s.fours)::integer as fours,
    sum(s.sixes)::integer as sixes,
    sum(s.wickets)::integer as wickets,
    sum(s.bowling_runs)::integer as bowling_runs,
    sum(s.bowling_balls)::integer as bowling_balls,
    count(*) filter(where s.runs between 50 and 99)::integer as fifties,
    count(*) filter(where s.runs>=100)::integer as hundreds,
    count(*) filter(where s.wickets>=3)::integer as three_wicket_hauls,
    count(*) filter(where s.wickets>=5)::integer as five_wicket_hauls
  from eligible s
  group by s.player_id
),
best_bowling as (
  select distinct on(player_id)
    player_id,wickets as best_wickets,bowling_runs as best_runs
  from eligible
  where bowling_balls>0
  order by player_id,wickets desc,bowling_runs asc
),
active_deliveries as (
  select e.*
  from public.match_scoring_events e
  join eligible_matches em on em.match_id=e.match_id
  where e.event_type='DELIVERY'
    and not exists(
      select 1 from public.match_scoring_events r
      where r.event_type='REVERSAL' and r.reverses_event_id=e.id
    )
),
batter_progress as (
  select
    e.innings_id,
    e.striker_id as player_id,
    e.sequence_no,
    sum(e.runs_off_bat) over(partition by e.innings_id,e.striker_id order by e.sequence_no rows unbounded preceding)::integer as cumulative_runs,
    sum(case when e.legal_delivery then 1 else 0 end) over(partition by e.innings_id,e.striker_id order by e.sequence_no rows unbounded preceding)::integer as cumulative_balls,
    sum(case when e.runs_off_bat=4 then 1 else 0 end) over(partition by e.innings_id,e.striker_id order by e.sequence_no rows unbounded preceding)::integer as cumulative_fours,
    sum(case when e.runs_off_bat=6 then 1 else 0 end) over(partition by e.innings_id,e.striker_id order by e.sequence_no rows unbounded preceding)::integer as cumulative_sixes
  from active_deliveries e
  where e.striker_id is not null
),
fifty_reach as (
  select *,
    row_number() over(partition by innings_id,player_id order by sequence_no) as reach_order
  from batter_progress
  where cumulative_runs>=50
),
fastest_fifty as (
  select distinct on(player_id)
    player_id,
    cumulative_balls as balls_to_fifty,
    cumulative_runs as score_at_fifty,
    cumulative_fours as fours_at_fifty,
    cumulative_sixes as sixes_at_fifty
  from fifty_reach
  where reach_order=1
  order by player_id,cumulative_balls asc,cumulative_runs desc
),
bowler_delivery_marks as (
  select
    e.innings_id,
    e.bowler_id as player_id,
    e.sequence_no,
    case when e.is_wicket and e.wicket_kind in ('BOWLED','CAUGHT','HIT_WICKET') then 1 else 0 end as wicket_mark
  from active_deliveries e
  where e.bowler_id is not null
),
bowler_streak as (
  select *,
    lag(wicket_mark,1,0) over(partition by innings_id,player_id order by sequence_no) as prev1,
    lag(wicket_mark,2,0) over(partition by innings_id,player_id order by sequence_no) as prev2
  from bowler_delivery_marks
),
hat_tricks as (
  select player_id,count(*)::integer as hat_tricks
  from bowler_streak
  where wicket_mark=1 and prev1=1 and prev2=1
  group by player_id
),
current_team as (
  select distinct on(tm.player_id)
    tm.player_id,tm.team_id,t.name,t.short_name,c.city_id,ci.name as city_name
  from public.team_memberships tm
  join public.teams t on t.id=tm.team_id
  join public.clubs c on c.id=t.club_id
  left join public.cities ci on ci.id=c.city_id
  where tm.status='ACTIVE' and tm.end_on is null
  order by tm.player_id,tm.start_on desc,tm.created_at desc
)
select
  p.id,
  p.ips_code,
  p.slug,
  p.display_name,
  p.profile_image_url,
  ct.team_id,
  ct.name,
  ct.short_name,
  ct.city_id,
  ct.city_name,
  a.matches,
  a.runs,
  a.balls,
  a.fours,
  a.sixes,
  a.wickets,
  a.bowling_runs,
  a.bowling_balls,
  case when a.balls>0 then round((a.runs::numeric*100)/a.balls,2) else 0 end,
  case when a.bowling_balls>0 then round((a.bowling_runs::numeric*6)/a.bowling_balls,2) else 0 end,
  a.fifties,
  a.hundreds,
  a.three_wicket_hauls,
  a.five_wicket_hauls,
  coalesce(bb.best_wickets,0),
  coalesce(bb.best_runs,0),
  ff.balls_to_fifty,
  ff.score_at_fifty,
  ff.fours_at_fifty,
  ff.sixes_at_fifty,
  coalesce(ht.hat_tricks,0),
  round(a.runs*f.runs_weight+a.fours*f.four_bonus+a.sixes*f.six_bonus+a.fifties*f.fifty_bonus+a.hundreds*f.hundred_bonus,2),
  round(a.wickets*f.wicket_weight+a.three_wicket_hauls*f.three_wicket_bonus+a.five_wicket_hauls*f.five_wicket_bonus,2),
  round(
    a.runs*f.runs_weight+a.fours*f.four_bonus+a.sixes*f.six_bonus+a.fifties*f.fifty_bonus+a.hundreds*f.hundred_bonus+
    a.wickets*f.wicket_weight+a.three_wicket_hauls*f.three_wicket_bonus+a.five_wicket_hauls*f.five_wicket_bonus
  ,2)
from agg a
join public.players p on p.id=a.player_id
cross join formula f
left join best_bowling bb on bb.player_id=a.player_id
left join fastest_fifty ff on ff.player_id=a.player_id
left join hat_tricks ht on ht.player_id=a.player_id
left join current_team ct on ct.player_id=a.player_id
order by a.runs desc,p.display_name;
$$;

revoke all on function public.ips_public_player_rankings(smallint) from public;
grant execute on function public.ips_public_player_rankings(smallint) to anon,authenticated,service_role;

notify pgrst,'reload schema';

commit;
