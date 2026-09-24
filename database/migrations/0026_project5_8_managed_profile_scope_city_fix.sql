-- IPS Project 5.8.6 — correct managed-profile city scope resolution.
-- The fallback scope for linked players must use clubs.city_id, not clubs.id.
-- Also removes two temporary unversioned helper RPCs that were not part of the final API.

begin;

drop function if exists public.ips_access_account_profile(uuid);
drop function if exists public.ips_update_access_account_profile(uuid,text,text,text,date,uuid);

create or replace function public.ips_can_manage_account_profile(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path=public,auth
as $$
declare
  v_actor_rank integer := 0;
  v_target_rank integer := 0;
  v_city_id uuid;
  v_club_id uuid;
  v_team_id uuid;
begin
  if auth.uid() is null then return false; end if;
  if p_user_id=auth.uid() then return true; end if;
  if public.ips_is_owner() then return true; end if;

  if public.ips_has_role('ADMIN','GLOBAL',null) then
    v_actor_rank := 4;
  elsif exists(
    select 1 from public.role_grants rg
    where rg.user_id=auth.uid()
      and rg.role='ADMIN'
      and rg.scope_type='CITY'
      and public.ips_role_grant_is_active(rg)
  ) then
    v_actor_rank := 3;
  elsif exists(
    select 1 from public.role_grants rg
    where rg.user_id=auth.uid()
      and rg.role='ADMIN'
      and rg.scope_type in ('CLUB','TEAM')
      and public.ips_role_grant_is_active(rg)
  ) then
    v_actor_rank := 2;
  else
    return false;
  end if;

  select coalesce(max(
    case
      when rg.role='OWNER' and rg.scope_type='GLOBAL' then 5
      when rg.role='ADMIN' and rg.scope_type='GLOBAL' then 4
      when rg.role='ADMIN' and rg.scope_type='CITY' then 3
      when rg.role='ADMIN' and rg.scope_type in ('CLUB','TEAM') then 2
      else 1
    end
  ),0)
  into v_target_rank
  from public.role_grants rg
  where rg.user_id=p_user_id
    and public.ips_role_grant_is_active(rg);

  if v_target_rank>=v_actor_rank then return false; end if;

  select
    coalesce(rg.city_id,c.city_id,tc.city_id),
    coalesce(rg.club_id,t.club_id),
    rg.team_id
  into v_city_id,v_club_id,v_team_id
  from public.role_grants rg
  left join public.clubs c on rg.scope_type='CLUB' and c.id=rg.club_id
  left join public.teams t on rg.scope_type='TEAM' and t.id=rg.team_id
  left join public.clubs tc on tc.id=t.club_id
  where rg.user_id=p_user_id
    and rg.role='ADMIN'
    and rg.scope_type in ('CITY','CLUB','TEAM')
    and public.ips_role_grant_is_active(rg)
  order by case rg.scope_type when 'CITY' then 3 when 'CLUB' then 2 else 1 end desc
  limit 1;

  if v_city_id is null then
    select
      coalesce(c.city_id,p.city_id),
      t.club_id,
      t.id
    into v_city_id,v_club_id,v_team_id
    from public.profiles p
    left join public.players pl on pl.id=p.linked_player_id
    left join lateral (
      select tm.team_id
      from public.team_memberships tm
      where tm.player_id=pl.id
        and tm.status='ACTIVE'
        and tm.end_on is null
      order by tm.is_primary desc,tm.start_on desc
      limit 1
    ) active_membership on true
    left join public.teams t on t.id=active_membership.team_id
    left join public.clubs c on c.id=t.club_id
    where p.id=p_user_id;
  end if;

  if v_actor_rank=4 then return true; end if;

  if v_actor_rank=3 then
    return v_city_id is not null and exists(
      select 1
      from public.role_grants rg
      where rg.user_id=auth.uid()
        and rg.role='ADMIN'
        and rg.scope_type='CITY'
        and rg.city_id=v_city_id
        and public.ips_role_grant_is_active(rg)
    );
  end if;

  if v_actor_rank=2 then
    return
      (v_club_id is not null and exists(
        select 1
        from public.role_grants rg
        where rg.user_id=auth.uid()
          and rg.role='ADMIN'
          and rg.scope_type='CLUB'
          and rg.club_id=v_club_id
          and public.ips_role_grant_is_active(rg)
      ))
      or
      (v_team_id is not null and exists(
        select 1
        from public.role_grants rg
        where rg.user_id=auth.uid()
          and rg.role='ADMIN'
          and rg.scope_type='TEAM'
          and rg.team_id=v_team_id
          and public.ips_role_grant_is_active(rg)
      ));
  end if;

  return false;
end;
$$;

revoke all on function public.ips_can_manage_account_profile(uuid) from public,anon,authenticated;

notify pgrst,'reload schema';

commit;
