-- IPS Project 6.16 — ranking eligibility + transparent ranking engine v1.
begin;

alter table public.matches
  add column if not exists match_classification text not null default 'RANKING',
  add column if not exists ranking_eligible boolean not null default true;

alter table public.matches
  drop constraint if exists matches_match_classification_check;

alter table public.matches
  add constraint matches_match_classification_check
  check (match_classification in ('RANKING','FRIENDLY','PRACTICE'));

alter table public.player_match_stats
  add column if not exists ranking_eligible boolean not null default true;

create table if not exists public.ranking_formula_versions (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique,
  name text not null,
  active boolean not null default false,
  runs_weight numeric(8,3) not null default 1,
  four_bonus numeric(8,3) not null default 1,
  six_bonus numeric(8,3) not null default 2,
  fifty_bonus numeric(8,3) not null default 20,
  hundred_bonus numeric(8,3) not null default 50,
  wicket_weight numeric(8,3) not null default 25,
  three_wicket_bonus numeric(8,3) not null default 20,
  five_wicket_bonus numeric(8,3) not null default 50,
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now())
);

insert into public.ranking_formula_versions(
  version,name,active,runs_weight,four_bonus,six_bonus,fifty_bonus,hundred_bonus,wicket_weight,three_wicket_bonus,five_wicket_bonus
)
values(1,'IPS Ranking Formula v1',true,1,1,2,20,50,25,20,50)
on conflict(version) do update set active=true;

update public.ranking_formula_versions set active=false where version<>1;

alter table public.ranking_formula_versions enable row level security;
drop policy if exists "ranking formula public read" on public.ranking_formula_versions;
create policy "ranking formula public read"
on public.ranking_formula_versions for select to anon,authenticated
using (active or public.ips_is_owner() or public.ips_has_role('ADMIN','GLOBAL',null));
grant select on public.ranking_formula_versions to anon,authenticated;

create or replace function public.ips_archive_match(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_match public.matches;
  v_tournament public.tournaments;
  v_card jsonb;
  v_result text;
  v_completed_at timestamptz;
  v_official boolean;
begin
  select * into v_match from public.matches where id=p_match_id;
  if not found then raise exception 'Match not found.'; end if;

  if v_match.status::text not in ('COMPLETED','AWAITING_CERTIFICATION','OFFICIAL','LOCKED') then
    return;
  end if;

  select * into v_tournament from public.tournaments where id=v_match.tournament_id;
  v_card:=public.ips_public_match_scorecard(p_match_id);
  v_result:=nullif(v_card->>'result_text','');
  v_official:=v_match.status::text in ('OFFICIAL','LOCKED');

  select max(completed_at) into v_completed_at
  from public.match_innings
  where match_id=p_match_id;

  insert into public.match_archives(
    match_id,tournament_id,competition_kind,match_code,match_status,
    result_text,snapshot,completed_at,certified_at,archived_at,updated_at
  )
  values(
    v_match.id,v_match.tournament_id,coalesce(v_tournament.competition_kind,'TOURNAMENT'),
    v_match.match_code,v_match.status::text,v_result,
    coalesce(v_card,'{}'::jsonb) || jsonb_build_object(
      'match_classification',v_match.match_classification,
      'ranking_eligible',v_match.ranking_eligible
    ),
    coalesce(v_completed_at,timezone('utc',now())),
    case when v_official then timezone('utc',now()) else null end,
    timezone('utc',now()),timezone('utc',now())
  )
  on conflict(match_id) do update set
    tournament_id=excluded.tournament_id,
    competition_kind=excluded.competition_kind,
    match_code=excluded.match_code,
    match_status=excluded.match_status,
    result_text=excluded.result_text,
    snapshot=excluded.snapshot,
    completed_at=coalesce(public.match_archives.completed_at,excluded.completed_at),
    certified_at=case
      when v_official then coalesce(public.match_archives.certified_at,timezone('utc',now()))
      else public.match_archives.certified_at
    end,
    updated_at=timezone('utc',now());

  with active as (
    select e.*
    from public.match_scoring_events e
    where e.match_id=p_match_id
      and e.event_type='DELIVERY'
      and not exists (
        select 1 from public.match_scoring_events r
        where r.event_type='REVERSAL' and r.reverses_event_id=e.id
      )
  ),
  facts as (
    select
      px.player_id,
      px.team_id,
      coalesce(sum(a.runs_off_bat) filter (where a.striker_id=px.player_id),0)::integer as runs,
      coalesce(count(*) filter (where a.striker_id=px.player_id and a.legal_delivery),0)::integer as balls,
      coalesce(count(*) filter (where a.striker_id=px.player_id and a.runs_off_bat=4),0)::integer as fours,
      coalesce(count(*) filter (where a.striker_id=px.player_id and a.runs_off_bat=6),0)::integer as sixes,
      coalesce(count(*) filter (
        where a.bowler_id=px.player_id
          and a.is_wicket
          and a.wicket_kind in ('BOWLED','CAUGHT','HIT_WICKET')
      ),0)::integer as wickets,
      coalesce(sum(a.runs_off_bat+a.wide_runs+a.no_ball_runs) filter (where a.bowler_id=px.player_id),0)::integer as bowling_runs,
      coalesce(count(*) filter (where a.bowler_id=px.player_id and a.legal_delivery),0)::integer as bowling_balls
    from public.match_playing_xi px
    left join active a on a.match_id=px.match_id
    where px.match_id=p_match_id
    group by px.player_id,px.team_id
  )
  insert into public.player_match_stats(
    match_id,player_id,team_id,overs_format,runs,balls,fours,sixes,
    wickets,bowling_runs,bowling_balls,is_official,ranking_eligible,archived_at,updated_at
  )
  select
    p_match_id,f.player_id,f.team_id,v_match.format_overs_per_innings,
    f.runs,f.balls,f.fours,f.sixes,f.wickets,f.bowling_runs,f.bowling_balls,
    v_official,v_match.ranking_eligible,timezone('utc',now()),timezone('utc',now())
  from facts f
  on conflict(match_id,player_id) do update set
    team_id=excluded.team_id,
    overs_format=excluded.overs_format,
    runs=excluded.runs,
    balls=excluded.balls,
    fours=excluded.fours,
    sixes=excluded.sixes,
    wickets=excluded.wickets,
    bowling_runs=excluded.bowling_runs,
    bowling_balls=excluded.bowling_balls,
    is_official=excluded.is_official,
    ranking_eligible=excluded.ranking_eligible,
    updated_at=timezone('utc',now());
end
$$;

create or replace function public.ips_public_player_rankings(p_overs smallint default null)
returns table(
  player_id uuid,
  ips_code text,
  slug text,
  display_name text,
  profile_image_url text,
  team_id uuid,
  team_name text,
  team_short_name text,
  city_id uuid,
  city_name text,
  matches integer,
  runs integer,
  balls integer,
  fours integer,
  sixes integer,
  wickets integer,
  bowling_runs integer,
  bowling_balls integer,
  strike_rate numeric,
  economy numeric,
  fifties integer,
  hundreds integer,
  three_wicket_hauls integer,
  five_wicket_hauls integer,
  best_bowling_wickets integer,
  best_bowling_runs integer,
  batting_points numeric,
  bowling_points numeric,
  all_rounder_points numeric
)
language sql
stable
security definer
set search_path=public
as $$
with formula as (
  select *
  from public.ranking_formula_versions
  where active
  order by version desc
  limit 1
),
eligible as (
  select s.*
  from public.player_match_stats s
  where s.is_official
    and s.ranking_eligible
    and (p_overs is null or s.overs_format=p_overs)
),
agg as (
  select
    s.player_id,
    count(*)::integer as matches,
    sum(s.runs)::integer as runs,
    sum(s.balls)::integer as balls,
    sum(s.fours)::integer as fours,
    sum(s.sixes)::integer as sixes,
    sum(s.wickets)::integer as wickets,
    sum(s.bowling_runs)::integer as bowling_runs,
    sum(s.bowling_balls)::integer as bowling_balls,
    count(*) filter(where s.runs between 50 and 99)::integer as fifties,
    count(*) filter(where s.runs>=100)::integer as hundreds,
    count(*) filter(where s.wickets>=3)::integer as three_wicket_hauls,
    count(*) filter(where s.wickets>=5)::integer as five_wicket_hauls
  from eligible s
  group by s.player_id
),
best_bowling as (
  select distinct on(player_id)
    player_id,
    wickets as best_wickets,
    bowling_runs as best_runs
  from eligible
  where bowling_balls>0
  order by player_id,wickets desc,bowling_runs asc
),
current_team as (
  select distinct on(tm.player_id)
    tm.player_id,tm.team_id,t.name,t.short_name,c.city_id,ci.name as city_name
  from public.team_memberships tm
  join public.teams t on t.id=tm.team_id
  join public.clubs c on c.id=t.club_id
  left join public.cities ci on ci.id=c.city_id
  where tm.status='ACTIVE' and tm.end_on is null
  order by tm.player_id,tm.start_on desc,tm.created_at desc
)
select
  p.id,
  p.ips_code,
  p.slug,
  p.display_name,
  p.profile_image_url,
  ct.team_id,
  ct.name,
  ct.short_name,
  ct.city_id,
  ct.city_name,
  a.matches,
  a.runs,
  a.balls,
  a.fours,
  a.sixes,
  a.wickets,
  a.bowling_runs,
  a.bowling_balls,
  case when a.balls>0 then round((a.runs::numeric*100)/a.balls,2) else 0 end,
  case when a.bowling_balls>0 then round((a.bowling_runs::numeric*6)/a.bowling_balls,2) else 0 end,
  a.fifties,
  a.hundreds,
  a.three_wicket_hauls,
  a.five_wicket_hauls,
  coalesce(bb.best_wickets,0),
  coalesce(bb.best_runs,0),
  round(
    a.runs*f.runs_weight +
    a.fours*f.four_bonus +
    a.sixes*f.six_bonus +
    a.fifties*f.fifty_bonus +
    a.hundreds*f.hundred_bonus
  ,2),
  round(
    a.wickets*f.wicket_weight +
    a.three_wicket_hauls*f.three_wicket_bonus +
    a.five_wicket_hauls*f.five_wicket_bonus
  ,2),
  round(
    a.runs*f.runs_weight +
    a.fours*f.four_bonus +
    a.sixes*f.six_bonus +
    a.fifties*f.fifty_bonus +
    a.hundreds*f.hundred_bonus +
    a.wickets*f.wicket_weight +
    a.three_wicket_hauls*f.three_wicket_bonus +
    a.five_wicket_hauls*f.five_wicket_bonus
  ,2)
from agg a
join public.players p on p.id=a.player_id
cross join formula f
left join best_bowling bb on bb.player_id=a.player_id
left join current_team ct on ct.player_id=a.player_id
order by a.runs desc,p.display_name;
$$;

revoke all on function public.ips_public_player_rankings(smallint) from public;
grant execute on function public.ips_public_player_rankings(smallint) to anon,authenticated,service_role;

create or replace function public.ips_public_ranking_formats()
returns table(overs_format smallint)
language sql
stable
security definer
set search_path=public
as $$
  select distinct s.overs_format
  from public.player_match_stats s
  where s.is_official and s.ranking_eligible
  order by 1;
$$;

revoke all on function public.ips_public_ranking_formats() from public;
grant execute on function public.ips_public_ranking_formats() to anon,authenticated,service_role;

-- Existing Quick Matches were created before classification existed.
-- Keep them ranking-capable by default; admins still control certification.
update public.matches
set match_classification='RANKING',ranking_eligible=true
where match_classification is null or ranking_eligible is null;

-- Refresh archived player facts with ranking eligibility metadata.
do $$
declare r record;
begin
  for r in
    select id from public.matches
    where status::text in ('COMPLETED','AWAITING_CERTIFICATION','OFFICIAL','LOCKED')
  loop
    perform public.ips_archive_match(r.id);
  end loop;
end $$;

notify pgrst,'reload schema';

commit;
