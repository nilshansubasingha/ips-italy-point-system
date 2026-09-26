-- IPS Project 6.12 — public match result and innings scorecard.
begin;

create or replace function public.ips_public_match_scorecard(p_match_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
with m as (
  select m.*,t.name as tournament_name,t.status as tournament_status,
         h.name as home_name,h.short_name as home_short,h.logo_url as home_logo,
         a.name as away_name,a.short_name as away_short,a.logo_url as away_logo
  from public.matches m
  join public.tournaments t on t.id=m.tournament_id
  join public.teams h on h.id=m.home_team_id
  join public.teams a on a.id=m.away_team_id
  where m.id=p_match_id
    and (t.status::text<>'DRAFT' or m.status::text in ('LIVE','COMPLETED','AWAITING_CERTIFICATION','OFFICIAL','LOCKED'))
),
active as (
  select e.*
  from public.match_scoring_events e
  join m on m.id=e.match_id
  where e.event_type='DELIVERY'
    and not exists (
      select 1 from public.match_scoring_events r
      where r.event_type='REVERSAL' and r.reverses_event_id=e.id
    )
),
innings_json as (
  select jsonb_agg(
    jsonb_build_object(
      'innings_no',i.innings_no,
      'status',i.status,
      'batting_team',jsonb_build_object('id',bt.id,'name',bt.name,'short_name',bt.short_name,'logo_url',bt.logo_url),
      'bowling_team',jsonb_build_object('id',bw.id,'name',bw.name,'short_name',bw.short_name,'logo_url',bw.logo_url),
      'runs',i.total_runs,
      'wickets',i.wickets,
      'legal_balls',i.legal_balls,
      'overs',(i.legal_balls/greatest(m.format_balls_per_over,1))::text||'.'||(i.legal_balls%greatest(m.format_balls_per_over,1))::text,
      'target_runs',i.target_runs,
      'batting',coalesce((
        select jsonb_agg(jsonb_build_object(
          'player_id',px.player_id,
          'name',p.display_name,
          'ips_code',p.ips_code,
          'order',px.lineup_order,
          'runs',coalesce((select sum(ad.runs_off_bat) from active ad where ad.innings_id=i.id and ad.striker_id=px.player_id),0),
          'balls',coalesce((select count(*) from active ad where ad.innings_id=i.id and ad.striker_id=px.player_id and ad.legal_delivery),0),
          'fours',coalesce((select count(*) from active ad where ad.innings_id=i.id and ad.striker_id=px.player_id and ad.runs_off_bat=4),0),
          'sixes',coalesce((select count(*) from active ad where ad.innings_id=i.id and ad.striker_id=px.player_id and ad.runs_off_bat=6),0),
          'dismissed',exists(select 1 from active ad where ad.innings_id=i.id and ad.dismissed_player_id=px.player_id and ad.is_wicket),
          'dismissal',coalesce((select ad.wicket_kind from active ad where ad.innings_id=i.id and ad.dismissed_player_id=px.player_id and ad.is_wicket order by ad.sequence_no desc limit 1),'')
        ) order by px.lineup_order)
        from public.match_playing_xi px
        join public.players p on p.id=px.player_id
        where px.match_id=i.match_id and px.team_id=i.batting_team_id
      ),'[]'::jsonb),
      'bowling',coalesce((
        select jsonb_agg(jsonb_build_object(
          'player_id',px.player_id,
          'name',p.display_name,
          'ips_code',p.ips_code,
          'order',px.lineup_order,
          'legal_balls',coalesce((select count(*) from active ad where ad.innings_id=i.id and ad.bowler_id=px.player_id and ad.legal_delivery),0),
          'overs',
            (coalesce((select count(*) from active ad where ad.innings_id=i.id and ad.bowler_id=px.player_id and ad.legal_delivery),0)/greatest(m.format_balls_per_over,1))::text
            ||'.'||
            (coalesce((select count(*) from active ad where ad.innings_id=i.id and ad.bowler_id=px.player_id and ad.legal_delivery),0)%greatest(m.format_balls_per_over,1))::text,
          'runs',coalesce((select sum(ad.runs_off_bat+ad.wide_runs+ad.no_ball_runs) from active ad where ad.innings_id=i.id and ad.bowler_id=px.player_id),0),
          'wickets',coalesce((select count(*) from active ad where ad.innings_id=i.id and ad.bowler_id=px.player_id and ad.is_wicket and ad.wicket_kind in ('BOWLED','CAUGHT','HIT_WICKET')),0)
        ) order by px.lineup_order)
        from public.match_playing_xi px
        join public.players p on p.id=px.player_id
        where px.match_id=i.match_id and px.team_id=i.bowling_team_id
          and exists(select 1 from active ad where ad.innings_id=i.id and ad.bowler_id=px.player_id)
      ),'[]'::jsonb)
    )
    order by i.innings_no
  ) as innings
  from public.match_innings i
  join m on m.id=i.match_id
  left join public.teams bt on bt.id=i.batting_team_id
  left join public.teams bw on bw.id=i.bowling_team_id
  group by m.format_balls_per_over
),
summary as (
  select
    i1.batting_team_id as first_batting_team_id,
    i1.total_runs as first_runs,
    i1.wickets as first_wickets,
    i2.batting_team_id as second_batting_team_id,
    i2.total_runs as second_runs,
    i2.wickets as second_wickets,
    i2.target_runs,
    m.format_players_per_side,
    coalesce(m.format_wicket_limit,greatest(m.format_players_per_side-1,1)) as wicket_limit,
    m.status
  from m
  left join public.match_innings i1 on i1.match_id=m.id and i1.innings_no=1
  left join public.match_innings i2 on i2.match_id=m.id and i2.innings_no=2
),
result as (
  select case
    when s.status::text not in ('COMPLETED','AWAITING_CERTIFICATION','OFFICIAL','LOCKED') or s.first_runs is null or s.second_runs is null then null
    when s.second_runs>s.first_runs then
      coalesce(t2.name,'Team')||' won by '||greatest(s.wicket_limit-s.second_wickets,0)||' wicket'||case when greatest(s.wicket_limit-s.second_wickets,0)=1 then '' else 's' end
    when s.first_runs>s.second_runs then
      coalesce(t1.name,'Team')||' won by '||(s.first_runs-s.second_runs)||' run'||case when (s.first_runs-s.second_runs)=1 then '' else 's' end
    else 'Match tied'
  end as result_text
  from summary s
  left join public.teams t1 on t1.id=s.first_batting_team_id
  left join public.teams t2 on t2.id=s.second_batting_team_id
)
select jsonb_build_object(
  'match',jsonb_build_object(
    'id',m.id,'code',m.match_code,'number',m.match_number,'status',m.status,'scheduled_at',m.scheduled_at,
    'stage',m.stage,'round_label',m.round_label,'players_per_side',m.format_players_per_side,
    'overs_per_innings',m.format_overs_per_innings,'balls_per_over',m.format_balls_per_over,
    'tournament_name',m.tournament_name,
    'home_team',jsonb_build_object('id',m.home_team_id,'name',m.home_name,'short_name',m.home_short,'logo_url',m.home_logo),
    'away_team',jsonb_build_object('id',m.away_team_id,'name',m.away_name,'short_name',m.away_short,'logo_url',m.away_logo)
  ),
  'result_text',(select result_text from result),
  'innings',coalesce((select innings from innings_json),'[]'::jsonb)
)
from m;
$$;

revoke all on function public.ips_public_match_scorecard(uuid) from public;
grant execute on function public.ips_public_match_scorecard(uuid) to anon,authenticated,service_role;

notify pgrst,'reload schema';

commit;
