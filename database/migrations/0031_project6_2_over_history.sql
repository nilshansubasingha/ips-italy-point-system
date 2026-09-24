-- IPS Project 6.2 — derived over history for the scorer cockpit.
-- History is read from the immutable scoring-event ledger; reversals are excluded.

begin;

create or replace function public.ips_scoring_over_history(p_match_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth
as $$
declare
  s public.match_live_state;
  v_bpo integer;
  v_result jsonb;
begin
  if not public.ips_can_score_match(p_match_id) then
    raise exception 'You are not assigned to score/manage this match.';
  end if;

  select * into s
  from public.match_live_state
  where match_id=p_match_id;

  if not found or s.innings_id is null then
    return '[]'::jsonb;
  end if;

  select format_balls_per_over
  into v_bpo
  from public.matches
  where id=p_match_id;

  with active_deliveries as (
    select e.*
    from public.match_scoring_events e
    where e.match_id=p_match_id
      and e.innings_id=s.innings_id
      and e.event_type='DELIVERY'
      and not exists (
        select 1
        from public.match_scoring_events r
        where r.event_type='REVERSAL'
          and r.reverses_event_id=e.id
      )
  ),
  over_summaries as (
    select
      ad.over_no,
      count(*) filter (where ad.legal_delivery)::integer as legal_balls,
      coalesce(sum(ad.runs_off_bat+ad.wide_runs+ad.no_ball_runs+ad.bye_runs+ad.leg_bye_runs),0)::integer as runs,
      count(*) filter (where ad.is_wicket)::integer as wickets,
      (array_agg(ad.bowler_id order by ad.sequence_no))[1] as bowler_id,
      (array_agg(ad.id order by ad.sequence_no desc))[1] as last_event_id,
      jsonb_agg(
        jsonb_build_object(
          'id',ad.id,
          'label',ad.delivery_label,
          'legal',ad.legal_delivery,
          'is_wicket',ad.is_wicket
        )
        order by ad.sequence_no
      ) as balls
    from active_deliveries ad
    group by ad.over_no
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'over_no',os.over_no+1,
        'runs',os.runs,
        'wickets',os.wickets,
        'legal_balls',os.legal_balls,
        'complete',os.legal_balls>=v_bpo,
        'current',
          not coalesce(s.innings_complete,false)
          and not coalesce(s.awaiting_bowler,false)
          and os.over_no=(s.legal_balls/v_bpo),
        'bowler_id',os.bowler_id,
        'bowler_name',p.display_name,
        'score_after',coalesce((last_event.state_after->>'runs')::integer,0),
        'wickets_after',coalesce((last_event.state_after->>'wickets')::integer,0),
        'balls',os.balls
      )
      order by os.over_no desc
    ),
    '[]'::jsonb
  )
  into v_result
  from over_summaries os
  left join public.players p on p.id=os.bowler_id
  left join public.match_scoring_events last_event on last_event.id=os.last_event_id;

  return v_result;
end;
$$;

revoke all on function public.ips_scoring_over_history(uuid) from public,anon;
grant execute on function public.ips_scoring_over_history(uuid) to authenticated,service_role;

commit;
