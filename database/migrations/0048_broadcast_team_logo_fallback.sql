-- Use club branding when a team side has no team-specific logo.
begin;

create or replace function public.ips_broadcast_match_data(p_match_id uuid)
returns jsonb
language sql stable security definer
set search_path=public
as $$
with m as (
  select m.*,t.name tournament_name,t.code tournament_code,t.logo_url tournament_logo,
         t.primary_color tournament_primary,t.secondary_color tournament_secondary,
         v.name venue_name
  from public.matches m
  join public.tournaments t on t.id=m.tournament_id
  left join public.venues v on v.id=m.venue_id
  where m.id=p_match_id
    and (t.status::text<>'DRAFT' or m.status::text in ('LIVE','COMPLETED','AWAITING_CERTIFICATION','OFFICIAL','LOCKED'))
),
s as (select * from public.match_live_state where match_id=p_match_id),
active as (
  select e.*,(e.runs_off_bat+e.wide_runs+e.no_ball_runs+e.bye_runs+e.leg_bye_runs)::integer delivery_runs
  from public.match_scoring_events e
  join s on e.innings_id=s.innings_id
  where e.match_id=p_match_id and e.event_type='DELIVERY'
    and not exists(select 1 from public.match_scoring_events r where r.event_type='REVERSAL' and r.reverses_event_id=e.id)
),
last_delivery as (select * from active order by sequence_no desc limit 1),
last_wicket as (select coalesce(max(sequence_no),0) seq from active where is_wicket),
partnership as (
 select coalesce(sum(delivery_runs),0)::integer runs,
        count(*) filter(where legal_delivery)::integer balls
 from active where sequence_no>(select seq from last_wicket)
),
batting_stats as (
 select xi.player_id,p.display_name,p.ips_code,p.profile_image_url,p.batting_style,p.bowling_style,p.primary_role,xi.lineup_order,
        coalesce(sum(case when a.striker_id=xi.player_id then a.runs_off_bat else 0 end),0)::integer runs,
        count(*) filter(where a.striker_id=xi.player_id and a.legal_delivery)::integer balls,
        count(*) filter(where a.striker_id=xi.player_id and a.runs_off_bat=4)::integer fours,
        count(*) filter(where a.striker_id=xi.player_id and a.runs_off_bat=6)::integer sixes,
        (array_agg(a.wicket_kind order by a.sequence_no) filter(where a.is_wicket and a.dismissed_player_id=xi.player_id))[1] dismissal
 from public.match_playing_xi xi
 join public.players p on p.id=xi.player_id
 left join active a on true
 where xi.match_id=p_match_id and xi.team_id=(select batting_team_id from s)
 group by xi.player_id,p.display_name,p.ips_code,p.profile_image_url,p.batting_style,p.bowling_style,p.primary_role,xi.lineup_order
),
bowler_over as (
 select bowler_id,over_no,sum(runs_off_bat+wide_runs+no_ball_runs)::integer conceded
 from active group by bowler_id,over_no
),
bowling_stats as (
 select xi.player_id,p.display_name,p.ips_code,p.profile_image_url,p.batting_style,p.bowling_style,p.primary_role,xi.lineup_order,
   count(*) filter(where a.bowler_id=xi.player_id and a.legal_delivery)::integer legal_balls,
   coalesce(sum(case when a.bowler_id=xi.player_id then a.runs_off_bat+a.wide_runs+a.no_ball_runs else 0 end),0)::integer runs,
   count(*) filter(where a.bowler_id=xi.player_id and a.is_wicket and a.wicket_kind in ('BOWLED','CAUGHT','HIT_WICKET'))::integer wickets,
   coalesce((select count(*) from bowler_over bo where bo.bowler_id=xi.player_id and bo.conceded=0),0)::integer maidens
 from public.match_playing_xi xi
 join public.players p on p.id=xi.player_id
 left join active a on true
 where xi.match_id=p_match_id and xi.team_id=(select bowling_team_id from s)
 group by xi.player_id,p.display_name,p.ips_code,p.profile_image_url,p.batting_style,p.bowling_style,p.primary_role,xi.lineup_order
),
over_groups as (
 select over_no,
   coalesce(sum(delivery_runs),0)::integer runs,
   count(*) filter(where is_wicket)::integer wickets,
   jsonb_agg(delivery_label order by sequence_no) balls
 from active group by over_no order by over_no desc
),
innings_rows as (
 select i.*,t.name batting_name,t.short_name batting_short,t.logo_url batting_logo
 from public.match_innings i join public.teams t on t.id=i.batting_team_id
 where i.match_id=p_match_id
)
select jsonb_build_object(
 'match',jsonb_build_object(
   'id',m.id,'code',m.match_code,'number',m.match_number,'status',m.status,'stage',m.stage,'round',m.round_label,
   'scheduled_at',m.scheduled_at,'venue',m.venue_name,
   'tournament',jsonb_build_object('id',m.tournament_id,'name',m.tournament_name,'code',m.tournament_code,'logo_url',m.tournament_logo,'primary_color',m.tournament_primary,'secondary_color',m.tournament_secondary),
   'home_team',jsonb_build_object('id',ht.id,'name',ht.name,'short_name',ht.short_name,'logo_url',coalesce(ht.logo_url,hc.logo_url),'primary_color',coalesce(ht.primary_color,'#19d18f'),'secondary_color',coalesce(ht.secondary_color,'#071d2d')),
   'away_team',jsonb_build_object('id',at.id,'name',at.name,'short_name',at.short_name,'logo_url',coalesce(at.logo_url,ac.logo_url),'primary_color',coalesce(at.primary_color,'#4f7cff'),'secondary_color',coalesce(at.secondary_color,'#071d2d'))
 ),
 'innings',jsonb_build_object(
   'started',s.innings_id is not null,'number',s.innings_no,'complete',coalesce(s.innings_complete,false),
   'batting_team',jsonb_build_object('id',bt.id,'name',bt.name,'short_name',coalesce(bt.short_name,bt.name),'logo_url',coalesce(bt.logo_url,bc.logo_url),'primary_color',coalesce(bt.primary_color,'#19d18f'),'secondary_color',coalesce(bt.secondary_color,'#071d2d')),
   'bowling_team',jsonb_build_object('id',bw.id,'name',bw.name,'short_name',coalesce(bw.short_name,bw.name),'logo_url',coalesce(bw.logo_url,wc.logo_url),'primary_color',coalesce(bw.primary_color,'#4f7cff'),'secondary_color',coalesce(bw.secondary_color,'#071d2d')),
   'runs',coalesce(s.total_runs,0),'wickets',coalesce(s.wickets,0),
   'score_display',coalesce(s.total_runs,0)::text||'/'||coalesce(s.wickets,0)::text,
   'legal_balls',coalesce(s.legal_balls,0),
   'overs',(coalesce(s.legal_balls,0)/greatest(m.format_balls_per_over,1))::text||'.'||(coalesce(s.legal_balls,0)%greatest(m.format_balls_per_over,1))::text,
   'target',s.target_runs,
   'runs_required',case when s.target_runs is null then null else greatest(s.target_runs-coalesce(s.total_runs,0),0) end,
   'balls_remaining',case when s.innings_id is null then null else greatest(m.format_overs_per_innings*m.format_balls_per_over-coalesce(s.legal_balls,0),0) end,
   'crr',case when coalesce(s.legal_balls,0)=0 then 0 else round((s.total_runs::numeric*m.format_balls_per_over)/s.legal_balls,2) end,
   'rrr',case when s.target_runs is null or greatest(m.format_overs_per_innings*m.format_balls_per_over-coalesce(s.legal_balls,0),0)=0 then null else round((greatest(s.target_runs-s.total_runs,0)::numeric*m.format_balls_per_over)/greatest(m.format_overs_per_innings*m.format_balls_per_over-s.legal_balls,1),2) end,
   'projected_score',case when coalesce(s.legal_balls,0)=0 then null else ceil((s.total_runs::numeric*(m.format_overs_per_innings*m.format_balls_per_over))/s.legal_balls)::integer end,
   'chase_display',case when s.target_runs is null then '' else 'NEED '||greatest(s.target_runs-s.total_runs,0)::text||' FROM '||greatest(m.format_overs_per_innings*m.format_balls_per_over-s.legal_balls,0)::text end,
   'free_hit',coalesce(s.free_hit,false),
   'extras',jsonb_build_object(
      'wide',coalesce((select sum(wide_runs) from active),0),
      'no_ball',coalesce((select sum(no_ball_runs) from active),0),
      'bye',coalesce((select sum(bye_runs) from active),0),
      'leg_bye',coalesce((select sum(leg_bye_runs) from active),0),
      'total',coalesce((select sum(wide_runs+no_ball_runs+bye_runs+leg_bye_runs) from active),0)
   )
 ),
 'current',jsonb_build_object(
   'striker',coalesce((select jsonb_build_object('id',bs.player_id,'name',bs.display_name,'photo_url',bs.profile_image_url,'ips_code',bs.ips_code,'role',bs.primary_role,'batting_style',bs.batting_style,'runs',bs.runs,'balls',bs.balls,'fours',bs.fours,'sixes',bs.sixes,'strike_rate',case when bs.balls=0 then 0 else round(bs.runs::numeric*100/bs.balls,1) end,'score_display',bs.runs::text||' ('||bs.balls::text||')') from batting_stats bs where bs.player_id=s.striker_id),'{}'::jsonb),
   'non_striker',coalesce((select jsonb_build_object('id',bs.player_id,'name',bs.display_name,'photo_url',bs.profile_image_url,'ips_code',bs.ips_code,'role',bs.primary_role,'batting_style',bs.batting_style,'runs',bs.runs,'balls',bs.balls,'fours',bs.fours,'sixes',bs.sixes,'strike_rate',case when bs.balls=0 then 0 else round(bs.runs::numeric*100/bs.balls,1) end,'score_display',bs.runs::text||' ('||bs.balls::text||')') from batting_stats bs where bs.player_id=s.non_striker_id),'{}'::jsonb),
   'bowler',coalesce((select jsonb_build_object('id',bs.player_id,'name',bs.display_name,'photo_url',bs.profile_image_url,'ips_code',bs.ips_code,'role',bs.primary_role,'bowling_style',bs.bowling_style,'runs',bs.runs,'wickets',bs.wickets,'maidens',bs.maidens,'legal_balls',bs.legal_balls,'overs',(bs.legal_balls/m.format_balls_per_over)::text||'.'||(bs.legal_balls%m.format_balls_per_over)::text,'economy',case when bs.legal_balls=0 then 0 else round(bs.runs::numeric*m.format_balls_per_over/bs.legal_balls,2) end,'figures_display',bs.wickets::text||'/'||bs.runs::text||' ('||(bs.legal_balls/m.format_balls_per_over)::text||'.'||(bs.legal_balls%m.format_balls_per_over)::text||')') from bowling_stats bs where bs.player_id=s.bowler_id),'{}'::jsonb),
   'partnership',jsonb_build_object('runs',(select runs from partnership),'balls',(select balls from partnership)),
   'last_wicket',coalesce((
      select jsonb_build_object(
        'sequence_no',d.sequence_no,
        'player_id',d.dismissed_player_id,
        'name',p.display_name,
        'photo_url',p.profile_image_url,
        'runs',coalesce(bs.runs,0),
        'balls',coalesce(bs.balls,0),
        'score_display',coalesce(bs.runs,0)::text||' ('||coalesce(bs.balls,0)::text||')',
        'wicket_kind',d.wicket_kind
      )
      from active d
      left join public.players p on p.id=d.dismissed_player_id
      left join batting_stats bs on bs.player_id=d.dismissed_player_id
      where d.is_wicket
      order by d.sequence_no desc
      limit 1
   ),'{}'::jsonb),
   'current_over',coalesce((select balls from over_groups order by over_no desc limit 1),'[]'::jsonb),
   'previous_over',coalesce((select jsonb_build_object('over_no',over_no+1,'runs',runs,'wickets',wickets,'balls',balls) from over_groups order by over_no desc offset 1 limit 1),'{}'::jsonb),
   'last_five_overs',coalesce((select jsonb_agg(jsonb_build_object('over_no',x.over_no+1,'runs',x.runs,'wickets',x.wickets,'balls',x.balls) order by x.over_no) from (select * from over_groups order by over_no desc limit 5) x),'[]'::jsonb)
 ),
 'batting_scorecard',coalesce((select jsonb_agg(jsonb_build_object('player_id',bs.player_id,'name',bs.display_name,'photo_url',bs.profile_image_url,'runs',bs.runs,'balls',bs.balls,'fours',bs.fours,'sixes',bs.sixes,'strike_rate',case when bs.balls=0 then 0 else round(bs.runs::numeric*100/bs.balls,1) end,'dismissal',bs.dismissal,'is_striker',bs.player_id=s.striker_id,'is_non_striker',bs.player_id=s.non_striker_id) order by bs.lineup_order) from batting_stats bs),'[]'::jsonb),
 'bowling_scorecard',coalesce((select jsonb_agg(jsonb_build_object('player_id',bs.player_id,'name',bs.display_name,'photo_url',bs.profile_image_url,'overs',(bs.legal_balls/m.format_balls_per_over)::text||'.'||(bs.legal_balls%m.format_balls_per_over)::text,'maidens',bs.maidens,'runs',bs.runs,'wickets',bs.wickets,'economy',case when bs.legal_balls=0 then 0 else round(bs.runs::numeric*m.format_balls_per_over/bs.legal_balls,2) end,'is_current',bs.player_id=s.bowler_id) order by bs.lineup_order) from bowling_stats bs where bs.legal_balls>0 or bs.player_id=s.bowler_id),'[]'::jsonb),
 'playing_xi',jsonb_build_object(
   'home',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'photo_url',p.profile_image_url,'role',p.primary_role,'batting_style',p.batting_style,'bowling_style',p.bowling_style,'order',xi.lineup_order) order by xi.lineup_order) from public.match_playing_xi xi join public.players p on p.id=xi.player_id where xi.match_id=p_match_id and xi.team_id=m.home_team_id),'[]'::jsonb),
   'away',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'photo_url',p.profile_image_url,'role',p.primary_role,'batting_style',p.batting_style,'bowling_style',p.bowling_style,'order',xi.lineup_order) order by xi.lineup_order) from public.match_playing_xi xi join public.players p on p.id=xi.player_id where xi.match_id=p_match_id and xi.team_id=m.away_team_id),'[]'::jsonb)
 ),
 'innings_history',coalesce((select jsonb_agg(jsonb_build_object('innings_no',i.innings_no,'team',i.batting_name,'team_short',i.batting_short,'team_logo',i.batting_logo,'runs',i.total_runs,'wickets',i.wickets,'legal_balls',i.legal_balls,'target',i.target_runs,'status',i.status) order by i.innings_no) from innings_rows i),'[]'::jsonb),
 'last_delivery',coalesce((select jsonb_build_object(
   'id',d.id,'sequence_no',d.sequence_no,'label',d.delivery_label,'runs_off_bat',d.runs_off_bat,'is_wicket',d.is_wicket,'wicket_kind',d.wicket_kind,
   'dismissed_player',coalesce((select jsonb_build_object('id',p.id,'name',p.display_name,'photo_url',p.profile_image_url) from public.players p where p.id=d.dismissed_player_id),'{}'::jsonb)
 ) from last_delivery d),'{}'::jsonb)
)
from m
left join s on true
left join public.teams ht on ht.id=m.home_team_id
left join public.clubs hc on hc.id=ht.club_id
left join public.teams at on at.id=m.away_team_id
left join public.clubs ac on ac.id=at.club_id
left join public.teams bt on bt.id=s.batting_team_id
left join public.clubs bc on bc.id=bt.club_id
left join public.teams bw on bw.id=s.bowling_team_id
left join public.clubs wc on wc.id=bw.club_id;
$$;

revoke all on function public.ips_broadcast_match_data(uuid) from public;
grant execute on function public.ips_broadcast_match_data(uuid) to anon,authenticated,service_role;

commit;
