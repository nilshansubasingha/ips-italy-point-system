-- IPS Project 6.10 — one-step Quick Match playing sides + roles.
begin;

create or replace function public.ips_setup_quick_match(
  p_match_id uuid,
  p_home_player_ids uuid[],
  p_away_player_ids uuid[],
  p_home_captain_id uuid,
  p_home_wicketkeeper_id uuid,
  p_away_captain_id uuid,
  p_away_wicketkeeper_id uuid
)
returns void
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_home_team uuid;
  v_away_team uuid;
  v_kind text;
begin
  select m.home_team_id,m.away_team_id,t.competition_kind
  into v_home_team,v_away_team,v_kind
  from public.matches m
  join public.tournaments t on t.id=m.tournament_id
  where m.id=p_match_id;

  if not found then raise exception 'Quick Match not found.'; end if;
  if v_kind<>'QUICK_MATCH' then raise exception 'This workflow is only for Quick Match.'; end if;

  perform public.ips_set_match_playing_sides(p_match_id,p_home_player_ids,p_away_player_ids);
  perform public.ips_set_match_team_roles(p_match_id,v_home_team,p_home_captain_id,p_home_wicketkeeper_id);
  perform public.ips_set_match_team_roles(p_match_id,v_away_team,p_away_captain_id,p_away_wicketkeeper_id);
end $$;

revoke all on function public.ips_setup_quick_match(uuid,uuid[],uuid[],uuid,uuid,uuid,uuid) from public;
grant execute on function public.ips_setup_quick_match(uuid,uuid[],uuid[],uuid,uuid,uuid,uuid) to authenticated,service_role;

notify pgrst,'reload schema';

commit;
