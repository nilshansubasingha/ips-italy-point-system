-- IPS Project 6.13 — add innings team/result fields to public Match Centre summary.
begin;

drop function if exists public.ips_public_match_live_summaries();

create function public.ips_public_match_live_summaries()
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
  first_innings_team_id uuid,
  first_innings_team_name text,
  second_innings_runs integer,
  second_innings_wickets smallint,
  second_innings_team_id uuid,
  second_innings_team_name text,
  result_text text,
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
  ),
  base as (
    select
      m.*,
      ls.innings_id,
      ls.innings_no,
      ls.innings_complete,
      ls.batting_team_id,
      ls.bowling_team_id,
      ls.striker_id,
      ls.non_striker_id,
      ls.bowler_id,
      ls.total_runs,
      ls.wickets as live_wickets,
      ls.legal_balls,
      ls.target_runs,
      ls.updated_at as live_updated_at,
      i1.total_runs as i1_runs,
      i1.wickets as i1_wickets,
      i1.batting_team_id as i1_team_id,
      i2.total_runs as i2_runs,
      i2.wickets as i2_wickets,
      i2.batting_team_id as i2_team_id
    from public.matches m
    left join public.match_live_state ls on ls.match_id=m.id
    left join public.match_innings i1 on i1.match_id=m.id and i1.innings_no=1
    left join public.match_innings i2 on i2.match_id=m.id and i2.innings_no=2
    where m.status not in ('CANCELLED')
  )
  select
    b.id,
    (b.innings_id is not null),
    b.innings_no,
    coalesce(b.innings_complete,false),
    (b.status in ('COMPLETED','AWAITING_CERTIFICATION','OFFICIAL','LOCKED')),
    b.batting_team_id,
    bt.name,
    b.bowling_team_id,
    bw.name,
    case when b.innings_no=1 and b.innings_complete then b.bowling_team_id else null end,
    case when b.innings_no=1 and b.innings_complete then bw.name else null end,
    coalesce(b.total_runs,0),
    coalesce(b.live_wickets,0),
    coalesce(b.legal_balls,0),
    b.format_balls_per_over,
    (coalesce(b.legal_balls,0)/greatest(b.format_balls_per_over,1))::text||'.'||(coalesce(b.legal_balls,0)%greatest(b.format_balls_per_over,1))::text,
    b.target_runs,
    sp.display_name,
    coalesce((select sum(ad.runs_off_bat)::integer from active_deliveries ad where ad.innings_id=b.innings_id and ad.striker_id=b.striker_id),0),
    coalesce((select count(*)::integer from active_deliveries ad where ad.innings_id=b.innings_id and ad.striker_id=b.striker_id and ad.legal_delivery),0),
    nsp.display_name,
    coalesce((select sum(ad.runs_off_bat)::integer from active_deliveries ad where ad.innings_id=b.innings_id and ad.striker_id=b.non_striker_id),0),
    coalesce((select count(*)::integer from active_deliveries ad where ad.innings_id=b.innings_id and ad.striker_id=b.non_striker_id and ad.legal_delivery),0),
    bp.display_name,
    coalesce((select count(*)::integer from active_deliveries ad where ad.innings_id=b.innings_id and ad.bowler_id=b.bowler_id and ad.is_wicket and ad.wicket_kind in ('BOWLED','CAUGHT','HIT_WICKET')),0),
    coalesce((select sum(ad.runs_off_bat+ad.wide_runs+ad.no_ball_runs)::integer from active_deliveries ad where ad.innings_id=b.innings_id and ad.bowler_id=b.bowler_id),0),
    (
      coalesce((select count(*)::integer from active_deliveries ad where ad.innings_id=b.innings_id and ad.bowler_id=b.bowler_id and ad.legal_delivery),0)/greatest(b.format_balls_per_over,1)
    )::text||'.'||(
      coalesce((select count(*)::integer from active_deliveries ad where ad.innings_id=b.innings_id and ad.bowler_id=b.bowler_id and ad.legal_delivery),0)%greatest(b.format_balls_per_over,1)
    )::text,
    b.i1_runs,
    b.i1_wickets,
    b.i1_team_id,
    i1t.name,
    b.i2_runs,
    b.i2_wickets,
    b.i2_team_id,
    i2t.name,
    case
      when b.status not in ('COMPLETED','AWAITING_CERTIFICATION','OFFICIAL','LOCKED') or b.i1_runs is null or b.i2_runs is null then null
      when b.i2_runs>b.i1_runs then
        coalesce(i2t.name,'Team')||' won by '||
        greatest(coalesce(b.format_wicket_limit,greatest(b.format_players_per_side-1,1))-b.i2_wickets,0)::text||
        ' wicket'||case when greatest(coalesce(b.format_wicket_limit,greatest(b.format_players_per_side-1,1))-b.i2_wickets,0)=1 then '' else 's' end
      when b.i1_runs>b.i2_runs then
        coalesce(i1t.name,'Team')||' won by '||(b.i1_runs-b.i2_runs)::text||
        ' run'||case when (b.i1_runs-b.i2_runs)=1 then '' else 's' end
      else 'Match tied'
    end,
    b.live_updated_at
  from base b
  left join public.teams bt on bt.id=b.batting_team_id
  left join public.teams bw on bw.id=b.bowling_team_id
  left join public.teams i1t on i1t.id=b.i1_team_id
  left join public.teams i2t on i2t.id=b.i2_team_id
  left join public.players sp on sp.id=b.striker_id
  left join public.players nsp on nsp.id=b.non_striker_id
  left join public.players bp on bp.id=b.bowler_id;
$$;

revoke all on function public.ips_public_match_live_summaries() from public;
grant execute on function public.ips_public_match_live_summaries() to anon,authenticated,service_role;

notify pgrst,'reload schema';

commit;
