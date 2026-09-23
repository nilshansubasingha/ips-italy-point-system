-- IPS Project 5.7 — nationwide Italian municipality registry + active-city discovery.
-- Source data is loaded separately from current public municipality datasets.
-- Existing IPS city IDs/codes are preserved.

begin;

alter table public.cities
  drop constraint if exists cities_name_key;

alter table public.cities
  add column if not exists istat_code text,
  add column if not exists cadastral_code text,
  add column if not exists alternate_name text,
  add column if not exists province_name text,
  add column if not exists province_code text,
  add column if not exists province_abbr text,
  add column if not exists region_code text,
  add column if not exists source_updated_on date;

alter table public.cities
  add constraint cities_istat_code_unique unique (istat_code);

create index if not exists ix_cities_name_lower on public.cities(lower(name));
create index if not exists ix_cities_region_lower on public.cities(lower(region));
create index if not exists ix_cities_province_lower on public.cities(lower(province_name));
create index if not exists ix_cities_province_abbr on public.cities(province_abbr);
create index if not exists ix_cities_region_code on public.cities(region_code);

create or replace function public.ips_search_cities(
  p_query text default null,
  p_limit integer default 12,
  p_active_only boolean default false
)
returns table(
  id uuid,
  code text,
  name text,
  alternate_name text,
  region text,
  region_code text,
  province_name text,
  province_code text,
  province_abbr text,
  istat_code text,
  team_count bigint,
  player_count bigint,
  tournament_count bigint,
  fixture_count bigint
)
language sql stable security definer
set search_path=public,auth as $$
  with activity as (
    select
      c.id,
      (select count(*) from public.clubs cl where cl.city_id=c.id and cl.status='ACTIVE')::bigint as team_count,
      (
        select count(distinct tm.player_id)
        from public.team_memberships tm
        join public.teams s on s.id=tm.team_id
        join public.clubs cl on cl.id=s.club_id
        where cl.city_id=c.id and tm.status='ACTIVE' and tm.end_on is null
      )::bigint as player_count,
      (select count(*) from public.tournaments t where t.city_id=c.id and t.status<>'ARCHIVED')::bigint as tournament_count,
      (
        select count(*)
        from public.matches m
        join public.tournaments t on t.id=m.tournament_id
        where t.city_id=c.id
      )::bigint as fixture_count
    from public.cities c
    where c.status='ACTIVE'
  )
  select
    c.id,c.code,c.name,c.alternate_name,c.region,c.region_code,
    c.province_name,c.province_code,c.province_abbr,c.istat_code,
    a.team_count,a.player_count,a.tournament_count,a.fixture_count
  from public.cities c
  join activity a on a.id=c.id
  where c.status='ACTIVE'
    and (
      not p_active_only
      or (a.team_count+a.player_count+a.tournament_count+a.fixture_count)>0
    )
    and (
      coalesce(trim(p_query),'')=''
      or c.name ilike '%'||trim(p_query)||'%'
      or coalesce(c.alternate_name,'') ilike '%'||trim(p_query)||'%'
      or coalesce(c.province_name,'') ilike '%'||trim(p_query)||'%'
      or coalesce(c.province_abbr,'') ilike trim(p_query)||'%'
      or coalesce(c.region,'') ilike '%'||trim(p_query)||'%'
      or coalesce(c.istat_code,'') ilike trim(p_query)||'%'
    )
  order by
    case
      when coalesce(trim(p_query),'')<>'' and lower(c.name)=lower(trim(p_query)) then 0
      when coalesce(trim(p_query),'')<>'' and lower(c.name) like lower(trim(p_query))||'%' then 1
      when coalesce(trim(p_query),'')<>'' and lower(coalesce(c.alternate_name,'')) like lower(trim(p_query))||'%' then 2
      else 3
    end,
    case when p_active_only then -(a.team_count*100+a.player_count*5+a.tournament_count*20+a.fixture_count) else 0 end,
    c.name,
    c.province_abbr
  limit greatest(1,least(coalesce(p_limit,12),50));
$$;

create or replace function public.ips_active_cities(p_limit integer default 50)
returns table(
  id uuid,
  code text,
  name text,
  alternate_name text,
  region text,
  region_code text,
  province_name text,
  province_code text,
  province_abbr text,
  istat_code text,
  team_count bigint,
  player_count bigint,
  tournament_count bigint,
  fixture_count bigint,
  activity_score bigint
)
language sql stable security definer
set search_path=public,auth as $$
  select
    s.id,s.code,s.name,s.alternate_name,s.region,s.region_code,
    s.province_name,s.province_code,s.province_abbr,s.istat_code,
    s.team_count,s.player_count,s.tournament_count,s.fixture_count,
    (s.team_count*100+s.player_count*5+s.tournament_count*20+s.fixture_count)::bigint as activity_score
  from public.ips_search_cities(null,50,true) s
  order by activity_score desc,s.name
  limit greatest(1,least(coalesce(p_limit,50),50));
$$;

revoke all on function public.ips_search_cities(text,integer,boolean) from public;
grant execute on function public.ips_search_cities(text,integer,boolean) to anon,authenticated;

revoke all on function public.ips_active_cities(integer) from public;
grant execute on function public.ips_active_cities(integer) to anon,authenticated;

notify pgrst,'reload schema';

commit;
