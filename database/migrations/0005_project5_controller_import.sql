-- IPS Project 5 — controller import + match playing XI + custom tournament catalogues.
-- Prerequisite: Project 4 schema is already installed.
-- The connected IPS Supabase project used during development was migrated automatically;
-- this file is included for reproducibility on a fresh Project 4 database.

create extension if not exists pgcrypto;
do $$ begin create type public.ips_match_team_role as enum ('CAPTAIN','WICKETKEEPER'); exception when duplicate_object then null; end $$;

create table if not exists public.match_playing_xi (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  lineup_order smallint not null check(lineup_order between 1 and 20),
  selected_by uuid references auth.users(id) on delete set null,
  selected_at timestamptz not null default now(),
  unique(match_id,team_id,player_id), unique(match_id,team_id,lineup_order)
);
create table if not exists public.match_team_roles (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete restrict,
  role public.ips_match_team_role not null,
  player_id uuid not null references public.players(id) on delete restrict,
  selected_by uuid references auth.users(id) on delete set null,
  selected_at timestamptz not null default now(),
  unique(match_id,team_id,role)
);
create index if not exists ix_match_playing_xi_match on public.match_playing_xi(match_id);
create index if not exists ix_match_team_roles_match on public.match_team_roles(match_id);

create or replace function public.ips_can_manage_global_catalog()
returns boolean language sql stable security definer set search_path=public,auth as $$
  select public.ips_is_owner() or public.ips_has_role('ADMIN','GLOBAL',null);
$$;
create or replace function public.ips_can_manage_match_team(p_match_id uuid,p_team_id uuid)
returns boolean language sql stable security definer set search_path=public,auth as $$
  select exists(select 1 from public.matches m where m.id=p_match_id and p_team_id in(m.home_team_id,m.away_team_id)
    and (public.ips_can_manage_tournament(m.tournament_id) or public.ips_can_manage_team(p_team_id)));
$$;
create or replace function public.ips_match_team_squad_id(p_match_id uuid,p_team_id uuid)
returns uuid language sql stable security definer set search_path=public as $$
  select s.id from public.matches m join public.tournament_squads s on s.tournament_id=m.tournament_id and s.team_id=p_team_id
  where m.id=p_match_id and p_team_id in(m.home_team_id,m.away_team_id) limit 1;
$$;
create or replace function public.ips_match_team_squad_ready(p_match_id uuid,p_team_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce(public.ips_squad_effectively_locked(public.ips_match_team_squad_id(p_match_id,p_team_id)),false);
$$;

create or replace function public.ips_set_match_playing_xi(p_match_id uuid,p_team_id uuid,p_player_ids uuid[])
returns void language plpgsql security definer set search_path=public,auth as $$
declare v_tournament_id uuid; v_ruleset_id uuid; v_required integer; v_squad_id uuid; v_count integer; p uuid; i integer:=0;
begin
  if not public.ips_can_manage_match_team(p_match_id,p_team_id) then raise exception 'Not authorised to manage this playing XI.'; end if;
  select m.tournament_id,t.ruleset_id into v_tournament_id,v_ruleset_id from public.matches m join public.tournaments t on t.id=m.tournament_id where m.id=p_match_id and p_team_id in(m.home_team_id,m.away_team_id);
  if v_tournament_id is null then raise exception 'Match/team relationship is invalid.'; end if;
  select playing_xi_size into v_required from public.competition_rulesets where id=v_ruleset_id;
  if coalesce(array_length(p_player_ids,1),0)<>v_required then raise exception 'Playing XI must contain exactly % players.',v_required; end if;
  v_squad_id:=public.ips_match_team_squad_id(p_match_id,p_team_id);
  if v_squad_id is null then raise exception 'Tournament squad is missing.'; end if;
  if not public.ips_squad_effectively_locked(v_squad_id) then raise exception 'Tournament squad must be locked before selecting the playing XI.'; end if;
  select count(distinct x) into v_count from unnest(p_player_ids) x;
  if v_count<>v_required then raise exception 'Playing XI contains duplicate players.'; end if;
  if exists(select 1 from unnest(p_player_ids) x where not exists(select 1 from public.tournament_squad_players sp where sp.squad_id=v_squad_id and sp.player_id=x and sp.removed_at is null)) then raise exception 'Every playing XI player must belong to the locked tournament squad.'; end if;
  delete from public.match_team_roles where match_id=p_match_id and team_id=p_team_id;
  delete from public.match_playing_xi where match_id=p_match_id and team_id=p_team_id;
  foreach p in array p_player_ids loop i:=i+1; insert into public.match_playing_xi(match_id,team_id,player_id,lineup_order,selected_by) values(p_match_id,p_team_id,p,i,auth.uid()); end loop;
end $$;

create or replace function public.ips_set_match_team_roles(p_match_id uuid,p_team_id uuid,p_captain_id uuid,p_wicketkeeper_id uuid)
returns void language plpgsql security definer set search_path=public,auth as $$
begin
  if not public.ips_can_manage_match_team(p_match_id,p_team_id) then raise exception 'Not authorised to manage team roles.'; end if;
  if not exists(select 1 from public.match_playing_xi where match_id=p_match_id and team_id=p_team_id and player_id=p_captain_id) then raise exception 'Captain must be in the playing XI.'; end if;
  if not exists(select 1 from public.match_playing_xi where match_id=p_match_id and team_id=p_team_id and player_id=p_wicketkeeper_id) then raise exception 'Wicketkeeper must be in the playing XI.'; end if;
  insert into public.match_team_roles(match_id,team_id,role,player_id,selected_by) values
    (p_match_id,p_team_id,'CAPTAIN',p_captain_id,auth.uid()),(p_match_id,p_team_id,'WICKETKEEPER',p_wicketkeeper_id,auth.uid())
  on conflict(match_id,team_id,role) do update set player_id=excluded.player_id,selected_by=excluded.selected_by,selected_at=now();
end $$;

create or replace function public.ips_controller_available_matches()
returns table(match_id uuid,match_code text,match_number integer,match_status public.ips_match_status,scheduled_at timestamptz,tournament_name text,home_team_name text,away_team_name text,venue_name text)
language sql stable security definer set search_path=public,auth as $$
  select m.id,m.match_code,m.match_number,m.status,m.scheduled_at,t.name,ht.name,at.name,v.name
  from public.matches m join public.tournaments t on t.id=m.tournament_id join public.teams ht on ht.id=m.home_team_id join public.teams at on at.id=m.away_team_id left join public.venues v on v.id=m.venue_id
  where public.ips_can_score_match(m.id) and m.status not in('LOCKED','CANCELLED') order by case when m.status='LIVE' then 0 when m.status='READY' then 1 else 2 end,m.scheduled_at;
$$;

-- Rich match context is returned as JSON so the Controller receives one coherent snapshot.
create or replace function public.ips_controller_match_context(p_match_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,auth as $$
declare ctx jsonb;
begin
  if not public.ips_can_score_match(p_match_id) then raise exception 'You are not assigned to score/manage this match.'; end if;
  select jsonb_build_object(
    'match',jsonb_build_object('id',m.id,'code',m.match_code,'number',m.match_number,'status',m.status,'scheduled_at',m.scheduled_at,'stage',m.stage,'round_label',m.round_label),
    'tournament',jsonb_build_object('id',t.id,'code',t.code,'name',t.name,'format_label',t.format_label,'city',jsonb_build_object('id',c.id,'code',c.code,'name',c.name)),
    'venue',case when v.id is null then null else jsonb_build_object('id',v.id,'name',v.name,'address',v.address_text) end,
    'rules',jsonb_build_object('id',r.id,'name',r.name,'version',r.version,'balls_per_over',r.balls_per_over,'max_overs',r.max_overs,'playing_xi_size',r.playing_xi_size,'innings_wicket_limit',r.innings_wicket_limit,'free_hit_on_no_ball',r.free_hit_on_no_ball,'consecutive_overs_by_same_bowler_allowed',r.consecutive_overs_by_same_bowler_allowed,'max_overs_per_bowler',r.max_overs_per_bowler,'retirement_runs',r.retirement_runs,'retirement_mode',r.retirement_mode,'extras_rules',r.extras_rules,'additional_rules',r.additional_rules),
    'home',jsonb_build_object('team',jsonb_build_object('id',ht.id,'name',ht.name,'short_name',ht.short_name,'logo_url',ht.logo_url),'squad_locked',public.ips_match_team_squad_ready(m.id,ht.id),'squad',coalesce((select jsonb_agg(jsonb_build_object('player_id',p.id,'ips_code',p.ips_code,'name',p.display_name,'primary_role',p.primary_role,'batting_style',p.batting_style,'bowling_style',p.bowling_style) order by p.display_name) from public.tournament_squads s join public.tournament_squad_players sp on sp.squad_id=s.id and sp.removed_at is null join public.players p on p.id=sp.player_id where s.tournament_id=m.tournament_id and s.team_id=ht.id),'[]'::jsonb),'playing_xi',coalesce((select jsonb_agg(jsonb_build_object('player_id',p.id,'ips_code',p.ips_code,'name',p.display_name,'primary_role',p.primary_role,'batting_style',p.batting_style,'bowling_style',p.bowling_style,'order',xi.lineup_order) order by xi.lineup_order) from public.match_playing_xi xi join public.players p on p.id=xi.player_id where xi.match_id=m.id and xi.team_id=ht.id),'[]'::jsonb),'roles',coalesce((select jsonb_object_agg(mtr.role::text,jsonb_build_object('player_id',p.id,'ips_code',p.ips_code,'name',p.display_name)) from public.match_team_roles mtr join public.players p on p.id=mtr.player_id where mtr.match_id=m.id and mtr.team_id=ht.id),'{}'::jsonb)),
    'away',jsonb_build_object('team',jsonb_build_object('id',at.id,'name',at.name,'short_name',at.short_name,'logo_url',at.logo_url),'squad_locked',public.ips_match_team_squad_ready(m.id,at.id),'squad',coalesce((select jsonb_agg(jsonb_build_object('player_id',p.id,'ips_code',p.ips_code,'name',p.display_name,'primary_role',p.primary_role,'batting_style',p.batting_style,'bowling_style',p.bowling_style) order by p.display_name) from public.tournament_squads s join public.tournament_squad_players sp on sp.squad_id=s.id and sp.removed_at is null join public.players p on p.id=sp.player_id where s.tournament_id=m.tournament_id and s.team_id=at.id),'[]'::jsonb),'playing_xi',coalesce((select jsonb_agg(jsonb_build_object('player_id',p.id,'ips_code',p.ips_code,'name',p.display_name,'primary_role',p.primary_role,'batting_style',p.batting_style,'bowling_style',p.bowling_style,'order',xi.lineup_order) order by xi.lineup_order) from public.match_playing_xi xi join public.players p on p.id=xi.player_id where xi.match_id=m.id and xi.team_id=at.id),'[]'::jsonb),'roles',coalesce((select jsonb_object_agg(mtr.role::text,jsonb_build_object('player_id',p.id,'ips_code',p.ips_code,'name',p.display_name)) from public.match_team_roles mtr join public.players p on p.id=mtr.player_id where mtr.match_id=m.id and mtr.team_id=at.id),'{}'::jsonb)),
    'officials',coalesce((select jsonb_agg(jsonb_build_object('user_id',a.user_id,'role',a.role,'designation',a.designation,'display_name',pr.display_name) order by a.role,a.designation) from public.match_official_assignments a left join public.profiles pr on pr.id=a.user_id where a.match_id=m.id),'[]'::jsonb)
  ) into ctx from public.matches m join public.tournaments t on t.id=m.tournament_id join public.cities c on c.id=t.city_id join public.competition_rulesets r on r.id=t.ruleset_id join public.teams ht on ht.id=m.home_team_id join public.teams at on at.id=m.away_team_id left join public.venues v on v.id=m.venue_id where m.id=p_match_id;
  if ctx is null then raise exception 'Match not found.'; end if; return ctx;
end $$;

alter table public.match_playing_xi enable row level security;
alter table public.match_team_roles enable row level security;
create policy "project5 read playing xi" on public.match_playing_xi for select to authenticated using(public.ips_can_manage_match_team(match_id,team_id) or public.ips_can_score_match(match_id));
create policy "project5 read team roles" on public.match_team_roles for select to authenticated using(public.ips_can_manage_match_team(match_id,team_id) or public.ips_can_score_match(match_id));
create policy "catalog create city" on public.cities for insert to authenticated with check(public.ips_can_manage_global_catalog());
create policy "catalog update city" on public.cities for update to authenticated using(public.ips_can_manage_global_catalog()) with check(public.ips_can_manage_global_catalog());
create policy "catalog create season" on public.seasons for insert to authenticated with check(public.ips_can_manage_global_catalog());
create policy "catalog update season" on public.seasons for update to authenticated using(public.ips_can_manage_global_catalog()) with check(public.ips_can_manage_global_catalog());
create policy "catalog create ruleset" on public.competition_rulesets for insert to authenticated with check(public.ips_can_manage_global_catalog());
create policy "catalog update ruleset" on public.competition_rulesets for update to authenticated using(public.ips_can_manage_global_catalog()) with check(public.ips_can_manage_global_catalog());

grant select on public.match_playing_xi,public.match_team_roles to authenticated;
grant insert,update on public.cities,public.seasons,public.competition_rulesets to authenticated;
revoke all on function public.ips_set_match_playing_xi(uuid,uuid,uuid[]) from public,anon;
revoke all on function public.ips_set_match_team_roles(uuid,uuid,uuid,uuid) from public,anon;
revoke all on function public.ips_controller_available_matches() from public,anon;
revoke all on function public.ips_controller_match_context(uuid) from public,anon;
grant execute on function public.ips_set_match_playing_xi(uuid,uuid,uuid[]) to authenticated;
grant execute on function public.ips_set_match_team_roles(uuid,uuid,uuid,uuid) to authenticated;
grant execute on function public.ips_controller_available_matches() to authenticated;
grant execute on function public.ips_controller_match_context(uuid) to authenticated;

notify pgrst,'reload schema';

-- Audit catalogue + lineup changes using the Project 4 audit trigger function.
do $$
declare tbl text; trig text;
begin
  foreach tbl in array array['cities','seasons','competition_rulesets','match_playing_xi','match_team_roles'] loop
    trig:='audit_project5_'||tbl;
    execute format('drop trigger if exists %I on public.%I',trig,tbl);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.ips_audit_project4_change()',trig,tbl);
  end loop;
end $$;
