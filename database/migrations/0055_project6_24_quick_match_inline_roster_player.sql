-- IPS Project 6.24 — create a permanent player from Quick Match setup and add to its locked squad.
begin;

create or replace function public.ips_quick_match_create_roster_player(
  p_match_id uuid,
  p_team_id uuid,
  p_full_name text,
  p_display_name text,
  p_date_of_birth date default null,
  p_primary_role text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_tournament_id uuid;
  v_kind text;
  v_status text;
  v_home uuid;
  v_away uuid;
  v_squad_id uuid;
  v_player public.players;
begin
  select m.tournament_id,t.competition_kind,m.status::text,m.home_team_id,m.away_team_id
  into v_tournament_id,v_kind,v_status,v_home,v_away
  from public.matches m
  join public.tournaments t on t.id=m.tournament_id
  where m.id=p_match_id;

  if not found then raise exception 'Quick Match not found.'; end if;
  if v_kind<>'QUICK_MATCH' then raise exception 'This action is only available for Quick Match.'; end if;
  if p_team_id not in (v_home,v_away) then raise exception 'Selected team is not part of this Quick Match.'; end if;
  if v_status not in ('SCHEDULED','READY') then raise exception 'New roster players can only be added before scoring starts.'; end if;
  if not public.ips_can_manage_match_team(p_match_id,p_team_id) then raise exception 'Not authorised to manage this Quick Match team.'; end if;

  v_player:=public.ips_create_player_for_team_v2(
    p_team_id,
    p_full_name,
    coalesce(nullif(trim(p_display_name),''),trim(p_full_name)),
    p_date_of_birth,
    p_primary_role,
    null,
    null,
    null,
    null,
    null,
    false
  );

  select id into v_squad_id
  from public.tournament_squads
  where tournament_id=v_tournament_id and team_id=p_team_id;

  if v_squad_id is null then raise exception 'Quick Match squad is missing.'; end if;

  perform set_config('ips.emergency_replacement','on',true);

  insert into public.tournament_squad_players(
    squad_id,player_id,added_by,removed_at,is_emergency_replacement
  )
  values(v_squad_id,v_player.id,auth.uid(),null,false)
  on conflict(squad_id,player_id) do update set removed_at=null;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(
    auth.uid(),'QUICK_MATCH_ROSTER_PLAYER_CREATED','PLAYER',v_player.id,
    jsonb_build_object('match_id',p_match_id,'team_id',p_team_id,'squad_id',v_squad_id)
  );

  return jsonb_build_object(
    'id',v_player.id,
    'display_name',v_player.display_name,
    'ips_code',v_player.ips_code,
    'primary_role',v_player.primary_role
  );
end
$$;

revoke all on function public.ips_quick_match_create_roster_player(uuid,uuid,text,text,date,text) from public;
grant execute on function public.ips_quick_match_create_roster_player(uuid,uuid,text,text,date,text) to authenticated;

notify pgrst,'reload schema';

commit;
