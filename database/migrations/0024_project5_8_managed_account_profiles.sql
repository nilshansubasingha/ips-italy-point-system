-- IPS Project 5.8.4 — scoped account-profile management.
-- Adds guarded read/update RPCs so clickable Access Management profiles follow
-- the existing Owner > Global Admin > City Admin > Team Admin hierarchy.


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
    coalesce(c.id,p.city_id),
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

create or replace function public.ips_managed_profile_detail(p_user_id uuid)
returns table(
  id uuid,
  display_name text,
  full_name text,
  email text,
  phone text,
  date_of_birth date,
  status public.ips_entity_status,
  city_id uuid,
  city_name text,
  province_abbr text,
  linked_player_id uuid,
  player_display_name text,
  ips_code text,
  player_image_url text,
  club_id uuid,
  club_name text,
  team_id uuid,
  team_name text,
  can_edit_city boolean
)
language plpgsql
stable
security definer
set search_path=public,auth
as $$
begin
  if not public.ips_can_manage_account_profile(p_user_id) then
    raise exception 'You do not have permission to manage this profile.';
  end if;

  return query
  select
    p.id,
    p.display_name,
    p.full_name,
    p.email,
    p.phone,
    p.date_of_birth,
    p.status,
    p.city_id,
    ci.name,
    ci.province_abbr,
    pl.id,
    pl.display_name,
    pl.ips_code,
    pl.profile_image_url,
    c.id,
    case when c.name is null then null else regexp_replace(c.name,'[[:space:]]+Cricket Club$','','i') end,
    t.id,
    t.name,
    (
      public.ips_is_owner()
      or public.ips_has_role('ADMIN','GLOBAL',null)
    ) as can_edit_city
  from public.profiles p
  left join public.cities ci on ci.id=p.city_id
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
end;
$$;

create or replace function public.ips_update_managed_profile(
  p_user_id uuid,
  p_display_name text,
  p_full_name text,
  p_phone text,
  p_date_of_birth date,
  p_city_id uuid
)
returns void
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_current_city uuid;
  v_can_edit_city boolean;
begin
  if not public.ips_can_manage_account_profile(p_user_id) then
    raise exception 'You do not have permission to manage this profile.';
  end if;

  if nullif(trim(p_display_name),'') is null then
    raise exception 'Display name is required.';
  end if;

  select city_id into v_current_city
  from public.profiles
  where id=p_user_id
  for update;

  if not found then
    raise exception 'Profile not found.';
  end if;

  v_can_edit_city := public.ips_is_owner() or public.ips_has_role('ADMIN','GLOBAL',null);

  if not v_can_edit_city and p_city_id is distinct from v_current_city then
    raise exception 'Only Owner or Global Admin can change an account city.';
  end if;

  if p_city_id is not null and not exists(
    select 1 from public.cities c where c.id=p_city_id and c.status='ACTIVE'
  ) then
    raise exception 'Selected city is not active.';
  end if;

  update public.profiles
  set
    display_name=trim(p_display_name),
    full_name=nullif(trim(p_full_name),''),
    phone=nullif(trim(p_phone),''),
    date_of_birth=p_date_of_birth,
    city_id=p_city_id,
    updated_at=timezone('utc',now())
  where id=p_user_id;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(
    auth.uid(),
    'PROFILE_UPDATED',
    'PROFILE',
    p_user_id,
    jsonb_build_object(
      'display_name',trim(p_display_name),
      'full_name',nullif(trim(p_full_name),''),
      'phone_changed',true,
      'date_of_birth',p_date_of_birth,
      'city_id',p_city_id
    )
  );
end;
$$;

revoke all on function public.ips_can_manage_account_profile(uuid) from public,anon,authenticated;
revoke all on function public.ips_managed_profile_detail(uuid) from public,anon;
revoke all on function public.ips_update_managed_profile(uuid,text,text,text,date,uuid) from public,anon;

grant execute on function public.ips_managed_profile_detail(uuid) to authenticated;
grant execute on function public.ips_update_managed_profile(uuid,text,text,text,date,uuid) to authenticated;

notify pgrst,'reload schema';

