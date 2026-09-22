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
