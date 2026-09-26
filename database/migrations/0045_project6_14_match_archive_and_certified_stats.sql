-- IPS Project 6.14 — persistent match archive + certified player fact pipeline.
begin;

create table if not exists public.match_archives (
  match_id uuid primary key references public.matches(id) on delete restrict,
  tournament_id uuid not null references public.tournaments(id) on delete restrict,
  competition_kind text not null,
  match_code text not null,
  match_status text not null,
  result_text text,
  snapshot jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  certified_at timestamptz,
  archived_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now())
);

create index if not exists match_archives_updated_idx on public.match_archives(updated_at desc);
create index if not exists match_archives_tournament_idx on public.match_archives(tournament_id,updated_at desc);

create table if not exists public.player_match_stats (
  match_id uuid not null references public.matches(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  team_id uuid not null references public.teams(id) on delete restrict,
  overs_format smallint not null,
  runs integer not null default 0,
  balls integer not null default 0,
  fours integer not null default 0,
  sixes integer not null default 0,
  wickets integer not null default 0,
  bowling_runs integer not null default 0,
  bowling_balls integer not null default 0,
  is_official boolean not null default false,
  archived_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now()),
  primary key(match_id,player_id)
);

create index if not exists player_match_stats_player_idx on public.player_match_stats(player_id,is_official,overs_format);
create index if not exists player_match_stats_match_idx on public.player_match_stats(match_id);

alter table public.match_archives enable row level security;
alter table public.player_match_stats enable row level security;

drop policy if exists "match archives global admin read" on public.match_archives;
create policy "match archives global admin read"
on public.match_archives for select to authenticated
using (public.ips_is_owner() or public.ips_has_role('ADMIN','GLOBAL',null));

drop policy if exists "player stats public official read" on public.player_match_stats;
create policy "player stats public official read"
on public.player_match_stats for select to anon,authenticated
using (
  is_official
  or public.ips_is_owner()
  or public.ips_has_role('ADMIN','GLOBAL',null)
);

revoke all on table public.match_archives from public,anon,authenticated;
grant select on table public.match_archives to authenticated;
revoke all on table public.player_match_stats from public,anon,authenticated;
grant select on table public.player_match_stats to anon,authenticated;

create or replace function public.ips_archive_match(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_match public.matches;
  v_tournament public.tournaments;
  v_card jsonb;
  v_result text;
  v_completed_at timestamptz;
  v_official boolean;
begin
  select * into v_match from public.matches where id=p_match_id;
  if not found then raise exception 'Match not found.'; end if;

  if v_match.status::text not in ('COMPLETED','AWAITING_CERTIFICATION','OFFICIAL','LOCKED') then
    return;
  end if;

  select * into v_tournament from public.tournaments where id=v_match.tournament_id;
  v_card:=public.ips_public_match_scorecard(p_match_id);
  v_result:=nullif(v_card->>'result_text','');
  v_official:=v_match.status::text in ('OFFICIAL','LOCKED');

  select max(completed_at) into v_completed_at
  from public.match_innings
  where match_id=p_match_id;

  insert into public.match_archives(
    match_id,tournament_id,competition_kind,match_code,match_status,
    result_text,snapshot,completed_at,certified_at,archived_at,updated_at
  )
  values(
    v_match.id,v_match.tournament_id,coalesce(v_tournament.competition_kind,'TOURNAMENT'),
    v_match.match_code,v_match.status::text,v_result,coalesce(v_card,'{}'::jsonb),
    coalesce(v_completed_at,timezone('utc',now())),
    case when v_official then timezone('utc',now()) else null end,
    timezone('utc',now()),timezone('utc',now())
  )
  on conflict(match_id) do update set
    tournament_id=excluded.tournament_id,
    competition_kind=excluded.competition_kind,
    match_code=excluded.match_code,
    match_status=excluded.match_status,
    result_text=excluded.result_text,
    snapshot=excluded.snapshot,
    completed_at=coalesce(public.match_archives.completed_at,excluded.completed_at),
    certified_at=case
      when v_official then coalesce(public.match_archives.certified_at,timezone('utc',now()))
      else public.match_archives.certified_at
    end,
    updated_at=timezone('utc',now());

  with active as (
    select e.*
    from public.match_scoring_events e
    where e.match_id=p_match_id
      and e.event_type='DELIVERY'
      and not exists (
        select 1 from public.match_scoring_events r
        where r.event_type='REVERSAL' and r.reverses_event_id=e.id
      )
  ),
  facts as (
    select
      px.player_id,
      px.team_id,
      coalesce(sum(a.runs_off_bat) filter (where a.striker_id=px.player_id),0)::integer as runs,
      coalesce(count(*) filter (where a.striker_id=px.player_id and a.legal_delivery),0)::integer as balls,
      coalesce(count(*) filter (where a.striker_id=px.player_id and a.runs_off_bat=4),0)::integer as fours,
      coalesce(count(*) filter (where a.striker_id=px.player_id and a.runs_off_bat=6),0)::integer as sixes,
      coalesce(count(*) filter (
        where a.bowler_id=px.player_id
          and a.is_wicket
          and a.wicket_kind in ('BOWLED','CAUGHT','HIT_WICKET')
      ),0)::integer as wickets,
      coalesce(sum(a.runs_off_bat+a.wide_runs+a.no_ball_runs) filter (where a.bowler_id=px.player_id),0)::integer as bowling_runs,
      coalesce(count(*) filter (where a.bowler_id=px.player_id and a.legal_delivery),0)::integer as bowling_balls
    from public.match_playing_xi px
    left join active a on a.match_id=px.match_id
    where px.match_id=p_match_id
    group by px.player_id,px.team_id
  )
  insert into public.player_match_stats(
    match_id,player_id,team_id,overs_format,runs,balls,fours,sixes,
    wickets,bowling_runs,bowling_balls,is_official,archived_at,updated_at
  )
  select
    p_match_id,f.player_id,f.team_id,v_match.format_overs_per_innings,
    f.runs,f.balls,f.fours,f.sixes,f.wickets,f.bowling_runs,f.bowling_balls,
    v_official,timezone('utc',now()),timezone('utc',now())
  from facts f
  on conflict(match_id,player_id) do update set
    team_id=excluded.team_id,
    overs_format=excluded.overs_format,
    runs=excluded.runs,
    balls=excluded.balls,
    fours=excluded.fours,
    sixes=excluded.sixes,
    wickets=excluded.wickets,
    bowling_runs=excluded.bowling_runs,
    bowling_balls=excluded.bowling_balls,
    is_official=excluded.is_official,
    updated_at=timezone('utc',now());
end
$$;

create or replace function public.ips_archive_match_on_status()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.status::text in ('COMPLETED','AWAITING_CERTIFICATION','OFFICIAL','LOCKED')
     and (tg_op='INSERT' or old.status is distinct from new.status) then
    perform public.ips_archive_match(new.id);
  end if;
  return new;
end
$$;

drop trigger if exists archive_match_on_status on public.matches;
create trigger archive_match_on_status
after insert or update of status on public.matches
for each row execute function public.ips_archive_match_on_status();

create or replace function public.ips_public_player_career_stats(p_player_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select jsonb_build_object(
    'matches',count(*)::integer,
    'runs',coalesce(sum(runs),0)::integer,
    'balls',coalesce(sum(balls),0)::integer,
    'fours',coalesce(sum(fours),0)::integer,
    'sixes',coalesce(sum(sixes),0)::integer,
    'wickets',coalesce(sum(wickets),0)::integer,
    'bowling_runs',coalesce(sum(bowling_runs),0)::integer,
    'bowling_balls',coalesce(sum(bowling_balls),0)::integer,
    'strike_rate',case when coalesce(sum(balls),0)>0 then round((sum(runs)::numeric*100)/sum(balls),2) else 0 end,
    'economy',case when coalesce(sum(bowling_balls),0)>0 then round((sum(bowling_runs)::numeric*6)/sum(bowling_balls),2) else 0 end
  )
  from public.player_match_stats
  where player_id=p_player_id and is_official;
$$;

revoke all on function public.ips_public_player_career_stats(uuid) from public;
grant execute on function public.ips_public_player_career_stats(uuid) to anon,authenticated,service_role;

-- Backfill every completed/certifiable match that already exists.
do $$
declare r record;
begin
  for r in
    select id from public.matches
    where status::text in ('COMPLETED','AWAITING_CERTIFICATION','OFFICIAL','LOCKED')
  loop
    perform public.ips_archive_match(r.id);
  end loop;
end $$;

notify pgrst,'reload schema';

commit;
