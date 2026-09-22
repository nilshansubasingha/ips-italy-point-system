-- IPS Project 5.1 — flexible tournament match defaults + frozen fixture snapshots
-- Run only on a database that already has Project 5 installed.
-- The connected IPS development database used in this conversation is ALREADY migrated.

alter table public.tournaments
  add column if not exists players_per_side smallint,
  add column if not exists overs_per_innings smallint,
  add column if not exists balls_per_over smallint,
  add column if not exists wicket_limit smallint,
  add column if not exists tournament_max_overs_per_bowler smallint,
  add column if not exists registration_mode text not null default 'OPEN',
  add column if not exists max_teams smallint,
  add column if not exists default_venue_id uuid references public.venues(id) on delete set null,
  add column if not exists short_description text;

update public.tournaments t
set players_per_side=coalesce(t.players_per_side,r.playing_xi_size),
    overs_per_innings=coalesce(t.overs_per_innings,r.max_overs),
    balls_per_over=coalesce(t.balls_per_over,r.balls_per_over),
    wicket_limit=coalesce(t.wicket_limit,r.innings_wicket_limit),
    tournament_max_overs_per_bowler=coalesce(t.tournament_max_overs_per_bowler,r.max_overs_per_bowler)
from public.competition_rulesets r where r.id=t.ruleset_id;

alter table public.tournaments alter column players_per_side set not null;
alter table public.tournaments alter column overs_per_innings set not null;
alter table public.tournaments alter column balls_per_over set not null;

do $$ begin alter table public.tournaments add constraint tournaments_players_per_side_check check(players_per_side between 2 and 20); exception when duplicate_object then null; end $$;
do $$ begin alter table public.tournaments add constraint tournaments_overs_per_innings_check check(overs_per_innings between 1 and 100); exception when duplicate_object then null; end $$;
do $$ begin alter table public.tournaments add constraint tournaments_balls_per_over_check check(balls_per_over between 1 and 12); exception when duplicate_object then null; end $$;
do $$ begin alter table public.tournaments add constraint tournaments_wicket_limit_check check(wicket_limit is null or wicket_limit between 1 and 19); exception when duplicate_object then null; end $$;
do $$ begin alter table public.tournaments add constraint tournaments_max_bowler_overs_check check(tournament_max_overs_per_bowler is null or tournament_max_overs_per_bowler between 1 and 100); exception when duplicate_object then null; end $$;
do $$ begin alter table public.tournaments add constraint tournaments_registration_mode_check check(registration_mode in ('OPEN','INVITE_ONLY')); exception when duplicate_object then null; end $$;
do $$ begin alter table public.tournaments add constraint tournaments_max_teams_check check(max_teams is null or max_teams between 2 and 100); exception when duplicate_object then null; end $$;

alter table public.matches
  add column if not exists format_players_per_side smallint,
  add column if not exists format_overs_per_innings smallint,
  add column if not exists format_balls_per_over smallint,
  add column if not exists format_wicket_limit smallint,
  add column if not exists format_max_overs_per_bowler smallint,
  add column if not exists format_source text not null default 'TOURNAMENT',
  add column if not exists format_override_reason text,
  add column if not exists format_overridden_by uuid references auth.users(id) on delete set null,
  add column if not exists format_overridden_at timestamptz;

update public.matches m
set format_players_per_side=coalesce(m.format_players_per_side,t.players_per_side),
    format_overs_per_innings=coalesce(m.format_overs_per_innings,t.overs_per_innings),
    format_balls_per_over=coalesce(m.format_balls_per_over,t.balls_per_over),
    format_wicket_limit=coalesce(m.format_wicket_limit,t.wicket_limit),
    format_max_overs_per_bowler=coalesce(m.format_max_overs_per_bowler,t.tournament_max_overs_per_bowler)
from public.tournaments t where t.id=m.tournament_id;

alter table public.matches alter column format_players_per_side set not null;
alter table public.matches alter column format_overs_per_innings set not null;
alter table public.matches alter column format_balls_per_over set not null;

do $$ begin alter table public.matches add constraint matches_format_players_per_side_check check(format_players_per_side between 2 and 20); exception when duplicate_object then null; end $$;
do $$ begin alter table public.matches add constraint matches_format_overs_check check(format_overs_per_innings between 1 and 100); exception when duplicate_object then null; end $$;
do $$ begin alter table public.matches add constraint matches_format_balls_check check(format_balls_per_over between 1 and 12); exception when duplicate_object then null; end $$;
do $$ begin alter table public.matches add constraint matches_format_wickets_check check(format_wicket_limit is null or format_wicket_limit between 1 and 19); exception when duplicate_object then null; end $$;
do $$ begin alter table public.matches add constraint matches_format_bowler_overs_check check(format_max_overs_per_bowler is null or format_max_overs_per_bowler between 1 and 100); exception when duplicate_object then null; end $$;
do $$ begin alter table public.matches add constraint matches_format_source_check check(format_source in ('TOURNAMENT','MATCH_OVERRIDE')); exception when duplicate_object then null; end $$;

create or replace function public.ips_snapshot_match_format()
returns trigger language plpgsql security definer set search_path=public as $$
declare t public.tournaments;
begin
  select * into t from public.tournaments where id=new.tournament_id;
  if not found then raise exception 'Tournament not found.'; end if;
  new.format_players_per_side:=coalesce(new.format_players_per_side,t.players_per_side);
  new.format_overs_per_innings:=coalesce(new.format_overs_per_innings,t.overs_per_innings);
  new.format_balls_per_over:=coalesce(new.format_balls_per_over,t.balls_per_over);
  new.format_wicket_limit:=coalesce(new.format_wicket_limit,t.wicket_limit);
  new.format_max_overs_per_bowler:=coalesce(new.format_max_overs_per_bowler,t.tournament_max_overs_per_bowler);
  new.format_source:=coalesce(new.format_source,'TOURNAMENT');
  new.venue_id:=coalesce(new.venue_id,t.default_venue_id);
  return new;
end $$;

drop trigger if exists snapshot_match_format on public.matches;
create trigger snapshot_match_format before insert on public.matches for each row execute function public.ips_snapshot_match_format();

create or replace function public.ips_override_match_format(
  p_match_id uuid,
  p_players_per_side smallint,
  p_overs_per_innings smallint,
  p_balls_per_over smallint,
  p_wicket_limit smallint default null,
  p_max_overs_per_bowler smallint default null,
  p_reason text default null
) returns public.matches
language plpgsql security definer set search_path=public,auth as $$
declare m public.matches; result public.matches;
begin
  select * into m from public.matches where id=p_match_id for update;
  if not found then raise exception 'Match not found.'; end if;
  if m.status in ('COMPLETED','AWAITING_CERTIFICATION','OFFICIAL','LOCKED') then
    raise exception 'Match format cannot be changed after the match has been completed.';
  end if;
  if m.status='LIVE' then
    if not public.ips_can_manage_tournament(m.tournament_id) then raise exception 'A tournament administrator is required to change format after the match starts.'; end if;
    if coalesce(trim(p_reason),'')='' then raise exception 'A reason is required for a live-match format override.'; end if;
  elsif not public.ips_can_score_match(m.id) then
    raise exception 'You are not authorised to change this match format.';
  end if;
  if p_players_per_side not between 2 and 20 then raise exception 'Players per side must be between 2 and 20.'; end if;
  if p_overs_per_innings not between 1 and 100 then raise exception 'Overs per innings must be between 1 and 100.'; end if;
  if p_balls_per_over not between 1 and 12 then raise exception 'Balls per over must be between 1 and 12.'; end if;
  update public.matches set
    format_players_per_side=p_players_per_side,
    format_overs_per_innings=p_overs_per_innings,
    format_balls_per_over=p_balls_per_over,
    format_wicket_limit=p_wicket_limit,
    format_max_overs_per_bowler=p_max_overs_per_bowler,
    format_source='MATCH_OVERRIDE',
    format_override_reason=nullif(trim(p_reason),''),
    format_overridden_by=auth.uid(),
    format_overridden_at=now()
  where id=p_match_id returning * into result;
  return result;
end $$;

-- Project 5's playing-XI table remains the physical storage name for compatibility;
-- the product UI now calls this a Playing Side because IPS supports 6/7/8/10/11-a-side formats.
create or replace function public.ips_set_match_playing_xi(p_match_id uuid,p_team_id uuid,p_player_ids uuid[])
returns void language plpgsql security definer set search_path=public,auth as $$
declare v_required integer; v_squad_id uuid; v_count integer; p uuid; i integer:=0;
begin
  if not public.ips_can_manage_match_team(p_match_id,p_team_id) then raise exception 'Not authorised to manage this playing side.'; end if;
  select format_players_per_side into v_required from public.matches where id=p_match_id and p_team_id in(home_team_id,away_team_id);
  if v_required is null then raise exception 'Match/team relationship is invalid.'; end if;
  if coalesce(array_length(p_player_ids,1),0)<>v_required then raise exception 'Playing side must contain exactly % players.',v_required; end if;
  select public.ips_match_team_squad_id(p_match_id,p_team_id) into v_squad_id;
  if v_squad_id is null then raise exception 'Tournament squad is missing.'; end if;
  if not public.ips_squad_effectively_locked(v_squad_id) then raise exception 'Tournament squad must be locked before selecting the playing side.'; end if;
  select count(distinct x) into v_count from unnest(p_player_ids)x;
  if v_count<>v_required then raise exception 'Playing side contains duplicate players.'; end if;
  if exists(select 1 from unnest(p_player_ids)x where not exists(select 1 from public.tournament_squad_players sp where sp.squad_id=v_squad_id and sp.player_id=x and sp.removed_at is null)) then
    raise exception 'Every playing-side player must belong to the locked tournament squad.';
  end if;
  delete from public.match_team_roles where match_id=p_match_id and team_id=p_team_id;
  delete from public.match_playing_xi where match_id=p_match_id and team_id=p_team_id;
  foreach p in array p_player_ids loop i:=i+1; insert into public.match_playing_xi(match_id,team_id,player_id,lineup_order,selected_by) values(p_match_id,p_team_id,p,i,auth.uid()); end loop;
end $$;

create or replace function public.ips_guard_tournament_team_insert()
returns trigger language plpgsql security definer set search_path=public,auth as $$
declare mode text;
begin
  if public.ips_can_manage_tournament(new.tournament_id) then return new; end if;
  if public.ips_can_manage_team(new.team_id) then
    select registration_mode into mode from public.tournaments where id=new.tournament_id;
    if mode='INVITE_ONLY' then raise exception 'This tournament is invite-only. A tournament administrator must add the team.'; end if;
    if new.status<>'APPLIED' then raise exception 'Team leaders may only create APPLIED tournament applications.'; end if;
    new.submitted_by:=auth.uid(); return new;
  end if;
  raise exception 'Not authorised to apply this team to the tournament.';
end $$;

create or replace function public.ips_guard_tournament_team_capacity()
returns trigger language plpgsql security definer set search_path=public as $$
declare limit_count integer; confirmed_count integer;
begin
  if new.status='CONFIRMED' and (tg_op='INSERT' or old.status is distinct from 'CONFIRMED') then
    select max_teams into limit_count from public.tournaments where id=new.tournament_id;
    if limit_count is not null then
      select count(*) into confirmed_count from public.tournament_teams tt where tt.tournament_id=new.tournament_id and tt.status='CONFIRMED' and tt.id<>coalesce(new.id,'00000000-0000-0000-0000-000000000000'::uuid);
      if confirmed_count>=limit_count then raise exception 'Tournament has reached its maximum of % confirmed teams.',limit_count; end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists tournament_team_capacity_guard on public.tournament_teams;
create trigger tournament_team_capacity_guard before insert or update on public.tournament_teams for each row execute function public.ips_guard_tournament_team_capacity();

revoke all on function public.ips_snapshot_match_format() from public,anon,authenticated;
revoke all on function public.ips_guard_tournament_team_capacity() from public,anon,authenticated;
revoke all on function public.ips_override_match_format(uuid,smallint,smallint,smallint,smallint,smallint,text) from public,anon;
grant execute on function public.ips_override_match_format(uuid,smallint,smallint,smallint,smallint,smallint,text) to authenticated;

notify pgrst,'reload schema';

-- Replace Project 5 controller context so it exposes the frozen match format
-- and uses the user-facing term Playing Side.
create or replace function public.ips_controller_match_context(p_match_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path=public,auth as $$
declare ctx jsonb;
begin
  if not public.ips_can_score_match(p_match_id) then raise exception 'You are not assigned to score/manage this match.'; end if;
  select jsonb_build_object(
    'match',jsonb_build_object('id',m.id,'code',m.match_code,'number',m.match_number,'status',m.status,'scheduled_at',m.scheduled_at,'stage',m.stage,'round_label',m.round_label),
    'tournament',jsonb_build_object('id',t.id,'code',t.code,'name',t.name,'format_label',t.format_label,'city',jsonb_build_object('id',c.id,'code',c.code,'name',c.name)),
    'venue',case when v.id is null then null else jsonb_build_object('id',v.id,'name',v.name,'address',v.address_text) end,
    'match_format',jsonb_build_object(
      'players_per_side',m.format_players_per_side,
      'overs_per_innings',m.format_overs_per_innings,
      'balls_per_over',m.format_balls_per_over,
      'wicket_limit',m.format_wicket_limit,
      'max_overs_per_bowler',m.format_max_overs_per_bowler,
      'source',m.format_source,
      'override_reason',m.format_override_reason,
      'overridden_at',m.format_overridden_at
    ),
    'rules',jsonb_build_object(
      'id',r.id,'name',r.name,'version',r.version,
      'free_hit_on_no_ball',r.free_hit_on_no_ball,
      'consecutive_overs_by_same_bowler_allowed',r.consecutive_overs_by_same_bowler_allowed,
      'retirement_runs',r.retirement_runs,'retirement_mode',r.retirement_mode,
      'extras_rules',r.extras_rules,'additional_rules',r.additional_rules
    ),
    'home',jsonb_build_object(
      'team',jsonb_build_object('id',ht.id,'name',ht.name,'short_name',ht.short_name,'logo_url',ht.logo_url),
      'squad_locked',public.ips_match_team_squad_ready(m.id,ht.id),
      'squad',coalesce((select jsonb_agg(jsonb_build_object('player_id',p.id,'ips_code',p.ips_code,'name',p.display_name,'primary_role',p.primary_role,'batting_style',p.batting_style,'bowling_style',p.bowling_style) order by p.display_name) from public.tournament_squads s join public.tournament_squad_players sp on sp.squad_id=s.id and sp.removed_at is null join public.players p on p.id=sp.player_id where s.tournament_id=m.tournament_id and s.team_id=ht.id),'[]'::jsonb),
      'playing_side',coalesce((select jsonb_agg(jsonb_build_object('player_id',p.id,'ips_code',p.ips_code,'name',p.display_name,'primary_role',p.primary_role,'batting_style',p.batting_style,'bowling_style',p.bowling_style,'order',xi.lineup_order) order by xi.lineup_order) from public.match_playing_xi xi join public.players p on p.id=xi.player_id where xi.match_id=m.id and xi.team_id=ht.id),'[]'::jsonb),
      'roles',coalesce((select jsonb_object_agg(mtr.role::text,jsonb_build_object('player_id',p.id,'ips_code',p.ips_code,'name',p.display_name)) from public.match_team_roles mtr join public.players p on p.id=mtr.player_id where mtr.match_id=m.id and mtr.team_id=ht.id),'{}'::jsonb)
    ),
    'away',jsonb_build_object(
      'team',jsonb_build_object('id',at.id,'name',at.name,'short_name',at.short_name,'logo_url',at.logo_url),
      'squad_locked',public.ips_match_team_squad_ready(m.id,at.id),
      'squad',coalesce((select jsonb_agg(jsonb_build_object('player_id',p.id,'ips_code',p.ips_code,'name',p.display_name,'primary_role',p.primary_role,'batting_style',p.batting_style,'bowling_style',p.bowling_style) order by p.display_name) from public.tournament_squads s join public.tournament_squad_players sp on sp.squad_id=s.id and sp.removed_at is null join public.players p on p.id=sp.player_id where s.tournament_id=m.tournament_id and s.team_id=at.id),'[]'::jsonb),
      'playing_side',coalesce((select jsonb_agg(jsonb_build_object('player_id',p.id,'ips_code',p.ips_code,'name',p.display_name,'primary_role',p.primary_role,'batting_style',p.batting_style,'bowling_style',p.bowling_style,'order',xi.lineup_order) order by xi.lineup_order) from public.match_playing_xi xi join public.players p on p.id=xi.player_id where xi.match_id=m.id and xi.team_id=at.id),'[]'::jsonb),
      'roles',coalesce((select jsonb_object_agg(mtr.role::text,jsonb_build_object('player_id',p.id,'ips_code',p.ips_code,'name',p.display_name)) from public.match_team_roles mtr join public.players p on p.id=mtr.player_id where mtr.match_id=m.id and mtr.team_id=at.id),'{}'::jsonb)
    ),
    'officials',coalesce((select jsonb_agg(jsonb_build_object('user_id',a.user_id,'role',a.role,'designation',a.designation,'display_name',pr.display_name) order by a.role,a.designation) from public.match_official_assignments a left join public.profiles pr on pr.id=a.user_id where a.match_id=m.id),'[]'::jsonb)
  ) into ctx
  from public.matches m
  join public.tournaments t on t.id=m.tournament_id
  join public.cities c on c.id=t.city_id
  join public.competition_rulesets r on r.id=t.ruleset_id
  join public.teams ht on ht.id=m.home_team_id
  join public.teams at on at.id=m.away_team_id
  left join public.venues v on v.id=m.venue_id
  where m.id=p_match_id;
  if ctx is null then raise exception 'Match not found.'; end if;
  return ctx;
end $$;

notify pgrst,'reload schema';
