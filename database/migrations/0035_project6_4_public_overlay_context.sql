-- IPS Project 6.4 — public, read-only live projection for broadcast overlays.
-- Scoring remains event-ledger/server-authoritative. This function exposes only derived broadcast state.

begin;

create or replace function public.ips_public_overlay_context(p_match_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
with m as (
  select m.*, t.name as tournament_name
  from public.matches m
  join public.tournaments t on t.id=m.tournament_id
  where m.id=p_match_id
    and (
      t.status::text <> 'DRAFT'
      or m.status::text in ('LIVE','COMPLETED','AWAITING_CERTIFICATION','OFFICIAL','LOCKED')
    )
),
s as (
  select *
  from public.match_live_state
  where match_id=p_match_id
),
active as (
  select e.*
  from public.match_scoring_events e
  join s on e.innings_id=s.innings_id
  where e.match_id=p_match_id
    and e.event_type='DELIVERY'
    and not exists (
      select 1
      from public.match_scoring_events r
      where r.event_type='REVERSAL'
        and r.reverses_event_id=e.id
    )
),
ctx as (
  select
    m.*,
    s.innings_id,
    s.innings_no,
    s.batting_team_id,
    s.bowling_team_id,
    s.striker_id,
    s.non_striker_id,
    s.bowler_id,
    s.total_runs,
    s.wickets,
    s.legal_balls,
    s.target_runs,
    s.awaiting_bowler,
    s.innings_complete,
    s.free_hit,
    s.updated_at as score_updated_at
  from m
  left join s on true
)
select jsonb_build_object(
  'match_id',c.id,
  'match_code',c.match_code,
  'tournament_name',c.tournament_name,
  'status',c.status,
  'started',c.innings_id is not null,
  'innings_no',c.innings_no,
  'batting_team',jsonb_build_object(
    'id',bt.id,
    'name',bt.name,
    'short_name',bt.short_name
  ),
  'bowling_team',jsonb_build_object(
    'id',bw.id,
    'name',bw.name,
    'short_name',bw.short_name
  ),
  'runs',coalesce(c.total_runs,0),
  'wickets',coalesce(c.wickets,0),
  'legal_balls',coalesce(c.legal_balls,0),
  'balls_per_over',c.format_balls_per_over,
  'overs',
    (coalesce(c.legal_balls,0)/greatest(c.format_balls_per_over,1))::text
    ||'.'||
    (coalesce(c.legal_balls,0)%greatest(c.format_balls_per_over,1))::text,
  'target_runs',c.target_runs,
  'runs_required',
    case
      when c.target_runs is null then null
      else greatest(c.target_runs-coalesce(c.total_runs,0),0)
    end,
  'balls_remaining',
    case
      when c.innings_id is null then null
      else greatest(
        c.format_overs_per_innings*c.format_balls_per_over-coalesce(c.legal_balls,0),
        0
      )
    end,
  'free_hit',coalesce(c.free_hit,false),
  'striker',jsonb_build_object(
    'id',sp.id,
    'name',sp.display_name,
    'runs',coalesce((
      select sum(a.runs_off_bat)
      from active a
      where a.striker_id=c.striker_id
    ),0),
    'balls',coalesce((
      select count(*)
      from active a
      where a.striker_id=c.striker_id
        and a.legal_delivery
    ),0)
  ),
  'non_striker',jsonb_build_object(
    'id',np.id,
    'name',np.display_name,
    'runs',coalesce((
      select sum(a.runs_off_bat)
      from active a
      where a.striker_id=c.non_striker_id
    ),0),
    'balls',coalesce((
      select count(*)
      from active a
      where a.striker_id=c.non_striker_id
        and a.legal_delivery
    ),0)
  ),
  'bowler',jsonb_build_object(
    'id',bp.id,
    'name',bp.display_name,
    'runs',coalesce((
      select sum(a.runs_off_bat+a.wide_runs+a.no_ball_runs)
      from active a
      where a.bowler_id=c.bowler_id
    ),0),
    'wickets',coalesce((
      select count(*)
      from active a
      where a.bowler_id=c.bowler_id
        and a.is_wicket
        and a.wicket_kind in ('BOWLED','CAUGHT','HIT_WICKET')
    ),0),
    'legal_balls',coalesce((
      select count(*)
      from active a
      where a.bowler_id=c.bowler_id
        and a.legal_delivery
    ),0)
  ),
  'current_over',coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id',a.id,
        'label',a.delivery_label,
        'legal',a.legal_delivery,
        'is_wicket',a.is_wicket
      )
      order by a.sequence_no
    )
    from active a
    where a.over_no=case
      when coalesce(c.awaiting_bowler,false)
        then greatest(
          (coalesce(c.legal_balls,0)/greatest(c.format_balls_per_over,1))-1,
          0
        )
      else coalesce(c.legal_balls,0)/greatest(c.format_balls_per_over,1)
    end
  ),'[]'::jsonb),
  'updated_at',c.score_updated_at
)
from ctx c
left join public.teams bt on bt.id=c.batting_team_id
left join public.teams bw on bw.id=c.bowling_team_id
left join public.players sp on sp.id=c.striker_id
left join public.players np on np.id=c.non_striker_id
left join public.players bp on bp.id=c.bowler_id;
$$;

revoke all on function public.ips_public_overlay_context(uuid) from public;
grant execute on function public.ips_public_overlay_context(uuid) to anon,authenticated,service_role;

commit;
