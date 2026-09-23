-- IPS Project 5.5 — public Team identity + optional A/B/C competitive sides.
-- Technical compatibility note:
--   public.clubs remains the persisted top-level identity table for this migration cycle.
--   public.teams remains the persisted competitive-side table used by fixtures and squads.
-- The product/UI no longer exposes a "Club" concept.

begin;

alter table public.teams
  add column if not exists side_label text not null default 'MAIN',
  add column if not exists side_order smallint not null default 1;

update public.teams
set side_label = case
  when name ~* ' [A-Z]$' then upper(right(name,1))
  else 'MAIN'
end
where side_label is null or trim(side_label)='' or side_label='MAIN';

with ranked as (
  select id, row_number() over(partition by club_id order by name,id)::smallint as rn
  from public.teams
)
update public.teams t
set side_order=r.rn
from ranked r
where r.id=t.id;

-- ADMIN can now be scoped to the top-level Team identity (stored in club_id)
-- as well as to an individual competitive side (stored in team_id).
alter table public.role_grants
  drop constraint if exists role_scope_allowed;

alter table public.role_grants
  add constraint role_scope_allowed check (
    (role='OWNER' and scope_type='GLOBAL')
    or (role='ADMIN' and scope_type in ('GLOBAL','CITY','CLUB','TEAM','TOURNAMENT'))
    or (role='LEADER' and scope_type in ('CLUB','TEAM'))
    or (role='SCORER' and scope_type='MATCH')
    or (role='PLAYER' and scope_type='PLAYER')
  );

create or replace function public.ips_can_manage_club(p_club_id uuid)
returns boolean
language sql stable security definer
set search_path=public,auth as $$
  select public.ips_is_owner()
    or public.ips_has_role('ADMIN','GLOBAL',null)
    or public.ips_has_role('ADMIN','CLUB',p_club_id)
    or public.ips_has_role('LEADER','CLUB',p_club_id)
    or exists (
      select 1 from public.clubs c
      where c.id=p_club_id
        and public.ips_has_role('ADMIN','CITY',c.city_id)
    );
$$;

create or replace function public.ips_can_manage_team(p_team_id uuid)
returns boolean
language sql stable security definer
set search_path=public,auth as $$
  select public.ips_is_owner()
    or public.ips_has_role('ADMIN','GLOBAL',null)
    or public.ips_has_role('ADMIN','TEAM',p_team_id)
    or public.ips_has_role('LEADER','TEAM',p_team_id)
    or exists (
      select 1
      from public.teams tm
      join public.clubs c on c.id=tm.club_id
      where tm.id=p_team_id
        and (
          public.ips_has_role('ADMIN','CITY',c.city_id)
          or public.ips_has_role('ADMIN','CLUB',c.id)
          or public.ips_has_role('LEADER','CLUB',c.id)
        )
    );
$$;

create or replace function public.ips_create_team_identity(
  p_city_id uuid,
  p_name text,
  p_short_name text default null,
  p_category text default 'OPEN',
  p_structure text default 'SINGLE'
)
returns public.clubs
language plpgsql security definer
set search_path=public,auth as $$
declare
  v_identity public.clubs;
  v_slug text;
  v_structure text;
  v_short text;
begin
  if not public.ips_can_create_club(p_city_id) then
    raise exception 'Not authorised to create a team in this city.';
  end if;
  if coalesce(trim(p_name),'')='' then raise exception 'Team name is required.'; end if;

  v_structure := upper(coalesce(nullif(trim(p_structure),''),'SINGLE'));
  if v_structure not in ('SINGLE','A_B','A_B_C') then raise exception 'Unsupported team structure.'; end if;

  v_slug := public.ips_slug_base(p_name);
  if v_slug='' then raise exception 'Team name must contain letters or numbers.'; end if;
  v_short := nullif(trim(p_short_name),'');

  insert into public.clubs(city_id,name,short_name,slug,status)
  values(p_city_id,trim(p_name),v_short,v_slug,'ACTIVE')
  returning * into v_identity;

  if v_structure='SINGLE' then
    insert into public.teams(club_id,name,short_name,slug,category,status,side_label,side_order)
    values(v_identity.id,trim(p_name),v_short,v_slug||'-main',coalesce(nullif(trim(p_category),''),'OPEN'),'ACTIVE','MAIN',1);
  elsif v_structure='A_B' then
    insert into public.teams(club_id,name,short_name,slug,category,status,side_label,side_order)
    values
      (v_identity.id,trim(p_name)||' A',case when v_short is null then null else v_short||' A' end,v_slug||'-a',coalesce(nullif(trim(p_category),''),'OPEN'),'ACTIVE','A',1),
      (v_identity.id,trim(p_name)||' B',case when v_short is null then null else v_short||' B' end,v_slug||'-b',coalesce(nullif(trim(p_category),''),'OPEN'),'ACTIVE','B',2);
  else
    insert into public.teams(club_id,name,short_name,slug,category,status,side_label,side_order)
    values
      (v_identity.id,trim(p_name)||' A',case when v_short is null then null else v_short||' A' end,v_slug||'-a',coalesce(nullif(trim(p_category),''),'OPEN'),'ACTIVE','A',1),
      (v_identity.id,trim(p_name)||' B',case when v_short is null then null else v_short||' B' end,v_slug||'-b',coalesce(nullif(trim(p_category),''),'OPEN'),'ACTIVE','B',2),
      (v_identity.id,trim(p_name)||' C',case when v_short is null then null else v_short||' C' end,v_slug||'-c',coalesce(nullif(trim(p_category),''),'OPEN'),'ACTIVE','C',3);
  end if;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(auth.uid(),'TEAM_IDENTITY_CREATED','TEAM_IDENTITY',v_identity.id,jsonb_build_object('structure',v_structure,'city_id',p_city_id));

  return v_identity;
end $$;

create or replace function public.ips_add_team_side(
  p_team_identity_id uuid,
  p_side_label text,
  p_category text default 'OPEN'
)
returns public.teams
language plpgsql security definer
set search_path=public,auth as $$
declare
  v_parent public.clubs;
  v_side public.teams;
  v_label text;
  v_slug text;
  v_order smallint;
begin
  if not public.ips_can_manage_club(p_team_identity_id) then raise exception 'Not authorised to manage this team.'; end if;
  select * into v_parent from public.clubs where id=p_team_identity_id and status='ACTIVE';
  if not found then raise exception 'Team identity not found.'; end if;

  v_label := upper(coalesce(nullif(trim(p_side_label),''),''));
  if v_label !~ '^[A-Z0-9]{1,8}$' then raise exception 'Side label must be a short value such as A, B or C.'; end if;
  if exists(select 1 from public.teams where club_id=p_team_identity_id and upper(side_label)=v_label and status='ACTIVE') then
    raise exception 'That side already exists for this team.';
  end if;

  select coalesce(max(side_order),0)+1 into v_order from public.teams where club_id=p_team_identity_id;
  v_slug := v_parent.slug||'-'||lower(v_label);

  insert into public.teams(club_id,name,short_name,slug,category,status,side_label,side_order)
  values(
    v_parent.id,
    v_parent.name||' '||v_label,
    case when v_parent.short_name is null then null else v_parent.short_name||' '||v_label end,
    v_slug,
    coalesce(nullif(trim(p_category),''),'OPEN'),
    'ACTIVE',
    v_label,
    v_order
  )
  returning * into v_side;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(auth.uid(),'TEAM_SIDE_CREATED','TEAM_SIDE',v_side.id,jsonb_build_object('team_identity_id',v_parent.id,'side_label',v_label));

  return v_side;
end $$;

create or replace function public.ips_update_team_identity(
  p_team_identity_id uuid,
  p_name text,
  p_short_name text default null,
  p_founded_year smallint default null,
  p_website_url text default null,
  p_description text default null
)
returns public.clubs
language plpgsql security definer
set search_path=public,auth as $$
declare v public.clubs;
begin
  if not public.ips_can_manage_club(p_team_identity_id) then raise exception 'Not authorised to edit this team.'; end if;
  if coalesce(trim(p_name),'')='' then raise exception 'Team name is required.'; end if;

  update public.clubs
  set name=trim(p_name),
      short_name=nullif(trim(p_short_name),''),
      founded_year=p_founded_year,
      website_url=nullif(trim(p_website_url),''),
      description=nullif(trim(p_description),''),
      updated_at=now()
  where id=p_team_identity_id
  returning * into v;

  if not found then raise exception 'Team identity not found.'; end if;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(auth.uid(),'TEAM_IDENTITY_UPDATED','TEAM_IDENTITY',v.id,jsonb_build_object('name',v.name));

  return v;
end $$;

create or replace function public.ips_delete_team_identity(p_team_identity_id uuid)
returns void
language plpgsql security definer
set search_path=public,auth as $$
declare
  v_name text;
begin
  if not public.ips_can_global_registry_delete() then
    raise exception 'Only a GLOBAL OWNER or GLOBAL ADMIN can delete a team.';
  end if;

  select name into v_name from public.clubs where id=p_team_identity_id;
  if not found then raise exception 'Team not found.'; end if;

  if exists(
      select 1 from public.tournament_teams tt
      join public.teams t on t.id=tt.team_id
      where t.club_id=p_team_identity_id
    )
    or exists(
      select 1 from public.match_playing_xi px
      join public.teams t on t.id=px.team_id
      where t.club_id=p_team_identity_id
    )
    or exists(
      select 1 from public.match_team_roles mr
      join public.teams t on t.id=mr.team_id
      where t.club_id=p_team_identity_id
    ) then
    raise exception 'This team already has competition or match history and cannot be permanently deleted.';
  end if;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(auth.uid(),'TEAM_IDENTITY_DELETED','TEAM_IDENTITY',p_team_identity_id,jsonb_build_object('name',v_name));

  delete from public.team_memberships tm
  using public.teams t
  where tm.team_id=t.id and t.club_id=p_team_identity_id;

  delete from public.teams where club_id=p_team_identity_id;
  delete from public.clubs where id=p_team_identity_id;
end $$;

create or replace function public.ips_registry_players(p_query text default null)
returns table(
  id uuid, ips_code text, display_name text, primary_role text, profile_image_url text, status public.ips_entity_status,
  team_id uuid, team_name text, club_id uuid, club_name text, city_id uuid, city_name text, has_account boolean
)
language sql stable security definer
set search_path=public,auth as $$
  select p.id,p.ips_code,p.display_name,p.primary_role,p.profile_image_url,p.status,
    cur.team_id,cur.team_name,cur.club_id,cur.club_name,cur.city_id,cur.city_name,
    exists(select 1 from public.profiles pr where pr.linked_player_id=p.id) as has_account
  from public.players p
  left join lateral (
    select tm.team_id,t.name team_name,c.id club_id,c.name club_name,ci.id city_id,ci.name city_name
    from public.team_memberships tm
    join public.teams t on t.id=tm.team_id
    join public.clubs c on c.id=t.club_id
    join public.cities ci on ci.id=c.city_id
    where tm.player_id=p.id and tm.status='ACTIVE' and tm.end_on is null
    order by tm.is_primary desc,tm.start_on desc limit 1
  ) cur on true
  where p.status='ACTIVE'
    and (coalesce(trim(p_query),'')='' or p.display_name ilike '%'||trim(p_query)||'%' or p.ips_code ilike '%'||trim(p_query)||'%')
    and (
      public.ips_is_owner()
      or public.ips_has_role('ADMIN','GLOBAL',null)
      or (cur.city_id is not null and public.ips_has_role('ADMIN','CITY',cur.city_id))
      or (cur.club_id is not null and public.ips_has_role('ADMIN','CLUB',cur.club_id))
      or (cur.club_id is not null and public.ips_has_role('LEADER','CLUB',cur.club_id))
      or (cur.team_id is not null and public.ips_has_role('ADMIN','TEAM',cur.team_id))
      or (cur.team_id is not null and public.ips_has_role('LEADER','TEAM',cur.team_id))
    )
  order by p.display_name;
$$;

revoke all on function public.ips_create_team_identity(uuid,text,text,text,text) from public,anon;
grant execute on function public.ips_create_team_identity(uuid,text,text,text,text) to authenticated;

revoke all on function public.ips_add_team_side(uuid,text,text) from public,anon;
grant execute on function public.ips_add_team_side(uuid,text,text) to authenticated;

revoke all on function public.ips_update_team_identity(uuid,text,text,smallint,text,text) from public,anon;
grant execute on function public.ips_update_team_identity(uuid,text,text,smallint,text,text) to authenticated;

revoke all on function public.ips_delete_team_identity(uuid) from public,anon;
grant execute on function public.ips_delete_team_identity(uuid) to authenticated;

notify pgrst,'reload schema';

commit;
