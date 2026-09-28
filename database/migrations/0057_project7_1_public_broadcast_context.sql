-- IPS Project 7.1 — public-safe broadcast presentation context.
-- Exposes only match/team/player presentation data needed by browser-source graphics.

begin;

create or replace function public.ips_public_broadcast_context(p_match_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
with match_row as (
  select
    m.*,
    t.id as tournament_id,
    t.name as tournament_name,
    t.code as tournament_code,
    t.format_label,
    t.status as tournament_status,
    c.name as city_name,
    v.name as venue_name,
    v.address_text as venue_address,
    h.id as home_id,
    h.name as home_name,
    h.short_name as home_short,
    h.logo_url as home_logo,
    a.id as away_id,
    a.name as away_name,
    a.short_name as away_short,
    a.logo_url as away_logo
  from public.matches m
  join public.tournaments t on t.id=m.tournament_id
  join public.cities c on c.id=t.city_id
  join public.teams h on h.id=m.home_team_id
  join public.teams a on a.id=m.away_team_id
  left join public.venues v on v.id=m.venue_id
  where m.id=p_match_id
    and (
      t.status::text<>'DRAFT'
      or m.status::text in ('READY','LIVE','COMPLETED','AWAITING_CERTIFICATION','OFFICIAL','LOCKED')
    )
    and m.status::text<>'CANCELLED'
),
home_players as (
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'player_id',p.id,
      'name',p.display_name,
      'ips_code',p.ips_code,
      'profile_image_url',p.profile_image_url,
      'batting_style',p.batting_style,
      'bowling_style',p.bowling_style,
      'primary_role',p.primary_role,
      'order',xi.lineup_order,
      'captain',exists(
        select 1 from public.match_team_roles r
        where r.match_id=xi.match_id and r.team_id=xi.team_id and r.player_id=p.id and r.role::text='CAPTAIN'
      ),
      'wicketkeeper',exists(
        select 1 from public.match_team_roles r
        where r.match_id=xi.match_id and r.team_id=xi.team_id and r.player_id=p.id and r.role::text='WICKETKEEPER'
      )
    )
    order by xi.lineup_order
  ),'[]'::jsonb) as players
  from match_row m
  left join public.match_playing_xi xi on xi.match_id=m.id and xi.team_id=m.home_id
  left join public.players p on p.id=xi.player_id
  where p.id is not null
),
away_players as (
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'player_id',p.id,
      'name',p.display_name,
      'ips_code',p.ips_code,
      'profile_image_url',p.profile_image_url,
      'batting_style',p.batting_style,
      'bowling_style',p.bowling_style,
      'primary_role',p.primary_role,
      'order',xi.lineup_order,
      'captain',exists(
        select 1 from public.match_team_roles r
        where r.match_id=xi.match_id and r.team_id=xi.team_id and r.player_id=p.id and r.role::text='CAPTAIN'
      ),
      'wicketkeeper',exists(
        select 1 from public.match_team_roles r
        where r.match_id=xi.match_id and r.team_id=xi.team_id and r.player_id=p.id and r.role::text='WICKETKEEPER'
      )
    )
    order by xi.lineup_order
  ),'[]'::jsonb) as players
  from match_row m
  left join public.match_playing_xi xi on xi.match_id=m.id and xi.team_id=m.away_id
  left join public.players p on p.id=xi.player_id
  where p.id is not null
),
officials as (
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'role',a.role,
      'designation',a.designation,
      'display_name',pr.display_name
    )
    order by a.role,a.designation
  ),'[]'::jsonb) as people
  from match_row m
  left join public.match_official_assignments a on a.match_id=m.id
  left join public.profiles pr on pr.id=a.user_id
  where a.id is not null
)
select jsonb_build_object(
  'match',jsonb_build_object(
    'id',m.id,
    'code',m.match_code,
    'number',m.match_number,
    'status',m.status,
    'scheduled_at',m.scheduled_at,
    'stage',m.stage,
    'round_label',m.round_label,
    'players_per_side',m.format_players_per_side,
    'overs_per_innings',m.format_overs_per_innings,
    'balls_per_over',m.format_balls_per_over
  ),
  'tournament',jsonb_build_object(
    'id',m.tournament_id,
    'name',m.tournament_name,
    'code',m.tournament_code,
    'format_label',m.format_label,
    'city',m.city_name
  ),
  'venue',case when m.venue_name is null then null else jsonb_build_object(
    'name',m.venue_name,
    'address',m.venue_address
  ) end,
  'home',jsonb_build_object(
    'team',jsonb_build_object('id',m.home_id,'name',m.home_name,'short_name',m.home_short,'logo_url',m.home_logo),
    'playing_side',(select players from home_players)
  ),
  'away',jsonb_build_object(
    'team',jsonb_build_object('id',m.away_id,'name',m.away_name,'short_name',m.away_short,'logo_url',m.away_logo),
    'playing_side',(select players from away_players)
  ),
  'officials',(select people from officials)
)
from match_row m;
$$;

revoke all on function public.ips_public_broadcast_context(uuid) from public;
grant execute on function public.ips_public_broadcast_context(uuid) to anon,authenticated,service_role;

notify pgrst,'reload schema';

commit;
