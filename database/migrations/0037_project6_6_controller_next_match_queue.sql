-- IPS Project 6.6 — controller innings-break queue navigation.
begin;

create or replace function public.ips_controller_next_match(p_match_id uuid)
returns table(
  match_id uuid,
  match_code text,
  match_number integer,
  match_status public.ips_match_status,
  scheduled_at timestamptz,
  home_team_name text,
  away_team_name text
)
language sql
stable
security definer
set search_path=public,auth
as $$
  with current_match as (
    select id,tournament_id,match_number,scheduled_at
    from public.matches
    where id=p_match_id
      and public.ips_can_score_match(id)
  )
  select
    m.id,
    m.match_code,
    m.match_number,
    m.status,
    m.scheduled_at,
    ht.name,
    at.name
  from current_match cur
  join public.matches m on m.tournament_id=cur.tournament_id
  join public.teams ht on ht.id=m.home_team_id
  join public.teams at on at.id=m.away_team_id
  where m.id<>cur.id
    and public.ips_can_score_match(m.id)
    and m.status in ('READY','SCHEDULED','LIVE')
    and (
      m.match_number>cur.match_number
      or (
        m.match_number=cur.match_number
        and m.scheduled_at>cur.scheduled_at
      )
    )
  order by
    case m.status when 'READY' then 0 when 'SCHEDULED' then 1 else 2 end,
    m.match_number,
    m.scheduled_at
  limit 1;
$$;

notify pgrst,'reload schema';

commit;
