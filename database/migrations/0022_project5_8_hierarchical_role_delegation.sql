-- IPS Project 5.8 — hierarchical role delegation and scoped access-management search.
-- OWNER > GLOBAL ADMIN > CITY ADMIN > TEAM ADMIN > Player / lower operational access.
-- Existing role grant rows and public IDs are preserved.

begin;

CREATE OR REPLACE FUNCTION public.ips_can_delegate_role(p_role ips_role, p_scope_type ips_scope_type, p_scope_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_city uuid;
  v_club uuid;
  v_team uuid;
begin
  if auth.uid() is null then return false; end if;
  if public.ips_is_owner() then return true; end if;

  -- A GLOBAL ADMIN can create only lower-level access.
  if public.ips_has_role('ADMIN','GLOBAL',null) then
    return not (
      p_role='OWNER'
      or (p_role='ADMIN' and p_scope_type='GLOBAL')
    );
  end if;

  v_city := public.ips_role_scope_city(p_scope_type,p_scope_id);
  v_club := public.ips_role_scope_club(p_scope_type,p_scope_id);
  v_team := public.ips_role_scope_team(p_scope_type,p_scope_id);

  -- CITY ADMIN: may delegate only below CITY level and only inside one of their cities.
  if v_city is not null and public.ips_has_role('ADMIN','CITY',v_city) then
    return
      (p_role='ADMIN' and p_scope_type in ('CLUB','TEAM','TOURNAMENT'))
      or (p_role='LEADER' and p_scope_type in ('CLUB','TEAM'))
      or (p_role='SCORER' and p_scope_type='MATCH')
      or (p_role='PLAYER' and p_scope_type='PLAYER');
  end if;

  -- TEAM ADMIN (all competitive sides): may delegate lower operational/player access.
  if v_club is not null and public.ips_has_role('ADMIN','CLUB',v_club) then
    return
      (p_role='LEADER' and p_scope_type in ('CLUB','TEAM'))
      or (p_role='PLAYER' and p_scope_type='PLAYER');
  end if;

  if p_role='SCORER' and p_scope_type='MATCH' and exists (
    select 1
    from public.matches m
    join public.teams ht on ht.id=m.home_team_id
    join public.teams at on at.id=m.away_team_id
    where m.id=p_scope_id
      and (
        public.ips_has_role('ADMIN','CLUB',ht.club_id)
        or public.ips_has_role('ADMIN','CLUB',at.club_id)
      )
  ) then return true; end if;

  -- Competitive-side ADMIN: may delegate lower access only inside that side.
  if v_team is not null and public.ips_has_role('ADMIN','TEAM',v_team) then
    return
      (p_role='LEADER' and p_scope_type='TEAM')
      or (p_role='PLAYER' and p_scope_type='PLAYER');
  end if;

  if p_role='SCORER' and p_scope_type='MATCH' and exists (
    select 1
    from public.matches m
    where m.id=p_scope_id
      and (
        public.ips_has_role('ADMIN','TEAM',m.home_team_id)
        or public.ips_has_role('ADMIN','TEAM',m.away_team_id)
      )
  ) then return true; end if;

  return false;
end;
$function$;

CREATE OR REPLACE FUNCTION public.ips_create_role_grant(p_user_id uuid, p_role ips_role, p_scope_type ips_scope_type, p_scope_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_id uuid;
  v_linked_player uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated.'; end if;

  if not exists(select 1 from public.profiles where id=p_user_id and status='ACTIVE') then
    raise exception 'Registered account not found.';
  end if;

  if p_scope_type<>'GLOBAL' and p_scope_id is null then
    raise exception 'A scope record is required.';
  end if;

  if not public.ips_can_delegate_role(p_role,p_scope_type,p_scope_id) then
    raise exception 'You cannot grant this access level or scope.';
  end if;

  if p_role='PLAYER' then
    select linked_player_id into v_linked_player from public.profiles where id=p_user_id;
    if v_linked_player is null or v_linked_player<>p_scope_id then
      raise exception 'PLAYER access must match the account''s linked IPS player identity.';
    end if;
  end if;

  if exists(
    select 1 from public.role_grants rg
    where rg.user_id=p_user_id
      and rg.role=p_role
      and rg.scope_type=p_scope_type
      and public.ips_role_grant_is_active(rg)
      and (
        (p_scope_type='GLOBAL')
        or (p_scope_type='CITY' and rg.city_id=p_scope_id)
        or (p_scope_type='CLUB' and rg.club_id=p_scope_id)
        or (p_scope_type='TEAM' and rg.team_id=p_scope_id)
        or (p_scope_type='TOURNAMENT' and rg.tournament_id=p_scope_id)
        or (p_scope_type='MATCH' and rg.match_id=p_scope_id)
        or (p_scope_type='PLAYER' and rg.player_id=p_scope_id)
      )
  ) then
    raise exception 'This account already has that active access grant.';
  end if;

  insert into public.role_grants(
    user_id,role,scope_type,city_id,club_id,team_id,tournament_id,match_id,player_id,granted_by,note
  )
  values(
    p_user_id,p_role,p_scope_type,
    case when p_scope_type='CITY' then p_scope_id end,
    case when p_scope_type='CLUB' then p_scope_id end,
    case when p_scope_type='TEAM' then p_scope_id end,
    case when p_scope_type='TOURNAMENT' then p_scope_id end,
    case when p_scope_type='MATCH' then p_scope_id end,
    case when p_scope_type='PLAYER' then p_scope_id end,
    auth.uid(),
    nullif(trim(p_note),'')
  )
  returning id into v_id;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(
    auth.uid(),'ROLE_GRANT_CREATED','ROLE_GRANT',v_id,
    jsonb_build_object('user_id',p_user_id,'role',p_role,'scope_type',p_scope_type,'scope_id',p_scope_id)
  );

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.ips_revoke_role_grant(p_grant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_rg public.role_grants%rowtype;
  v_scope_id uuid;
  v_owner_count integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated.'; end if;

  select * into v_rg
  from public.role_grants
  where id=p_grant_id and public.ips_role_grant_is_active(role_grants)
  for update;

  if not found then raise exception 'Active role grant not found.'; end if;

  v_scope_id := case v_rg.scope_type
    when 'CITY' then v_rg.city_id
    when 'CLUB' then v_rg.club_id
    when 'TEAM' then v_rg.team_id
    when 'TOURNAMENT' then v_rg.tournament_id
    when 'MATCH' then v_rg.match_id
    when 'PLAYER' then v_rg.player_id
    else null
  end;

  if not public.ips_can_delegate_role(v_rg.role,v_rg.scope_type,v_scope_id) then
    raise exception 'You cannot revoke this access grant.';
  end if;

  if v_rg.role='OWNER' and v_rg.scope_type='GLOBAL' then
    select count(*) into v_owner_count
    from public.role_grants rg
    where rg.role='OWNER' and rg.scope_type='GLOBAL' and public.ips_role_grant_is_active(rg);
    if v_owner_count<=1 then raise exception 'The last GLOBAL OWNER cannot be revoked.'; end if;
  end if;

  update public.role_grants set revoked_at=timezone('utc',now()) where id=p_grant_id;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(
    auth.uid(),'ROLE_GRANT_REVOKED','ROLE_GRANT',p_grant_id,
    jsonb_build_object('user_id',v_rg.user_id,'role',v_rg.role,'scope_type',v_rg.scope_type,'scope_id',v_scope_id)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.ips_role_grant_visible(p_user_id uuid, p_role ips_role, p_scope_type ips_scope_type, p_scope_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_city uuid;
  v_club uuid;
  v_team uuid;
begin
  if auth.uid() is null then return false; end if;
  if p_user_id=auth.uid() then return true; end if;
  if public.ips_is_owner() or public.ips_has_role('ADMIN','GLOBAL',null) then return true; end if;

  v_city := public.ips_role_scope_city(p_scope_type,p_scope_id);
  v_club := public.ips_role_scope_club(p_scope_type,p_scope_id);
  v_team := public.ips_role_scope_team(p_scope_type,p_scope_id);

  if v_city is not null and public.ips_has_role('ADMIN','CITY',v_city) then return true; end if;
  if v_club is not null and public.ips_has_role('ADMIN','CLUB',v_club) then return true; end if;
  if v_team is not null and public.ips_has_role('ADMIN','TEAM',v_team) then return true; end if;

  if p_scope_type='MATCH' and exists (
    select 1
    from public.matches m
    join public.teams ht on ht.id=m.home_team_id
    join public.teams at on at.id=m.away_team_id
    where m.id=p_scope_id and (
      public.ips_has_role('ADMIN','CLUB',ht.club_id)
      or public.ips_has_role('ADMIN','CLUB',at.club_id)
      or public.ips_has_role('ADMIN','TEAM',m.home_team_id)
      or public.ips_has_role('ADMIN','TEAM',m.away_team_id)
    )
  ) then return true; end if;

  return false;
end;
$function$;

CREATE OR REPLACE FUNCTION public.ips_role_management_cities(p_query text DEFAULT NULL::text, p_limit integer DEFAULT 8)
 RETURNS TABLE(id uuid, name text, province_abbr text, region text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  with registered as (
    select distinct ci.id,ci.name,ci.province_abbr,ci.region
    from public.cities ci
    where ci.status='ACTIVE'
      and (
        exists(select 1 from public.profiles pr where pr.city_id=ci.id and pr.status='ACTIVE')
        or exists(select 1 from public.clubs c where c.city_id=ci.id and c.status='ACTIVE')
        or exists(select 1 from public.tournaments tr where tr.city_id=ci.id)
        or exists(
          select 1 from public.role_grants rg
          where rg.scope_type='CITY' and rg.city_id=ci.id and public.ips_role_grant_is_active(rg)
        )
      )
      and (
        public.ips_is_owner()
        or public.ips_has_role('ADMIN','GLOBAL',null)
        or public.ips_has_role('ADMIN','CITY',ci.id)
        or exists(
          select 1 from public.clubs c
          where c.city_id=ci.id and public.ips_has_role('ADMIN','CLUB',c.id)
        )
        or exists(
          select 1
          from public.teams t join public.clubs c on c.id=t.club_id
          where c.city_id=ci.id and public.ips_has_role('ADMIN','TEAM',t.id)
        )
      )
  )
  select r.id,r.name,r.province_abbr,r.region
  from registered r
  where coalesce(trim(p_query),'')=''
     or r.name ilike '%'||trim(p_query)||'%'
     or coalesce(r.province_abbr,'') ilike '%'||trim(p_query)||'%'
     or coalesce(r.region,'') ilike '%'||trim(p_query)||'%'
  order by r.name
  limit greatest(1,least(coalesce(p_limit,8),20));
$function$;

CREATE OR REPLACE FUNCTION public.ips_role_management_grants()
 RETURNS TABLE(id uuid, user_id uuid, display_name text, email text, role ips_role, scope_type ips_scope_type, city_id uuid, club_id uuid, team_id uuid, tournament_id uuid, match_id uuid, player_id uuid, note text, starts_at timestamp with time zone, ends_at timestamp with time zone, created_at timestamp with time zone, scope_label text, can_revoke boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  select
    rg.id,rg.user_id,coalesce(pr.display_name,pr.full_name,pr.email,'IPS account') as display_name,
    pr.email,rg.role,rg.scope_type,rg.city_id,rg.club_id,rg.team_id,rg.tournament_id,rg.match_id,rg.player_id,
    rg.note,rg.starts_at,rg.ends_at,rg.created_at,
    case
      when rg.scope_type='GLOBAL' then 'All Italy'
      when rg.scope_type='CITY' then coalesce(ci.name,'City')
      when rg.scope_type='CLUB' then regexp_replace(coalesce(c.name,'Team'),'[[:space:]]+Cricket Club$','','i')
      when rg.scope_type='TEAM' then coalesce(t.name,'Competitive side')
      when rg.scope_type='TOURNAMENT' then coalesce(tr.name,'Tournament')
      when rg.scope_type='MATCH' then coalesce(m.match_code,'Match')
      when rg.scope_type='PLAYER' then coalesce(p.display_name,'Player')
      else rg.scope_type::text
    end as scope_label,
    public.ips_can_delegate_role(
      rg.role,
      rg.scope_type,
      case rg.scope_type
        when 'CITY' then rg.city_id
        when 'CLUB' then rg.club_id
        when 'TEAM' then rg.team_id
        when 'TOURNAMENT' then rg.tournament_id
        when 'MATCH' then rg.match_id
        when 'PLAYER' then rg.player_id
        else null
      end
    ) as can_revoke
  from public.role_grants rg
  left join public.profiles pr on pr.id=rg.user_id
  left join public.cities ci on ci.id=rg.city_id
  left join public.clubs c on c.id=rg.club_id
  left join public.teams t on t.id=rg.team_id
  left join public.tournaments tr on tr.id=rg.tournament_id
  left join public.matches m on m.id=rg.match_id
  left join public.players p on p.id=rg.player_id
  where public.ips_role_grant_is_active(rg)
    and public.ips_role_grant_visible(
      rg.user_id,
      rg.role,
      rg.scope_type,
      case rg.scope_type
        when 'CITY' then rg.city_id
        when 'CLUB' then rg.club_id
        when 'TEAM' then rg.team_id
        when 'TOURNAMENT' then rg.tournament_id
        when 'MATCH' then rg.match_id
        when 'PLAYER' then rg.player_id
        else null
      end
    )
  order by rg.created_at desc;
$function$;

CREATE OR REPLACE FUNCTION public.ips_role_management_search(p_query text DEFAULT NULL::text, p_city_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 16)
 RETURNS TABLE(id uuid, display_name text, email text, status ips_entity_status, linked_player_id uuid, player_display_name text, ips_code text, primary_role text, city_id uuid, city_name text, province_abbr text, region text, club_id uuid, club_name text, team_id uuid, team_name text, side_label text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  select
    pr.id,
    coalesce(pr.display_name,pr.full_name,pr.email,'IPS account') as display_name,
    pr.email,
    pr.status,
    p.id as linked_player_id,
    p.display_name as player_display_name,
    p.ips_code,
    p.primary_role,
    coalesce(cur.city_id,pr.city_id) as city_id,
    ci.name as city_name,
    ci.province_abbr,
    ci.region,
    cur.club_id,
    case when cur.club_name is null then null else regexp_replace(cur.club_name,'[[:space:]]+Cricket Club$','','i') end as club_name,
    cur.team_id,
    cur.team_name,
    cur.side_label
  from public.profiles pr
  left join public.players p on p.id=pr.linked_player_id
  left join lateral (
    select
      tm.team_id,t.name as team_name,t.side_label,
      c.id as club_id,c.name as club_name,c.city_id
    from public.team_memberships tm
    join public.teams t on t.id=tm.team_id
    join public.clubs c on c.id=t.club_id
    where tm.player_id=p.id
      and tm.status='ACTIVE'
      and tm.end_on is null
    order by tm.is_primary desc,tm.start_on desc
    limit 1
  ) cur on true
  left join public.cities ci on ci.id=coalesce(cur.city_id,pr.city_id)
  where pr.status='ACTIVE'
    and (
      public.ips_is_owner()
      or public.ips_has_role('ADMIN','GLOBAL',null)
      or (coalesce(cur.city_id,pr.city_id) is not null and public.ips_has_role('ADMIN','CITY',coalesce(cur.city_id,pr.city_id)))
      or (cur.club_id is not null and public.ips_has_role('ADMIN','CLUB',cur.club_id))
      or (cur.team_id is not null and public.ips_has_role('ADMIN','TEAM',cur.team_id))
    )
    and (p_city_id is null or coalesce(cur.city_id,pr.city_id)=p_city_id)
    and (
      coalesce(trim(p_query),'')=''
      or coalesce(pr.display_name,'') ilike '%'||trim(p_query)||'%'
      or coalesce(pr.full_name,'') ilike '%'||trim(p_query)||'%'
      or coalesce(pr.email,'') ilike '%'||trim(p_query)||'%'
      or coalesce(pr.phone,'') ilike '%'||trim(p_query)||'%'
      or coalesce(p.display_name,'') ilike '%'||trim(p_query)||'%'
      or coalesce(p.ips_code,'') ilike '%'||trim(p_query)||'%'
      or coalesce(cur.club_name,'') ilike '%'||trim(p_query)||'%'
      or coalesce(cur.team_name,'') ilike '%'||trim(p_query)||'%'
      or coalesce(ci.name,'') ilike '%'||trim(p_query)||'%'
    )
  order by
    case when p.ips_code=trim(p_query) then 0 else 1 end,
    coalesce(pr.display_name,pr.full_name,pr.email)
  limit greatest(1,least(coalesce(p_limit,16),24));
$function$;

CREATE OR REPLACE FUNCTION public.ips_role_scope_city(p_scope_type ips_scope_type, p_scope_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_city uuid;
begin
  if p_scope_type='CITY' then return p_scope_id; end if;

  if p_scope_type='CLUB' then
    select c.city_id into v_city from public.clubs c where c.id=p_scope_id;
    return v_city;
  end if;

  if p_scope_type='TEAM' then
    select c.city_id into v_city
    from public.teams t join public.clubs c on c.id=t.club_id
    where t.id=p_scope_id;
    return v_city;
  end if;

  if p_scope_type='TOURNAMENT' then
    select tr.city_id into v_city from public.tournaments tr where tr.id=p_scope_id;
    return v_city;
  end if;

  if p_scope_type='MATCH' then
    select tr.city_id into v_city
    from public.matches m join public.tournaments tr on tr.id=m.tournament_id
    where m.id=p_scope_id;
    return v_city;
  end if;

  if p_scope_type='PLAYER' then
    select c.city_id into v_city
    from public.team_memberships tm
    join public.teams t on t.id=tm.team_id
    join public.clubs c on c.id=t.club_id
    where tm.player_id=p_scope_id
      and tm.status='ACTIVE'
      and tm.end_on is null
    order by tm.is_primary desc,tm.start_on desc
    limit 1;
    return v_city;
  end if;

  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.ips_role_scope_club(p_scope_type ips_scope_type, p_scope_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_club uuid;
begin
  if p_scope_type='CLUB' then return p_scope_id; end if;

  if p_scope_type='TEAM' then
    select t.club_id into v_club from public.teams t where t.id=p_scope_id;
    return v_club;
  end if;

  if p_scope_type='PLAYER' then
    select t.club_id into v_club
    from public.team_memberships tm
    join public.teams t on t.id=tm.team_id
    where tm.player_id=p_scope_id
      and tm.status='ACTIVE'
      and tm.end_on is null
    order by tm.is_primary desc,tm.start_on desc
    limit 1;
    return v_club;
  end if;

  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.ips_role_scope_team(p_scope_type ips_scope_type, p_scope_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_team uuid;
begin
  if p_scope_type='TEAM' then return p_scope_id; end if;

  if p_scope_type='PLAYER' then
    select tm.team_id into v_team
    from public.team_memberships tm
    where tm.player_id=p_scope_id
      and tm.status='ACTIVE'
      and tm.end_on is null
    order by tm.is_primary desc,tm.start_on desc
    limit 1;
    return v_team;
  end if;

  return null;
end;
$function$;


revoke all on function public.ips_role_scope_city(public.ips_scope_type,uuid) from public,anon;
revoke all on function public.ips_role_scope_club(public.ips_scope_type,uuid) from public,anon;
revoke all on function public.ips_role_scope_team(public.ips_scope_type,uuid) from public,anon;
revoke all on function public.ips_can_delegate_role(public.ips_role,public.ips_scope_type,uuid) from public,anon;
revoke all on function public.ips_role_grant_visible(uuid,public.ips_role,public.ips_scope_type,uuid) from public,anon;
revoke all on function public.ips_role_management_grants() from public,anon;
revoke all on function public.ips_role_management_cities(text,integer) from public,anon;
revoke all on function public.ips_role_management_search(text,uuid,integer) from public,anon;
revoke all on function public.ips_create_role_grant(uuid,public.ips_role,public.ips_scope_type,uuid,text) from public,anon;
revoke all on function public.ips_revoke_role_grant(uuid) from public,anon;

grant execute on function public.ips_role_scope_city(public.ips_scope_type,uuid) to authenticated;
grant execute on function public.ips_role_scope_club(public.ips_scope_type,uuid) to authenticated;
grant execute on function public.ips_role_scope_team(public.ips_scope_type,uuid) to authenticated;
grant execute on function public.ips_can_delegate_role(public.ips_role,public.ips_scope_type,uuid) to authenticated;
grant execute on function public.ips_role_grant_visible(uuid,public.ips_role,public.ips_scope_type,uuid) to authenticated;
grant execute on function public.ips_role_management_grants() to authenticated;
grant execute on function public.ips_role_management_cities(text,integer) to authenticated;
grant execute on function public.ips_role_management_search(text,uuid,integer) to authenticated;
grant execute on function public.ips_create_role_grant(uuid,public.ips_role,public.ips_scope_type,uuid,text) to authenticated;
grant execute on function public.ips_revoke_role_grant(uuid) to authenticated;

notify pgrst,'reload schema';

commit;
