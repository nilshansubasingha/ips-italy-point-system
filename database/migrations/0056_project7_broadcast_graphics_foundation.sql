-- IPS Project 7.0 — broadcast graphics foundation.
-- Presentation cues are intentionally separate from authoritative cricket scoring state.
-- The scorer remains the source of truth; Director actions only affect broadcast presentation.

begin;

create table if not exists public.broadcast_graphic_cues (
  id uuid primary key default gen_random_uuid(),
  sequence_no bigint generated always as identity unique,
  match_id uuid not null references public.matches(id) on update cascade on delete cascade,
  output text not null default 'PROGRAM' check (output in ('PREVIEW','PROGRAM')),
  graphic text not null,
  mode text not null default 'COMPACT' check (mode in ('COMPACT','LOWER_THIRD','SIDE_PANEL','FULL_SCREEN')),
  layer smallint not null check (layer between 1 and 6),
  payload jsonb not null default '{}'::jsonb,
  duration_ms integer check (duration_ms is null or duration_ms between 0 and 120000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists broadcast_graphic_cues_match_sequence_idx
  on public.broadcast_graphic_cues(match_id,sequence_no desc);

alter table public.broadcast_graphic_cues enable row level security;

drop policy if exists "broadcast public reads cues" on public.broadcast_graphic_cues;
create policy "broadcast public reads cues"
on public.broadcast_graphic_cues
for select
to anon,authenticated
using (
  exists (
    select 1
    from public.matches m
    join public.tournaments t on t.id=m.tournament_id
    where m.id=match_id
      and t.status::text <> 'DRAFT'
      and m.status::text <> 'CANCELLED'
  )
  or public.ips_can_score_match(match_id)
);

grant select on public.broadcast_graphic_cues to anon,authenticated,service_role;
revoke insert,update,delete on public.broadcast_graphic_cues from anon,authenticated;

create or replace function public.ips_emit_broadcast_cue(
  p_match_id uuid,
  p_output text,
  p_graphic text,
  p_mode text,
  p_layer smallint,
  p_payload jsonb default '{}'::jsonb,
  p_duration_ms integer default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_row public.broadcast_graphic_cues;
  v_output text:=upper(trim(coalesce(p_output,'PROGRAM')));
  v_graphic text:=upper(trim(coalesce(p_graphic,'')));
  v_mode text:=upper(trim(coalesce(p_mode,'COMPACT')));
begin
  if not public.ips_can_score_match(p_match_id) then
    raise exception 'You are not authorised to direct this match.';
  end if;
  if v_output not in ('PREVIEW','PROGRAM') then raise exception 'Unsupported broadcast output.'; end if;
  if v_mode not in ('COMPACT','LOWER_THIRD','SIDE_PANEL','FULL_SCREEN') then raise exception 'Unsupported graphic mode.'; end if;
  if v_graphic='' then raise exception 'Graphic is required.'; end if;
  if p_layer is null or p_layer<1 or p_layer>6 then raise exception 'Broadcast layer must be between 1 and 6.'; end if;
  if p_duration_ms is not null and (p_duration_ms<0 or p_duration_ms>120000) then raise exception 'Graphic duration is outside the supported range.'; end if;

  insert into public.broadcast_graphic_cues(
    match_id,output,graphic,mode,layer,payload,duration_ms,created_by
  ) values(
    p_match_id,v_output,v_graphic,v_mode,p_layer,coalesce(p_payload,'{}'::jsonb),p_duration_ms,auth.uid()
  )
  returning * into v_row;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(
    auth.uid(),'BROADCAST_GRAPHIC_CUE','match',p_match_id,
    jsonb_build_object(
      'cue_id',v_row.id,
      'sequence_no',v_row.sequence_no,
      'output',v_row.output,
      'graphic',v_row.graphic,
      'mode',v_row.mode,
      'layer',v_row.layer,
      'duration_ms',v_row.duration_ms
    )
  );

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.ips_emit_broadcast_cue(uuid,text,text,text,smallint,jsonb,integer) from public,anon;
grant execute on function public.ips_emit_broadcast_cue(uuid,text,text,text,smallint,jsonb,integer) to authenticated,service_role;

-- Public browser-source overlays need only the already-public live score projection.
-- This exposes no private contact/account data.
grant select on public.match_live_state to anon;

drop policy if exists "broadcast public reads live state" on public.match_live_state;
create policy "broadcast public reads live state"
on public.match_live_state
for select
to anon
using (
  exists (
    select 1
    from public.matches m
    join public.tournaments t on t.id=m.tournament_id
    where m.id=match_id
      and t.status::text <> 'DRAFT'
      and m.status::text <> 'CANCELLED'
  )
);

create or replace function public.ips_public_current_over(p_match_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  s public.match_live_state;
  v_bpo integer;
  v_over integer;
  v_balls jsonb;
begin
  select * into s from public.match_live_state where match_id=p_match_id;
  if not found or s.innings_id is null then
    return jsonb_build_object('balls','[]'::jsonb,'free_hit',false);
  end if;

  select greatest(format_balls_per_over,1) into v_bpo
  from public.matches where id=p_match_id;

  if s.awaiting_bowler then
    v_over:=greatest((s.legal_balls/v_bpo)-1,0);
  else
    v_over:=s.legal_balls/v_bpo;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,
    'label',e.delivery_label,
    'legal',e.legal_delivery,
    'is_wicket',e.is_wicket
  ) order by e.sequence_no),'[]'::jsonb)
  into v_balls
  from public.match_scoring_events e
  where e.match_id=p_match_id
    and e.innings_id=s.innings_id
    and e.event_type='DELIVERY'
    and e.over_no=v_over
    and not exists (
      select 1 from public.match_scoring_events r
      where r.event_type='REVERSAL' and r.reverses_event_id=e.id
    );

  return jsonb_build_object(
    'balls',v_balls,
    'free_hit',coalesce(s.free_hit,false),
    'awaiting_bowler',coalesce(s.awaiting_bowler,false)
  );
end;
$$;

revoke all on function public.ips_public_current_over(uuid) from public;
grant execute on function public.ips_public_current_over(uuid) to anon,authenticated,service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='broadcast_graphic_cues'
  ) then
    alter publication supabase_realtime add table public.broadcast_graphic_cues;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='match_live_state'
  ) then
    alter publication supabase_realtime add table public.match_live_state;
  end if;
end $$;

notify pgrst,'reload schema';

commit;
