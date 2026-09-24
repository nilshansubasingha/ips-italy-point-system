-- Project 6.0 validation hardening for innings start and run-out resolution.

begin;

create or replace function public.ips_start_innings(
  p_match_id uuid,
  p_batting_team_id uuid,
  p_striker_id uuid,
  p_non_striker_id uuid,
  p_bowler_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  m public.matches;
  v_innings_no integer;
  v_batting_team uuid;
  v_bowling_team uuid;
  v_target integer;
  v_previous public.match_innings;
  v_innings_id uuid;
  v_event_id uuid;
  v_sequence integer;
  v_required integer;
begin
  if not public.ips_can_score_match(p_match_id) then
    raise exception 'You are not assigned to score/manage this match.';
  end if;

  select * into m from public.matches where id=p_match_id for update;
  if not found then raise exception 'Match not found.'; end if;
  if m.status in ('COMPLETED','AWAITING_CERTIFICATION','OFFICIAL','LOCKED','CANCELLED','ABANDONED') then
    raise exception 'This match cannot start a new innings in its current status.';
  end if;

  if exists(select 1 from public.match_innings where match_id=p_match_id and status='OPEN') then
    raise exception 'An innings is already in progress.';
  end if;

  select count(*) into v_innings_no from public.match_innings where match_id=p_match_id;
  v_innings_no := v_innings_no + 1;
  if v_innings_no > 2 then raise exception 'Both innings have already been created.'; end if;

  if v_innings_no=1 then
    if p_batting_team_id is null or p_batting_team_id not in (m.home_team_id,m.away_team_id) then
      raise exception 'Choose one of the two match teams to bat first.';
    end if;
    v_batting_team := p_batting_team_id;
    v_bowling_team := case when p_batting_team_id=m.home_team_id then m.away_team_id else m.home_team_id end;
    v_target := null;
  else
    select * into v_previous
    from public.match_innings
    where match_id=p_match_id and innings_no=1 and status='COMPLETED';
    if not found then raise exception 'The first innings must be completed first.'; end if;
    v_batting_team := v_previous.bowling_team_id;
    v_bowling_team := v_previous.batting_team_id;
    if p_batting_team_id is not null and p_batting_team_id<>v_batting_team then
      raise exception 'The second-innings batting side is fixed by the first innings.';
    end if;
    v_target := v_previous.total_runs+1;
  end if;

  v_required := m.format_players_per_side;
  if (select count(*) from public.match_playing_xi where match_id=p_match_id and team_id=v_batting_team)<>v_required
     or (select count(*) from public.match_playing_xi where match_id=p_match_id and team_id=v_bowling_team)<>v_required then
    raise exception 'Both official playing sides must contain exactly % players before scoring starts.',v_required;
  end if;

  if not exists(select 1 from public.match_playing_xi where match_id=p_match_id and team_id=v_batting_team and player_id=p_striker_id)
     or not exists(select 1 from public.match_playing_xi where match_id=p_match_id and team_id=v_batting_team and player_id=p_non_striker_id) then
    raise exception 'Both opening batters must come from the batting playing side.';
  end if;
  if p_striker_id=p_non_striker_id then raise exception 'Striker and non-striker must be different players.'; end if;
  if not exists(select 1 from public.match_playing_xi where match_id=p_match_id and team_id=v_bowling_team and player_id=p_bowler_id) then
    raise exception 'Opening bowler must come from the bowling playing side.';
  end if;

  insert into public.match_innings(
    match_id,innings_no,batting_team_id,bowling_team_id,
    opening_striker_id,opening_non_striker_id,opening_bowler_id,
    target_runs,started_by
  ) values(
    p_match_id,v_innings_no,v_batting_team,v_bowling_team,
    p_striker_id,p_non_striker_id,p_bowler_id,
    v_target,auth.uid()
  ) returning id into v_innings_id;

  select coalesce(max(sequence_no),0)+1 into v_sequence
  from public.match_scoring_events where match_id=p_match_id;

  insert into public.match_scoring_events(
    match_id,innings_id,sequence_no,event_type,
    striker_id,non_striker_id,bowler_id,state_after,created_by
  ) values(
    p_match_id,v_innings_id,v_sequence,'INNINGS_START',
    p_striker_id,p_non_striker_id,p_bowler_id,
    jsonb_build_object(
      'innings_no',v_innings_no,'runs',0,'wickets',0,'legal_balls',0,
      'striker_id',p_striker_id,'non_striker_id',p_non_striker_id,'bowler_id',p_bowler_id,
      'awaiting_bowler',false,'innings_complete',false,'free_hit',false,'target_runs',v_target
    ),
    auth.uid()
  ) returning id into v_event_id;

  insert into public.match_live_state(
    match_id,innings_id,innings_no,batting_team_id,bowling_team_id,
    striker_id,non_striker_id,bowler_id,previous_bowler_id,
    total_runs,wickets,legal_balls,target_runs,awaiting_bowler,innings_complete,free_hit,last_event_id,updated_at
  ) values(
    p_match_id,v_innings_id,v_innings_no,v_batting_team,v_bowling_team,
    p_striker_id,p_non_striker_id,p_bowler_id,null,
    0,0,0,v_target,false,false,false,v_event_id,now()
  )
  on conflict(match_id) do update set
    innings_id=excluded.innings_id,
    innings_no=excluded.innings_no,
    batting_team_id=excluded.batting_team_id,
    bowling_team_id=excluded.bowling_team_id,
    striker_id=excluded.striker_id,
    non_striker_id=excluded.non_striker_id,
    bowler_id=excluded.bowler_id,
    previous_bowler_id=null,
    total_runs=0,wickets=0,legal_balls=0,
    target_runs=excluded.target_runs,
    awaiting_bowler=false,innings_complete=false,free_hit=false,
    last_event_id=excluded.last_event_id,updated_at=now();

  if m.status in ('SCHEDULED','READY') then
    update public.matches set status='LIVE' where id=p_match_id;
  end if;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(auth.uid(),'SCORING_INNINGS_STARTED','match',p_match_id,
    jsonb_build_object('innings_no',v_innings_no,'batting_team_id',v_batting_team,'bowling_team_id',v_bowling_team));

  return public.ips_scoring_context(p_match_id);
end
$$;

revoke all on function public.ips_start_innings(uuid,uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.ips_start_innings(uuid,uuid,uuid,uuid,uuid) to authenticated,service_role;


create or replace function public.ips_score_delivery(
  p_match_id uuid,
  p_runs_off_bat smallint default 0,
  p_extra_type text default null,
  p_extra_additional_runs smallint default 0,
  p_wicket_kind text default null,
  p_dismissed_player_id uuid default null,
  p_incoming_batter_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
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

  select coalesce(r.free_hit_on_no_ball,false)
  into v_free_hit_rule
  from public.tournaments t
  join public.competition_rulesets r on r.id=t.ruleset_id
  where t.id=m.tournament_id;

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
$$;

revoke all on function public.ips_score_delivery(uuid,smallint,text,smallint,text,uuid,uuid) from public,anon;
grant execute on function public.ips_score_delivery(uuid,smallint,text,smallint,text,uuid,uuid) to authenticated,service_role;


commit;
