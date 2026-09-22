-- IPS Project 4 — Tournament Operations
-- Applications, squads, deadline locking, emergency replacement, fixtures,
-- venues, officials/scorers, scoped write permissions and audit trail.

create extension if not exists pgcrypto;

do $$ begin
  create type public.ips_squad_status as enum ('DRAFT','SUBMITTED','LOCKED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ips_squad_change_status as enum ('REQUESTED','APPROVED','REJECTED','CANCELLED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ips_match_official_role as enum ('SCORER','UMPIRE','MATCH_MANAGER');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ips_official_designation as enum ('STANDARD','PRIMARY','BACKUP');
exception when duplicate_object then null; end $$;

-- Tournament application metadata extends the existing tournament_teams workflow.
alter table public.tournament_teams add column if not exists submitted_by uuid references auth.users(id) on delete set null;
alter table public.tournament_teams add column if not exists application_note text;
alter table public.tournament_teams add column if not exists decision_by uuid references auth.users(id) on delete set null;
alter table public.tournament_teams add column if not exists decision_note text;

create table if not exists public.tournament_squads (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null,
  team_id uuid not null,
  status public.ips_squad_status not null default 'DRAFT',
  submitted_at timestamptz,
  submitted_by uuid references auth.users(id) on delete set null,
  locked_at timestamptz,
  locked_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, team_id),
  foreign key (tournament_id, team_id)
    references public.tournament_teams(tournament_id, team_id)
    on delete cascade
);

create table if not exists public.tournament_squad_players (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null references public.tournament_squads(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  added_by uuid references auth.users(id) on delete set null,
  added_at timestamptz not null default now(),
  removed_at timestamptz,
  is_emergency_replacement boolean not null default false,
  unique (squad_id, player_id)
);

create table if not exists public.squad_change_requests (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null references public.tournament_squads(id) on delete cascade,
  outgoing_player_id uuid not null references public.players(id) on delete restrict,
  incoming_player_id uuid not null references public.players(id) on delete restrict,
  reason text not null,
  status public.ips_squad_change_status not null default 'REQUESTED',
  requested_by uuid not null references auth.users(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  check (outgoing_player_id <> incoming_player_id)
);

-- Frozen product rule: one approved emergency replacement per squad.
create unique index if not exists squad_change_one_approved_per_squad
  on public.squad_change_requests(squad_id)
  where status = 'APPROVED';

create table if not exists public.match_official_assignments (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  role public.ips_match_official_role not null,
  designation public.ips_official_designation not null default 'STANDARD',
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  note text,
  unique(match_id, user_id, role)
);

create unique index if not exists one_primary_scorer_per_match
  on public.match_official_assignments(match_id)
  where role='SCORER' and designation='PRIMARY';
create unique index if not exists one_backup_scorer_per_match
  on public.match_official_assignments(match_id)
  where role='SCORER' and designation='BACKUP';

create index if not exists ix_tournament_squads_tournament on public.tournament_squads(tournament_id);
create index if not exists ix_tournament_squads_team on public.tournament_squads(team_id);
create index if not exists ix_squad_players_squad on public.tournament_squad_players(squad_id);
create index if not exists ix_squad_players_player on public.tournament_squad_players(player_id);
create index if not exists ix_squad_change_squad on public.squad_change_requests(squad_id);
create index if not exists ix_match_official_match on public.match_official_assignments(match_id);
create index if not exists ix_match_official_user on public.match_official_assignments(user_id);

create or replace function public.ips_project4_touch_updated_at()
returns trigger language plpgsql set search_path=public as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists tournament_squads_touch_updated_at on public.tournament_squads;
create trigger tournament_squads_touch_updated_at
before update on public.tournament_squads
for each row execute function public.ips_project4_touch_updated_at();

create or replace function public.ips_is_admin_any()
returns boolean
language sql stable security definer
set search_path=public,auth as $$
  select public.ips_is_owner()
  or exists (
    select 1 from public.role_grants rg
    where rg.user_id=auth.uid()
      and rg.role='ADMIN'
      and public.ips_role_grant_is_active(rg)
  );
$$;

create or replace function public.ips_can_manage_venue(p_city_id uuid)
returns boolean
language sql stable security definer
set search_path=public,auth as $$
  select public.ips_is_owner()
  or public.ips_has_role('ADMIN','GLOBAL',null)
  or public.ips_has_role('ADMIN','CITY',p_city_id);
$$;

create or replace function public.ips_can_manage_squad(p_squad_id uuid)
returns boolean
language sql stable security definer
set search_path=public,auth as $$
  select exists (
    select 1 from public.tournament_squads s
    where s.id=p_squad_id
      and (
        public.ips_can_manage_tournament(s.tournament_id)
        or public.ips_can_manage_team(s.team_id)
      )
  );
$$;

create or replace function public.ips_squad_effectively_locked(p_squad_id uuid)
returns boolean
language sql stable security definer
set search_path=public as $$
  select coalesce((
    select s.status='LOCKED'
      or (t.squad_deadline is not null and now() >= t.squad_deadline)
    from public.tournament_squads s
    join public.tournaments t on t.id=s.tournament_id
    where s.id=p_squad_id
  ), false);
$$;

-- Minimal account directory for tournament admins. No emails are exposed here.
create or replace function public.ips_management_account_directory()
returns table(id uuid, display_name text, linked_player_id uuid)
language sql stable security definer
set search_path=public,auth as $$
  select p.id, coalesce(p.display_name,'IPS account'), p.linked_player_id
  from public.profiles p
  where public.ips_is_admin_any()
  order by coalesce(p.display_name,'IPS account');
$$;

-- Last-owner protection: the platform must never lose its final active GLOBAL OWNER by accident.
create or replace function public.ips_protect_last_global_owner()
returns trigger
language plpgsql security definer
set search_path=public,auth as $$
declare
  old_is_owner boolean;
  new_is_owner_active boolean := false;
  other_count integer;
begin
  old_is_owner := old.role='OWNER' and old.scope_type='GLOBAL'
    and old.revoked_at is null
    and old.starts_at <= now()
    and (old.ends_at is null or old.ends_at > now());

  if not old_is_owner then
    return case when tg_op='DELETE' then old else new end;
  end if;

  if tg_op='UPDATE' then
    new_is_owner_active := new.role='OWNER' and new.scope_type='GLOBAL'
      and new.revoked_at is null
      and new.starts_at <= now()
      and (new.ends_at is null or new.ends_at > now());
    if new_is_owner_active then return new; end if;
  end if;

  select count(*) into other_count
  from public.role_grants rg
  where rg.id<>old.id
    and rg.role='OWNER' and rg.scope_type='GLOBAL'
    and rg.revoked_at is null
    and rg.starts_at <= now()
    and (rg.ends_at is null or rg.ends_at > now());

  if other_count=0 then
    raise exception 'Cannot remove the last active GLOBAL OWNER. Grant another owner first.';
  end if;

  return case when tg_op='DELETE' then old else new end;
end; $$;

drop trigger if exists protect_last_global_owner on public.role_grants;
create trigger protect_last_global_owner
before update or delete on public.role_grants
for each row execute function public.ips_protect_last_global_owner();

-- Team leaders may apply their own team, but only tournament managers may insert non-APPLIED states.
create or replace function public.ips_guard_tournament_team_insert()
returns trigger
language plpgsql security definer
set search_path=public,auth as $$
begin
  if public.ips_can_manage_tournament(new.tournament_id) then
    return new;
  end if;
  if public.ips_can_manage_team(new.team_id) then
    if new.status <> 'APPLIED' then
      raise exception 'Team leaders may only create APPLIED tournament applications.';
    end if;
    new.submitted_by := auth.uid();
    return new;
  end if;
  raise exception 'Not authorised to apply this team to the tournament.';
end; $$;

drop trigger if exists tournament_team_insert_guard on public.tournament_teams;
create trigger tournament_team_insert_guard
before insert on public.tournament_teams
for each row execute function public.ips_guard_tournament_team_insert();

-- Locked squads cannot be edited directly. Approved emergency replacement uses an audited RPC.
create or replace function public.ips_guard_squad_player_change()
returns trigger
language plpgsql security definer
set search_path=public,auth as $$
declare
  v_squad uuid;
  v_team uuid;
  emergency_mode text;
begin
  v_squad := coalesce(new.squad_id, old.squad_id);
  emergency_mode := current_setting('ips.emergency_replacement', true);
  if public.ips_squad_effectively_locked(v_squad) and coalesce(emergency_mode,'') <> 'on' then
    raise exception 'Squad is locked. Use the emergency replacement workflow.';
  end if;

  if tg_op='INSERT' then
    select team_id into v_team from public.tournament_squads where id=new.squad_id;
    if not exists (
      select 1 from public.team_memberships tm
      where tm.team_id=v_team and tm.player_id=new.player_id
        and tm.status='ACTIVE' and tm.end_on is null
    ) then
      raise exception 'Player is not an active member of this team.';
    end if;
    return new;
  end if;
  return case when tg_op='DELETE' then old else new end;
end; $$;

drop trigger if exists squad_player_change_guard on public.tournament_squad_players;
create trigger squad_player_change_guard
before insert or update or delete on public.tournament_squad_players
for each row execute function public.ips_guard_squad_player_change();

create or replace function public.ips_submit_squad(p_squad_id uuid)
returns public.tournament_squads
language plpgsql security definer
set search_path=public,auth as $$
declare
  s public.tournament_squads;
  t public.tournaments;
  player_count integer;
begin
  select * into s from public.tournament_squads where id=p_squad_id;
  if not found then raise exception 'Squad not found.'; end if;
  if not public.ips_can_manage_squad(p_squad_id) then raise exception 'Not authorised.'; end if;
  select * into t from public.tournaments where id=s.tournament_id;
  if t.squad_deadline is not null and now() >= t.squad_deadline and not public.ips_can_manage_tournament(t.id) then
    raise exception 'Squad deadline has passed.';
  end if;
  if public.ips_squad_effectively_locked(p_squad_id) then raise exception 'Squad is locked.'; end if;
  select count(*) into player_count from public.tournament_squad_players where squad_id=p_squad_id and removed_at is null;
  if player_count < 1 then raise exception 'Add at least one player before submission.'; end if;
  if t.squad_size is not null and player_count > t.squad_size then raise exception 'Squad exceeds tournament squad size.'; end if;
  update public.tournament_squads
    set status='SUBMITTED', submitted_at=now(), submitted_by=auth.uid()
    where id=p_squad_id returning * into s;
  return s;
end; $$;

create or replace function public.ips_lock_squad(p_squad_id uuid)
returns public.tournament_squads
language plpgsql security definer
set search_path=public,auth as $$
declare s public.tournament_squads;
begin
  select * into s from public.tournament_squads where id=p_squad_id;
  if not found then raise exception 'Squad not found.'; end if;
  if not public.ips_can_manage_tournament(s.tournament_id) then raise exception 'Tournament admin required.'; end if;
  update public.tournament_squads
    set status='LOCKED', locked_at=coalesce(locked_at,now()), locked_by=coalesce(locked_by,auth.uid())
    where id=p_squad_id returning * into s;
  return s;
end; $$;

create or replace function public.ips_approve_emergency_replacement(p_request_id uuid)
returns public.squad_change_requests
language plpgsql security definer
set search_path=public,auth as $$
declare
  r public.squad_change_requests;
  s public.tournament_squads;
begin
  select * into r from public.squad_change_requests where id=p_request_id for update;
  if not found then raise exception 'Replacement request not found.'; end if;
  select * into s from public.tournament_squads where id=r.squad_id;
  if not public.ips_can_manage_tournament(s.tournament_id) then raise exception 'Tournament admin required.'; end if;
  if r.status <> 'REQUESTED' then raise exception 'Request is no longer pending.'; end if;
  if not public.ips_squad_effectively_locked(s.id) then raise exception 'Emergency replacement is only for locked squads.'; end if;
  if exists (select 1 from public.squad_change_requests x where x.squad_id=s.id and x.status='APPROVED') then
    raise exception 'This squad already used its approved emergency replacement.';
  end if;
  if not exists (select 1 from public.tournament_squad_players sp where sp.squad_id=s.id and sp.player_id=r.outgoing_player_id and sp.removed_at is null) then
    raise exception 'Outgoing player is not active in the squad.';
  end if;

  perform set_config('ips.emergency_replacement','on',true);
  update public.tournament_squad_players
    set removed_at=now()
    where squad_id=s.id and player_id=r.outgoing_player_id and removed_at is null;
  insert into public.tournament_squad_players(squad_id,player_id,added_by,is_emergency_replacement)
    values(s.id,r.incoming_player_id,auth.uid(),true);
  update public.squad_change_requests
    set status='APPROVED', reviewed_by=auth.uid(), reviewed_at=now()
    where id=r.id returning * into r;
  return r;
end; $$;

-- Generic Project 4 audit trigger.
create or replace function public.ips_audit_project4_change()
returns trigger
language plpgsql security definer
set search_path=public,auth as $$
declare
  v_id uuid;
  v_details jsonb;
begin
  if tg_op='DELETE' then
    v_id := old.id;
    v_details := jsonb_build_object('operation',tg_op,'before',to_jsonb(old),'after',null);
  elsif tg_op='INSERT' then
    v_id := new.id;
    v_details := jsonb_build_object('operation',tg_op,'before',null,'after',to_jsonb(new));
  else
    v_id := new.id;
    v_details := jsonb_build_object('operation',tg_op,'before',to_jsonb(old),'after',to_jsonb(new));
  end if;
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(auth.uid(), 'PROJECT4_'||tg_op, tg_table_name, v_id, v_details);
  return case when tg_op='DELETE' then old else new end;
end; $$;

-- RLS
alter table public.tournament_squads enable row level security;
alter table public.tournament_squad_players enable row level security;
alter table public.squad_change_requests enable row level security;
alter table public.match_official_assignments enable row level security;

-- Tournament write access.
drop policy if exists "project4 management reads tournaments" on public.tournaments;
create policy "project4 management reads tournaments" on public.tournaments for select to authenticated
using (public.ips_can_manage_tournament(id));

drop policy if exists "project4 create tournaments" on public.tournaments;
create policy "project4 create tournaments" on public.tournaments for insert to authenticated
with check (
  public.ips_is_owner()
  or public.ips_has_role('ADMIN','GLOBAL',null)
  or public.ips_has_role('ADMIN','CITY',city_id)
);
drop policy if exists "project4 update tournaments" on public.tournaments;
create policy "project4 update tournaments" on public.tournaments for update to authenticated
using (public.ips_can_manage_tournament(id))
with check (public.ips_can_manage_tournament(id));

-- Venue write access.
drop policy if exists "project4 create venues" on public.venues;
create policy "project4 create venues" on public.venues for insert to authenticated
with check (public.ips_can_manage_venue(city_id));
drop policy if exists "project4 update venues" on public.venues;
create policy "project4 update venues" on public.venues for update to authenticated
using (public.ips_can_manage_venue(city_id))
with check (public.ips_can_manage_venue(city_id));

-- Tournament applications: confirmed rows remain public via Project 1 policy; management sees relevant pending rows.
drop policy if exists "project4 management reads tournament teams" on public.tournament_teams;
create policy "project4 management reads tournament teams" on public.tournament_teams for select to authenticated
using (public.ips_can_manage_tournament(tournament_id) or public.ips_can_manage_team(team_id));
drop policy if exists "project4 apply tournament team" on public.tournament_teams;
create policy "project4 apply tournament team" on public.tournament_teams for insert to authenticated
with check (public.ips_can_manage_tournament(tournament_id) or public.ips_can_manage_team(team_id));
drop policy if exists "project4 decide tournament team" on public.tournament_teams;
create policy "project4 decide tournament team" on public.tournament_teams for update to authenticated
using (public.ips_can_manage_tournament(tournament_id))
with check (public.ips_can_manage_tournament(tournament_id));

-- Fixtures.
drop policy if exists "project4 management reads fixtures" on public.matches;
create policy "project4 management reads fixtures" on public.matches for select to authenticated
using (public.ips_can_manage_tournament(tournament_id));

drop policy if exists "project4 create fixtures" on public.matches;
create policy "project4 create fixtures" on public.matches for insert to authenticated
with check (public.ips_can_manage_tournament(tournament_id));
drop policy if exists "project4 update fixtures" on public.matches;
create policy "project4 update fixtures" on public.matches for update to authenticated
using (public.ips_can_manage_tournament(tournament_id))
with check (public.ips_can_manage_tournament(tournament_id));

-- Squads.
drop policy if exists "project4 read squads" on public.tournament_squads;
create policy "project4 read squads" on public.tournament_squads for select to authenticated
using (public.ips_can_manage_tournament(tournament_id) or public.ips_can_manage_team(team_id));
drop policy if exists "project4 create squads" on public.tournament_squads;
create policy "project4 create squads" on public.tournament_squads for insert to authenticated
with check (public.ips_can_manage_tournament(tournament_id) or public.ips_can_manage_team(team_id));
drop policy if exists "project4 update squads" on public.tournament_squads;
create policy "project4 update squads" on public.tournament_squads for update to authenticated
using (public.ips_can_manage_tournament(tournament_id) or public.ips_can_manage_team(team_id))
with check (public.ips_can_manage_tournament(tournament_id) or public.ips_can_manage_team(team_id));

drop policy if exists "project4 read squad players" on public.tournament_squad_players;
create policy "project4 read squad players" on public.tournament_squad_players for select to authenticated
using (public.ips_can_manage_squad(squad_id));
drop policy if exists "project4 add squad players" on public.tournament_squad_players;
create policy "project4 add squad players" on public.tournament_squad_players for insert to authenticated
with check (public.ips_can_manage_squad(squad_id));
drop policy if exists "project4 update squad players" on public.tournament_squad_players;
create policy "project4 update squad players" on public.tournament_squad_players for update to authenticated
using (public.ips_can_manage_squad(squad_id)) with check (public.ips_can_manage_squad(squad_id));
drop policy if exists "project4 delete squad players" on public.tournament_squad_players;
create policy "project4 delete squad players" on public.tournament_squad_players for delete to authenticated
using (public.ips_can_manage_squad(squad_id));

-- Emergency replacement requests.
drop policy if exists "project4 read replacement requests" on public.squad_change_requests;
create policy "project4 read replacement requests" on public.squad_change_requests for select to authenticated
using (public.ips_can_manage_squad(squad_id));
drop policy if exists "project4 create replacement requests" on public.squad_change_requests;
create policy "project4 create replacement requests" on public.squad_change_requests for insert to authenticated
with check (requested_by=auth.uid() and public.ips_can_manage_squad(squad_id));
drop policy if exists "project4 review replacement requests" on public.squad_change_requests;
create policy "project4 review replacement requests" on public.squad_change_requests for update to authenticated
using (exists(select 1 from public.tournament_squads s where s.id=squad_id and public.ips_can_manage_tournament(s.tournament_id)))
with check (exists(select 1 from public.tournament_squads s where s.id=squad_id and public.ips_can_manage_tournament(s.tournament_id)));

-- Officials/scorers.
drop policy if exists "project4 read match officials" on public.match_official_assignments;
create policy "project4 read match officials" on public.match_official_assignments for select to authenticated
using (
  user_id=auth.uid()
  or exists(select 1 from public.matches m where m.id=match_id and public.ips_can_manage_tournament(m.tournament_id))
);
drop policy if exists "project4 create match officials" on public.match_official_assignments;
create policy "project4 create match officials" on public.match_official_assignments for insert to authenticated
with check (exists(select 1 from public.matches m where m.id=match_id and public.ips_can_manage_tournament(m.tournament_id)));
drop policy if exists "project4 update match officials" on public.match_official_assignments;
create policy "project4 update match officials" on public.match_official_assignments for update to authenticated
using (exists(select 1 from public.matches m where m.id=match_id and public.ips_can_manage_tournament(m.tournament_id)))
with check (exists(select 1 from public.matches m where m.id=match_id and public.ips_can_manage_tournament(m.tournament_id)));
drop policy if exists "project4 delete match officials" on public.match_official_assignments;
create policy "project4 delete match officials" on public.match_official_assignments for delete to authenticated
using (exists(select 1 from public.matches m where m.id=match_id and public.ips_can_manage_tournament(m.tournament_id)));

-- Auditing for Project 4 operational writes.
do $$
declare tbl text; trig text;
begin
  foreach tbl in array array['tournaments','tournament_teams','tournament_squads','tournament_squad_players','squad_change_requests','venues','matches','match_official_assignments']
  loop
    trig := 'audit_project4_'||tbl;
    execute format('drop trigger if exists %I on public.%I', trig, tbl);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.ips_audit_project4_change()', trig, tbl);
  end loop;
end $$;

-- Function permissions. The functions do their own authorization checks.
grant execute on function public.ips_is_admin_any() to authenticated;
grant execute on function public.ips_can_manage_venue(uuid) to authenticated;
grant execute on function public.ips_can_manage_squad(uuid) to authenticated;
grant execute on function public.ips_squad_effectively_locked(uuid) to authenticated;
grant execute on function public.ips_management_account_directory() to authenticated;
grant execute on function public.ips_submit_squad(uuid) to authenticated;
grant execute on function public.ips_lock_squad(uuid) to authenticated;
grant execute on function public.ips_approve_emergency_replacement(uuid) to authenticated;

-- Explicit table grants; RLS remains the authorization boundary.
grant select,insert,update on public.tournament_squads to authenticated;
grant select,insert,update,delete on public.tournament_squad_players to authenticated;
grant select,insert,update on public.squad_change_requests to authenticated;
grant select,insert,update,delete on public.match_official_assignments to authenticated;

notify pgrst, 'reload schema';

-- Keep scoring authorization synchronized with scorer assignment.
create or replace function public.ips_sync_scorer_role_grant()
returns trigger
language plpgsql security definer
set search_path=public,auth as $$
declare marker text;
begin
  if tg_op in ('UPDATE','DELETE') and old.role='SCORER' then
    marker := '[MATCH_OFFICIAL:'||old.id::text||']';
    update public.role_grants
      set revoked_at=coalesce(revoked_at,now())
      where user_id=old.user_id and role='SCORER' and scope_type='MATCH'
        and match_id=old.match_id and note=marker and revoked_at is null;
  end if;
  if tg_op in ('INSERT','UPDATE') and new.role='SCORER' then
    marker := '[MATCH_OFFICIAL:'||new.id::text||']';
    if not exists (
      select 1 from public.role_grants rg
      where rg.user_id=new.user_id and rg.role='SCORER' and rg.scope_type='MATCH'
        and rg.match_id=new.match_id and public.ips_role_grant_is_active(rg)
    ) then
      insert into public.role_grants(user_id,role,scope_type,match_id,granted_by,note)
      values(new.user_id,'SCORER','MATCH',new.match_id,new.assigned_by,marker);
    end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;

drop trigger if exists sync_scorer_role_grant on public.match_official_assignments;
create trigger sync_scorer_role_grant
after insert or update or delete on public.match_official_assignments
for each row execute function public.ips_sync_scorer_role_grant();

-- Project 4 SECURITY DEFINER hardening.
revoke all on function public.ips_audit_project4_change() from public, anon, authenticated;
revoke all on function public.ips_guard_squad_player_change() from public, anon, authenticated;
revoke all on function public.ips_guard_tournament_team_insert() from public, anon, authenticated;
revoke all on function public.ips_protect_last_global_owner() from public, anon, authenticated;
revoke all on function public.ips_sync_scorer_role_grant() from public, anon, authenticated;
revoke all on function public.ips_is_admin_any() from public, anon, authenticated;
revoke all on function public.ips_can_manage_venue(uuid) from public, anon;
revoke all on function public.ips_can_manage_squad(uuid) from public, anon;
revoke all on function public.ips_squad_effectively_locked(uuid) from public, anon;
revoke all on function public.ips_management_account_directory() from public, anon;
revoke all on function public.ips_submit_squad(uuid) from public, anon;
revoke all on function public.ips_lock_squad(uuid) from public, anon;
revoke all on function public.ips_approve_emergency_replacement(uuid) from public, anon;
grant execute on function public.ips_can_manage_venue(uuid) to authenticated;
grant execute on function public.ips_can_manage_squad(uuid) to authenticated;
grant execute on function public.ips_squad_effectively_locked(uuid) to authenticated;
grant execute on function public.ips_management_account_directory() to authenticated;
grant execute on function public.ips_submit_squad(uuid) to authenticated;
grant execute on function public.ips_lock_squad(uuid) to authenticated;
grant execute on function public.ips_approve_emergency_replacement(uuid) to authenticated;
