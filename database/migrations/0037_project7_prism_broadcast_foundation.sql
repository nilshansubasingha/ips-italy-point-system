-- IPS Project 7 — PRISM broadcast platform foundation.
-- Scoring remains authoritative in Project 6 tables/RPCs. Broadcast state only controls presentation.

begin;

alter table public.teams add column if not exists primary_color text;
alter table public.teams add column if not exists secondary_color text;
alter table public.tournaments add column if not exists logo_url text;
alter table public.tournaments add column if not exists primary_color text;
alter table public.tournaments add column if not exists secondary_color text;

create table if not exists public.broadcast_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text,
  is_factory boolean not null default false,
  base_package_id uuid references public.broadcast_packages(id) on update cascade on delete set null,
  tournament_id uuid references public.tournaments(id) on update cascade on delete cascade,
  theme jsonb not null default '{}'::jsonb check (jsonb_typeof(theme)='object'),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.broadcast_components (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.broadcast_packages(id) on update cascade on delete cascade,
  component_key text not null,
  name text not null,
  category text not null,
  factory_locked boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(package_id,component_key)
);

create table if not exists public.broadcast_component_versions (
  id uuid primary key default gen_random_uuid(),
  component_id uuid not null references public.broadcast_components(id) on update cascade on delete cascade,
  version_no integer not null check (version_no>0),
  status text not null check (status in ('DRAFT','PUBLISHED','ARCHIVED')),
  document jsonb not null check (jsonb_typeof(document)='object'),
  created_by uuid references auth.users(id) on delete set null,
  published_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique(component_id,version_no)
);
create unique index if not exists broadcast_component_one_draft_idx
  on public.broadcast_component_versions(component_id) where status='DRAFT';

create table if not exists public.broadcast_scenes (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.broadcast_packages(id) on update cascade on delete cascade,
  scene_key text not null,
  name text not null,
  category text not null,
  description text,
  factory_locked boolean not null default false,
  director_visible boolean not null default true,
  director_label text,
  replacement_group text,
  default_priority integer not null default 50 check (default_priority between 0 and 1000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(package_id,scene_key)
);

create table if not exists public.broadcast_variants (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references public.broadcast_scenes(id) on update cascade on delete cascade,
  variant_key text not null,
  name text not null,
  presentation text not null check (presentation in ('FULLSCREEN','LOWER_THIRD','SCOREBAR','BUG','TICKER','CARD','CUSTOM')),
  is_default boolean not null default false,
  priority integer not null default 50 check (priority between 0 and 1000),
  replacement_group text,
  conflict_behavior text not null default 'COEXIST'
    check (conflict_behavior in ('COEXIST','REPLACE_GROUP','HIDE_SCOREBAR','HIDE_LOWER_PRIORITY','EXCLUSIVE')),
  default_duration_ms integer check (default_duration_ms is null or default_duration_ms between 250 and 120000),
  direct_take boolean not null default false,
  retrigger_policy text not null default 'RESTART' check (retrigger_policy in ('IGNORE','RESTART','QUEUE')),
  automation_eligible boolean not null default false,
  created_at timestamptz not null default now(),
  unique(scene_id,variant_key)
);

create table if not exists public.broadcast_variant_versions (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.broadcast_variants(id) on update cascade on delete cascade,
  version_no integer not null check (version_no>0),
  status text not null check (status in ('DRAFT','PUBLISHED','ARCHIVED')),
  document jsonb not null check (jsonb_typeof(document)='object'),
  source text not null default 'EDITOR' check (source in ('FACTORY','EDITOR','DUPLICATE','RESTORE')),
  created_by uuid references auth.users(id) on delete set null,
  published_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique(variant_id,version_no)
);
create unique index if not exists broadcast_variant_one_draft_idx
  on public.broadcast_variant_versions(variant_id) where status='DRAFT';

create table if not exists public.broadcast_sequences (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.broadcast_packages(id) on update cascade on delete cascade,
  sequence_key text not null,
  name text not null,
  category text not null default 'MATCH',
  factory_locked boolean not null default false,
  director_visible boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(package_id,sequence_key)
);

create table if not exists public.broadcast_sequence_versions (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.broadcast_sequences(id) on update cascade on delete cascade,
  version_no integer not null check (version_no>0),
  status text not null check (status in ('DRAFT','PUBLISHED','ARCHIVED')),
  document jsonb not null check (jsonb_typeof(document)='object'),
  created_by uuid references auth.users(id) on delete set null,
  published_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique(sequence_id,version_no)
);
create unique index if not exists broadcast_sequence_one_draft_idx
  on public.broadcast_sequence_versions(sequence_id) where status='DRAFT';

create table if not exists public.broadcast_package_releases (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.broadcast_packages(id) on update cascade on delete cascade,
  version_no integer not null check (version_no>0),
  manifest jsonb not null check (jsonb_typeof(manifest)='object'),
  theme jsonb not null default '{}'::jsonb check (jsonb_typeof(theme)='object'),
  checksum text,
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default now(),
  unique(package_id,version_no)
);

create table if not exists public.broadcast_assets (
  id uuid primary key default gen_random_uuid(),
  package_id uuid references public.broadcast_packages(id) on update cascade on delete cascade,
  name text not null,
  kind text not null check (kind in ('IMAGE','SVG','VIDEO','AUDIO','FONT','OTHER')),
  storage_bucket text not null default 'ips-media',
  storage_path text not null,
  mime_type text,
  width integer,
  height integer,
  duration_ms integer,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.broadcast_match_sessions (
  match_id uuid primary key references public.matches(id) on update cascade on delete cascade,
  package_release_id uuid not null references public.broadcast_package_releases(id) on update cascade on delete restrict,
  status text not null default 'READY' check (status in ('READY','LIVE','CLOSED')),
  automation_enabled boolean not null default true,
  scorebar_locked boolean not null default false,
  emergency_sponsor_off boolean not null default false,
  clean_feed boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.broadcast_program_state (
  match_id uuid primary key references public.matches(id) on update cascade on delete cascade,
  revision bigint not null default 0,
  preview jsonb,
  active_layers jsonb not null default '[]'::jsonb check (jsonb_typeof(active_layers)='array'),
  queue jsonb not null default '[]'::jsonb check (jsonb_typeof(queue)='array'),
  persistent_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(persistent_snapshot)='array'),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.broadcast_program_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on update cascade on delete cascade,
  revision bigint not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists broadcast_program_events_match_revision_idx
  on public.broadcast_program_events(match_id,revision desc);

create table if not exists public.broadcast_realtime_signals (
  match_id uuid primary key references public.matches(id) on update cascade on delete cascade,
  score_revision bigint not null default 0,
  program_revision bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.broadcast_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  scene_id uuid not null references public.broadcast_scenes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id,scene_id)
);

create table if not exists public.broadcast_sponsors (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references public.tournaments(id) on update cascade on delete cascade,
  name text not null,
  logo_url text,
  message text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE','ARCHIVED')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.broadcast_sponsor_playlists (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references public.tournaments(id) on update cascade on delete cascade,
  name text not null,
  rotation_interval_ms integer not null default 10000 check (rotation_interval_ms between 1000 and 600000),
  shine_enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.broadcast_sponsor_playlist_items (
  playlist_id uuid not null references public.broadcast_sponsor_playlists(id) on update cascade on delete cascade,
  sponsor_id uuid not null references public.broadcast_sponsors(id) on update cascade on delete cascade,
  position integer not null check (position>=0),
  duration_ms integer,
  primary key(playlist_id,sponsor_id)
);

create table if not exists public.broadcast_sponsor_exposure (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on update cascade on delete cascade,
  sponsor_id uuid not null references public.broadcast_sponsors(id) on update cascade on delete cascade,
  scene_key text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_ms bigint,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.broadcast_packages enable row level security;
alter table public.broadcast_components enable row level security;
alter table public.broadcast_component_versions enable row level security;
alter table public.broadcast_scenes enable row level security;
alter table public.broadcast_variants enable row level security;
alter table public.broadcast_variant_versions enable row level security;
alter table public.broadcast_sequences enable row level security;
alter table public.broadcast_sequence_versions enable row level security;
alter table public.broadcast_package_releases enable row level security;
alter table public.broadcast_assets enable row level security;
alter table public.broadcast_match_sessions enable row level security;
alter table public.broadcast_program_state enable row level security;
alter table public.broadcast_program_events enable row level security;
alter table public.broadcast_realtime_signals enable row level security;
alter table public.broadcast_favorites enable row level security;
alter table public.broadcast_sponsors enable row level security;
alter table public.broadcast_sponsor_playlists enable row level security;
alter table public.broadcast_sponsor_playlist_items enable row level security;
alter table public.broadcast_sponsor_exposure enable row level security;

revoke insert,update,delete on all tables in schema public from anon;
revoke insert,update,delete on public.broadcast_packages,public.broadcast_components,public.broadcast_component_versions,
 public.broadcast_scenes,public.broadcast_variants,public.broadcast_variant_versions,public.broadcast_sequences,
 public.broadcast_sequence_versions,public.broadcast_package_releases,public.broadcast_assets,public.broadcast_match_sessions,
 public.broadcast_program_state,public.broadcast_program_events,public.broadcast_realtime_signals,public.broadcast_sponsors,
 public.broadcast_sponsor_playlists,public.broadcast_sponsor_playlist_items,public.broadcast_sponsor_exposure
from authenticated;

create or replace function public.ips_can_direct_match(p_match_id uuid)
returns boolean
language sql stable security definer
set search_path=public,auth
as $$
  select public.ips_is_owner()
  or exists (
    select 1 from public.matches m
    where m.id=p_match_id and public.ips_can_manage_tournament(m.tournament_id)
  )
  or exists (
    select 1 from public.match_official_assignments a
    where a.match_id=p_match_id and a.user_id=auth.uid() and a.role='MATCH_MANAGER'
  );
$$;
revoke all on function public.ips_can_direct_match(uuid) from public,anon;
grant execute on function public.ips_can_direct_match(uuid) to authenticated,service_role;

create or replace function public.ips_can_manage_broadcast_package(p_package_id uuid)
returns boolean
language sql stable security definer
set search_path=public,auth
as $$
  select public.ips_is_owner()
  or exists (
    select 1 from public.broadcast_packages p
    where p.id=p_package_id
      and not p.is_factory
      and (p.tournament_id is null or public.ips_can_manage_tournament(p.tournament_id))
  );
$$;
revoke all on function public.ips_can_manage_broadcast_package(uuid) from public,anon;
grant execute on function public.ips_can_manage_broadcast_package(uuid) to authenticated,service_role;

drop policy if exists "broadcast authenticated package read" on public.broadcast_packages;
create policy "broadcast authenticated package read" on public.broadcast_packages
for select to authenticated using (status='ACTIVE');

drop policy if exists "broadcast authenticated catalogue read" on public.broadcast_scenes;
create policy "broadcast authenticated catalogue read" on public.broadcast_scenes
for select to authenticated using (true);
drop policy if exists "broadcast authenticated variants read" on public.broadcast_variants;
create policy "broadcast authenticated variants read" on public.broadcast_variants
for select to authenticated using (true);
drop policy if exists "broadcast authenticated published versions read" on public.broadcast_variant_versions;
create policy "broadcast authenticated published versions read" on public.broadcast_variant_versions
for select to authenticated using (status='PUBLISHED' or public.ips_can_manage_broadcast_package((select s.package_id from public.broadcast_variants v join public.broadcast_scenes s on s.id=v.scene_id where v.id=variant_id)));
drop policy if exists "broadcast authenticated release read" on public.broadcast_package_releases;
create policy "broadcast authenticated release read" on public.broadcast_package_releases
for select to authenticated using (true);
drop policy if exists "broadcast director session read" on public.broadcast_match_sessions;
create policy "broadcast director session read" on public.broadcast_match_sessions
for select to authenticated using (public.ips_can_direct_match(match_id));
drop policy if exists "broadcast director state read" on public.broadcast_program_state;
create policy "broadcast director state read" on public.broadcast_program_state
for select to authenticated using (public.ips_can_direct_match(match_id));
drop policy if exists "broadcast director event read" on public.broadcast_program_events;
create policy "broadcast director event read" on public.broadcast_program_events
for select to authenticated using (public.ips_can_direct_match(match_id));
drop policy if exists "broadcast signal public read" on public.broadcast_realtime_signals;
create policy "broadcast signal public read" on public.broadcast_realtime_signals
for select to anon,authenticated using (
  exists (
    select 1 from public.matches m
    join public.tournaments t on t.id=m.tournament_id
    where m.id=match_id
      and (t.status::text<>'DRAFT' or m.status::text in ('LIVE','COMPLETED','AWAITING_CERTIFICATION','OFFICIAL','LOCKED'))
  )
);

grant select on public.broadcast_packages,public.broadcast_scenes,public.broadcast_variants,public.broadcast_variant_versions,
 public.broadcast_package_releases,public.broadcast_match_sessions,public.broadcast_program_state,public.broadcast_program_events
to authenticated;
grant select on public.broadcast_realtime_signals to anon,authenticated;

create or replace function public.ips_prism_factory_document(p_key text)
returns jsonb
language plpgsql immutable
as $$
begin
  case p_key
  when 'scorebar.default' then return $json$
  {
    "schemaVersion":1,"canvas":{"width":1920,"height":1080,"transparent":true},"name":"PRISM Master Scorebar",
    "designTokens":{"accent":"#19d18f","navy":"#061827","ice":"#eaf7f3","italyGreen":"#169b62","italyRed":"#ce2b37"},
    "safeArea":{"top":54,"right":96,"bottom":54,"left":96},
    "elements":[
      {"id":"sb-shadow","name":"Depth Shadow","type":"RECT","zIndex":1,"transform":{"x":72,"y":902,"width":1776,"height":122},"style":{"fill":{"type":"SOLID","color":"rgba(0,0,0,.30)"},"blur":24}},
      {"id":"sb-base","name":"Prism Glass Base","type":"ROUNDED_RECT","zIndex":2,"transform":{"x":72,"y":866,"width":1776,"height":122},"style":{"fill":{"type":"LINEAR_GRADIENT","angle":0,"stops":[{"offset":0,"color":"#061827"},{"offset":0.62,"color":"#0a2638"},{"offset":1,"color":"#071d2d"}]},"stroke":{"type":"SOLID","color":"rgba(255,255,255,.14)"},"strokeWidth":1,"corners":{"tl":18,"tr":18,"br":18,"bl":18,"linked":true},"shadows":[{"x":0,"y":18,"blur":48,"spread":0,"color":"rgba(0,0,0,.34)"}]}},
      {"id":"sb-prism","name":"Prism Accent","type":"RECT","zIndex":3,"transform":{"x":72,"y":982,"width":1776,"height":6},"style":{"fill":{"type":"LINEAR_GRADIENT","angle":0,"stops":[{"offset":0,"color":"#169b62"},{"offset":0.33,"color":"#f4f5f0"},{"offset":0.66,"color":"#ce2b37"},{"offset":1,"color":"#19d18f"}]}}},
      {"id":"sb-brand","name":"IPS Identity","type":"TEXT","zIndex":5,"transform":{"x":100,"y":887,"width":170,"height":56},"style":{"fill":{"type":"SOLID","color":"#19d18f"}},"text":{"value":"IPS","typography":{"fontFamily":"Inter","fontWeight":950,"fontSize":34,"lineHeight":1,"letterSpacing":-1.8,"align":"LEFT","verticalAlign":"MIDDLE","case":"UPPER","wrap":"SHRINK","maxLines":1,"padding":0}}},
      {"id":"sb-match","name":"Match Code","type":"TEXT","zIndex":5,"transform":{"x":101,"y":941,"width":170,"height":24},"style":{"fill":{"type":"SOLID","color":"#9eb6c3"}},"text":{"value":"MATCH","typography":{"fontFamily":"Inter","fontWeight":850,"fontSize":13,"lineHeight":1,"letterSpacing":1.5,"align":"LEFT","verticalAlign":"MIDDLE","case":"UPPER","wrap":"SHRINK","maxLines":1,"padding":0}},"bindings":[{"property":"text.value","path":"match.code","fallback":"MATCH","format":"UPPER","prefix":"","suffix":""}]},
      {"id":"sb-team","name":"Batting Team","type":"TEXT","zIndex":5,"transform":{"x":305,"y":884,"width":235,"height":25},"style":{"fill":{"type":"SOLID","color":"#7fdcba"}},"text":{"value":"TEAM","typography":{"fontFamily":"Inter","fontWeight":900,"fontSize":15,"lineHeight":1,"letterSpacing":1,"align":"LEFT","verticalAlign":"MIDDLE","case":"UPPER","wrap":"SHRINK","maxLines":1,"padding":0}},"bindings":[{"property":"text.value","path":"innings.batting_team.short_name","fallback":"TEAM","format":"UPPER","prefix":"","suffix":""}]},
      {"id":"sb-score","name":"Score","type":"TEXT","zIndex":6,"transform":{"x":304,"y":908,"width":238,"height":61},"style":{"fill":{"type":"SOLID","color":"#ffffff"}},"text":{"value":"0/0","typography":{"fontFamily":"Inter","fontWeight":950,"fontSize":48,"lineHeight":1,"letterSpacing":-2.4,"align":"LEFT","verticalAlign":"MIDDLE","case":"NONE","wrap":"SHRINK","maxLines":1,"padding":0}},"bindings":[{"property":"text.value","path":"innings.score_display","fallback":"0/0","format":"RAW","prefix":"","suffix":""}]},
      {"id":"sb-overs-label","name":"Overs Label","type":"TEXT","zIndex":5,"transform":{"x":555,"y":886,"width":112,"height":22},"style":{"fill":{"type":"SOLID","color":"#7e97a5"}},"text":{"value":"OVERS","typography":{"fontFamily":"Inter","fontWeight":850,"fontSize":11,"lineHeight":1,"letterSpacing":1.3,"align":"CENTER","verticalAlign":"MIDDLE","case":"UPPER","wrap":"SHRINK","maxLines":1,"padding":0}}},
      {"id":"sb-overs","name":"Overs","type":"TEXT","zIndex":6,"transform":{"x":555,"y":911,"width":112,"height":49},"style":{"fill":{"type":"SOLID","color":"#ffffff"}},"text":{"value":"0.0","typography":{"fontFamily":"Inter","fontWeight":950,"fontSize":34,"lineHeight":1,"letterSpacing":-1,"align":"CENTER","verticalAlign":"MIDDLE","case":"NONE","wrap":"SHRINK","maxLines":1,"padding":0}},"bindings":[{"property":"text.value","path":"innings.overs","fallback":"0.0","format":"RAW","prefix":"","suffix":""}]},
      {"id":"sb-striker-label","name":"Striker Label","type":"TEXT","zIndex":5,"transform":{"x":696,"y":882,"width":245,"height":22},"style":{"fill":{"type":"SOLID","color":"#19d18f"}},"text":{"value":"STRIKER","typography":{"fontFamily":"Inter","fontWeight":900,"fontSize":10,"lineHeight":1,"letterSpacing":1.2,"align":"LEFT","verticalAlign":"MIDDLE","case":"UPPER","wrap":"SHRINK","maxLines":1,"padding":0}}},
      {"id":"sb-striker","name":"Striker Name","type":"TEXT","zIndex":6,"transform":{"x":696,"y":906,"width":245,"height":31},"style":{"fill":{"type":"SOLID","color":"#ffffff"}},"text":{"value":"BATTER","typography":{"fontFamily":"Inter","fontWeight":900,"fontSize":22,"lineHeight":1,"letterSpacing":-.5,"align":"LEFT","verticalAlign":"MIDDLE","case":"NONE","wrap":"SHRINK","maxLines":1,"padding":0}},"bindings":[{"property":"text.value","path":"current.striker.name","fallback":"—","format":"RAW","prefix":"","suffix":""}]},
      {"id":"sb-striker-runs","name":"Striker Score","type":"TEXT","zIndex":6,"transform":{"x":696,"y":941,"width":245,"height":25},"style":{"fill":{"type":"SOLID","color":"#b8cad3"}},"text":{"value":"0 (0)","typography":{"fontFamily":"Inter","fontWeight":850,"fontSize":15,"lineHeight":1,"letterSpacing":0,"align":"LEFT","verticalAlign":"MIDDLE","case":"NONE","wrap":"SHRINK","maxLines":1,"padding":0}},"bindings":[{"property":"text.value","path":"current.striker.score_display","fallback":"0 (0)","format":"RAW","prefix":"","suffix":""}]},
      {"id":"sb-nonstriker","name":"Non-striker Name","type":"TEXT","zIndex":6,"transform":{"x":966,"y":906,"width":245,"height":31},"style":{"fill":{"type":"SOLID","color":"#ffffff"}},"text":{"value":"BATTER","typography":{"fontFamily":"Inter","fontWeight":850,"fontSize":20,"lineHeight":1,"letterSpacing":-.4,"align":"LEFT","verticalAlign":"MIDDLE","case":"NONE","wrap":"SHRINK","maxLines":1,"padding":0}},"bindings":[{"property":"text.value","path":"current.non_striker.name","fallback":"—","format":"RAW","prefix":"","suffix":""}]},
      {"id":"sb-nonstriker-runs","name":"Non-striker Score","type":"TEXT","zIndex":6,"transform":{"x":966,"y":941,"width":245,"height":25},"style":{"fill":{"type":"SOLID","color":"#91a9b5"}},"text":{"value":"0 (0)","typography":{"fontFamily":"Inter","fontWeight":800,"fontSize":14,"lineHeight":1,"letterSpacing":0,"align":"LEFT","verticalAlign":"MIDDLE","case":"NONE","wrap":"SHRINK","maxLines":1,"padding":0}},"bindings":[{"property":"text.value","path":"current.non_striker.score_display","fallback":"0 (0)","format":"RAW","prefix":"","suffix":""}]},
      {"id":"sb-bowler-label","name":"Bowler Label","type":"TEXT","zIndex":5,"transform":{"x":1242,"y":882,"width":230,"height":22},"style":{"fill":{"type":"SOLID","color":"#7e97a5"}},"text":{"value":"BOWLER","typography":{"fontFamily":"Inter","fontWeight":900,"fontSize":10,"lineHeight":1,"letterSpacing":1.2,"align":"LEFT","verticalAlign":"MIDDLE","case":"UPPER","wrap":"SHRINK","maxLines":1,"padding":0}}},
      {"id":"sb-bowler","name":"Bowler","type":"TEXT","zIndex":6,"transform":{"x":1242,"y":906,"width":230,"height":31},"style":{"fill":{"type":"SOLID","color":"#ffffff"}},"text":{"value":"BOWLER","typography":{"fontFamily":"Inter","fontWeight":900,"fontSize":21,"lineHeight":1,"letterSpacing":-.4,"align":"LEFT","verticalAlign":"MIDDLE","case":"NONE","wrap":"SHRINK","maxLines":1,"padding":0}},"bindings":[{"property":"text.value","path":"current.bowler.name","fallback":"—","format":"RAW","prefix":"","suffix":""}]},
      {"id":"sb-bowler-fig","name":"Bowler Figures","type":"TEXT","zIndex":6,"transform":{"x":1242,"y":941,"width":230,"height":25},"style":{"fill":{"type":"SOLID","color":"#b8cad3"}},"text":{"value":"0/0 (0.0)","typography":{"fontFamily":"Inter","fontWeight":850,"fontSize":14,"lineHeight":1,"letterSpacing":0,"align":"LEFT","verticalAlign":"MIDDLE","case":"NONE","wrap":"SHRINK","maxLines":1,"padding":0}},"bindings":[{"property":"text.value","path":"current.bowler.figures_display","fallback":"0/0 (0.0)","format":"RAW","prefix":"","suffix":""}]},
      {"id":"sb-situation","name":"Chase Situation","type":"TEXT","zIndex":6,"transform":{"x":1505,"y":895,"width":310,"height":60},"style":{"fill":{"type":"SOLID","color":"#8fe1c1"}},"text":{"value":"","typography":{"fontFamily":"Inter","fontWeight":900,"fontSize":19,"lineHeight":1.05,"letterSpacing":-.2,"align":"RIGHT","verticalAlign":"MIDDLE","case":"UPPER","wrap":"SHRINK","maxLines":2,"padding":0}},"bindings":[{"property":"text.value","path":"innings.chase_display","fallback":"","format":"UPPER","prefix":"","suffix":""}],"conditions":{"mode":"ALL","conditions":[{"path":"innings.number","operator":"EQ","value":2},{"path":"innings.runs_required","operator":"GT","value":0}]}}
    ],
    "guides":[],"metadata":{"factory":"IPS PRISM","scene":"scorebar","variant":"default"}
  }$json$::jsonb;
  when 'four.fullscreen' then return $json$
  {
    "schemaVersion":1,"canvas":{"width":1920,"height":1080,"transparent":true},"name":"PRISM FOUR Fullscreen",
    "designTokens":{"accent":"#20d5a0","blue":"#2f6fff","navy":"#041523"},"safeArea":{"top":54,"right":96,"bottom":54,"left":96},
    "elements":[
      {"id":"4-vignette","name":"Cinematic Vignette","type":"RECT","zIndex":1,"transform":{"x":0,"y":0,"width":1920,"height":1080},"style":{"fill":{"type":"RADIAL_GRADIENT","stops":[{"offset":0,"color":"rgba(14,74,104,.88)"},{"offset":1,"color":"rgba(3,13,23,.98)"}]}}},
      {"id":"4-streaks","name":"Speed Streaks","type":"EFFECT","zIndex":2,"transform":{"x":0,"y":0,"width":1920,"height":1080},"style":{},"effect":{"kind":"SPEED_STREAKS","params":{"count":30,"angle":-12,"color":"#20d5a0","opacity":0.45}},"animation":{"enterPreset":"IMPACT","durationMs":650,"exitPreset":"FADE","exitDurationMs":320}},
      {"id":"4-shards","name":"Angular Shards","type":"PARTICLES","zIndex":3,"transform":{"x":0,"y":0,"width":1920,"height":1080},"style":{},"effect":{"kind":"SHARDS","params":{"count":38,"color":"#2f6fff","spread":0.72}},"animation":{"enterPreset":"IMPACT","durationMs":900,"exitPreset":"FADE","exitDurationMs":300}},
      {"id":"4-giant","name":"Giant Four","type":"TEXT","zIndex":5,"transform":{"x":250,"y":145,"width":700,"height":720,"rotation":-4},"style":{"fill":{"type":"LINEAR_GRADIENT","angle":90,"stops":[{"offset":0,"color":"#ffffff"},{"offset":.55,"color":"#8cf3d0"},{"offset":1,"color":"#20d5a0"}]},"shadows":[{"x":0,"y":24,"blur":55,"spread":0,"color":"rgba(0,0,0,.48)"}]},"text":{"value":"4","typography":{"fontFamily":"Inter","fontWeight":1000,"fontSize":720,"lineHeight":.82,"letterSpacing":-35,"align":"CENTER","verticalAlign":"MIDDLE","case":"NONE","wrap":"SHRINK","maxLines":1,"padding":0}},"animation":{"enterPreset":"SCALE_POP","durationMs":520,"delayMs":100,"exitPreset":"WIPE","exitDurationMs":300}},
      {"id":"4-word","name":"FOUR Title","type":"TEXT","zIndex":6,"transform":{"x":900,"y":380,"width":760,"height":170},"style":{"fill":{"type":"SOLID","color":"#ffffff"}},"text":{"value":"FOUR","typography":{"fontFamily":"Inter","fontWeight":1000,"fontSize":148,"lineHeight":.9,"letterSpacing":-6,"align":"LEFT","verticalAlign":"MIDDLE","case":"UPPER","wrap":"SHRINK","maxLines":1,"padding":0}},"animation":{"enterPreset":"BROADCAST_WIPE","durationMs":500,"delayMs":220,"exitPreset":"SLIDE","exitDurationMs":260}},
      {"id":"4-team","name":"Team Identity","type":"TEXT","zIndex":6,"transform":{"x":914,"y":552,"width":720,"height":58},"style":{"fill":{"type":"SOLID","color":"#85e6c2"}},"text":{"value":"TEAM","typography":{"fontFamily":"Inter","fontWeight":900,"fontSize":34,"lineHeight":1,"letterSpacing":2,"align":"LEFT","verticalAlign":"MIDDLE","case":"UPPER","wrap":"SHRINK","maxLines":1,"padding":0}},"bindings":[{"property":"text.value","path":"innings.batting_team.name","fallback":"IPS CRICKET","format":"UPPER","prefix":"","suffix":""}]},
      {"id":"4-player","name":"Batter","type":"TEXT","zIndex":6,"transform":{"x":914,"y":622,"width":720,"height":52},"style":{"fill":{"type":"SOLID","color":"#b8cbd5"}},"text":{"value":"BATTER","typography":{"fontFamily":"Inter","fontWeight":800,"fontSize":28,"lineHeight":1,"letterSpacing":0,"align":"LEFT","verticalAlign":"MIDDLE","case":"NONE","wrap":"SHRINK","maxLines":1,"padding":0}},"bindings":[{"property":"text.value","path":"current.striker.name","fallback":"","format":"RAW","prefix":"","suffix":""}]},
      {"id":"4-sweep","name":"Light Sweep","type":"EFFECT","zIndex":8,"transform":{"x":0,"y":0,"width":1920,"height":1080},"style":{},"effect":{"kind":"LIGHT_SWEEP","params":{"width":240,"intensity":0.55,"angle":-16}},"animation":{"enterPreset":"LIGHT_SWEEP","durationMs":1100,"delayMs":260,"exitPreset":"FADE","exitDurationMs":120}}
    ],"guides":[],"metadata":{"factory":"IPS PRISM","scene":"four","variant":"fullscreen"}
  }$json$::jsonb;
  when 'four.lower-third' then return $json$
  {
    "schemaVersion":1,"canvas":{"width":1920,"height":1080,"transparent":true},"name":"PRISM FOUR Lower Third",
    "designTokens":{"accent":"#20d5a0"},"safeArea":{"top":54,"right":96,"bottom":54,"left":96},
    "elements":[
      {"id":"4lt-base","name":"Boundary Bar","type":"ROUNDED_RECT","zIndex":1,"transform":{"x":72,"y":866,"width":1776,"height":122},"style":{"fill":{"type":"LINEAR_GRADIENT","angle":0,"stops":[{"offset":0,"color":"#124f70"},{"offset":.48,"color":"#071d2d"},{"offset":1,"color":"#0d694f"}]},"stroke":{"type":"SOLID","color":"rgba(255,255,255,.15)"},"strokeWidth":1,"corners":{"tl":18,"tr":18,"br":18,"bl":18,"linked":true},"shadows":[{"x":0,"y":18,"blur":48,"spread":0,"color":"rgba(0,0,0,.34)"}]},"animation":{"enterPreset":"BROADCAST_WIPE","durationMs":360,"exitPreset":"BROADCAST_WIPE","exitDurationMs":300}},
      {"id":"4lt-num","name":"Four Numeral","type":"TEXT","zIndex":4,"transform":{"x":110,"y":873,"width":150,"height":100},"style":{"fill":{"type":"SOLID","color":"#7ef0c6"}},"text":{"value":"4","typography":{"fontFamily":"Inter","fontWeight":1000,"fontSize":92,"lineHeight":.9,"letterSpacing":-5,"align":"CENTER","verticalAlign":"MIDDLE","case":"NONE","wrap":"SHRINK","maxLines":1,"padding":0}},"animation":{"enterPreset":"SCALE_POP","durationMs":360,"delayMs":80,"exitPreset":"FADE","exitDurationMs":180}},
      {"id":"4lt-word","name":"FOUR","type":"TEXT","zIndex":4,"transform":{"x":285,"y":891,"width":410,"height":62},"style":{"fill":{"type":"SOLID","color":"#ffffff"}},"text":{"value":"FOUR","typography":{"fontFamily":"Inter","fontWeight":1000,"fontSize":55,"lineHeight":1,"letterSpacing":-2,"align":"LEFT","verticalAlign":"MIDDLE","case":"UPPER","wrap":"SHRINK","maxLines":1,"padding":0}}},
      {"id":"4lt-player","name":"Batter Identity","type":"TEXT","zIndex":4,"transform":{"x":720,"y":894,"width":650,"height":56},"style":{"fill":{"type":"SOLID","color":"#bcd0da"}},"text":{"value":"BATTER","typography":{"fontFamily":"Inter","fontWeight":850,"fontSize":30,"lineHeight":1,"letterSpacing":0,"align":"LEFT","verticalAlign":"MIDDLE","case":"NONE","wrap":"SHRINK","maxLines":1,"padding":0}},"bindings":[{"property":"text.value","path":"current.striker.name","fallback":"","format":"RAW","prefix":"","suffix":""}]},
      {"id":"4lt-score","name":"Live Score","type":"TEXT","zIndex":4,"transform":{"x":1435,"y":891,"width":345,"height":62},"style":{"fill":{"type":"SOLID","color":"#ffffff"}},"text":{"value":"0/0","typography":{"fontFamily":"Inter","fontWeight":950,"fontSize":48,"lineHeight":1,"letterSpacing":-1.5,"align":"RIGHT","verticalAlign":"MIDDLE","case":"NONE","wrap":"SHRINK","maxLines":1,"padding":0}},"bindings":[{"property":"text.value","path":"innings.score_display","fallback":"0/0","format":"RAW","prefix":"","suffix":""}]},
      {"id":"4lt-sweep","name":"Boundary Sweep","type":"EFFECT","zIndex":8,"transform":{"x":72,"y":866,"width":1776,"height":122},"style":{},"effect":{"kind":"LIGHT_SWEEP","params":{"width":180,"intensity":0.45,"angle":-18}},"animation":{"enterPreset":"LIGHT_SWEEP","durationMs":850,"delayMs":100,"exitPreset":"FADE","exitDurationMs":120}}
    ],"guides":[],"metadata":{"factory":"IPS PRISM","scene":"four","variant":"lower-third"}
  }$json$::jsonb;
  when 'six.fullscreen' then return $json$
  {
    "schemaVersion":1,"canvas":{"width":1920,"height":1080,"transparent":true},"name":"PRISM SIX Fullscreen",
    "designTokens":{"accent":"#19d18f","violet":"#7768ff"},"safeArea":{"top":54,"right":96,"bottom":54,"left":96},
    "elements":[
      {"id":"6-bg","name":"Deep Energy Field","type":"RECT","zIndex":1,"transform":{"x":0,"y":0,"width":1920,"height":1080},"style":{"fill":{"type":"RADIAL_GRADIENT","stops":[{"offset":0,"color":"#12385b"},{"offset":.5,"color":"#071a2b"},{"offset":1,"color":"#020a12"}]}}},
      {"id":"6-rings","name":"Radial Energy Rings","type":"EFFECT","zIndex":2,"transform":{"x":170,"y":40,"width":1050,"height":1000},"style":{},"effect":{"kind":"ENERGY_RINGS","params":{"count":5,"color":"#19d18f","secondary":"#7768ff","opacity":0.5}},"animation":{"enterPreset":"IMPACT","durationMs":750,"exitPreset":"FADE","exitDurationMs":280}},
      {"id":"6-particles","name":"Particle Depth","type":"PARTICLES","zIndex":3,"transform":{"x":0,"y":0,"width":1920,"height":1080},"style":{},"effect":{"kind":"PARTICLE_DEPTH","params":{"count":72,"color":"#9dfff0","depth":0.8}},"animation":{"enterPreset":"IMPACT","durationMs":900,"exitPreset":"FADE","exitDurationMs":250}},
      {"id":"6-giant","name":"Dimensional Six","type":"TEXT","zIndex":5,"transform":{"x":205,"y":100,"width":800,"height":810,"rotation":-3},"style":{"fill":{"type":"LINEAR_GRADIENT","angle":110,"stops":[{"offset":0,"color":"#ffffff"},{"offset":.45,"color":"#9ffff0"},{"offset":.75,"color":"#38d8ad"},{"offset":1,"color":"#7768ff"}]},"shadows":[{"x":8,"y":30,"blur":70,"spread":4,"color":"rgba(27,220,168,.28)"},{"x":0,"y":18,"blur":42,"spread":0,"color":"rgba(0,0,0,.5)"}]},"text":{"value":"6","typography":{"fontFamily":"Inter","fontWeight":1000,"fontSize":790,"lineHeight":.82,"letterSpacing":-42,"align":"CENTER","verticalAlign":"MIDDLE","case":"NONE","wrap":"SHRINK","maxLines":1,"padding":0}},"animation":{"enterPreset":"IMPACT","durationMs":560,"delayMs":60,"exitPreset":"SCALE_POP","exitDurationMs":300}},
      {"id":"6-word","name":"SIX Title","type":"TEXT","zIndex":6,"transform":{"x":1010,"y":345,"width":650,"height":190},"style":{"fill":{"type":"SOLID","color":"#ffffff"},"glow":16},"text":{"value":"SIX","typography":{"fontFamily":"Inter","fontWeight":1000,"fontSize":170,"lineHeight":.9,"letterSpacing":-8,"align":"LEFT","verticalAlign":"MIDDLE","case":"UPPER","wrap":"SHRINK","maxLines":1,"padding":0}},"animation":{"enterPreset":"MASK_REVEAL","durationMs":520,"delayMs":180,"exitPreset":"SLIDE","exitDurationMs":260}},
      {"id":"6-max","name":"Maximum","type":"TEXT","zIndex":6,"transform":{"x":1025,"y":540,"width":610,"height":54},"style":{"fill":{"type":"SOLID","color":"#8ae6c6"}},"text":{"value":"MAXIMUM","typography":{"fontFamily":"Inter","fontWeight":950,"fontSize":32,"lineHeight":1,"letterSpacing":5,"align":"LEFT","verticalAlign":"MIDDLE","case":"UPPER","wrap":"SHRINK","maxLines":1,"padding":0}}},
      {"id":"6-player","name":"Batter Identity","type":"TEXT","zIndex":6,"transform":{"x":1025,"y":622,"width":610,"height":54},"style":{"fill":{"type":"SOLID","color":"#c6d7df"}},"text":{"value":"BATTER","typography":{"fontFamily":"Inter","fontWeight":850,"fontSize":30,"lineHeight":1,"letterSpacing":0,"align":"LEFT","verticalAlign":"MIDDLE","case":"NONE","wrap":"SHRINK","maxLines":1,"padding":0}},"bindings":[{"property":"text.value","path":"current.striker.name","fallback":"","format":"RAW","prefix":"","suffix":""}]},
      {"id":"6-team","name":"Team","type":"TEXT","zIndex":6,"transform":{"x":1025,"y":687,"width":610,"height":42},"style":{"fill":{"type":"SOLID","color":"#778f9d"}},"text":{"value":"TEAM","typography":{"fontFamily":"Inter","fontWeight":900,"fontSize":20,"lineHeight":1,"letterSpacing":2,"align":"LEFT","verticalAlign":"MIDDLE","case":"UPPER","wrap":"SHRINK","maxLines":1,"padding":0}},"bindings":[{"property":"text.value","path":"innings.batting_team.name","fallback":"","format":"UPPER","prefix":"","suffix":""}]},
      {"id":"6-sweep","name":"Hero Light Sweep","type":"EFFECT","zIndex":9,"transform":{"x":0,"y":0,"width":1920,"height":1080},"style":{},"effect":{"kind":"LIGHT_SWEEP","params":{"width":300,"intensity":0.65,"angle":-18}},"animation":{"enterPreset":"LIGHT_SWEEP","durationMs":1250,"delayMs":320,"exitPreset":"FADE","exitDurationMs":100}}
    ],"guides":[],"metadata":{"factory":"IPS PRISM","scene":"six","variant":"fullscreen"}
  }$json$::jsonb;
  when 'six.lower-third' then return $json$
  {
    "schemaVersion":1,"canvas":{"width":1920,"height":1080,"transparent":true},"name":"PRISM SIX Lower Third",
    "designTokens":{"accent":"#19d18f"},"safeArea":{"top":54,"right":96,"bottom":54,"left":96},
    "elements":[
      {"id":"6lt-base","name":"Maximum Bar","type":"ROUNDED_RECT","zIndex":1,"transform":{"x":72,"y":866,"width":1776,"height":122},"style":{"fill":{"type":"LINEAR_GRADIENT","angle":0,"stops":[{"offset":0,"color":"#17445d"},{"offset":.5,"color":"#071d2d"},{"offset":1,"color":"#4f45a5"}]},"stroke":{"type":"SOLID","color":"rgba(255,255,255,.16)"},"strokeWidth":1,"corners":{"tl":18,"tr":18,"br":18,"bl":18,"linked":true}},"animation":{"enterPreset":"IMPACT","durationMs":360,"exitPreset":"BROADCAST_WIPE","exitDurationMs":300}},
      {"id":"6lt-num","name":"Six Numeral","type":"TEXT","zIndex":4,"transform":{"x":110,"y":873,"width":150,"height":100},"style":{"fill":{"type":"LINEAR_GRADIENT","angle":90,"stops":[{"offset":0,"color":"#ffffff"},{"offset":1,"color":"#7ef0c6"}]}},"text":{"value":"6","typography":{"fontFamily":"Inter","fontWeight":1000,"fontSize":92,"lineHeight":.9,"letterSpacing":-5,"align":"CENTER","verticalAlign":"MIDDLE","case":"NONE","wrap":"SHRINK","maxLines":1,"padding":0}},"animation":{"enterPreset":"SCALE_POP","durationMs":360,"delayMs":60,"exitPreset":"FADE","exitDurationMs":180}},
      {"id":"6lt-word","name":"SIX","type":"TEXT","zIndex":4,"transform":{"x":285,"y":891,"width":410,"height":62},"style":{"fill":{"type":"SOLID","color":"#ffffff"}},"text":{"value":"SIX","typography":{"fontFamily":"Inter","fontWeight":1000,"fontSize":55,"lineHeight":1,"letterSpacing":-2,"align":"LEFT","verticalAlign":"MIDDLE","case":"UPPER","wrap":"SHRINK","maxLines":1,"padding":0}}},
      {"id":"6lt-player","name":"Batter Identity","type":"TEXT","zIndex":4,"transform":{"x":720,"y":894,"width":650,"height":56},"style":{"fill":{"type":"SOLID","color":"#c4d5dd"}},"text":{"value":"BATTER","typography":{"fontFamily":"Inter","fontWeight":850,"fontSize":30,"lineHeight":1,"letterSpacing":0,"align":"LEFT","verticalAlign":"MIDDLE","case":"NONE","wrap":"SHRINK","maxLines":1,"padding":0}},"bindings":[{"property":"text.value","path":"current.striker.name","fallback":"","format":"RAW","prefix":"","suffix":""}]},
      {"id":"6lt-score","name":"Live Score","type":"TEXT","zIndex":4,"transform":{"x":1435,"y":891,"width":345,"height":62},"style":{"fill":{"type":"SOLID","color":"#ffffff"}},"text":{"value":"0/0","typography":{"fontFamily":"Inter","fontWeight":950,"fontSize":48,"lineHeight":1,"letterSpacing":-1.5,"align":"RIGHT","verticalAlign":"MIDDLE","case":"NONE","wrap":"SHRINK","maxLines":1,"padding":0}},"bindings":[{"property":"text.value","path":"innings.score_display","fallback":"0/0","format":"RAW","prefix":"","suffix":""}]},
      {"id":"6lt-sweep","name":"Maximum Sweep","type":"EFFECT","zIndex":8,"transform":{"x":72,"y":866,"width":1776,"height":122},"style":{},"effect":{"kind":"LIGHT_SWEEP","params":{"width":210,"intensity":0.58,"angle":-18}},"animation":{"enterPreset":"LIGHT_SWEEP","durationMs":900,"delayMs":90,"exitPreset":"FADE","exitDurationMs":120}}
    ],"guides":[],"metadata":{"factory":"IPS PRISM","scene":"six","variant":"lower-third"}
  }$json$::jsonb;
  when 'wicket.fullscreen' then return $json$
  {
    "schemaVersion":1,"canvas":{"width":1920,"height":1080,"transparent":true},"name":"PRISM WICKET Fullscreen",
    "designTokens":{"red":"#e33b49","accent":"#19d18f"},"safeArea":{"top":54,"right":96,"bottom":54,"left":96},
    "elements":[
      {"id":"w-bg","name":"Impact Background","type":"RECT","zIndex":1,"transform":{"x":0,"y":0,"width":1920,"height":1080},"style":{"fill":{"type":"RADIAL_GRADIENT","stops":[{"offset":0,"color":"#651c2a"},{"offset":.48,"color":"#160d18"},{"offset":1,"color":"#03090f"}]}}},
      {"id":"w-ball","name":"Ball Streak","type":"EFFECT","zIndex":2,"transform":{"x":0,"y":0,"width":1920,"height":1080},"style":{},"effect":{"kind":"BALL_STREAK","params":{"color":"#f45a64","trail":680}},"animation":{"enterPreset":"BALL_IMPACT","durationMs":620,"exitPreset":"FADE","exitDurationMs":120}},
      {"id":"w-stumps","name":"Editable Stumps","type":"EFFECT","zIndex":4,"transform":{"x":260,"y":145,"width":630,"height":750},"style":{},"effect":{"kind":"STUMPS","params":{"stumpColor":"#edf5f6","bailColor":"#19d18f","impact":true}},"animation":{"enterPreset":"IMPACT","durationMs":760,"delayMs":180,"exitPreset":"FADE","exitDurationMs":260}},
      {"id":"w-fragments","name":"Bail Fragments","type":"PARTICLES","zIndex":5,"transform":{"x":0,"y":0,"width":1920,"height":1080},"style":{},"effect":{"kind":"SHARDS","params":{"count":45,"color":"#f4f6f7","secondary":"#e33b49","spread":0.78}},"animation":{"enterPreset":"IMPACT","durationMs":900,"delayMs":190,"exitPreset":"FADE","exitDurationMs":280}},
      {"id":"w-letter","name":"Giant W","type":"TEXT","zIndex":6,"transform":{"x":890,"y":250,"width":770,"height":340},"style":{"fill":{"type":"LINEAR_GRADIENT","angle":90,"stops":[{"offset":0,"color":"#ffffff"},{"offset":1,"color":"#e33b49"}]},"glow":18},"text":{"value":"W","typography":{"fontFamily":"Inter","fontWeight":1000,"fontSize":330,"lineHeight":.9,"letterSpacing":-20,"align":"LEFT","verticalAlign":"MIDDLE","case":"UPPER","wrap":"SHRINK","maxLines":1,"padding":0}},"animation":{"enterPreset":"IMPACT","durationMs":430,"delayMs":260,"exitPreset":"SCALE_POP","exitDurationMs":260}},
      {"id":"w-title","name":"WICKET","type":"TEXT","zIndex":7,"transform":{"x":915,"y":585,"width":720,"height":120},"style":{"fill":{"type":"SOLID","color":"#ffffff"}},"text":{"value":"WICKET","typography":{"fontFamily":"Inter","fontWeight":1000,"fontSize":100,"lineHeight":.9,"letterSpacing":-4,"align":"LEFT","verticalAlign":"MIDDLE","case":"UPPER","wrap":"SHRINK","maxLines":1,"padding":0}},"animation":{"enterPreset":"MASK_REVEAL","durationMs":480,"delayMs":360,"exitPreset":"SLIDE","exitDurationMs":280}},
      {"id":"w-team","name":"Bowling Team","type":"TEXT","zIndex":7,"transform":{"x":925,"y":714,"width":700,"height":48},"style":{"fill":{"type":"SOLID","color":"#ef8f98"}},"text":{"value":"TEAM","typography":{"fontFamily":"Inter","fontWeight":900,"fontSize":25,"lineHeight":1,"letterSpacing":2,"align":"LEFT","verticalAlign":"MIDDLE","case":"UPPER","wrap":"SHRINK","maxLines":1,"padding":0}},"bindings":[{"property":"text.value","path":"innings.bowling_team.name","fallback":"WICKET","format":"UPPER","prefix":"","suffix":""}]},
      {"id":"w-flash","name":"Impact Flash","type":"EFFECT","zIndex":10,"transform":{"x":0,"y":0,"width":1920,"height":1080},"style":{},"effect":{"kind":"IMPACT_FLASH","params":{"color":"#ffffff","intensity":0.8}},"animation":{"enterPreset":"FLASH","durationMs":320,"delayMs":210,"exitPreset":"FADE","exitDurationMs":90}}
    ],"guides":[],"metadata":{"factory":"IPS PRISM","scene":"wicket","variant":"fullscreen"}
  }$json$::jsonb;
  when 'wicket.lower-third' then return $json$
  {
    "schemaVersion":1,"canvas":{"width":1920,"height":1080,"transparent":true},"name":"PRISM WICKET Lower Third",
    "designTokens":{"red":"#e33b49"},"safeArea":{"top":54,"right":96,"bottom":54,"left":96},
    "elements":[
      {"id":"wlt-base","name":"Wicket Bar","type":"ROUNDED_RECT","zIndex":1,"transform":{"x":72,"y":866,"width":1776,"height":122},"style":{"fill":{"type":"LINEAR_GRADIENT","angle":0,"stops":[{"offset":0,"color":"#7c1d2a"},{"offset":.47,"color":"#180d18"},{"offset":1,"color":"#071b29"}]},"stroke":{"type":"SOLID","color":"rgba(255,255,255,.15)"},"strokeWidth":1,"corners":{"tl":18,"tr":18,"br":18,"bl":18,"linked":true}},"animation":{"enterPreset":"IMPACT","durationMs":340,"exitPreset":"BROADCAST_WIPE","exitDurationMs":300}},
      {"id":"wlt-w","name":"W Mark","type":"TEXT","zIndex":4,"transform":{"x":105,"y":875,"width":150,"height":96},"style":{"fill":{"type":"SOLID","color":"#ff8b95"}},"text":{"value":"W","typography":{"fontFamily":"Inter","fontWeight":1000,"fontSize":82,"lineHeight":.9,"letterSpacing":-5,"align":"CENTER","verticalAlign":"MIDDLE","case":"UPPER","wrap":"SHRINK","maxLines":1,"padding":0}},"animation":{"enterPreset":"IMPACT","durationMs":350,"delayMs":50,"exitPreset":"FADE","exitDurationMs":180}},
      {"id":"wlt-word","name":"WICKET","type":"TEXT","zIndex":4,"transform":{"x":285,"y":891,"width":500,"height":62},"style":{"fill":{"type":"SOLID","color":"#ffffff"}},"text":{"value":"WICKET","typography":{"fontFamily":"Inter","fontWeight":1000,"fontSize":55,"lineHeight":1,"letterSpacing":-2,"align":"LEFT","verticalAlign":"MIDDLE","case":"UPPER","wrap":"SHRINK","maxLines":1,"padding":0}}},
      {"id":"wlt-player","name":"Dismissed Batter","type":"TEXT","zIndex":4,"transform":{"x":790,"y":894,"width":620,"height":56},"style":{"fill":{"type":"SOLID","color":"#ffc1c6"}},"text":{"value":"","typography":{"fontFamily":"Inter","fontWeight":900,"fontSize":29,"lineHeight":1,"letterSpacing":0,"align":"LEFT","verticalAlign":"MIDDLE","case":"NONE","wrap":"SHRINK","maxLines":1,"padding":0}},"bindings":[{"property":"text.value","path":"last_delivery.dismissed_player.name","fallback":"","format":"RAW","prefix":"","suffix":""}]},
      {"id":"wlt-score","name":"Live Score","type":"TEXT","zIndex":4,"transform":{"x":1435,"y":891,"width":345,"height":62},"style":{"fill":{"type":"SOLID","color":"#ffffff"}},"text":{"value":"0/0","typography":{"fontFamily":"Inter","fontWeight":950,"fontSize":48,"lineHeight":1,"letterSpacing":-1.5,"align":"RIGHT","verticalAlign":"MIDDLE","case":"NONE","wrap":"SHRINK","maxLines":1,"padding":0}},"bindings":[{"property":"text.value","path":"innings.score_display","fallback":"0/0","format":"RAW","prefix":"","suffix":""}]},
      {"id":"wlt-flash","name":"Wicket Sweep","type":"EFFECT","zIndex":8,"transform":{"x":72,"y":866,"width":1776,"height":122},"style":{},"effect":{"kind":"LIGHT_SWEEP","params":{"width":190,"intensity":0.6,"angle":-18,"color":"#ff6d78"}},"animation":{"enterPreset":"LIGHT_SWEEP","durationMs":800,"delayMs":100,"exitPreset":"FADE","exitDurationMs":100}}
    ],"guides":[],"metadata":{"factory":"IPS PRISM","scene":"wicket","variant":"lower-third"}
  }$json$::jsonb;
  else
    raise exception 'Unknown factory PRISM variant %',p_key;
  end case;
end
$$;

revoke all on function public.ips_prism_factory_document(text) from public,anon;
grant execute on function public.ips_prism_factory_document(text) to authenticated,service_role;

with pkg as (
  insert into public.broadcast_packages(name,slug,description,is_factory,theme,status)
  values(
    'IPS PRISM','ips-prism',
    'Factory IPS broadcast package. Protected source package for live cricket production.',
    true,
    '{"primary":"#071d2d","secondary":"#12385b","accent":"#19d18f","danger":"#e33b49","foreground":"#ffffff","muted":"#91a9b5","fontDisplay":"Inter","fontBody":"Inter","cornerRadius":18,"motion":"PRISM"}'::jsonb,
    'ACTIVE'
  )
  on conflict(slug) do update set name=excluded.name,description=excluded.description,is_factory=true,theme=excluded.theme,status='ACTIVE'
  returning id
),
scene_rows(scene_key,name,category,replacement_group,priority) as (
 values
 ('scorebar','Master Scorebar','PERSISTENT','scorebar',50),
 ('four','FOUR','EVENT','event',90),
 ('six','SIX','EVENT','event',90),
 ('wicket','WICKET','EVENT','event',90)
),
scenes as (
 insert into public.broadcast_scenes(package_id,scene_key,name,category,description,factory_locked,director_visible,director_label,replacement_group,default_priority)
 select pkg.id,r.scene_key,r.name,r.category,'IPS PRISM factory graphic',true,true,upper(r.name),r.replacement_group,r.priority
 from pkg cross join scene_rows r
 on conflict(package_id,scene_key) do update set
   name=excluded.name,category=excluded.category,factory_locked=true,director_visible=true,
   replacement_group=excluded.replacement_group,default_priority=excluded.default_priority
 returning id,scene_key
),
variant_rows(scene_key,variant_key,name,presentation,is_default,priority,replacement_group,conflict_behavior,duration_ms,direct_take,automation) as (
 values
 ('scorebar','default','PRISM Scorebar','SCOREBAR',true,50,'scorebar','REPLACE_GROUP',null,false,false),
 ('four','fullscreen','PRISM FOUR Fullscreen','FULLSCREEN',true,90,'event','HIDE_SCOREBAR',2600,true,true),
 ('four','lower-third','PRISM FOUR Lower Third','LOWER_THIRD',false,90,'event','COEXIST',2200,true,true),
 ('six','fullscreen','PRISM SIX Fullscreen','FULLSCREEN',true,90,'event','HIDE_SCOREBAR',3000,true,true),
 ('six','lower-third','PRISM SIX Lower Third','LOWER_THIRD',false,90,'event','COEXIST',2500,true,true),
 ('wicket','fullscreen','PRISM WICKET Fullscreen','FULLSCREEN',true,90,'event','HIDE_SCOREBAR',3200,true,true),
 ('wicket','lower-third','PRISM WICKET Lower Third','LOWER_THIRD',false,90,'event','COEXIST',2700,true,true)
),
variants as (
 insert into public.broadcast_variants(scene_id,variant_key,name,presentation,is_default,priority,replacement_group,conflict_behavior,default_duration_ms,direct_take,retrigger_policy,automation_eligible)
 select s.id,v.variant_key,v.name,v.presentation,v.is_default,v.priority,v.replacement_group,v.conflict_behavior,v.duration_ms,v.direct_take,'RESTART',v.automation
 from scenes s join variant_rows v using(scene_key)
 on conflict(scene_id,variant_key) do update set
  name=excluded.name,presentation=excluded.presentation,is_default=excluded.is_default,priority=excluded.priority,
  replacement_group=excluded.replacement_group,conflict_behavior=excluded.conflict_behavior,
  default_duration_ms=excluded.default_duration_ms,direct_take=excluded.direct_take,automation_eligible=excluded.automation_eligible
 returning id,scene_id,variant_key,name,presentation,priority,replacement_group,conflict_behavior,default_duration_ms,direct_take,automation_eligible
),
published as (
 insert into public.broadcast_variant_versions(variant_id,version_no,status,document,source,published_at)
 select v.id,1,'PUBLISHED',public.ips_prism_factory_document(s.scene_key||'.'||v.variant_key),'FACTORY',now()
 from variants v join scenes s on s.id=v.scene_id
 on conflict(variant_id,version_no) do update set document=excluded.document,status='PUBLISHED',source='FACTORY',published_at=now()
 returning id,variant_id,document
),
release_manifest as (
 select jsonb_build_object(
   'schemaVersion',1,
   'package','IPS PRISM',
   'variants',jsonb_object_agg(
      s.scene_key||'.'||v.variant_key,
      jsonb_build_object(
        'variantVersionId',pv.id,
        'sceneKey',s.scene_key,
        'variantKey',v.variant_key,
        'name',v.name,
        'presentation',v.presentation,
        'priority',v.priority,
        'replacementGroup',v.replacement_group,
        'conflictBehavior',v.conflict_behavior,
        'durationMs',v.default_duration_ms,
        'directTake',v.direct_take,
        'automationEligible',v.automation_eligible,
        'document',pv.document
      )
   )
 ) manifest
 from published pv
 join variants v on v.id=pv.variant_id
 join scenes s on s.id=v.scene_id
),
release as (
 insert into public.broadcast_package_releases(package_id,version_no,manifest,theme,checksum)
 select pkg.id,1,rm.manifest,pkg.theme,'ips-prism-factory-1'
 from pkg cross join release_manifest rm
 on conflict(package_id,version_no) do update set manifest=excluded.manifest,theme=excluded.theme,checksum=excluded.checksum,published_at=now()
 returning id
)
select 1;

create or replace function public.ips_broadcast_default_release()
returns uuid
language sql stable security definer
set search_path=public
as $$
  select r.id
  from public.broadcast_package_releases r
  join public.broadcast_packages p on p.id=r.package_id
  where p.slug='ips-prism' and p.is_factory
  order by r.version_no desc limit 1
$$;
revoke all on function public.ips_broadcast_default_release() from public,anon;
grant execute on function public.ips_broadcast_default_release() to authenticated,service_role;

create or replace function public.ips_broadcast_match_data(p_match_id uuid)
returns jsonb
language sql stable security definer
set search_path=public
as $$
with m as (
  select m.*,t.name tournament_name,t.code tournament_code,t.logo_url tournament_logo,
         t.primary_color tournament_primary,t.secondary_color tournament_secondary,
         v.name venue_name
  from public.matches m
  join public.tournaments t on t.id=m.tournament_id
  left join public.venues v on v.id=m.venue_id
  where m.id=p_match_id
    and (t.status::text<>'DRAFT' or m.status::text in ('LIVE','COMPLETED','AWAITING_CERTIFICATION','OFFICIAL','LOCKED'))
),
s as (select * from public.match_live_state where match_id=p_match_id),
active as (
  select e.*,(e.runs_off_bat+e.wide_runs+e.no_ball_runs+e.bye_runs+e.leg_bye_runs)::integer delivery_runs
  from public.match_scoring_events e
  join s on e.innings_id=s.innings_id
  where e.match_id=p_match_id and e.event_type='DELIVERY'
    and not exists(select 1 from public.match_scoring_events r where r.event_type='REVERSAL' and r.reverses_event_id=e.id)
),
last_delivery as (select * from active order by sequence_no desc limit 1),
last_wicket as (select coalesce(max(sequence_no),0) seq from active where is_wicket),
partnership as (
 select coalesce(sum(delivery_runs),0)::integer runs,
        count(*) filter(where legal_delivery)::integer balls
 from active where sequence_no>(select seq from last_wicket)
),
batting_stats as (
 select xi.player_id,p.display_name,p.ips_code,p.profile_image_url,p.batting_style,p.bowling_style,p.primary_role,xi.lineup_order,
        coalesce(sum(case when a.striker_id=xi.player_id then a.runs_off_bat else 0 end),0)::integer runs,
        count(*) filter(where a.striker_id=xi.player_id and a.legal_delivery)::integer balls,
        count(*) filter(where a.striker_id=xi.player_id and a.runs_off_bat=4)::integer fours,
        count(*) filter(where a.striker_id=xi.player_id and a.runs_off_bat=6)::integer sixes,
        (array_agg(a.wicket_kind order by a.sequence_no) filter(where a.is_wicket and a.dismissed_player_id=xi.player_id))[1] dismissal
 from public.match_playing_xi xi
 join public.players p on p.id=xi.player_id
 left join active a on true
 where xi.match_id=p_match_id and xi.team_id=(select batting_team_id from s)
 group by xi.player_id,p.display_name,p.ips_code,p.profile_image_url,p.batting_style,p.bowling_style,p.primary_role,xi.lineup_order
),
bowler_over as (
 select bowler_id,over_no,sum(runs_off_bat+wide_runs+no_ball_runs)::integer conceded
 from active group by bowler_id,over_no
),
bowling_stats as (
 select xi.player_id,p.display_name,p.ips_code,p.profile_image_url,p.batting_style,p.bowling_style,p.primary_role,xi.lineup_order,
   count(*) filter(where a.bowler_id=xi.player_id and a.legal_delivery)::integer legal_balls,
   coalesce(sum(case when a.bowler_id=xi.player_id then a.runs_off_bat+a.wide_runs+a.no_ball_runs else 0 end),0)::integer runs,
   count(*) filter(where a.bowler_id=xi.player_id and a.is_wicket and a.wicket_kind in ('BOWLED','CAUGHT','HIT_WICKET'))::integer wickets,
   coalesce((select count(*) from bowler_over bo where bo.bowler_id=xi.player_id and bo.conceded=0),0)::integer maidens
 from public.match_playing_xi xi
 join public.players p on p.id=xi.player_id
 left join active a on true
 where xi.match_id=p_match_id and xi.team_id=(select bowling_team_id from s)
 group by xi.player_id,p.display_name,p.ips_code,p.profile_image_url,p.batting_style,p.bowling_style,p.primary_role,xi.lineup_order
),
over_groups as (
 select over_no,
   coalesce(sum(delivery_runs),0)::integer runs,
   count(*) filter(where is_wicket)::integer wickets,
   jsonb_agg(delivery_label order by sequence_no) balls
 from active group by over_no order by over_no desc
),
innings_rows as (
 select i.*,t.name batting_name,t.short_name batting_short,t.logo_url batting_logo
 from public.match_innings i join public.teams t on t.id=i.batting_team_id
 where i.match_id=p_match_id
)
select jsonb_build_object(
 'match',jsonb_build_object(
   'id',m.id,'code',m.match_code,'number',m.match_number,'status',m.status,'stage',m.stage,'round',m.round_label,
   'scheduled_at',m.scheduled_at,'venue',m.venue_name,
   'tournament',jsonb_build_object('id',m.tournament_id,'name',m.tournament_name,'code',m.tournament_code,'logo_url',m.tournament_logo,'primary_color',m.tournament_primary,'secondary_color',m.tournament_secondary),
   'home_team',jsonb_build_object('id',ht.id,'name',ht.name,'short_name',ht.short_name,'logo_url',ht.logo_url,'primary_color',coalesce(ht.primary_color,'#19d18f'),'secondary_color',coalesce(ht.secondary_color,'#071d2d')),
   'away_team',jsonb_build_object('id',at.id,'name',at.name,'short_name',at.short_name,'logo_url',at.logo_url,'primary_color',coalesce(at.primary_color,'#4f7cff'),'secondary_color',coalesce(at.secondary_color,'#071d2d'))
 ),
 'innings',jsonb_build_object(
   'started',s.innings_id is not null,'number',s.innings_no,'complete',coalesce(s.innings_complete,false),
   'batting_team',jsonb_build_object('id',bt.id,'name',bt.name,'short_name',coalesce(bt.short_name,bt.name),'logo_url',bt.logo_url,'primary_color',coalesce(bt.primary_color,'#19d18f'),'secondary_color',coalesce(bt.secondary_color,'#071d2d')),
   'bowling_team',jsonb_build_object('id',bw.id,'name',bw.name,'short_name',coalesce(bw.short_name,bw.name),'logo_url',bw.logo_url,'primary_color',coalesce(bw.primary_color,'#4f7cff'),'secondary_color',coalesce(bw.secondary_color,'#071d2d')),
   'runs',coalesce(s.total_runs,0),'wickets',coalesce(s.wickets,0),
   'score_display',coalesce(s.total_runs,0)::text||'/'||coalesce(s.wickets,0)::text,
   'legal_balls',coalesce(s.legal_balls,0),
   'overs',(coalesce(s.legal_balls,0)/greatest(m.format_balls_per_over,1))::text||'.'||(coalesce(s.legal_balls,0)%greatest(m.format_balls_per_over,1))::text,
   'target',s.target_runs,
   'runs_required',case when s.target_runs is null then null else greatest(s.target_runs-coalesce(s.total_runs,0),0) end,
   'balls_remaining',case when s.innings_id is null then null else greatest(m.format_overs_per_innings*m.format_balls_per_over-coalesce(s.legal_balls,0),0) end,
   'crr',case when coalesce(s.legal_balls,0)=0 then 0 else round((s.total_runs::numeric*m.format_balls_per_over)/s.legal_balls,2) end,
   'rrr',case when s.target_runs is null or greatest(m.format_overs_per_innings*m.format_balls_per_over-coalesce(s.legal_balls,0),0)=0 then null else round((greatest(s.target_runs-s.total_runs,0)::numeric*m.format_balls_per_over)/greatest(m.format_overs_per_innings*m.format_balls_per_over-s.legal_balls,1),2) end,
   'projected_score',case when coalesce(s.legal_balls,0)=0 then null else ceil((s.total_runs::numeric*(m.format_overs_per_innings*m.format_balls_per_over))/s.legal_balls)::integer end,
   'chase_display',case when s.target_runs is null then '' else 'NEED '||greatest(s.target_runs-s.total_runs,0)::text||' FROM '||greatest(m.format_overs_per_innings*m.format_balls_per_over-s.legal_balls,0)::text end,
   'free_hit',coalesce(s.free_hit,false),
   'extras',jsonb_build_object(
      'wide',coalesce((select sum(wide_runs) from active),0),
      'no_ball',coalesce((select sum(no_ball_runs) from active),0),
      'bye',coalesce((select sum(bye_runs) from active),0),
      'leg_bye',coalesce((select sum(leg_bye_runs) from active),0),
      'total',coalesce((select sum(wide_runs+no_ball_runs+bye_runs+leg_bye_runs) from active),0)
   )
 ),
 'current',jsonb_build_object(
   'striker',coalesce((select jsonb_build_object('id',bs.player_id,'name',bs.display_name,'photo_url',bs.profile_image_url,'ips_code',bs.ips_code,'role',bs.primary_role,'batting_style',bs.batting_style,'runs',bs.runs,'balls',bs.balls,'fours',bs.fours,'sixes',bs.sixes,'strike_rate',case when bs.balls=0 then 0 else round(bs.runs::numeric*100/bs.balls,1) end,'score_display',bs.runs::text||' ('||bs.balls::text||')') from batting_stats bs where bs.player_id=s.striker_id),'{}'::jsonb),
   'non_striker',coalesce((select jsonb_build_object('id',bs.player_id,'name',bs.display_name,'photo_url',bs.profile_image_url,'ips_code',bs.ips_code,'role',bs.primary_role,'batting_style',bs.batting_style,'runs',bs.runs,'balls',bs.balls,'fours',bs.fours,'sixes',bs.sixes,'strike_rate',case when bs.balls=0 then 0 else round(bs.runs::numeric*100/bs.balls,1) end,'score_display',bs.runs::text||' ('||bs.balls::text||')') from batting_stats bs where bs.player_id=s.non_striker_id),'{}'::jsonb),
   'bowler',coalesce((select jsonb_build_object('id',bs.player_id,'name',bs.display_name,'photo_url',bs.profile_image_url,'ips_code',bs.ips_code,'role',bs.primary_role,'bowling_style',bs.bowling_style,'runs',bs.runs,'wickets',bs.wickets,'maidens',bs.maidens,'legal_balls',bs.legal_balls,'overs',(bs.legal_balls/m.format_balls_per_over)::text||'.'||(bs.legal_balls%m.format_balls_per_over)::text,'economy',case when bs.legal_balls=0 then 0 else round(bs.runs::numeric*m.format_balls_per_over/bs.legal_balls,2) end,'figures_display',bs.wickets::text||'/'||bs.runs::text||' ('||(bs.legal_balls/m.format_balls_per_over)::text||'.'||(bs.legal_balls%m.format_balls_per_over)::text||')') from bowling_stats bs where bs.player_id=s.bowler_id),'{}'::jsonb),
   'partnership',jsonb_build_object('runs',(select runs from partnership),'balls',(select balls from partnership)),
   'current_over',coalesce((select balls from over_groups order by over_no desc limit 1),'[]'::jsonb),
   'previous_over',coalesce((select jsonb_build_object('over_no',over_no+1,'runs',runs,'wickets',wickets,'balls',balls) from over_groups order by over_no desc offset 1 limit 1),'{}'::jsonb),
   'last_five_overs',coalesce((select jsonb_agg(jsonb_build_object('over_no',x.over_no+1,'runs',x.runs,'wickets',x.wickets,'balls',x.balls) order by x.over_no) from (select * from over_groups order by over_no desc limit 5) x),'[]'::jsonb)
 ),
 'batting_scorecard',coalesce((select jsonb_agg(jsonb_build_object('player_id',bs.player_id,'name',bs.display_name,'photo_url',bs.profile_image_url,'runs',bs.runs,'balls',bs.balls,'fours',bs.fours,'sixes',bs.sixes,'strike_rate',case when bs.balls=0 then 0 else round(bs.runs::numeric*100/bs.balls,1) end,'dismissal',bs.dismissal,'is_striker',bs.player_id=s.striker_id,'is_non_striker',bs.player_id=s.non_striker_id) order by bs.lineup_order) from batting_stats bs),'[]'::jsonb),
 'bowling_scorecard',coalesce((select jsonb_agg(jsonb_build_object('player_id',bs.player_id,'name',bs.display_name,'photo_url',bs.profile_image_url,'overs',(bs.legal_balls/m.format_balls_per_over)::text||'.'||(bs.legal_balls%m.format_balls_per_over)::text,'maidens',bs.maidens,'runs',bs.runs,'wickets',bs.wickets,'economy',case when bs.legal_balls=0 then 0 else round(bs.runs::numeric*m.format_balls_per_over/bs.legal_balls,2) end,'is_current',bs.player_id=s.bowler_id) order by bs.lineup_order) from bowling_stats bs where bs.legal_balls>0 or bs.player_id=s.bowler_id),'[]'::jsonb),
 'playing_xi',jsonb_build_object(
   'home',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'photo_url',p.profile_image_url,'role',p.primary_role,'batting_style',p.batting_style,'bowling_style',p.bowling_style,'order',xi.lineup_order) order by xi.lineup_order) from public.match_playing_xi xi join public.players p on p.id=xi.player_id where xi.match_id=p_match_id and xi.team_id=m.home_team_id),'[]'::jsonb),
   'away',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'photo_url',p.profile_image_url,'role',p.primary_role,'batting_style',p.batting_style,'bowling_style',p.bowling_style,'order',xi.lineup_order) order by xi.lineup_order) from public.match_playing_xi xi join public.players p on p.id=xi.player_id where xi.match_id=p_match_id and xi.team_id=m.away_team_id),'[]'::jsonb)
 ),
 'innings_history',coalesce((select jsonb_agg(jsonb_build_object('innings_no',i.innings_no,'team',i.batting_name,'team_short',i.batting_short,'team_logo',i.batting_logo,'runs',i.total_runs,'wickets',i.wickets,'legal_balls',i.legal_balls,'target',i.target_runs,'status',i.status) order by i.innings_no) from innings_rows i),'[]'::jsonb),
 'last_delivery',coalesce((select jsonb_build_object(
   'id',d.id,'sequence_no',d.sequence_no,'label',d.delivery_label,'runs_off_bat',d.runs_off_bat,'is_wicket',d.is_wicket,'wicket_kind',d.wicket_kind,
   'dismissed_player',coalesce((select jsonb_build_object('id',p.id,'name',p.display_name,'photo_url',p.profile_image_url) from public.players p where p.id=d.dismissed_player_id),'{}'::jsonb)
 ) from last_delivery d),'{}'::jsonb)
)
from m
left join s on true
left join public.teams ht on ht.id=m.home_team_id
left join public.teams at on at.id=m.away_team_id
left join public.teams bt on bt.id=s.batting_team_id
left join public.teams bw on bw.id=s.bowling_team_id;
$$;
revoke all on function public.ips_broadcast_match_data(uuid) from public;
grant execute on function public.ips_broadcast_match_data(uuid) to anon,authenticated,service_role;

create or replace function public.ips_broadcast_ensure_match_session(p_match_id uuid)
returns jsonb
language plpgsql security definer
set search_path=public,auth
as $$
declare
  v_release uuid;
  v_manifest jsonb;
  v_scorebar jsonb;
begin
  if not public.ips_can_direct_match(p_match_id) then raise exception 'Not allowed to direct this match.'; end if;
  if not exists(select 1 from public.matches where id=p_match_id) then raise exception 'Match not found.'; end if;

  select package_release_id into v_release from public.broadcast_match_sessions where match_id=p_match_id;
  if v_release is null then
    v_release:=public.ips_broadcast_default_release();
    if v_release is null then raise exception 'IPS PRISM release is unavailable.'; end if;
    insert into public.broadcast_match_sessions(match_id,package_release_id,updated_by)
    values(p_match_id,v_release,auth.uid())
    on conflict(match_id) do nothing;
  end if;

  select r.manifest into v_manifest from public.broadcast_package_releases r
  join public.broadcast_match_sessions s on s.package_release_id=r.id
  where s.match_id=p_match_id;

  v_scorebar:=jsonb_build_object(
    'instanceId',gen_random_uuid(),
    'variantKey','scorebar.default',
    'priority',coalesce((v_manifest#>>'{variants,scorebar.default,priority}')::integer,50),
    'replacementGroup','scorebar',
    'startedAt',now(),
    'persistent',true,
    'payload','{}'::jsonb,
    'source','RESTORE'
  );

  insert into public.broadcast_program_state(match_id,revision,active_layers,persistent_snapshot,updated_by)
  values(p_match_id,1,jsonb_build_array(v_scorebar),jsonb_build_array(v_scorebar),auth.uid())
  on conflict(match_id) do nothing;

  insert into public.broadcast_realtime_signals(match_id,score_revision,program_revision)
  select p_match_id,0,coalesce((select revision from public.broadcast_program_state where match_id=p_match_id),0)
  on conflict(match_id) do nothing;

  return public.ips_broadcast_program_snapshot(p_match_id);
end
$$;

create or replace function public.ips_broadcast_program_snapshot(p_match_id uuid)
returns jsonb
language sql stable security definer
set search_path=public
as $$
 select jsonb_build_object(
  'match_id',m.id,
  'session',coalesce(to_jsonb(s),'{}'::jsonb),
  'program',coalesce(to_jsonb(ps),jsonb_build_object('revision',0,'preview',null,'active_layers','[]'::jsonb,'queue','[]'::jsonb,'persistent_snapshot','[]'::jsonb)),
  'release',coalesce(jsonb_build_object('id',r.id,'version',r.version_no,'manifest',r.manifest,'theme',r.theme),'{}'::jsonb),
  'data',public.ips_broadcast_match_data(p_match_id),
  'signal',coalesce(to_jsonb(sig),'{}'::jsonb)
 )
 from public.matches m
 left join public.broadcast_match_sessions s on s.match_id=m.id
 left join public.broadcast_program_state ps on ps.match_id=m.id
 left join public.broadcast_package_releases r on r.id=s.package_release_id
 left join public.broadcast_realtime_signals sig on sig.match_id=m.id
 where m.id=p_match_id;
$$;
revoke all on function public.ips_broadcast_program_snapshot(uuid) from public;
grant execute on function public.ips_broadcast_program_snapshot(uuid) to anon,authenticated,service_role;

create or replace function public.ips_broadcast_ensure_match_session(p_match_id uuid)
returns jsonb
language plpgsql security definer
set search_path=public,auth
as $$
declare
  v_release uuid;
  v_manifest jsonb;
  v_scorebar jsonb;
begin
  if not public.ips_can_direct_match(p_match_id) then raise exception 'Not allowed to direct this match.'; end if;
  if not exists(select 1 from public.matches where id=p_match_id) then raise exception 'Match not found.'; end if;

  select package_release_id into v_release from public.broadcast_match_sessions where match_id=p_match_id;
  if v_release is null then
    v_release:=public.ips_broadcast_default_release();
    if v_release is null then raise exception 'IPS PRISM release is unavailable.'; end if;
    insert into public.broadcast_match_sessions(match_id,package_release_id,updated_by)
    values(p_match_id,v_release,auth.uid())
    on conflict(match_id) do nothing;
  end if;

  select r.manifest into v_manifest from public.broadcast_package_releases r
  join public.broadcast_match_sessions s on s.package_release_id=r.id
  where s.match_id=p_match_id;

  v_scorebar:=jsonb_build_object(
    'instanceId',gen_random_uuid(),'variantKey','scorebar.default',
    'priority',coalesce((v_manifest#>>'{variants,scorebar.default,priority}')::integer,50),
    'replacementGroup','scorebar','startedAt',now(),'persistent',true,'payload','{}'::jsonb,'source','RESTORE'
  );

  insert into public.broadcast_program_state(match_id,revision,active_layers,persistent_snapshot,updated_by)
  values(p_match_id,1,jsonb_build_array(v_scorebar),jsonb_build_array(v_scorebar),auth.uid())
  on conflict(match_id) do nothing;

  insert into public.broadcast_realtime_signals(match_id,score_revision,program_revision)
  values(p_match_id,0,coalesce((select revision from public.broadcast_program_state where match_id=p_match_id),0))
  on conflict(match_id) do nothing;

  return public.ips_broadcast_program_snapshot(p_match_id);
end
$$;
revoke all on function public.ips_broadcast_ensure_match_session(uuid) from public,anon;
grant execute on function public.ips_broadcast_ensure_match_session(uuid) to authenticated,service_role;

create or replace function public.ips_broadcast_program_command(p_match_id uuid,p_command jsonb)
returns jsonb
language plpgsql security definer
set search_path=public,auth
as $$
declare
  st public.broadcast_program_state;
  sess public.broadcast_match_sessions;
  rel public.broadcast_package_releases;
  v_type text:=upper(coalesce(p_command->>'type',''));
  v_key text:=p_command->>'variantKey';
  v_meta jsonb;
  v_instance jsonb;
  v_active jsonb;
  v_queue jsonb;
  v_revision bigint;
  v_persistent boolean:=coalesce((p_command->>'persistent')::boolean,false);
  v_payload jsonb:=coalesce(p_command->'payload','{}'::jsonb);
begin
  if not public.ips_can_direct_match(p_match_id) then raise exception 'Not allowed to direct this match.'; end if;
  perform public.ips_broadcast_ensure_match_session(p_match_id);
  select * into sess from public.broadcast_match_sessions where match_id=p_match_id for update;
  select * into st from public.broadcast_program_state where match_id=p_match_id for update;
  select * into rel from public.broadcast_package_releases where id=sess.package_release_id;

  if v_type in ('PREVIEW','TAKE','QUEUE_ADD') then
    v_meta:=rel.manifest#>(array['variants',v_key]);
    if v_meta is null then raise exception 'Variant % is not in the pinned package release.',v_key; end if;
  end if;

  v_active:=st.active_layers;
  v_queue:=st.queue;

  if v_type='PREVIEW' then
    update public.broadcast_program_state
    set preview=jsonb_build_object('variantKey',v_key,'payload',v_payload,'preparedAt',now()),
        revision=revision+1,updated_by=auth.uid(),updated_at=now()
    where match_id=p_match_id returning revision into v_revision;

  elsif v_type='TAKE' then
    if v_meta->>'replacementGroup' is not null then
      select coalesce(jsonb_agg(x),'[]'::jsonb) into v_active
      from jsonb_array_elements(st.active_layers) x
      where coalesce(x->>'replacementGroup','')<>coalesce(v_meta->>'replacementGroup','');
    end if;

    v_instance:=jsonb_build_object(
      'instanceId',gen_random_uuid(),'variantKey',v_key,
      'priority',coalesce((v_meta->>'priority')::integer,50),
      'replacementGroup',v_meta->>'replacementGroup',
      'startedAt',now(),'persistent',v_persistent,'payload',v_payload,'source','DIRECTOR'
    );
    v_active:=v_active||jsonb_build_array(v_instance);

    update public.broadcast_program_state
    set active_layers=v_active,
        persistent_snapshot=case when v_persistent then
          coalesce((select jsonb_agg(x) from jsonb_array_elements(v_active) x where coalesce((x->>'persistent')::boolean,false)),'[]'::jsonb)
          else persistent_snapshot end,
        preview=null,revision=revision+1,updated_by=auth.uid(),updated_at=now()
    where match_id=p_match_id returning revision into v_revision;

  elsif v_type='CLEAR_TEMPORARY' then
    select coalesce(jsonb_agg(x),'[]'::jsonb) into v_active
    from jsonb_array_elements(st.active_layers) x
    where coalesce((x->>'persistent')::boolean,false);
    update public.broadcast_program_state set active_layers=v_active,preview=null,revision=revision+1,updated_by=auth.uid(),updated_at=now()
    where match_id=p_match_id returning revision into v_revision;

  elsif v_type='CLEAR_ALL' then
    update public.broadcast_program_state set active_layers='[]'::jsonb,preview=null,revision=revision+1,updated_by=auth.uid(),updated_at=now()
    where match_id=p_match_id returning revision into v_revision;

  elsif v_type='PANIC_ON' then
    update public.broadcast_match_sessions set clean_feed=true,updated_by=auth.uid(),updated_at=now() where match_id=p_match_id;
    update public.broadcast_program_state set revision=revision+1,updated_by=auth.uid(),updated_at=now()
    where match_id=p_match_id returning revision into v_revision;

  elsif v_type='PANIC_OFF' then
    update public.broadcast_match_sessions set clean_feed=false,updated_by=auth.uid(),updated_at=now() where match_id=p_match_id;
    update public.broadcast_program_state set revision=revision+1,updated_by=auth.uid(),updated_at=now()
    where match_id=p_match_id returning revision into v_revision;

  elsif v_type='RESTORE_PERSISTENT' then
    update public.broadcast_match_sessions set clean_feed=false,updated_by=auth.uid(),updated_at=now() where match_id=p_match_id;
    update public.broadcast_program_state set active_layers=persistent_snapshot,preview=null,revision=revision+1,updated_by=auth.uid(),updated_at=now()
    where match_id=p_match_id returning revision into v_revision;

  elsif v_type='QUEUE_ADD' then
    v_instance:=jsonb_build_object('queueId',gen_random_uuid(),'variantKey',v_key,'payload',v_payload,'addedAt',now());
    update public.broadcast_program_state set queue=queue||jsonb_build_array(v_instance),revision=revision+1,updated_by=auth.uid(),updated_at=now()
    where match_id=p_match_id returning revision into v_revision;

  elsif v_type='QUEUE_REMOVE' then
    select coalesce(jsonb_agg(x),'[]'::jsonb) into v_queue from jsonb_array_elements(st.queue) x where x->>'queueId'<>p_command->>'queueId';
    update public.broadcast_program_state set queue=v_queue,revision=revision+1,updated_by=auth.uid(),updated_at=now()
    where match_id=p_match_id returning revision into v_revision;

  elsif v_type='SET_AUTOMATION' then
    update public.broadcast_match_sessions set automation_enabled=coalesce((p_command->>'enabled')::boolean,true),updated_by=auth.uid(),updated_at=now() where match_id=p_match_id;
    update public.broadcast_program_state set revision=revision+1,updated_by=auth.uid(),updated_at=now()
    where match_id=p_match_id returning revision into v_revision;

  elsif v_type='SET_SCOREBAR_LOCK' then
    update public.broadcast_match_sessions set scorebar_locked=coalesce((p_command->>'enabled')::boolean,false),updated_by=auth.uid(),updated_at=now() where match_id=p_match_id;
    update public.broadcast_program_state set revision=revision+1,updated_by=auth.uid(),updated_at=now()
    where match_id=p_match_id returning revision into v_revision;

  elsif v_type='EMERGENCY_SPONSOR_OFF' then
    update public.broadcast_match_sessions set emergency_sponsor_off=coalesce((p_command->>'enabled')::boolean,true),updated_by=auth.uid(),updated_at=now() where match_id=p_match_id;
    update public.broadcast_program_state set revision=revision+1,updated_by=auth.uid(),updated_at=now()
    where match_id=p_match_id returning revision into v_revision;
  else
    raise exception 'Unsupported broadcast program command %',v_type;
  end if;

  insert into public.broadcast_program_events(match_id,revision,event_type,payload,actor_user_id)
  values(p_match_id,v_revision,v_type,p_command,auth.uid());

  return public.ips_broadcast_program_snapshot(p_match_id);
end
$$;
revoke all on function public.ips_broadcast_program_command(uuid,jsonb) from public,anon;
grant execute on function public.ips_broadcast_program_command(uuid,jsonb) to authenticated,service_role;

create or replace function public.ips_broadcast_signal_score()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
 insert into public.broadcast_realtime_signals(match_id,score_revision,program_revision,updated_at)
 values(new.match_id,1,0,now())
 on conflict(match_id) do update set score_revision=public.broadcast_realtime_signals.score_revision+1,updated_at=now();
 return new;
end
$$;

drop trigger if exists broadcast_signal_from_live_state on public.match_live_state;
create trigger broadcast_signal_from_live_state
after insert or update on public.match_live_state
for each row execute function public.ips_broadcast_signal_score();

create or replace function public.ips_broadcast_signal_program()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
 insert into public.broadcast_realtime_signals(match_id,score_revision,program_revision,updated_at)
 values(new.match_id,0,new.revision,now())
 on conflict(match_id) do update set program_revision=new.revision,updated_at=now();
 return new;
end
$$;

drop trigger if exists broadcast_signal_from_program_state on public.broadcast_program_state;
create trigger broadcast_signal_from_program_state
after insert or update on public.broadcast_program_state
for each row execute function public.ips_broadcast_signal_program();

do $$
begin
  if not exists(
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='broadcast_realtime_signals'
  ) then
    alter publication supabase_realtime add table public.broadcast_realtime_signals;
  end if;
end
$$;

commit;
