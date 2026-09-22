-- IPS — Italy Point System
-- Project 1: Central Domain Database
-- PostgreSQL / Supabase migration
-- This migration establishes canonical identity, competition, and fixture data only.
-- Match scoring/event sourcing is intentionally NOT implemented in Project 1.

begin;

create extension if not exists pgcrypto;

-- ---------- Enumerations ----------

do $$ begin
  create type public.ips_entity_status as enum ('ACTIVE', 'INACTIVE', 'ARCHIVED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ips_membership_status as enum ('ACTIVE', 'FORMER', 'SUSPENDED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ips_tournament_status as enum ('DRAFT', 'REGISTRATION_OPEN', 'READY', 'LIVE', 'COMPLETED', 'LOCKED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ips_tournament_team_status as enum ('APPLIED', 'ACCEPTED', 'CONFIRMED', 'WITHDRAWN', 'REJECTED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ips_match_status as enum (
    'SCHEDULED',
    'READY',
    'LIVE',
    'COMPLETED',
    'AWAITING_CERTIFICATION',
    'OFFICIAL',
    'LOCKED',
    'REOPENED_FOR_CORRECTION',
    'CANCELLED',
    'ABANDONED'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ips_retirement_mode as enum ('NONE', 'RETIRE_OUT', 'RETIRE_NOT_OUT', 'CUSTOM');
exception when duplicate_object then null; end $$;

-- ---------- Common timestamp helper ----------

create or replace function public.ips_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- ---------- Permanent public player-code sequence ----------

create sequence if not exists public.ips_player_code_seq start with 1 increment by 1 no cycle;

create or replace function public.ips_next_player_code()
returns text
language sql
volatile
as $$
  select 'ITA-' || lpad(nextval('public.ips_player_code_seq')::text, 7, '0');
$$;

-- ---------- Identity / organisation ----------

create table if not exists public.cities (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{2,8}$'),
  name text not null unique,
  region text,
  country_code char(2) not null default 'IT',
  status public.ips_entity_status not null default 'ACTIVE',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on update cascade on delete restrict,
  name text not null,
  short_name text,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  logo_url text,
  founded_year smallint check (founded_year is null or founded_year between 1900 and 2200),
  verified boolean not null default false,
  status public.ips_entity_status not null default 'ACTIVE',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (city_id, name)
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on update cascade on delete restrict,
  name text not null,
  short_name text,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  logo_url text,
  status public.ips_entity_status not null default 'ACTIVE',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (club_id, name)
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  ips_code text not null unique default public.ips_next_player_code()
    check (ips_code ~ '^ITA-[0-9]{7}$'),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  display_name text not null,
  given_name text,
  family_name text,
  profile_image_url text,
  batting_style text,
  bowling_style text,
  primary_role text,
  status public.ips_entity_status not null default 'ACTIVE',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.team_memberships (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on update cascade on delete restrict,
  team_id uuid not null references public.teams(id) on update cascade on delete restrict,
  start_on date not null,
  end_on date,
  shirt_number smallint check (shirt_number is null or shirt_number between 0 and 999),
  status public.ips_membership_status not null default 'ACTIVE',
  is_primary boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (end_on is null or end_on >= start_on),
  unique (player_id, team_id, start_on)
);

-- Only one open-ended active membership for the same player/team pair.
create unique index if not exists ux_team_membership_open_pair
  on public.team_memberships (player_id, team_id)
  where end_on is null and status = 'ACTIVE';

-- ---------- Competition ----------

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (ends_on >= starts_on)
);

create table if not exists public.venues (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on update cascade on delete restrict,
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  address_text text,
  latitude numeric(9,6) check (latitude is null or latitude between -90 and 90),
  longitude numeric(9,6) check (longitude is null or longitude between -180 and 180),
  status public.ips_entity_status not null default 'ACTIVE',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (city_id, name)
);

create table if not exists public.competition_rulesets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version integer not null check (version > 0),
  description text,
  balls_per_over smallint not null check (balls_per_over between 1 and 12),
  max_overs smallint not null check (max_overs between 1 and 100),
  playing_xi_size smallint not null check (playing_xi_size between 2 and 20),
  innings_wicket_limit smallint check (innings_wicket_limit is null or innings_wicket_limit between 1 and 19),
  free_hit_on_no_ball boolean not null default false,
  consecutive_overs_by_same_bowler_allowed boolean not null default false,
  max_overs_per_bowler smallint check (max_overs_per_bowler is null or max_overs_per_bowler between 1 and 100),
  retirement_runs integer check (retirement_runs is null or retirement_runs > 0),
  retirement_mode public.ips_retirement_mode not null default 'NONE',
  points_win numeric(5,2) not null default 2,
  points_tie numeric(5,2) not null default 1,
  points_no_result numeric(5,2) not null default 1,
  points_loss numeric(5,2) not null default 0,
  extras_rules jsonb not null default '{}'::jsonb,
  additional_rules jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  unique (name, version),
  check (innings_wicket_limit is null or innings_wicket_limit < playing_xi_size)
);

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on update cascade on delete restrict,
  city_id uuid not null references public.cities(id) on update cascade on delete restrict,
  ruleset_id uuid not null references public.competition_rulesets(id) on update cascade on delete restrict,
  code text not null unique check (code ~ '^[A-Z0-9-]{3,32}$'),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  format_label text not null,
  status public.ips_tournament_status not null default 'DRAFT',
  registration_deadline timestamptz,
  squad_deadline timestamptz,
  starts_at timestamptz not null,
  ends_at timestamptz,
  squad_size smallint check (squad_size is null or squad_size between 2 and 50),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (season_id, name),
  check (ends_at is null or ends_at >= starts_at),
  check (squad_deadline is null or squad_deadline <= starts_at)
);

create table if not exists public.tournament_teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on update cascade on delete cascade,
  team_id uuid not null references public.teams(id) on update cascade on delete restrict,
  status public.ips_tournament_team_status not null default 'APPLIED',
  seed smallint check (seed is null or seed > 0),
  applied_at timestamptz not null default timezone('utc', now()),
  accepted_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (tournament_id, team_id),
  unique (id, tournament_id, team_id)
);

-- ---------- Fixtures / matches ----------

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on update cascade on delete restrict,
  match_code text not null unique check (match_code ~ '^[A-Z0-9-]{3,40}$'),
  match_number integer not null check (match_number > 0),
  home_team_id uuid not null,
  away_team_id uuid not null,
  venue_id uuid references public.venues(id) on update cascade on delete restrict,
  scheduled_at timestamptz not null,
  stage text not null default 'LEAGUE',
  round_label text,
  status public.ips_match_status not null default 'SCHEDULED',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (tournament_id, match_number),
  check (home_team_id <> away_team_id),
  foreign key (tournament_id, home_team_id)
    references public.tournament_teams(tournament_id, team_id)
    on update cascade on delete restrict,
  foreign key (tournament_id, away_team_id)
    references public.tournament_teams(tournament_id, team_id)
    on update cascade on delete restrict
);

-- ---------- Indexes ----------

create index if not exists ix_clubs_city on public.clubs(city_id);
create index if not exists ix_teams_club on public.teams(club_id);
create index if not exists ix_players_display_name on public.players(display_name);
create index if not exists ix_team_memberships_player on public.team_memberships(player_id);
create index if not exists ix_team_memberships_team on public.team_memberships(team_id);
create index if not exists ix_venues_city on public.venues(city_id);
create index if not exists ix_tournaments_city on public.tournaments(city_id);
create index if not exists ix_tournaments_season on public.tournaments(season_id);
create index if not exists ix_tournament_teams_tournament on public.tournament_teams(tournament_id);
create index if not exists ix_tournament_teams_team on public.tournament_teams(team_id);
create index if not exists ix_matches_tournament on public.matches(tournament_id);
create index if not exists ix_matches_scheduled_at on public.matches(scheduled_at);
create index if not exists ix_matches_status on public.matches(status);

-- ---------- Updated-at triggers ----------

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'cities','clubs','teams','players','team_memberships','seasons','venues',
    'tournaments','tournament_teams','matches'
  ]
  loop
    execute format('drop trigger if exists trg_%I_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger trg_%I_updated_at before update on public.%I for each row execute function public.ips_set_updated_at()',
      table_name,
      table_name
    );
  end loop;
end $$;

-- ---------- Permanent identity protections ----------

create or replace function public.ips_protect_player_identity()
returns trigger
language plpgsql
as $$
begin
  if new.ips_code is distinct from old.ips_code then
    raise exception 'IPS player code is permanent and cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_players_protect_identity on public.players;
create trigger trg_players_protect_identity
before update on public.players
for each row execute function public.ips_protect_player_identity();

-- ---------- Read models / views ----------

create or replace view public.v_player_current_teams with (security_invoker = true) as
select
  tm.id as membership_id,
  p.id as player_id,
  p.ips_code,
  p.display_name as player_name,
  t.id as team_id,
  t.name as team_name,
  c.id as club_id,
  c.name as club_name,
  ci.id as city_id,
  ci.name as city_name,
  tm.start_on,
  tm.is_primary
from public.team_memberships tm
join public.players p on p.id = tm.player_id
join public.teams t on t.id = tm.team_id
join public.clubs c on c.id = t.club_id
join public.cities ci on ci.id = c.city_id
where tm.status = 'ACTIVE' and tm.end_on is null;

create or replace view public.v_fixture_context with (security_invoker = true) as
select
  m.id as match_id,
  m.match_code,
  m.match_number,
  m.status as match_status,
  m.scheduled_at,
  m.stage,
  m.round_label,
  tr.id as tournament_id,
  tr.code as tournament_code,
  tr.name as tournament_name,
  tr.status as tournament_status,
  ci.id as city_id,
  ci.name as city_name,
  v.id as venue_id,
  v.name as venue_name,
  ht.id as home_team_id,
  ht.name as home_team_name,
  at.id as away_team_id,
  at.name as away_team_name,
  rs.id as ruleset_id,
  rs.name as ruleset_name,
  rs.version as ruleset_version,
  rs.balls_per_over,
  rs.max_overs,
  rs.playing_xi_size,
  rs.innings_wicket_limit,
  rs.free_hit_on_no_ball,
  rs.max_overs_per_bowler,
  rs.retirement_runs,
  rs.retirement_mode
from public.matches m
join public.tournaments tr on tr.id = m.tournament_id
join public.cities ci on ci.id = tr.city_id
join public.teams ht on ht.id = m.home_team_id
join public.teams at on at.id = m.away_team_id
join public.competition_rulesets rs on rs.id = tr.ruleset_id
left join public.venues v on v.id = m.venue_id;

comment on view public.v_fixture_context is
'Project 1 fixture context only. Project 4/5 will extend launch context with locked squads, playing XI, scorers, sponsor configuration, and security.';

commit;
-- IPS Project 1 RLS baseline
-- Public/anonymous clients may READ safe public directory data only.
-- No anonymous/authenticated write policies exist in Project 1.
-- Scoped write permissions are added in Project 3.

begin;

alter table public.cities enable row level security;
alter table public.clubs enable row level security;
alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.team_memberships enable row level security;
alter table public.seasons enable row level security;
alter table public.venues enable row level security;
alter table public.competition_rulesets enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_teams enable row level security;
alter table public.matches enable row level security;

-- Drop/recreate policies to make the file repeatable during development.
drop policy if exists "public read active cities" on public.cities;
create policy "public read active cities" on public.cities for select to anon, authenticated
using (status = 'ACTIVE');

drop policy if exists "public read active clubs" on public.clubs;
create policy "public read active clubs" on public.clubs for select to anon, authenticated
using (status = 'ACTIVE');

drop policy if exists "public read active teams" on public.teams;
create policy "public read active teams" on public.teams for select to anon, authenticated
using (status = 'ACTIVE');

drop policy if exists "public read active players" on public.players;
create policy "public read active players" on public.players for select to anon, authenticated
using (status = 'ACTIVE');

drop policy if exists "public read active team memberships" on public.team_memberships;
create policy "public read active team memberships" on public.team_memberships for select to anon, authenticated
using (status in ('ACTIVE', 'FORMER'));

drop policy if exists "public read seasons" on public.seasons;
create policy "public read seasons" on public.seasons for select to anon, authenticated
using (true);

drop policy if exists "public read active venues" on public.venues;
create policy "public read active venues" on public.venues for select to anon, authenticated
using (status = 'ACTIVE');

drop policy if exists "public read active rulesets" on public.competition_rulesets;
create policy "public read active rulesets" on public.competition_rulesets for select to anon, authenticated
using (is_active = true);

drop policy if exists "public read visible tournaments" on public.tournaments;
create policy "public read visible tournaments" on public.tournaments for select to anon, authenticated
using (status <> 'DRAFT');

drop policy if exists "public read confirmed tournament teams" on public.tournament_teams;
create policy "public read confirmed tournament teams" on public.tournament_teams for select to anon, authenticated
using (
  status = 'CONFIRMED'
  and exists (
    select 1 from public.tournaments tr
    where tr.id = tournament_id and tr.status <> 'DRAFT'
  )
);

drop policy if exists "public read visible matches" on public.matches;
create policy "public read visible matches" on public.matches for select to anon, authenticated
using (
  exists (
    select 1 from public.tournaments tr
    where tr.id = tournament_id and tr.status <> 'DRAFT'
  )
);

commit;

-- Views use security_invoker=true, so underlying RLS policies still apply.
grant select on public.v_player_current_teams to anon, authenticated;
grant select on public.v_fixture_context to anon, authenticated;
grant select on public.cities, public.clubs, public.teams, public.players,
  public.team_memberships, public.seasons, public.venues, public.competition_rulesets,
  public.tournaments, public.tournament_teams, public.matches to anon, authenticated;
-- IPS Project 1 demo data
-- DEVELOPMENT / TEST DATA ONLY. Nothing here is an official competition rule or result.

begin;

insert into public.cities (id, code, name, region) values
  ('00000000-0000-4000-8000-000000000001', 'NAP', 'Napoli', 'Campania'),
  ('00000000-0000-4000-8000-000000000002', 'MIL', 'Milano', 'Lombardia'),
  ('00000000-0000-4000-8000-000000000003', 'TOR', 'Torino', 'Piemonte'),
  ('00000000-0000-4000-8000-000000000004', 'ROM', 'Roma', 'Lazio'),
  ('00000000-0000-4000-8000-000000000005', 'BOL', 'Bologna', 'Emilia-Romagna'),
  ('00000000-0000-4000-8000-000000000006', 'PAR', 'Parma', 'Emilia-Romagna')
on conflict (id) do nothing;

insert into public.clubs (id, city_id, name, short_name, slug, verified) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Napoli Lions Cricket Club', 'Napoli Lions', 'napoli-lions', true),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Vesuvio Kings Cricket Club', 'Vesuvio Kings', 'vesuvio-kings', true),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', 'Milano Stars Cricket Club', 'Milano Stars', 'milano-stars', true),
  ('10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000003', 'Torino Warriors Cricket Club', 'Torino Warriors', 'torino-warriors', true),
  ('10000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000004', 'Roma Royals Cricket Club', 'Roma Royals', 'roma-royals', true),
  ('10000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000006', 'Parma Titans Cricket Club', 'Parma Titans', 'parma-titans', true)
on conflict (id) do nothing;

insert into public.teams (id, club_id, name, short_name, slug) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Napoli Lions', 'NAP Lions', 'napoli-lions-first'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'Vesuvio Kings', 'VES Kings', 'vesuvio-kings-first'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'Milano Stars', 'MIL Stars', 'milano-stars-first'),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', 'Torino Warriors', 'TOR Warriors', 'torino-warriors-first'),
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000005', 'Roma Royals', 'ROM Royals', 'roma-royals-first'),
  ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000006', 'Parma Titans', 'PAR Titans', 'parma-titans-first')
on conflict (id) do nothing;

-- Explicit test player codes make identity checks deterministic.
insert into public.players (id, ips_code, slug, display_name, given_name, family_name, batting_style, bowling_style, primary_role) values
  ('30000000-0000-4000-8000-000000000001', 'ITA-0001847', 'd-fernando-1847', 'D. Fernando', 'D.', 'Fernando', 'Right hand', 'Right arm medium', 'All-rounder'),
  ('30000000-0000-4000-8000-000000000002', 'ITA-0001848', 'k-silva-1848', 'K. Silva', 'K.', 'Silva', 'Right hand', null, 'Batter'),
  ('30000000-0000-4000-8000-000000000003', 'ITA-0001849', 'm-perera-1849', 'M. Perera', 'M.', 'Perera', 'Right hand', 'Right arm fast', 'Bowler'),
  ('30000000-0000-4000-8000-000000000004', 'ITA-0001850', 'r-jayasuriya-1850', 'R. Jayasuriya', 'R.', 'Jayasuriya', 'Left hand', 'Right arm spin', 'All-rounder'),
  ('30000000-0000-4000-8000-000000000005', 'ITA-0001851', 's-de-silva-1851', 'S. de Silva', 'S.', 'de Silva', 'Right hand', null, 'Wicketkeeper'),
  ('30000000-0000-4000-8000-000000000006', 'ITA-0001852', 'a-kumara-1852', 'A. Kumara', 'A.', 'Kumara', 'Right hand', 'Right arm medium', 'All-rounder'),
  ('30000000-0000-4000-8000-000000000007', 'ITA-0001853', 'n-mendis-1853', 'N. Mendis', 'N.', 'Mendis', 'Left hand', 'Left arm medium', 'All-rounder'),
  ('30000000-0000-4000-8000-000000000008', 'ITA-0001854', 'p-ranasinghe-1854', 'P. Ranasinghe', 'P.', 'Ranasinghe', 'Right hand', 'Right arm spin', 'Bowler')
on conflict (id) do nothing;

insert into public.team_memberships (id, player_id, team_id, start_on, shirt_number, is_primary) values
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '2026-01-01', 18, true),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '2026-01-01', 7, true),
  ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', '2026-01-01', 10, true),
  ('40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', '2026-01-01', 23, true),
  ('40000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000002', '2026-01-01', 12, true),
  ('40000000-0000-4000-8000-000000000006', '30000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000002', '2026-01-01', 8, true),
  ('40000000-0000-4000-8000-000000000007', '30000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000002', '2026-01-01', 14, true),
  ('40000000-0000-4000-8000-000000000008', '30000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000002', '2026-01-01', 22, true)
on conflict (id) do nothing;

insert into public.seasons (id, code, name, starts_on, ends_on) values
  ('50000000-0000-4000-8000-000000000001', '2027', '2027 Season', '2027-01-01', '2027-12-31')
on conflict (id) do nothing;

insert into public.venues (id, city_id, name, slug, address_text) values
  ('60000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Napoli Demo Cricket Ground', 'napoli-demo-cricket-ground', 'Development fixture venue — replace with verified venue data')
on conflict (id) do nothing;

insert into public.competition_rulesets (
  id, name, version, description, balls_per_over, max_overs, playing_xi_size,
  innings_wicket_limit, free_hit_on_no_ball, consecutive_overs_by_same_bowler_allowed,
  max_overs_per_bowler, retirement_mode, additional_rules
) values (
  '70000000-0000-4000-8000-000000000001',
  'IPS DEMO T10 — NOT OFFICIAL',
  1,
  'Development ruleset only. Do not treat these values as approved IPS tournament rules.',
  6,
  10,
  7,
  6,
  true,
  false,
  2,
  'NONE',
  '{"project":"Project 1","official":false}'::jsonb
)
on conflict (id) do nothing;

insert into public.tournaments (
  id, season_id, city_id, ruleset_id, code, name, slug, format_label, status,
  squad_deadline, starts_at, ends_at, squad_size
) values (
  '80000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000001',
  'NAP-DEMO-2027',
  'Napoli Sandbox Cup 2027',
  'napoli-sandbox-cup-2027',
  'T10 development tournament',
  'READY',
  '2027-05-01 18:00:00+02',
  '2027-05-10 09:00:00+02',
  '2027-05-10 20:00:00+02',
  10
)
on conflict (id) do nothing;

insert into public.tournament_teams (id, tournament_id, team_id, status, confirmed_at) values
  ('90000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'CONFIRMED', timezone('utc', now())),
  ('90000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'CONFIRMED', timezone('utc', now()))
on conflict (id) do nothing;

insert into public.matches (
  id, tournament_id, match_code, match_number, home_team_id, away_team_id,
  venue_id, scheduled_at, stage, round_label, status
) values (
  'a0000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000001',
  'NAP-DEMO-001',
  1,
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
  '60000000-0000-4000-8000-000000000001',
  '2027-05-10 10:00:00+02',
  'LEAGUE',
  'Demo Match 1',
  'READY'
)
on conflict (id) do nothing;

-- Keep future auto-generated codes above the deterministic demo range.
select setval('public.ips_player_code_seq', greatest((select last_value from public.ips_player_code_seq), 1854), true);

commit;
