-- Correct the Project 6.3 scoring context bowler photo field.

create or replace function public.ips_scoring_context(p_match_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth
as $$
declare
  m public.matches;
  s public.match_live_state;
  v_bpo integer;
  v_max_balls integer;
  v_effective_wickets integer;
  v_consecutive boolean;
  v_max_bowler_overs integer;
  v_innings_count integer;
  v_next_batting_team uuid;
  v_current_over integer;
  v_context jsonb;
begin
  if not public.ips_can_score_match(p_match_id) then
    raise exception 'You are not assigned to score/manage this match.';
  end if;

  select * into m from public.matches where id=p_match_id;
  if not found then raise exception 'Match not found.'; end if;

  select coalesce(r.consecutive_overs_by_same_bowler_allowed,false)
  into v_consecutive
  from public.tournaments t
  join public.competition_rulesets r on r.id=t.ruleset_id
  where t.id=m.tournament_id;

  v_bpo := m.format_balls_per_over;
  v_max_balls := m.format_overs_per_innings * v_bpo;
  v_effective_wickets := public.ips_effective_wicket_limit(p_match_id);
  v_max_bowler_overs := m.format_max_overs_per_bowler;

  select count(*) into v_innings_count from public.match_innings where match_id=p_match_id;
  select * into s from public.match_live_state where match_id=p_match_id;

  if s.innings_id is not null then
    if s.innings_complete and s.innings_no=1 then v_next_batting_team := s.bowling_team_id; end if;
    if s.awaiting_bowler then
      v_current_over := greatest((s.legal_balls / v_bpo)-1,0);
    else
      v_current_over := s.legal_balls / v_bpo;
    end if;
  end if;

  with active_deliveries as (
    select e.*
    from public.match_scoring_events e
    where e.match_id=p_match_id
      and e.event_type='DELIVERY'
      and (s.innings_id is null or e.innings_id=s.innings_id)
      and not exists (
        select 1 from public.match_scoring_events r
        where r.event_type='REVERSAL' and r.reverses_event_id=e.id
      )
  ),
  batter_stats as (
    select xi.player_id,p.display_name,p.ips_code,p.profile_image_url,xi.lineup_order,
      coalesce(sum(case when ad.striker_id=xi.player_id then ad.runs_off_bat else 0 end),0)::integer as runs,
      count(*) filter (where ad.striker_id=xi.player_id and ad.legal_delivery)::integer as balls,
      count(*) filter (where ad.striker_id=xi.player_id and ad.runs_off_bat=4)::integer as fours,
      count(*) filter (where ad.striker_id=xi.player_id and ad.runs_off_bat=6)::integer as sixes,
      exists(select 1 from active_deliveries d where d.is_wicket and d.dismissed_player_id=xi.player_id) as dismissed
    from public.match_playing_xi xi
    join public.players p on p.id=xi.player_id
    left join active_deliveries ad on ad.innings_id=s.innings_id
    where s.batting_team_id is not null
      and xi.match_id=p_match_id and xi.team_id=s.batting_team_id
    group by xi.player_id,p.display_name,p.ips_code,p.profile_image_url,xi.lineup_order
  ),
  bowler_stats as (
    select xi.player_id,p.display_name,p.ips_code,p.profile_image_url,xi.lineup_order,
      count(*) filter (where ad.bowler_id=xi.player_id and ad.legal_delivery)::integer as legal_balls,
      coalesce(sum(case when ad.bowler_id=xi.player_id then ad.runs_off_bat+ad.wide_runs+ad.no_ball_runs else 0 end),0)::integer as runs,
      count(*) filter (
        where ad.bowler_id=xi.player_id and ad.is_wicket and ad.wicket_kind in ('BOWLED','CAUGHT','HIT_WICKET')
      )::integer as wickets
    from public.match_playing_xi xi
    join public.players p on p.id=xi.player_id
    left join active_deliveries ad on ad.innings_id=s.innings_id
    where s.bowling_team_id is not null
      and xi.match_id=p_match_id and xi.team_id=s.bowling_team_id
    group by xi.player_id,p.display_name,p.ips_code,p.profile_image_url,xi.lineup_order
  )
  select jsonb_build_object(
    'started',s.innings_id is not null,
    'innings_count',v_innings_count,
    'innings_no',s.innings_no,
    'innings_complete',coalesce(s.innings_complete,false),
    'match_complete',m.status in ('COMPLETED','AWAITING_CERTIFICATION','OFFICIAL','LOCKED'),
    'batting_team_id',s.batting_team_id,
    'bowling_team_id',s.bowling_team_id,
    'striker_id',s.striker_id,
    'non_striker_id',s.non_striker_id,
    'bowler_id',s.bowler_id,
    'previous_bowler_id',s.previous_bowler_id,
    'runs',coalesce(s.total_runs,0),
    'wickets',coalesce(s.wickets,0),
    'legal_balls',coalesce(s.legal_balls,0),
    'balls_per_over',v_bpo,
    'max_balls',v_max_balls,
    'overs_per_innings',m.format_overs_per_innings,
    'effective_wicket_limit',v_effective_wickets,
    'target_runs',s.target_runs,
    'runs_required',case when s.target_runs is null then null else greatest(s.target_runs-s.total_runs,0) end,
    'balls_remaining',case when s.innings_id is null then null else greatest(v_max_balls-s.legal_balls,0) end,
    'awaiting_bowler',coalesce(s.awaiting_bowler,false),
    'free_hit',coalesce(s.free_hit,false),
    'next_batting_team_id',v_next_batting_team,
    'innings',coalesce((
      select jsonb_agg(jsonb_build_object(
        'innings_no',i.innings_no,'batting_team_id',i.batting_team_id,'bowling_team_id',i.bowling_team_id,
        'runs',i.total_runs,'wickets',i.wickets,'legal_balls',i.legal_balls,'status',i.status,'target_runs',i.target_runs
      ) order by i.innings_no)
      from public.match_innings i where i.match_id=p_match_id
    ),'[]'::jsonb),
    'batter_stats',coalesce((
      select jsonb_agg(jsonb_build_object(
        'player_id',bs.player_id,'name',bs.display_name,'ips_code',bs.ips_code,'profile_image_url',bs.profile_image_url,'lineup_order',bs.lineup_order,
        'runs',bs.runs,'balls',bs.balls,'fours',bs.fours,'sixes',bs.sixes,
        'strike_rate',case when bs.balls=0 then 0 else round((bs.runs::numeric*100)/bs.balls,1) end,
        'dismissed',bs.dismissed
      ) order by bs.lineup_order)
      from batter_stats bs
    ),'[]'::jsonb),
    'bowler_stats',coalesce((
      select jsonb_agg(jsonb_build_object(
        'player_id',bs.player_id,'name',bs.display_name,'ips_code',bs.ips_code,'profile_image_url',bs.profile_image_url,'lineup_order',bs.lineup_order,
        'legal_balls',bs.legal_balls,
        'overs',(bs.legal_balls/v_bpo)::text||'.'||(bs.legal_balls%v_bpo)::text,
        'runs',bs.runs,'wickets',bs.wickets,
        'economy',case when bs.legal_balls=0 then 0 else round((bs.runs::numeric*v_bpo)/bs.legal_balls,2) end
      ) order by bs.lineup_order)
      from bowler_stats bs
    ),'[]'::jsonb),
    'current_over',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',ad.id,'label',ad.delivery_label,'legal',ad.legal_delivery,'is_wicket',ad.is_wicket
      ) order by ad.sequence_no)
      from active_deliveries ad
      where ad.over_no=v_current_over
    ),'[]'::jsonb),
    'next_batters',coalesce((
      select jsonb_agg(jsonb_build_object(
        'player_id',bs.player_id,'name',bs.display_name,'ips_code',bs.ips_code,
        'available',not bs.dismissed and bs.player_id not in (
          coalesce(s.striker_id,'00000000-0000-0000-0000-000000000000'::uuid),
          coalesce(s.non_striker_id,'00000000-0000-0000-0000-000000000000'::uuid)
        ),
        'reason',case
          when bs.dismissed then 'OUT'
          when bs.player_id=s.striker_id or bs.player_id=s.non_striker_id then 'BATTING'
          else null end
      ) order by bs.lineup_order)
      from batter_stats bs
    ),'[]'::jsonb),
    'bowlers',coalesce((
      select jsonb_agg(jsonb_build_object(
        'player_id',bs.player_id,'name',bs.display_name,'ips_code',bs.ips_code,
        'available',
          (v_consecutive or s.previous_bowler_id is null or bs.player_id<>s.previous_bowler_id)
          and (v_max_bowler_overs is null or bs.legal_balls < v_max_bowler_overs*v_bpo),
        'reason',case
          when not v_consecutive and s.previous_bowler_id=bs.player_id then 'PREVIOUS BOWLER'
          when v_max_bowler_overs is not null and bs.legal_balls >= v_max_bowler_overs*v_bpo then 'OVER LIMIT'
          else null end
      ) order by bs.lineup_order)
      from bowler_stats bs
    ),'[]'::jsonb)
  ) into v_context;

  return v_context;
end
$$;

revoke all on function public.ips_scoring_context(uuid) from public,anon;
grant execute on function public.ips_scoring_context(uuid) to authenticated,service_role;
