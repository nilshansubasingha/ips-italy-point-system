-- IPS Project 6.22 — save a complete tournament squad in one atomic request.
begin;

create or replace function public.ips_save_tournament_squad_selection(
  p_tournament_id uuid,
  p_team_id uuid,
  p_player_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_tournament public.tournaments;
  v_squad public.tournament_squads;
  v_player_id uuid;
  v_count integer:=coalesce(array_length(p_player_ids,1),0);
begin
  select * into v_tournament from public.tournaments where id=p_tournament_id;
  if not found then raise exception 'Tournament not found.'; end if;

  if not (public.ips_can_manage_tournament(p_tournament_id) or public.ips_can_manage_team(p_team_id)) then
    raise exception 'You do not have permission to manage this squad.';
  end if;

  if not exists(
    select 1 from public.tournament_teams
    where tournament_id=p_tournament_id and team_id=p_team_id and status='CONFIRMED'
  ) then
    raise exception 'The team must be confirmed in the tournament before its squad can be edited.';
  end if;

  if v_tournament.squad_deadline is not null and timezone('utc',now())>=v_tournament.squad_deadline then
    raise exception 'The squad deadline has passed.';
  end if;

  if v_tournament.squad_size is not null and v_count>v_tournament.squad_size then
    raise exception 'This tournament allows a maximum squad of % players.',v_tournament.squad_size;
  end if;

  if exists(
    select 1
    from unnest(coalesce(p_player_ids,array[]::uuid[])) x(player_id)
    where not exists(
      select 1 from public.team_memberships tm
      where tm.team_id=p_team_id
        and tm.player_id=x.player_id
        and tm.status='ACTIVE'
        and tm.end_on is null
    )
  ) then
    raise exception 'Every selected player must be an active member of this team.';
  end if;

  insert into public.tournament_squads(tournament_id,team_id)
  values(p_tournament_id,p_team_id)
  on conflict(tournament_id,team_id) do update
    set updated_at=timezone('utc',now())
  returning * into v_squad;

  if v_squad.status='LOCKED' then
    raise exception 'This squad is locked.';
  end if;

  update public.tournament_squad_players
  set removed_at=timezone('utc',now())
  where squad_id=v_squad.id
    and removed_at is null
    and not(player_id=any(coalesce(p_player_ids,array[]::uuid[])));

  foreach v_player_id in array coalesce(p_player_ids,array[]::uuid[])
  loop
    insert into public.tournament_squad_players(
      squad_id,player_id,added_by,added_at,removed_at,is_emergency_replacement
    )
    values(
      v_squad.id,v_player_id,auth.uid(),timezone('utc',now()),null,false
    )
    on conflict(squad_id,player_id) do update
      set removed_at=null,
          added_by=auth.uid(),
          added_at=case
            when public.tournament_squad_players.removed_at is not null then timezone('utc',now())
            else public.tournament_squad_players.added_at
          end,
          is_emergency_replacement=false;
  end loop;

  update public.tournament_squads
  set updated_at=timezone('utc',now())
  where id=v_squad.id;

  return jsonb_build_object(
    'squad_id',v_squad.id,
    'status',v_squad.status::text,
    'count',v_count
  );
end
$$;

revoke all on function public.ips_save_tournament_squad_selection(uuid,uuid,uuid[]) from public;
grant execute on function public.ips_save_tournament_squad_selection(uuid,uuid,uuid[]) to authenticated;

notify pgrst,'reload schema';

commit;
