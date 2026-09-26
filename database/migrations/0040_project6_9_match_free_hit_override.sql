-- IPS Project 6.9 — match-specific no-ball free-hit setting for Quick Match and format snapshots.
begin;

alter table public.matches
  add column if not exists format_free_hit_on_no_ball boolean;

update public.matches m
set format_free_hit_on_no_ball=coalesce(r.free_hit_on_no_ball,false)
from public.tournaments t
join public.competition_rulesets r on r.id=t.ruleset_id
where t.id=m.tournament_id
  and m.format_free_hit_on_no_ball is null;

alter table public.matches
  alter column format_free_hit_on_no_ball set default false,
  alter column format_free_hit_on_no_ball set not null;

CREATE OR REPLACE FUNCTION public.ips_snapshot_match_format()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  t public.tournaments;
  v_free_hit boolean;
begin
  select * into t from public.tournaments where id=new.tournament_id;
  if not found then raise exception 'Tournament not found.'; end if;

  select coalesce(r.free_hit_on_no_ball,false) into v_free_hit
  from public.competition_rulesets r where r.id=t.ruleset_id;

  new.format_players_per_side := coalesce(new.format_players_per_side,t.players_per_side);
  new.format_overs_per_innings := coalesce(new.format_overs_per_innings,t.overs_per_innings);
  new.format_balls_per_over := coalesce(new.format_balls_per_over,t.balls_per_over);
  new.format_wicket_limit := coalesce(new.format_wicket_limit,t.wicket_limit);
  new.format_max_overs_per_bowler := coalesce(new.format_max_overs_per_bowler,t.tournament_max_overs_per_bowler);
  new.format_free_hit_on_no_ball := coalesce(new.format_free_hit_on_no_ball,v_free_hit,false);
  new.format_source := coalesce(new.format_source,'TOURNAMENT');
  new.venue_id := coalesce(new.venue_id,t.default_venue_id);
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.ips_sync_unstarted_match_format_from_tournament()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_free_hit boolean;
begin
  select coalesce(r.free_hit_on_no_ball,false) into v_free_hit
  from public.competition_rulesets r where r.id=new.ruleset_id;
  update public.matches m
  set format_players_per_side = new.players_per_side,
      format_overs_per_innings = new.overs_per_innings,
      format_balls_per_over = new.balls_per_over,
      format_wicket_limit = new.wicket_limit,
      format_max_overs_per_bowler = new.tournament_max_overs_per_bowler,
      format_free_hit_on_no_ball = v_free_hit
  where m.tournament_id = new.id
    and m.format_source = 'TOURNAMENT'
    and m.status::text in ('SCHEDULED','READY','CANCELLED')
    and (
      m.format_players_per_side is distinct from new.players_per_side
      or m.format_overs_per_innings is distinct from new.overs_per_innings
      or m.format_balls_per_over is distinct from new.balls_per_over
      or m.format_wicket_limit is distinct from new.wicket_limit
      or m.format_max_overs_per_bowler is distinct from new.tournament_max_overs_per_bowler
      or m.format_free_hit_on_no_ball is distinct from v_free_hit
    );

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.ips_override_match_format(p_match_id uuid, p_players_per_side smallint, p_overs_per_innings smallint, p_balls_per_over smallint, p_wicket_limit smallint DEFAULT NULL::smallint, p_max_overs_per_bowler smallint DEFAULT NULL::smallint, p_reason text DEFAULT NULL::text, p_free_hit_on_no_ball boolean DEFAULT NULL::boolean)
 RETURNS matches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  m public.matches;
  result public.matches;
  live_or_later boolean;
begin
  select * into m from public.matches where id=p_match_id for update;
  if not found then raise exception 'Match not found.'; end if;

  if m.status in ('COMPLETED','AWAITING_CERTIFICATION','OFFICIAL','LOCKED') then
    raise exception 'Match format cannot be changed after the match has been completed.';
  end if;

  live_or_later := m.status='LIVE';

  if live_or_later then
    if not public.ips_can_manage_tournament(m.tournament_id) then
      raise exception 'A tournament administrator is required to change format after the match starts.';
    end if;
    if coalesce(trim(p_reason),'')='' then
      raise exception 'A reason is required for a live-match format override.';
    end if;
  else
    if not public.ips_can_score_match(m.id) then
      raise exception 'You are not authorised to change this match format.';
    end if;
  end if;

  if p_players_per_side not between 2 and 20 then raise exception 'Players per side must be between 2 and 20.'; end if;
  if p_overs_per_innings not between 1 and 100 then raise exception 'Overs per innings must be between 1 and 100.'; end if;
  if p_balls_per_over not between 1 and 12 then raise exception 'Balls per over must be between 1 and 12.'; end if;
  if p_wicket_limit is not null and (p_wicket_limit<1 or p_wicket_limit>19) then raise exception 'Wicket limit is invalid.'; end if;
  if p_max_overs_per_bowler is not null and (p_max_overs_per_bowler<1 or p_max_overs_per_bowler>100) then raise exception 'Bowler over limit is invalid.'; end if;

  update public.matches
  set
    format_players_per_side=p_players_per_side,
    format_overs_per_innings=p_overs_per_innings,
    format_balls_per_over=p_balls_per_over,
    format_wicket_limit=p_wicket_limit,
    format_max_overs_per_bowler=p_max_overs_per_bowler,
    format_free_hit_on_no_ball=coalesce(p_free_hit_on_no_ball,m.format_free_hit_on_no_ball),
    format_source='MATCH_OVERRIDE',
    format_override_reason=nullif(trim(p_reason),''),
    format_overridden_by=auth.uid(),
    format_overridden_at=now()
  where id=p_match_id
  returning * into result;

  return result;
end $function$;

CREATE OR REPLACE FUNCTION public.ips_score_delivery(p_match_id uuid, p_runs_off_bat smallint DEFAULT 0, p_extra_type text DEFAULT NULL::text, p_extra_additional_runs smallint DEFAULT 0, p_wicket_kind text DEFAULT NULL::text, p_dismissed_player_id uuid DEFAULT NULL::uuid, p_incoming_batter_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  s public.match_live_state;
  m public.matches;
  v_extra text;
  v_wicket text;
  v_runs_off_bat integer := coalesce(p_runs_off_bat,0);
  v_additional integer := coalesce(p_extra_additional_runs,0);
  v_wide integer := 0;
  v_no_ball integer := 0;
  v_bye integer := 0;
  v_leg_bye integer := 0;
  v_total_delta integer := 0;
  v_rotation_runs integer := 0;
  v_legal boolean := true;
  v_free_hit_rule boolean := false;
  v_free_hit_after boolean;
  v_striker_after uuid;
  v_non_striker_after uuid;
  v_bowler_after uuid;
  v_previous_bowler_after uuid;
  v_dismissed uuid;
  v_runs_after integer;
  v_wickets_after integer;
  v_legal_after integer;
  v_effective_wickets integer;
  v_max_balls integer;
  v_innings_end boolean := false;
  v_awaiting_bowler boolean := false;
  v_sequence integer;
  v_event_id uuid;
  v_over_no integer;
  v_ball_no integer;
  v_label text;
  v_temp uuid;
begin
  if not public.ips_can_score_match(p_match_id) then
    raise exception 'You are not assigned to score/manage this match.';
  end if;

  select * into s from public.match_live_state where match_id=p_match_id for update;
  if not found or s.innings_id is null then raise exception 'Start the innings before recording a delivery.'; end if;
  if s.innings_complete then raise exception 'This innings is complete.'; end if;
  if s.awaiting_bowler or s.bowler_id is null then raise exception 'Select the next bowler before recording another delivery.'; end if;

  select * into m from public.matches where id=p_match_id;
  v_extra := nullif(upper(trim(coalesce(p_extra_type,''))),'');
  v_wicket := nullif(upper(trim(coalesce(p_wicket_kind,''))),'');
  v_effective_wickets := public.ips_effective_wicket_limit(p_match_id);
  v_max_balls := m.format_overs_per_innings*m.format_balls_per_over;
  v_over_no := s.legal_balls/m.format_balls_per_over;
  v_ball_no := (s.legal_balls % m.format_balls_per_over)+1;

  v_free_hit_rule := coalesce(m.format_free_hit_on_no_ball,false);

  if v_runs_off_bat<0 or v_runs_off_bat>12 or v_additional<0 or v_additional>12 then
    raise exception 'Run value is outside the supported range.';
  end if;
  if v_extra is not null and v_extra not in ('WIDE','NO_BALL','BYE','LEG_BYE') then
    raise exception 'Unsupported extra type.';
  end if;
  if v_wicket is not null and v_wicket not in ('BOWLED','CAUGHT','RUN_OUT','HIT_WICKET') then
    raise exception 'Unsupported wicket type.';
  end if;
  if v_wicket is not null and (v_extra is not null or v_runs_off_bat<>0 or v_additional<>0) then
    raise exception 'Record this wicket as its own delivery. Combined wicket/extras will be added through the advanced correction flow.';
  end if;
  if s.free_hit and v_wicket in ('BOWLED','CAUGHT','HIT_WICKET') then
    raise exception 'Only a run out from the available wicket choices can dismiss a batter on this free hit.';
  end if;

  if v_extra='WIDE' then
    if v_runs_off_bat<>0 then raise exception 'Wide additional runs are recorded with the WD + value, not batter runs.'; end if;
    v_legal := false;
    v_wide := 1+v_additional;
    v_rotation_runs := v_additional;
    v_label := case when v_additional=0 then 'WD' else 'WD+'||v_additional::text end;
  elsif v_extra='NO_BALL' then
    if v_additional<>0 then raise exception 'No-ball + value is recorded as runs off the bat.'; end if;
    v_legal := false;
    v_no_ball := 1;
    v_rotation_runs := v_runs_off_bat;
    v_label := case when v_runs_off_bat=0 then 'NB' else 'NB+'||v_runs_off_bat::text end;
  elsif v_extra='BYE' then
    if v_runs_off_bat<>0 or v_additional=0 then raise exception 'Bye requires a + run value.'; end if;
    v_legal := true;
    v_bye := v_additional;
    v_rotation_runs := v_additional;
    v_label := 'B+'||v_additional::text;
  elsif v_extra='LEG_BYE' then
    if v_runs_off_bat<>0 or v_additional=0 then raise exception 'Leg bye requires a + run value.'; end if;
    v_legal := true;
    v_leg_bye := v_additional;
    v_rotation_runs := v_additional;
    v_label := 'LB+'||v_additional::text;
  else
    v_legal := true;
    v_rotation_runs := v_runs_off_bat;
    v_label := v_runs_off_bat::text;
  end if;

  v_striker_after := s.striker_id;
  v_non_striker_after := s.non_striker_id;
  v_bowler_after := s.bowler_id;
  v_previous_bowler_after := s.previous_bowler_id;
  v_runs_after := s.total_runs+v_runs_off_bat+v_wide+v_no_ball+v_bye+v_leg_bye;
  v_wickets_after := s.wickets + case when v_wicket is null then 0 else 1 end;
  v_legal_after := s.legal_balls + case when v_legal then 1 else 0 end;

  if v_wicket is not null then
    if v_wicket='RUN_OUT' then
      if p_dismissed_player_id is null or p_dismissed_player_id not in (s.striker_id,s.non_striker_id) then
        raise exception 'Choose the striker or non-striker for the run out.';
      end if;
      v_dismissed := p_dismissed_player_id;
    else
      v_dismissed := s.striker_id;
    end if;
    v_label := 'W';
  else
    if mod(v_rotation_runs,2)=1 then
      v_temp:=v_striker_after; v_striker_after:=v_non_striker_after; v_non_striker_after:=v_temp;
    end if;
  end if;

  v_innings_end :=
    v_wickets_after>=v_effective_wickets
    or v_legal_after>=v_max_balls
    or (s.target_runs is not null and v_runs_after>=s.target_runs);

  if v_wicket is not null and not v_innings_end then
    if p_incoming_batter_id is null then raise exception 'Select the next batter.'; end if;
    if not exists(
      select 1 from public.match_playing_xi
      where match_id=p_match_id and team_id=s.batting_team_id and player_id=p_incoming_batter_id
    ) then raise exception 'Next batter must come from the batting playing side.'; end if;
    if p_incoming_batter_id in (s.striker_id,s.non_striker_id) then raise exception 'That batter is already at the crease.'; end if;
    if exists(
      select 1 from public.match_scoring_events e
      where e.innings_id=s.innings_id and e.event_type='DELIVERY'
        and e.is_wicket and e.dismissed_player_id=p_incoming_batter_id
        and not exists(
          select 1 from public.match_scoring_events r
          where r.event_type='REVERSAL' and r.reverses_event_id=e.id
        )
    ) then raise exception 'A dismissed batter cannot return as the next batter.'; end if;

    if v_dismissed=s.striker_id then
      v_striker_after:=p_incoming_batter_id;
      v_non_striker_after:=s.non_striker_id;
    else
      v_striker_after:=s.striker_id;
      v_non_striker_after:=p_incoming_batter_id;
    end if;
  end if;

  if v_legal and mod(v_legal_after,m.format_balls_per_over)=0 and not v_innings_end then
    v_temp:=v_striker_after; v_striker_after:=v_non_striker_after; v_non_striker_after:=v_temp;
    v_previous_bowler_after:=s.bowler_id;
    v_bowler_after:=null;
    v_awaiting_bowler:=true;
  end if;

  if v_extra='NO_BALL' and v_free_hit_rule then
    v_free_hit_after:=true;
  elsif v_legal then
    v_free_hit_after:=false;
  else
    v_free_hit_after:=s.free_hit;
  end if;

  if v_innings_end then
    v_awaiting_bowler:=false;
    v_bowler_after:=null;
    v_free_hit_after:=false;
  end if;

  select coalesce(max(sequence_no),0)+1 into v_sequence
  from public.match_scoring_events where match_id=p_match_id;

  insert into public.match_scoring_events(
    match_id,innings_id,sequence_no,event_type,over_no,ball_no,
    striker_id,non_striker_id,bowler_id,legal_delivery,
    runs_off_bat,wide_runs,no_ball_runs,bye_runs,leg_bye_runs,
    is_wicket,wicket_kind,dismissed_player_id,incoming_batter_id,delivery_label,
    state_after,created_by
  ) values(
    p_match_id,s.innings_id,v_sequence,'DELIVERY',v_over_no,v_ball_no,
    s.striker_id,s.non_striker_id,s.bowler_id,v_legal,
    v_runs_off_bat,v_wide,v_no_ball,v_bye,v_leg_bye,
    v_wicket is not null,v_wicket,v_dismissed,p_incoming_batter_id,v_label,
    jsonb_build_object(
      'innings_no',s.innings_no,'runs',v_runs_after,'wickets',v_wickets_after,'legal_balls',v_legal_after,
      'striker_id',v_striker_after,'non_striker_id',v_non_striker_after,'bowler_id',v_bowler_after,
      'previous_bowler_id',v_previous_bowler_after,'awaiting_bowler',v_awaiting_bowler,
      'innings_complete',v_innings_end,'free_hit',v_free_hit_after,'target_runs',s.target_runs
    ),
    auth.uid()
  ) returning id into v_event_id;

  update public.match_innings
  set total_runs=v_runs_after,wickets=v_wickets_after,legal_balls=v_legal_after,
      status=case when v_innings_end then 'COMPLETED' else 'OPEN' end,
      completed_at=case when v_innings_end then now() else null end
  where id=s.innings_id;

  update public.match_live_state
  set striker_id=v_striker_after,non_striker_id=v_non_striker_after,
      bowler_id=v_bowler_after,previous_bowler_id=v_previous_bowler_after,
      total_runs=v_runs_after,wickets=v_wickets_after,legal_balls=v_legal_after,
      awaiting_bowler=v_awaiting_bowler,innings_complete=v_innings_end,
      free_hit=v_free_hit_after,last_event_id=v_event_id,updated_at=now()
  where match_id=p_match_id;

  if v_innings_end and s.innings_no=2 then
    update public.matches set status='COMPLETED' where id=p_match_id;
  end if;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(auth.uid(),'SCORING_DELIVERY_RECORDED','match',p_match_id,
    jsonb_build_object(
      'innings_no',s.innings_no,'sequence_no',v_sequence,'label',v_label,
      'runs_after',v_runs_after,'wickets_after',v_wickets_after,'legal_balls_after',v_legal_after,
      'wicket_kind',v_wicket,'dismissed_player_id',v_dismissed
    ));

  return public.ips_scoring_context(p_match_id);
end
$function$;

CREATE OR REPLACE FUNCTION public.ips_controller_match_context(p_match_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
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
      'free_hit_on_no_ball',m.format_free_hit_on_no_ball,
      'source',m.format_source,
      'override_reason',m.format_override_reason,
      'overridden_at',m.format_overridden_at
    ),
    'rules', jsonb_build_object(
      'id',r.id,'name',r.name,'version',r.version,
      'free_hit_on_no_ball',m.format_free_hit_on_no_ball,
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
$function$;

notify pgrst,'reload schema';

commit;
