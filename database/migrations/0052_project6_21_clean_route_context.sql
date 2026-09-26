-- IPS Project 6.21 — expose tournament slug in Controller context for clean route generation.
CREATE OR REPLACE FUNCTION public.ips_controller_match_context(p_match_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  ctx jsonb;
begin
  if not public.ips_can_score_match(p_match_id) then
    raise exception 'You are not assigned to score/manage this match.';
  end if;

  select jsonb_build_object(
    'match', jsonb_build_object(
      'id',m.id,'code',m.match_code,'number',m.match_number,'status',m.status,
      'scheduled_at',m.scheduled_at,'scheduled_time_tbc',m.scheduled_time_tbc,
      'stage',m.stage,'round_label',m.round_label
    ),
    'tournament', jsonb_build_object(
      'id',t.id,'code',t.code,'slug',t.slug,'name',t.name,'format_label',t.format_label,
      'city',jsonb_build_object('id',c.id,'code',c.code,'name',c.name)
    ),
    'venue', case when v.id is null then null else jsonb_build_object(
      'id',v.id,'name',v.name,'address',v.address_text
    ) end,
    'match_format', jsonb_build_object(
      'players_per_side',m.format_players_per_side,
      'overs_per_innings',m.format_overs_per_innings,
      'balls_per_over',m.format_balls_per_over,
      'wicket_limit',m.format_wicket_limit,
      'max_overs_per_bowler',m.format_max_overs_per_bowler,
      'free_hit_on_no_ball',m.format_free_hit_on_no_ball,
      'source',m.format_source,
      'override_reason',m.format_override_reason,
      'overridden_at',m.format_overridden_at
    ),
    'rules', jsonb_build_object(
      'id',r.id,'name',r.name,'version',r.version,
      'free_hit_on_no_ball',m.format_free_hit_on_no_ball,
      'consecutive_overs_by_same_bowler_allowed',r.consecutive_overs_by_same_bowler_allowed,
      'retirement_runs',r.retirement_runs,'retirement_mode',r.retirement_mode,
      'extras_rules',r.extras_rules,'additional_rules',r.additional_rules
    ),
    'home', jsonb_build_object(
      'team',jsonb_build_object('id',ht.id,'name',ht.name,'short_name',ht.short_name,'logo_url',ht.logo_url),
      'squad_locked',public.ips_match_team_squad_ready(m.id,ht.id),
      'squad',coalesce((
        select jsonb_agg(jsonb_build_object(
          'player_id',p.id,'ips_code',p.ips_code,'name',p.display_name,
          'primary_role',p.primary_role,'batting_style',p.batting_style,'bowling_style',p.bowling_style
        ) order by p.display_name)
        from public.tournament_squads s
        join public.tournament_squad_players sp on sp.squad_id=s.id and sp.removed_at is null
        join public.players p on p.id=sp.player_id
        where s.tournament_id=m.tournament_id and s.team_id=ht.id
      ),'[]'::jsonb),
      'playing_side',coalesce((
        select jsonb_agg(jsonb_build_object(
          'player_id',p.id,'ips_code',p.ips_code,'name',p.display_name,
          'primary_role',p.primary_role,'batting_style',p.batting_style,'bowling_style',p.bowling_style,
          'order',xi.lineup_order
        ) order by xi.lineup_order)
        from public.match_playing_xi xi join public.players p on p.id=xi.player_id
        where xi.match_id=m.id and xi.team_id=ht.id
      ),'[]'::jsonb),
      'roles',coalesce((
        select jsonb_object_agg(mtr.role::text,jsonb_build_object('player_id',p.id,'ips_code',p.ips_code,'name',p.display_name))
        from public.match_team_roles mtr join public.players p on p.id=mtr.player_id
        where mtr.match_id=m.id and mtr.team_id=ht.id
      ),'{}'::jsonb)
    ),
    'away', jsonb_build_object(
      'team',jsonb_build_object('id',at.id,'name',at.name,'short_name',at.short_name,'logo_url',at.logo_url),
      'squad_locked',public.ips_match_team_squad_ready(m.id,at.id),
      'squad',coalesce((
        select jsonb_agg(jsonb_build_object(
          'player_id',p.id,'ips_code',p.ips_code,'name',p.display_name,
          'primary_role',p.primary_role,'batting_style',p.batting_style,'bowling_style',p.bowling_style
        ) order by p.display_name)
        from public.tournament_squads s
        join public.tournament_squad_players sp on sp.squad_id=s.id and sp.removed_at is null
        join public.players p on p.id=sp.player_id
        where s.tournament_id=m.tournament_id and s.team_id=at.id
      ),'[]'::jsonb),
      'playing_side',coalesce((
        select jsonb_agg(jsonb_build_object(
          'player_id',p.id,'ips_code',p.ips_code,'name',p.display_name,
          'primary_role',p.primary_role,'batting_style',p.batting_style,'bowling_style',p.bowling_style,
          'order',xi.lineup_order
        ) order by xi.lineup_order)
        from public.match_playing_xi xi join public.players p on p.id=xi.player_id
        where xi.match_id=m.id and xi.team_id=at.id
      ),'[]'::jsonb),
      'roles',coalesce((
        select jsonb_object_agg(mtr.role::text,jsonb_build_object('player_id',p.id,'ips_code',p.ips_code,'name',p.display_name))
        from public.match_team_roles mtr join public.players p on p.id=mtr.player_id
        where mtr.match_id=m.id and mtr.team_id=at.id
      ),'{}'::jsonb)
    ),
    'officials',coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id',a.user_id,'role',a.role,'designation',a.designation,
        'display_name',pr.display_name
      ) order by a.role,a.designation)
      from public.match_official_assignments a
      left join public.profiles pr on pr.id=a.user_id
      where a.match_id=m.id
    ),'[]'::jsonb)
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
end;
$function$;
