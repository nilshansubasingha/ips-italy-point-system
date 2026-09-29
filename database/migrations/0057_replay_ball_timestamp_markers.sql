begin;

create table if not exists public.broadcast_replay_ball_markers (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  scoring_event_id uuid unique references public.match_scoring_events(id) on delete set null,
  marked_at timestamptz not null default clock_timestamp(),
  linked_at timestamptz,
  sequence_no integer,
  over_no integer,
  ball_no smallint,
  delivery_label text,
  score_state jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists broadcast_replay_ball_markers_match_time_idx
  on public.broadcast_replay_ball_markers(match_id, marked_at desc);

alter table public.broadcast_replay_ball_markers enable row level security;

create or replace function public.ips_replay_mark_ball(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_marker public.broadcast_replay_ball_markers%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.ips_can_direct_match(p_match_id) then raise exception 'Not authorized for this match'; end if;

  insert into public.broadcast_replay_ball_markers(match_id,created_by)
  values(p_match_id,auth.uid())
  returning * into v_marker;

  return to_jsonb(v_marker);
end;
$$;

create or replace function public.ips_replay_link_latest_pending_marker(p_match_id uuid,p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_event public.match_scoring_events%rowtype;
  v_marker public.broadcast_replay_ball_markers%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.ips_can_direct_match(p_match_id) then raise exception 'Not authorized for this match'; end if;

  select * into v_event
  from public.match_scoring_events
  where id=p_event_id and match_id=p_match_id and event_type='DELIVERY';

  if not found then return null; end if;

  select * into v_marker
  from public.broadcast_replay_ball_markers
  where match_id=p_match_id
    and scoring_event_id is null
    and marked_at<=v_event.created_at
    and marked_at>=v_event.created_at-interval '45 seconds'
  order by marked_at desc
  limit 1
  for update skip locked;

  if not found then return null; end if;

  update public.broadcast_replay_ball_markers
  set scoring_event_id=v_event.id,
      linked_at=clock_timestamp(),
      sequence_no=v_event.sequence_no,
      over_no=v_event.over_no,
      ball_no=v_event.ball_no,
      delivery_label=v_event.delivery_label,
      score_state=v_event.state_after
  where id=v_marker.id
  returning * into v_marker;

  return to_jsonb(v_marker);
end;
$$;

create or replace function public.ips_replay_ball_markers(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.ips_can_direct_match(p_match_id) then raise exception 'Not authorized for this match'; end if;

  select coalesce(jsonb_agg(to_jsonb(m) order by m.marked_at desc),'[]'::jsonb)
  into v_result
  from (
    select *
    from public.broadcast_replay_ball_markers
    where match_id=p_match_id
    order by marked_at desc
    limit 100
  ) m;

  return v_result;
end;
$$;

revoke all on public.broadcast_replay_ball_markers from anon,authenticated;
revoke all on function public.ips_replay_mark_ball(uuid) from public;
revoke all on function public.ips_replay_link_latest_pending_marker(uuid,uuid) from public;
revoke all on function public.ips_replay_ball_markers(uuid) from public;
grant execute on function public.ips_replay_mark_ball(uuid) to authenticated,service_role;
grant execute on function public.ips_replay_link_latest_pending_marker(uuid,uuid) to authenticated,service_role;
grant execute on function public.ips_replay_ball_markers(uuid) to authenticated,service_role;

commit;
