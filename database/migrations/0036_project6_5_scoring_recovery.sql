-- IPS Project 6.5 — scorer recovery controls.
-- Undo is ledger-based via REVERSAL events. Reset reverses the current innings back to its INNINGS_START snapshot.

begin;

create or replace function public.ips_undo_last_delivery(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  s public.match_live_state;
  m public.matches;
  v_target public.match_scoring_events;
  v_prev_state jsonb;
  v_sequence integer;
  v_reversal_id uuid;
  v_aux public.match_scoring_events;
begin
  if not public.ips_can_score_match(p_match_id) then
    raise exception 'You are not assigned to score/manage this match.';
  end if;

  select * into m from public.matches where id=p_match_id for update;
  if not found then raise exception 'Match not found.'; end if;
  if m.status in ('OFFICIAL','LOCKED','CANCELLED','ABANDONED') then
    raise exception 'This match cannot be changed in its current status.';
  end if;

  select * into s from public.match_live_state where match_id=p_match_id for update;
  if not found or s.innings_id is null then
    raise exception 'No innings is available to undo.';
  end if;

  select e.* into v_target
  from public.match_scoring_events e
  where e.innings_id=s.innings_id
    and e.event_type='DELIVERY'
    and not exists (
      select 1
      from public.match_scoring_events r
      where r.event_type='REVERSAL'
        and r.reverses_event_id=e.id
    )
  order by e.sequence_no desc
  limit 1;

  if not found then
    raise exception 'There is no recorded delivery to undo.';
  end if;

  -- If the scorer already selected the next bowler after the delivery being undone,
  -- reverse that setup event as part of the rollback so the match returns to one coherent state.
  for v_aux in
    select e.*
    from public.match_scoring_events e
    where e.innings_id=s.innings_id
      and e.event_type='BOWLER_CHANGE'
      and e.sequence_no>v_target.sequence_no
      and not exists (
        select 1
        from public.match_scoring_events r
        where r.event_type='REVERSAL'
          and r.reverses_event_id=e.id
      )
    order by e.sequence_no desc
  loop
    select coalesce(max(sequence_no),0)+1 into v_sequence
    from public.match_scoring_events where match_id=p_match_id;

    insert into public.match_scoring_events(
      match_id,innings_id,sequence_no,event_type,reverses_event_id,state_after,created_by
    ) values(
      p_match_id,s.innings_id,v_sequence,'REVERSAL',v_aux.id,'{}'::jsonb,auth.uid()
    );
  end loop;

  select e.state_after into v_prev_state
  from public.match_scoring_events e
  where e.innings_id=s.innings_id
    and e.sequence_no<v_target.sequence_no
    and e.event_type in ('INNINGS_START','DELIVERY','BOWLER_CHANGE')
    and not exists (
      select 1
      from public.match_scoring_events r
      where r.event_type='REVERSAL'
        and r.reverses_event_id=e.id
    )
  order by e.sequence_no desc
  limit 1;

  if v_prev_state is null then
    raise exception 'Could not reconstruct the score before the last delivery.';
  end if;

  select coalesce(max(sequence_no),0)+1 into v_sequence
  from public.match_scoring_events where match_id=p_match_id;

  insert into public.match_scoring_events(
    match_id,innings_id,sequence_no,event_type,reverses_event_id,state_after,created_by
  ) values(
    p_match_id,s.innings_id,v_sequence,'REVERSAL',v_target.id,v_prev_state,auth.uid()
  ) returning id into v_reversal_id;

  update public.match_innings
  set total_runs=coalesce((v_prev_state->>'runs')::integer,0),
      wickets=coalesce((v_prev_state->>'wickets')::smallint,0),
      legal_balls=coalesce((v_prev_state->>'legal_balls')::integer,0),
      status=case when coalesce((v_prev_state->>'innings_complete')::boolean,false) then 'COMPLETED' else 'OPEN' end,
      completed_at=case when coalesce((v_prev_state->>'innings_complete')::boolean,false) then completed_at else null end
  where id=s.innings_id;

  update public.match_live_state
  set striker_id=(v_prev_state->>'striker_id')::uuid,
      non_striker_id=(v_prev_state->>'non_striker_id')::uuid,
      bowler_id=(v_prev_state->>'bowler_id')::uuid,
      previous_bowler_id=(v_prev_state->>'previous_bowler_id')::uuid,
      total_runs=coalesce((v_prev_state->>'runs')::integer,0),
      wickets=coalesce((v_prev_state->>'wickets')::smallint,0),
      legal_balls=coalesce((v_prev_state->>'legal_balls')::integer,0),
      target_runs=case
        when v_prev_state ? 'target_runs' then (v_prev_state->>'target_runs')::integer
        else target_runs
      end,
      awaiting_bowler=coalesce((v_prev_state->>'awaiting_bowler')::boolean,false),
      innings_complete=coalesce((v_prev_state->>'innings_complete')::boolean,false),
      free_hit=coalesce((v_prev_state->>'free_hit')::boolean,false),
      last_event_id=v_reversal_id,
      updated_at=now()
  where match_id=p_match_id;

  if m.status in ('COMPLETED','AWAITING_CERTIFICATION') then
    update public.matches set status='LIVE' where id=p_match_id;
  end if;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(
    auth.uid(),'SCORING_DELIVERY_UNDONE','match',p_match_id,
    jsonb_build_object(
      'innings_no',s.innings_no,
      'reversed_event_id',v_target.id,
      'reversed_sequence_no',v_target.sequence_no,
      'reversed_label',v_target.delivery_label
    )
  );

  return public.ips_scoring_context(p_match_id);
end
$$;

revoke all on function public.ips_undo_last_delivery(uuid) from public,anon;
grant execute on function public.ips_undo_last_delivery(uuid) to authenticated,service_role;


create or replace function public.ips_reset_current_innings(
  p_match_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  s public.match_live_state;
  m public.matches;
  v_start public.match_scoring_events;
  v_event public.match_scoring_events;
  v_sequence integer;
  v_reversal_id uuid;
  v_reversed_count integer := 0;
begin
  if not public.ips_can_score_match(p_match_id) then
    raise exception 'You are not assigned to score/manage this match.';
  end if;

  select * into m from public.matches where id=p_match_id for update;
  if not found then raise exception 'Match not found.'; end if;
  if m.status in ('OFFICIAL','LOCKED','CANCELLED','ABANDONED') then
    raise exception 'This match cannot be reset in its current status.';
  end if;

  select * into s from public.match_live_state where match_id=p_match_id for update;
  if not found or s.innings_id is null then
    raise exception 'No innings is available to reset.';
  end if;

  select e.* into v_start
  from public.match_scoring_events e
  where e.innings_id=s.innings_id
    and e.event_type='INNINGS_START'
  order by e.sequence_no asc
  limit 1;

  if not found then
    raise exception 'The innings start snapshot is missing.';
  end if;

  for v_event in
    select e.*
    from public.match_scoring_events e
    where e.innings_id=s.innings_id
      and e.event_type in ('DELIVERY','BOWLER_CHANGE')
      and not exists (
        select 1
        from public.match_scoring_events r
        where r.event_type='REVERSAL'
          and r.reverses_event_id=e.id
      )
    order by e.sequence_no asc
  loop
    select coalesce(max(sequence_no),0)+1 into v_sequence
    from public.match_scoring_events where match_id=p_match_id;

    insert into public.match_scoring_events(
      match_id,innings_id,sequence_no,event_type,reverses_event_id,state_after,created_by
    ) values(
      p_match_id,s.innings_id,v_sequence,'REVERSAL',v_event.id,v_start.state_after,auth.uid()
    ) returning id into v_reversal_id;

    v_reversed_count := v_reversed_count + 1;
  end loop;

  update public.match_innings
  set total_runs=0,
      wickets=0,
      legal_balls=0,
      status='OPEN',
      completed_at=null
  where id=s.innings_id;

  update public.match_live_state
  set striker_id=(v_start.state_after->>'striker_id')::uuid,
      non_striker_id=(v_start.state_after->>'non_striker_id')::uuid,
      bowler_id=(v_start.state_after->>'bowler_id')::uuid,
      previous_bowler_id=null,
      total_runs=0,
      wickets=0,
      legal_balls=0,
      target_runs=case
        when v_start.state_after ? 'target_runs' then (v_start.state_after->>'target_runs')::integer
        else target_runs
      end,
      awaiting_bowler=false,
      innings_complete=false,
      free_hit=false,
      last_event_id=coalesce(v_reversal_id,v_start.id),
      updated_at=now()
  where match_id=p_match_id;

  if m.status in ('COMPLETED','AWAITING_CERTIFICATION') then
    update public.matches set status='LIVE' where id=p_match_id;
  end if;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(
    auth.uid(),'SCORING_INNINGS_RESET','match',p_match_id,
    jsonb_build_object(
      'innings_no',s.innings_no,
      'reversed_events',v_reversed_count,
      'reason',nullif(trim(coalesce(p_reason,'')),'')
    )
  );

  return public.ips_scoring_context(p_match_id);
end
$$;

revoke all on function public.ips_reset_current_innings(uuid,text) from public,anon;
grant execute on function public.ips_reset_current_innings(uuid,text) to authenticated,service_role;

commit;
