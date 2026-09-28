-- IPS Project 6.25 — broadcast graphics presentation state.
-- Scoring remains authoritative; this table only controls what the overlay presents.
begin;

create table if not exists public.match_broadcast_state (
  match_id uuid primary key references public.matches(id) on update cascade on delete cascade,
  active_graphic text not null default 'NONE',
  mode text not null default 'COMPACT' check (mode in ('FULLSCREEN','LOWER_THIRD','SIDE_PANEL','COMPACT')),
  payload jsonb not null default '{}'::jsonb,
  visible boolean not null default false,
  transition text not null default 'AUTO',
  duration_ms integer not null default 5000 check (duration_ms between 500 and 60000),
  sequence_no bigint not null default 0,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.match_broadcast_state enable row level security;
grant select on public.match_broadcast_state to anon,authenticated;
revoke insert,update,delete on public.match_broadcast_state from anon,authenticated;

drop policy if exists "public reads broadcast presentation state" on public.match_broadcast_state;
create policy "public reads broadcast presentation state"
on public.match_broadcast_state for select
to anon,authenticated
using (
  exists (
    select 1
    from public.matches m
    join public.tournaments t on t.id=m.tournament_id
    where m.id=match_broadcast_state.match_id
      and (t.status::text<>'DRAFT' or m.status::text in ('LIVE','COMPLETED','AWAITING_CERTIFICATION','OFFICIAL','LOCKED'))
  )
);

drop policy if exists "public reads live state for broadcast" on public.match_live_state;
create policy "public reads live state for broadcast"
on public.match_live_state for select
to anon
using (
  exists (
    select 1
    from public.matches m
    join public.tournaments t on t.id=m.tournament_id
    where m.id=match_live_state.match_id
      and (t.status::text<>'DRAFT' or m.status::text in ('LIVE','COMPLETED','AWAITING_CERTIFICATION','OFFICIAL','LOCKED'))
  )
);

grant select on public.match_live_state to anon;

create or replace function public.ips_set_broadcast_graphic(
  p_match_id uuid,
  p_graphic text,
  p_mode text default 'COMPACT',
  p_payload jsonb default '{}'::jsonb,
  p_visible boolean default true,
  p_duration_ms integer default 5000,
  p_transition text default 'AUTO'
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_row public.match_broadcast_state;
begin
  if not public.ips_can_score_match(p_match_id) then
    raise exception 'You are not assigned to manage this match.';
  end if;

  if upper(coalesce(p_mode,'')) not in ('FULLSCREEN','LOWER_THIRD','SIDE_PANEL','COMPACT') then
    raise exception 'Unsupported broadcast mode.';
  end if;

  insert into public.match_broadcast_state(
    match_id,active_graphic,mode,payload,visible,transition,duration_ms,sequence_no,updated_by,updated_at
  ) values(
    p_match_id,upper(coalesce(nullif(trim(p_graphic),''),'NONE')),upper(p_mode),coalesce(p_payload,'{}'::jsonb),
    p_visible,upper(coalesce(nullif(trim(p_transition),''),'AUTO')),greatest(500,least(coalesce(p_duration_ms,5000),60000)),
    1,auth.uid(),now()
  )
  on conflict (match_id) do update set
    active_graphic=excluded.active_graphic,
    mode=excluded.mode,
    payload=excluded.payload,
    visible=excluded.visible,
    transition=excluded.transition,
    duration_ms=excluded.duration_ms,
    sequence_no=match_broadcast_state.sequence_no+1,
    updated_by=auth.uid(),
    updated_at=now()
  returning * into v_row;

  return to_jsonb(v_row);
end
$$;

revoke all on function public.ips_set_broadcast_graphic(uuid,text,text,jsonb,boolean,integer,text) from public,anon;
grant execute on function public.ips_set_broadcast_graphic(uuid,text,text,jsonb,boolean,integer,text) to authenticated,service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='match_live_state'
  ) then
    alter publication supabase_realtime add table public.match_live_state;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='match_broadcast_state'
  ) then
    alter publication supabase_realtime add table public.match_broadcast_state;
  end if;
end $$;

notify pgrst,'reload schema';
commit;