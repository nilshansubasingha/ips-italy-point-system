-- IPS Project 5.10.1 — configurable ranking catalogue.
-- Public ranking layout is data-driven. Global Owner/Admin can create, edit,
-- reorder, enable/disable, and remove leaderboard definitions.

begin;

create table if not exists public.ranking_definitions (
  id uuid primary key default gen_random_uuid(),
  ranking_key text not null unique,
  title text not null,
  source_key text not null,
  section text not null default 'PRIMARY',
  columns jsonb not null default '[]'::jsonb,
  sort_direction text not null default 'DESC',
  sort_order integer not null default 100,
  description text,
  enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now()),
  constraint ranking_definitions_key_check check (ranking_key ~ '^[a-z0-9][a-z0-9_-]{1,62}$'),
  constraint ranking_definitions_source_check check (source_key ~ '^[a-z0-9][a-z0-9_]{1,62}$'),
  constraint ranking_definitions_section_check check (section in ('PRIMARY','MILESTONE')),
  constraint ranking_definitions_columns_check check (jsonb_typeof(columns)='array'),
  constraint ranking_definitions_direction_check check (sort_direction in ('ASC','DESC')),
  constraint ranking_definitions_order_check check (sort_order between 0 and 10000),
  constraint ranking_definitions_title_check check (char_length(trim(title)) between 2 and 80)
);

create index if not exists ranking_definitions_enabled_order_idx
  on public.ranking_definitions(enabled,section,sort_order);

alter table public.ranking_definitions enable row level security;

drop policy if exists "ranking definitions public read" on public.ranking_definitions;
create policy "ranking definitions public read"
on public.ranking_definitions
for select
to anon
using (enabled = true);

drop policy if exists "ranking definitions authenticated read" on public.ranking_definitions;
create policy "ranking definitions authenticated read"
on public.ranking_definitions
for select
to authenticated
using (
  enabled = true
  or public.ips_is_owner()
  or public.ips_has_role('ADMIN','GLOBAL',null)
);

drop policy if exists "ranking definitions global insert" on public.ranking_definitions;
create policy "ranking definitions global insert"
on public.ranking_definitions
for insert
to authenticated
with check (
  public.ips_is_owner()
  or public.ips_has_role('ADMIN','GLOBAL',null)
);

drop policy if exists "ranking definitions global update" on public.ranking_definitions;
create policy "ranking definitions global update"
on public.ranking_definitions
for update
to authenticated
using (
  public.ips_is_owner()
  or public.ips_has_role('ADMIN','GLOBAL',null)
)
with check (
  public.ips_is_owner()
  or public.ips_has_role('ADMIN','GLOBAL',null)
);

drop policy if exists "ranking definitions global delete" on public.ranking_definitions;
create policy "ranking definitions global delete"
on public.ranking_definitions
for delete
to authenticated
using (
  public.ips_is_owner()
  or public.ips_has_role('ADMIN','GLOBAL',null)
);

revoke all on table public.ranking_definitions from public;
grant select on table public.ranking_definitions to anon;
grant select,insert,update,delete on table public.ranking_definitions to authenticated;

insert into public.ranking_definitions
  (ranking_key,title,source_key,section,columns,sort_direction,sort_order,description,enabled)
values
  ('best-batsmen','Best batsmen','batting_points','PRIMARY',
   '[{"key":"sr","label":"SR"},{"key":"awards","label":"Awards"},{"key":"points","label":"Points"}]'::jsonb,
   'DESC',10,'SR = strike rate. Awards and ranking points come only from certified IPS match records.',true),
  ('best-bowlers','Best bowlers','bowling_points','PRIMARY',
   '[{"key":"best_figures","label":"Best Figures"},{"key":"awards","label":"Awards"},{"key":"points","label":"Points"}]'::jsonb,
   'DESC',20,'Best Figures uses certified innings bowling figures. Awards and points remain format-specific.',true),
  ('best-all-rounders','Best all-rounders','all_rounder_points','PRIMARY',
   '[{"key":"awards","label":"Awards"},{"key":"points","label":"Points"}]'::jsonb,
   'DESC',30,'All-rounder points combine certified batting and bowling contributions under the active ranking rules.',true),
  ('most-fifties','Most fifties','most_fifties','MILESTONE',
   '[{"key":"score_balls","label":"Score (Balls)"},{"key":"fours","label":"4"},{"key":"sixes","label":"6"}]'::jsonb,
   'DESC',110,'Fifty records are derived from certified innings. The scorer supplies score, balls faced, fours and sixes automatically.',true),
  ('fastest-fifty','Fastest fifty','fastest_fifty','MILESTONE',
   '[{"key":"score_balls","label":"Score (Balls)"},{"key":"fours","label":"4"},{"key":"sixes","label":"6"}]'::jsonb,
   'ASC',120,'Fastest fifty is ranked by balls required to reach 50. Score, balls, fours and sixes are derived from the certified delivery ledger.',true),
  ('most-hat-tricks','Most hat-tricks','most_hat_tricks','MILESTONE',
   '[{"key":"hat_tricks","label":"Hat-tricks"}]'::jsonb,
   'DESC',130,'Hat-tricks are detected from three consecutive qualifying wicket deliveries in certified match facts.',true)
on conflict (ranking_key) do update
set title=excluded.title,
    source_key=excluded.source_key,
    section=excluded.section,
    columns=excluded.columns,
    sort_direction=excluded.sort_direction,
    sort_order=excluded.sort_order,
    description=excluded.description,
    enabled=excluded.enabled,
    updated_at=timezone('utc',now());

commit;
