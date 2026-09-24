-- IPS Project 6.0 — server-authoritative live scoring engine.
-- Event ledger + derived live state. Controller records facts; database derives totals and eligibility.

begin;

create table if not exists public.match_innings (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on update cascade on delete cascade,
  innings_no smallint not null check (innings_no between 1 and 2),
  batting_team_id uuid not null references public.teams(id) on update cascade on delete restrict,
  bowling_team_id uuid not null references public.teams(id) on update cascade on delete restrict,
  status text not null default 'OPEN' check (status in ('OPEN','COMPLETED')),
  opening_striker_id uuid not null references public.players(id) on update cascade on delete restrict,
  opening_non_striker_id uuid not null references public.players(id) on update cascade on delete restrict,
  opening_bowler_id uuid not null references public.players(id) on update cascade on delete restrict,
  total_runs integer not null default 0 check (total_runs >= 0),
  wickets smallint not null default 0 check (wickets >= 0),
  legal_balls integer not null default 0 check (legal_balls >= 0),
  target_runs integer,
  started_by uuid references auth.users(id) on delete set null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(match_id,innings_no),
  check (batting_team_id <> bowling_team_id),
  check (opening_striker_id <> opening_non_striker_id)
);

create table if not exists public.match_scoring_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on update cascade on delete cascade,
  innings_id uuid not null references public.match_innings(id) on update cascade on delete cascade,
  sequence_no integer not null check (sequence_no > 0),
  event_type text not null check (event_type in ('INNINGS_START','DELIVERY','BOWLER_CHANGE','REVERSAL')),
  over_no integer,
  ball_no smallint,
  striker_id uuid references public.players(id) on update cascade on delete restrict,
  non_striker_id uuid references public.players(id) on update cascade on delete restrict,
  bowler_id uuid references public.players(id) on update cascade on delete restrict,
  legal_delivery boolean,
  runs_off_bat smallint not null default 0 check (runs_off_bat between 0 and 12),
  wide_runs smallint not null default 0 check (wide_runs between 0 and 12),
  no_ball_runs smallint not null default 0 check (no_ball_runs between 0 and 12),
  bye_runs smallint not null default 0 check (bye_runs between 0 and 12),
  leg_bye_runs smallint not null default 0 check (leg_bye_runs between 0 and 12),
  is_wicket boolean not null default false,
  wicket_kind text check (wicket_kind is null or wicket_kind in ('BOWLED','CAUGHT','RUN_OUT','HIT_WICKET')),
  dismissed_player_id uuid references public.players(id) on update cascade on delete restrict,
  incoming_batter_id uuid references public.players(id) on update cascade on delete restrict,
  delivery_label text,
  reverses_event_id uuid references public.match_scoring_events(id) on update cascade on delete restrict,
  state_after jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(match_id,sequence_no)
);

create table if not exists public.match_live_state (
  match_id uuid primary key references public.matches(id) on update cascade on delete cascade,
  innings_id uuid references public.match_innings(id) on update cascade on delete cascade,
  innings_no smallint,
  batting_team_id uuid references public.teams(id) on update cascade on delete restrict,
  bowling_team_id uuid references public.teams(id) on update cascade on delete restrict,
  striker_id uuid references public.players(id) on update cascade on delete restrict,
  non_striker_id uuid references public.players(id) on update cascade on delete restrict,
  bowler_id uuid references public.players(id) on update cascade on delete restrict,
  previous_bowler_id uuid references public.players(id) on update cascade on delete restrict,
  total_runs integer not null default 0 check (total_runs >= 0),
  wickets smallint not null default 0 check (wickets >= 0),
  legal_balls integer not null default 0 check (legal_balls >= 0),
  target_runs integer,
  awaiting_bowler boolean not null default false,
  innings_complete boolean not null default false,
  free_hit boolean not null default false,
  last_event_id uuid references public.match_scoring_events(id) on update cascade on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists match_innings_match_idx on public.match_innings(match_id,innings_no);
create index if not exists match_scoring_events_innings_seq_idx on public.match_scoring_events(innings_id,sequence_no);
create index if not exists match_scoring_events_match_seq_idx on public.match_scoring_events(match_id,sequence_no desc);
create index if not exists match_scoring_events_batter_idx on public.match_scoring_events(innings_id,striker_id) where event_type='DELIVERY';
create index if not exists match_scoring_events_bowler_idx on public.match_scoring_events(innings_id,bowler_id) where event_type='DELIVERY';

alter table public.match_innings enable row level security;
alter table public.match_scoring_events enable row level security;
alter table public.match_live_state enable row level security;

grant select on public.match_innings,public.match_scoring_events,public.match_live_state to authenticated;
revoke insert,update,delete on public.match_innings,public.match_scoring_events,public.match_live_state from anon,authenticated;

drop policy if exists "controller reads match innings" on public.match_innings;
create policy "controller reads match innings"
on public.match_innings for select to authenticated
using (public.ips_can_score_match(match_id));

drop policy if exists "controller reads scoring events" on public.match_scoring_events;
create policy "controller reads scoring events"
on public.match_scoring_events for select to authenticated
using (public.ips_can_score_match(match_id));

drop policy if exists "controller reads live state" on public.match_live_state;
create policy "controller reads live state"
on public.match_live_state for select to authenticated
using (public.ips_can_score_match(match_id));

create or replace function public.ips_effective_wicket_limit(p_match_id uuid)
returns integer
language sql
stable
security definer
set search_path=public,auth
as $$
  select greatest(
    1,
    least(
      coalesce(m.format_wicket_limit::integer,m.format_players_per_side::integer-1),
      m.format_players_per_side::integer-1
    )
  )
  from public.matches m
  where m.id=p_match_id
$$;

revoke all on function public.ips_effective_wicket_limit(uuid) from public,anon,authenticated;

create or replace function public.ips_scoring_context(p_match_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth
as $$
declare
  m public.matches;
  s public.match_live_state;
  v_bpo integer;
  v_max_balls integer;
  v_effective_wickets integer;
  v_consecutive boolean;
  v_max_bowler_overs integer;
  v_innings_count integer;
  v_next_batting_team uuid;
  v_current_over integer;
  v_context jsonb;
begin
  if not public.ips_can_score_match(p_match_id) then
    raise exception 'You are not assigned to score/manage this match.';
  end if;

  select * into m from public.matches where id=p_match_id;
  if not found then raise exception 'Match not found.'; end if;

  select coalesce(r.consecutive_overs_by_same_bowler_allowed,false)
  into v_consecutive
  from public.tournaments t
  join public.competition_rulesets r on r.id=t.ruleset_id
  where t.id=m.tournament_id;

  v_bpo := m.format_balls_per_over;
  v_max_balls := m.format_overs_per_innings * v_bpo;
  v_effective_wickets := public.ips_effective_wicket_limit(p_match_id);
  v_max_bowler_overs := m.format_max_overs_per_bowler;

  select count(*) into v_innings_count from public.match_innings where match_id=p_match_id;
  select * into s from public.match_live_state where match_id=p_match_id;

  if s.innings_id is not null then
    if s.innings_complete and s.innings_no=1 then v_next_batting_team := s.bowling_team_id; end if;
    if s.awaiting_bowler then
      v_current_over := greatest((s.legal_balls / v_bpo)-1,0);
    else
      v_current_over := s.legal_balls / v_bpo;
    end if;
  end if;

  with active_deliveries as (
    select e.*
    from public.match_scoring_events e
    where e.match_id=p_match_id
      and e.event_type='DELIVERY'
      and (s.innings_id is null or e.innings_id=s.innings_id)
      and not exists (
        select 1 from public.match_scoring_events r
        where r.event_type='REVERSAL' and r.reverses_event_id=e.id
      )
  ),
  batter_stats as (
    select xi.player_id,p.display_name,p.ips_code,xi.lineup_order,
      coalesce(sum(case when ad.striker_id=xi.player_id then ad.runs_off_bat else 0 end),0)::integer as runs,
      count(*) filter (where ad.striker_id=xi.player_id and ad.legal_delivery)::integer as balls,
      count(*) filter (where ad.striker_id=xi.player_id and ad.runs_off_bat=4)::integer as fours,
      count(*) filter (where ad.striker_id=xi.player_id and ad.runs_off_bat=6)::integer as sixes,
      exists(select 1 from active_deliveries d where d.is_wicket and d.dismissed_player_id=xi.player_id) as dismissed
    from public.match_playing_xi xi
    join public.players p on p.id=xi.player_id
    left join active_deliveries ad on ad.innings_id=s.innings_id
    where s.batting_team_id is not null
      and xi.match_id=p_match_id and xi.team_id=s.batting_team_id
    group by xi.player_id,p.display_name,p.ips_code,xi.lineup_order
  ),
  bowler_stats as (
    select xi.player_id,p.display_name,p.ips_code,xi.lineup_order,
      count(*) filter (where ad.bowler_id=xi.player_id and ad.legal_delivery)::integer as legal_balls,
      coalesce(sum(case when ad.bowler_id=xi.player_id then ad.runs_off_bat+ad.wide_runs+ad.no_ball_runs else 0 end),0)::integer as runs,
      count(*) filter (
        where ad.bowler_id=xi.player_id and ad.is_wicket and ad.wicket_kind in ('BOWLED','CAUGHT','HIT_WICKET')
      )::integer as wickets
    from public.match_playing_xi xi
    join public.players p on p.id=xi.player_id
    left join active_deliveries ad on ad.innings_id=s.innings_id
    where s.bowling_team_id is not null
      and xi.match_id=p_match_id and xi.team_id=s.bowling_team_id
    group by xi.player_id,p.display_name,p.ips_code,xi.lineup_order
  )
  select jsonb_build_object(
    'started',s.innings_id is not null,
    'innings_count',v_innings_count,
    'innings_no',s.innings_no,
    'innings_complete',coalesce(s.innings_complete,false),
    'match_complete',m.status in ('COMPLETED','AWAITING_CERTIFICATION','OFFICIAL','LOCKED'),
    'batting_team_id',s.batting_team_id,
    'bowling_team_id',s.bowling_team_id,
    'striker_id',s.striker_id,
    'non_striker_id',s.non_striker_id,
    'bowler_id',s.bowler_id,
    'previous_bowler_id',s.previous_bowler_id,
    'runs',coalesce(s.total_runs,0),
    'wickets',coalesce(s.wickets,0),
    'legal_balls',coalesce(s.legal_balls,0),
    'balls_per_over',v_bpo,
    'max_balls',v_max_balls,
    'overs_per_innings',m.format_overs_per_innings,
    'effective_wicket_limit',v_effective_wickets,
    'target_runs',s.target_runs,
    'runs_required',case when s.target_runs is null then null else greatest(s.target_runs-s.total_runs,0) end,
    'balls_remaining',case when s.innings_id is null then null else greatest(v_max_balls-s.legal_balls,0) end,
    'awaiting_bowler',coalesce(s.awaiting_bowler,false),
    'free_hit',coalesce(s.free_hit,false),
    'next_batting_team_id',v_next_batting_team,
    'innings',coalesce((
      select jsonb_agg(jsonb_build_object(
        'innings_no',i.innings_no,'batting_team_id',i.batting_team_id,'bowling_team_id',i.bowling_team_id,
        'runs',i.total_runs,'wickets',i.wickets,'legal_balls',i.legal_balls,'status',i.status,'target_runs',i.target_runs
      ) order by i.innings_no)
      from public.match_innings i where i.match_id=p_match_id
    ),'[]'::jsonb),
    'batter_stats',coalesce((
      select jsonb_agg(jsonb_build_object(
        'player_id',bs.player_id,'name',bs.display_name,'ips_code',bs.ips_code,'lineup_order',bs.lineup_order,
        'runs',bs.runs,'balls',bs.balls,'fours',bs.fours,'sixes',bs.sixes,
        'strike_rate',case when bs.balls=0 then 0 else round((bs.runs::numeric*100)/bs.balls,1) end,
        'dismissed',bs.dismissed
      ) order by bs.lineup_order)
      from batter_stats bs
    ),'[]'::jsonb),
    'bowler_stats',coalesce((
      select jsonb_agg(jsonb_build_object(
        'player_id',bs.player_id,'name',bs.display_name,'ips_code',bs.ips_code,'lineup_order',bs.lineup_order,
        'legal_balls',bs.legal_balls,
        'overs',(bs.legal_balls/v_bpo)::text||'.'||(bs.legal_balls%v_bpo)::text,
        'runs',bs.runs,'wickets',bs.wickets,
        'economy',case when bs.legal_balls=0 then 0 else round((bs.runs::numeric*v_bpo)/bs.legal_balls,2) end
      ) order by bs.lineup_order)
      from bowler_stats bs
    ),'[]'::jsonb),
    'current_over',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',ad.id,'label',ad.delivery_label,'legal',ad.legal_delivery,'is_wicket',ad.is_wicket
      ) order by ad.sequence_no)
      from active_deliveries ad
      where ad.over_no=v_current_over
    ),'[]'::jsonb),
    'next_batters',coalesce((
      select jsonb_agg(jsonb_build_object(
        'player_id',bs.player_id,'name',bs.display_name,'ips_code',bs.ips_code,
        'available',not bs.dismissed and bs.player_id not in (
          coalesce(s.striker_id,'00000000-0000-0000-0000-000000000000'::uuid),
          coalesce(s.non_striker_id,'00000000-0000-0000-0000-000000000000'::uuid)
        ),
        'reason',case
          when bs.dismissed then 'OUT'
          when bs.player_id=s.striker_id or bs.player_id=s.non_striker_id then 'BATTING'
          else null end
      ) order by bs.lineup_order)
      from batter_stats bs
    ),'[]'::jsonb),
    'bowlers',coalesce((
      select jsonb_agg(jsonb_build_object(
        'player_id',bs.player_id,'name',bs.display_name,'ips_code',bs.ips_code,
        'available',
          (v_consecutive or s.previous_bowler_id is null or bs.player_id<>s.previous_bowler_id)
          and (v_max_bowler_overs is null or bs.legal_balls < v_max_bowler_overs*v_bpo),
        'reason',case
          when not v_consecutive and s.previous_bowler_id=bs.player_id then 'PREVIOUS BOWLER'
          when v_max_bowler_overs is not null and bs.legal_balls >= v_max_bowler_overs*v_bpo then 'OVER LIMIT'
          else null end
      ) order by bs.lineup_order)
      from bowler_stats bs
    ),'[]'::jsonb)
  ) into v_context;

  return v_context;
end
$$;

revoke all on function public.ips_scoring_context(uuid) from public,anon;
grant execute on function public.ips_scoring_context(uuid) to authenticated,service_role;

create or replace function public.ips_start_innings(
  p_match_id uuid,
  p_batting_team_id uuid,
  p_striker_id uuid,
  p_non_striker_id uuid,
  p_bowler_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  m public.matches;
  v_innings_no integer;
  v_batting_team uuid;
  v_bowling_team uuid;
  v_target integer;
  v_previous public.match_innings;
  v_innings_id uuid;
  v_event_id uuid;
  v_sequence integer;
  v_required integer;
begin
  if not public.ips_can_score_match(p_match_id) then
    raise exception 'You are not assigned to score/manage this match.';
  end if;

  select * into m from public.matches where id=p_match_id for update;
  if not found then raise exception 'Match not found.'; end if;
  if m.status in ('COMPLETED','AWAITING_CERTIFICATION','OFFICIAL','LOCKED','CANCELLED','ABANDONED') then
    raise exception 'This match cannot start a new innings in its current status.';
  end if;

  if exists(select 1 from public.match_innings where match_id=p_match_id and status='OPEN') then
    raise exception 'An innings is already in progress.';
  end if;

  select count(*) into v_innings_no from public.match_innings where match_id=p_match_id;
  v_innings_no := v_innings_no + 1;
  if v_innings_no > 2 then raise exception 'Both innings have already been created.'; end if;

  if v_innings_no=1 then
    if p_batting_team_id not in (m.home_team_id,m.away_team_id) then
      raise exception 'Choose one of the two match teams to bat first.';
    end if;
    v_batting_team := p_batting_team_id;
    v_bowling_team := case when p_batting_team_id=m.home_team_id then m.away_team_id else m.home_team_id end;
    v_target := null;
  else
    select * into v_previous
    from public.match_innings
    where match_id=p_match_id and innings_no=1 and status='COMPLETED';
    if not found then raise exception 'The first innings must be completed first.'; end if;
    v_batting_team := v_previous.bowling_team_id;
    v_bowling_team := v_previous.batting_team_id;
    if p_batting_team_id is not null and p_batting_team_id<>v_batting_team then
      raise exception 'The second-innings batting side is fixed by the first innings.';
    end if;
    v_target := v_previous.total_runs+1;
  end if;

  v_required := m.format_players_per_side;
  if (select count(*) from public.match_playing_xi where match_id=p_match_id and team_id=v_batting_team)<>v_required
     or (select count(*) from public.match_playing_xi where match_id=p_match_id and team_id=v_bowling_team)<>v_required then
    raise exception 'Both official playing sides must contain exactly % players before scoring starts.',v_required;
  end if;

  if not exists(select 1 from public.match_playing_xi where match_id=p_match_id and team_id=v_batting_team and player_id=p_striker_id)
     or not exists(select 1 from public.match_playing_xi where match_id=p_match_id and team_id=v_batting_team and player_id=p_non_striker_id) then
    raise exception 'Both opening batters must come from the batting playing side.';
  end if;
  if p_striker_id=p_non_striker_id then raise exception 'Striker and non-striker must be different players.'; end if;
  if not exists(select 1 from public.match_playing_xi where match_id=p_match_id and team_id=v_bowling_team and player_id=p_bowler_id) then
    raise exception 'Opening bowler must come from the bowling playing side.';
  end if;

  insert into public.match_innings(
    match_id,innings_no,batting_team_id,bowling_team_id,
    opening_striker_id,opening_non_striker_id,opening_bowler_id,
    target_runs,started_by
  ) values(
    p_match_id,v_innings_no,v_batting_team,v_bowling_team,
    p_striker_id,p_non_striker_id,p_bowler_id,
    v_target,auth.uid()
  ) returning id into v_innings_id;

  select coalesce(max(sequence_no),0)+1 into v_sequence
  from public.match_scoring_events where match_id=p_match_id;

  insert into public.match_scoring_events(
    match_id,innings_id,sequence_no,event_type,
    striker_id,non_striker_id,bowler_id,state_after,created_by
  ) values(
    p_match_id,v_innings_id,v_sequence,'INNINGS_START',
    p_striker_id,p_non_striker_id,p_bowler_id,
    jsonb_build_object(
      'innings_no',v_innings_no,'runs',0,'wickets',0,'legal_balls',0,
      'striker_id',p_striker_id,'non_striker_id',p_non_striker_id,'bowler_id',p_bowler_id,
      'awaiting_bowler',false,'innings_complete',false,'free_hit',false,'target_runs',v_target
    ),
    auth.uid()
  ) returning id into v_event_id;

  insert into public.match_live_state(
    match_id,innings_id,innings_no,batting_team_id,bowling_team_id,
    striker_id,non_striker_id,bowler_id,previous_bowler_id,
    total_runs,wickets,legal_balls,target_runs,awaiting_bowler,innings_complete,free_hit,last_event_id,updated_at
  ) values(
    p_match_id,v_innings_id,v_innings_no,v_batting_team,v_bowling_team,
    p_striker_id,p_non_striker_id,p_bowler_id,null,
    0,0,0,v_target,false,false,false,v_event_id,now()
  )
  on conflict(match_id) do update set
    innings_id=excluded.innings_id,
    innings_no=excluded.innings_no,
    batting_team_id=excluded.batting_team_id,
    bowling_team_id=excluded.bowling_team_id,
    striker_id=excluded.striker_id,
    non_striker_id=excluded.non_striker_id,
    bowler_id=excluded.bowler_id,
    previous_bowler_id=null,
    total_runs=0,wickets=0,legal_balls=0,
    target_runs=excluded.target_runs,
    awaiting_bowler=false,innings_complete=false,free_hit=false,
    last_event_id=excluded.last_event_id,updated_at=now();

  if m.status in ('SCHEDULED','READY') then
    update public.matches set status='LIVE' where id=p_match_id;
  end if;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(auth.uid(),'SCORING_INNINGS_STARTED','match',p_match_id,
    jsonb_build_object('innings_no',v_innings_no,'batting_team_id',v_batting_team,'bowling_team_id',v_bowling_team));

  return public.ips_scoring_context(p_match_id);
end
$$;

revoke all on function public.ips_start_innings(uuid,uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.ips_start_innings(uuid,uuid,uuid,uuid,uuid) to authenticated,service_role;

create or replace function public.ips_set_next_bowler(
  p_match_id uuid,
  p_bowler_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  s public.match_live_state;
  m public.matches;
  v_consecutive boolean;
  v_legal_balls integer;
  v_sequence integer;
  v_event_id uuid;
begin
  if not public.ips_can_score_match(p_match_id) then
    raise exception 'You are not assigned to score/manage this match.';
  end if;

  select * into s from public.match_live_state where match_id=p_match_id for update;
  if not found or s.innings_id is null then raise exception 'No innings is in progress.'; end if;
  if s.innings_complete then raise exception 'The innings is already complete.'; end if;
  if not s.awaiting_bowler then raise exception 'A bowler change is not due yet.'; end if;

  select * into m from public.matches where id=p_match_id;

  if not exists(
    select 1 from public.match_playing_xi
    where match_id=p_match_id and team_id=s.bowling_team_id and player_id=p_bowler_id
  ) then raise exception 'Choose a bowler from the bowling playing side.'; end if;

  select coalesce(r.consecutive_overs_by_same_bowler_allowed,false)
  into v_consecutive
  from public.tournaments t
  join public.competition_rulesets r on r.id=t.ruleset_id
  where t.id=m.tournament_id;

  if not v_consecutive and s.previous_bowler_id=p_bowler_id then
    raise exception 'The previous bowler cannot bowl consecutive overs under this ruleset.';
  end if;

  select count(*) into v_legal_balls
  from public.match_scoring_events e
  where e.innings_id=s.innings_id and e.event_type='DELIVERY'
    and e.bowler_id=p_bowler_id and e.legal_delivery
    and not exists(
      select 1 from public.match_scoring_events r
      where r.event_type='REVERSAL' and r.reverses_event_id=e.id
    );

  if m.format_max_overs_per_bowler is not null
     and v_legal_balls >= m.format_max_overs_per_bowler*m.format_balls_per_over then
    raise exception 'This bowler has reached the match over limit.';
  end if;

  select coalesce(max(sequence_no),0)+1 into v_sequence
  from public.match_scoring_events where match_id=p_match_id;

  insert into public.match_scoring_events(
    match_id,innings_id,sequence_no,event_type,
    striker_id,non_striker_id,bowler_id,state_after,created_by
  ) values(
    p_match_id,s.innings_id,v_sequence,'BOWLER_CHANGE',
    s.striker_id,s.non_striker_id,p_bowler_id,
    jsonb_build_object(
      'innings_no',s.innings_no,'runs',s.total_runs,'wickets',s.wickets,'legal_balls',s.legal_balls,
      'striker_id',s.striker_id,'non_striker_id',s.non_striker_id,'bowler_id',p_bowler_id,
      'previous_bowler_id',s.previous_bowler_id,'awaiting_bowler',false,
      'innings_complete',false,'free_hit',s.free_hit,'target_runs',s.target_runs
    ),
    auth.uid()
  ) returning id into v_event_id;

  update public.match_live_state
  set bowler_id=p_bowler_id,awaiting_bowler=false,last_event_id=v_event_id,updated_at=now()
  where match_id=p_match_id;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(auth.uid(),'SCORING_BOWLER_CHANGED','match',p_match_id,
    jsonb_build_object('innings_no',s.innings_no,'bowler_id',p_bowler_id));

  return public.ips_scoring_context(p_match_id);
end
$$;

revoke all on function public.ips_set_next_bowler(uuid,uuid) from public,anon;
grant execute on function public.ips_set_next_bowler(uuid,uuid) to authenticated,service_role;

create or replace function public.ips_score_delivery(
  p_match_id uuid,
  p_runs_off_bat smallint default 0,
  p_extra_type text default null,
  p_extra_additional_runs smallint default 0,
  p_wicket_kind text default null,
  p_dismissed_player_id uuid default null,
  p_incoming_batter_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  s public.match_live_state;
  m public.matches;
  v_extra text;
  v_wicket text;
  v_runs_off_bat integer := coalesce(p_runs_off_bat,0);
  v_additional integer := coalesce(p_extra_additional_runs,0);
  v_wide integer := 0;
  v_no_ball integer := 0;
  v_bye integer := 0;
  v_leg_bye integer := 0;
  v_total_delta integer := 0;
  v_rotation_runs integer := 0;
  v_legal boolean := true;
  v_free_hit_rule boolean := false;
  v_free_hit_after boolean;
  v_striker_after uuid;
  v_non_striker_after uuid;
  v_bowler_after uuid;
  v_previous_bowler_after uuid;
  v_dismissed uuid;
  v_runs_after integer;
  v_wickets_after integer;
  v_legal_after integer;
  v_effective_wickets integer;
  v_max_balls integer;
  v_innings_end boolean := false;
  v_awaiting_bowler boolean := false;
  v_sequence integer;
  v_event_id uuid;
  v_over_no integer;
  v_ball_no integer;
  v_label text;
  v_temp uuid;
begin
  if not public.ips_can_score_match(p_match_id) then
    raise exception 'You are not assigned to score/manage this match.';
  end if;

  select * into s from public.match_live_state where match_id=p_match_id for update;
  if not found or s.innings_id is null then raise exception 'Start the innings before recording a delivery.'; end if;
  if s.innings_complete then raise exception 'This innings is complete.'; end if;
  if s.awaiting_bowler or s.bowler_id is null then raise exception 'Select the next bowler before recording another delivery.'; end if;

  select * into m from public.matches where id=p_match_id;
  v_extra := nullif(upper(trim(coalesce(p_extra_type,''))),'');
  v_wicket := nullif(upper(trim(coalesce(p_wicket_kind,''))),'');
  v_effective_wickets := public.ips_effective_wicket_limit(p_match_id);
  v_max_balls := m.format_overs_per_innings*m.format_balls_per_over;
  v_over_no := s.legal_balls/m.format_balls_per_over;
  v_ball_no := (s.legal_balls % m.format_balls_per_over)+1;

  select coalesce(r.free_hit_on_no_ball,false)
  into v_free_hit_rule
  from public.tournaments t
  join public.competition_rulesets r on r.id=t.ruleset_id
  where t.id=m.tournament_id;

  if v_runs_off_bat<0 or v_runs_off_bat>12 or v_additional<0 or v_additional>12 then
    raise exception 'Run value is outside the supported range.';
  end if;
  if v_extra is not null and v_extra not in ('WIDE','NO_BALL','BYE','LEG_BYE') then
    raise exception 'Unsupported extra type.';
  end if;
  if v_wicket is not null and v_wicket not in ('BOWLED','CAUGHT','RUN_OUT','HIT_WICKET') then
    raise exception 'Unsupported wicket type.';
  end if;
  if v_wicket is not null and (v_extra is not null or v_runs_off_bat<>0 or v_additional<>0) then
    raise exception 'Record this wicket as its own delivery. Combined wicket/extras will be added through the advanced correction flow.';
  end if;
  if s.free_hit and v_wicket in ('BOWLED','CAUGHT','HIT_WICKET') then
    raise exception 'Only a run out from the available wicket choices can dismiss a batter on this free hit.';
  end if;

  if v_extra='WIDE' then
    if v_runs_off_bat<>0 then raise exception 'Wide additional runs are recorded with the WD + value, not batter runs.'; end if;
    v_legal := false;
    v_wide := 1+v_additional;
    v_rotation_runs := v_additional;
    v_label := case when v_additional=0 then 'WD' else 'WD+'||v_additional::text end;
  elsif v_extra='NO_BALL' then
    if v_additional<>0 then raise exception 'No-ball + value is recorded as runs off the bat.'; end if;
    v_legal := false;
    v_no_ball := 1;
    v_rotation_runs := v_runs_off_bat;
    v_label := case when v_runs_off_bat=0 then 'NB' else 'NB+'||v_runs_off_bat::text end;
  elsif v_extra='BYE' then
    if v_runs_off_bat<>0 or v_additional=0 then raise exception 'Bye requires a + run value.'; end if;
    v_legal := true;
    v_bye := v_additional;
    v_rotation_runs := v_additional;
    v_label := 'B+'||v_additional::text;
  elsif v_extra='LEG_BYE' then
    if v_runs_off_bat<>0 or v_additional=0 then raise exception 'Leg bye requires a + run value.'; end if;
    v_legal := true;
    v_leg_bye := v_additional;
    v_rotation_runs := v_additional;
    v_label := 'LB+'||v_additional::text;
  else
    v_legal := true;
    v_rotation_runs := v_runs_off_bat;
    v_label := v_runs_off_bat::text;
  end if;

  v_striker_after := s.striker_id;
  v_non_striker_after := s.non_striker_id;
  v_bowler_after := s.bowler_id;
  v_previous_bowler_after := s.previous_bowler_id;
  v_runs_after := s.total_runs+v_runs_off_bat+v_wide+v_no_ball+v_bye+v_leg_bye;
  v_wickets_after := s.wickets + case when v_wicket is null then 0 else 1 end;
  v_legal_after := s.legal_balls + case when v_legal then 1 else 0 end;

  if v_wicket is not null then
    if v_wicket='RUN_OUT' then
      if p_dismissed_player_id not in (s.striker_id,s.non_striker_id) then
        raise exception 'Choose the striker or non-striker for the run out.';
      end if;
      v_dismissed := p_dismissed_player_id;
    else
      v_dismissed := s.striker_id;
    end if;
    v_label := 'W';
  else
    if mod(v_rotation_runs,2)=1 then
      v_temp:=v_striker_after; v_striker_after:=v_non_striker_after; v_non_striker_after:=v_temp;
    end if;
  end if;

  v_innings_end :=
    v_wickets_after>=v_effective_wickets
    or v_legal_after>=v_max_balls
    or (s.target_runs is not null and v_runs_after>=s.target_runs);

  if v_wicket is not null and not v_innings_end then
    if p_incoming_batter_id is null then raise exception 'Select the next batter.'; end if;
    if not exists(
      select 1 from public.match_playing_xi
      where match_id=p_match_id and team_id=s.batting_team_id and player_id=p_incoming_batter_id
    ) then raise exception 'Next batter must come from the batting playing side.'; end if;
    if p_incoming_batter_id in (s.striker_id,s.non_striker_id) then raise exception 'That batter is already at the crease.'; end if;
    if exists(
      select 1 from public.match_scoring_events e
      where e.innings_id=s.innings_id and e.event_type='DELIVERY'
        and e.is_wicket and e.dismissed_player_id=p_incoming_batter_id
        and not exists(
          select 1 from public.match_scoring_events r
          where r.event_type='REVERSAL' and r.reverses_event_id=e.id
        )
    ) then raise exception 'A dismissed batter cannot return as the next batter.'; end if;

    if v_dismissed=s.striker_id then
      v_striker_after:=p_incoming_batter_id;
      v_non_striker_after:=s.non_striker_id;
    else
      v_striker_after:=s.striker_id;
      v_non_striker_after:=p_incoming_batter_id;
    end if;
  end if;

  if v_legal and mod(v_legal_after,m.format_balls_per_over)=0 and not v_innings_end then
    v_temp:=v_striker_after; v_striker_after:=v_non_striker_after; v_non_striker_after:=v_temp;
    v_previous_bowler_after:=s.bowler_id;
    v_bowler_after:=null;
    v_awaiting_bowler:=true;
  end if;

  if v_extra='NO_BALL' and v_free_hit_rule then
    v_free_hit_after:=true;
  elsif v_legal then
    v_free_hit_after:=false;
  else
    v_free_hit_after:=s.free_hit;
  end if;

  if v_innings_end then
    v_awaiting_bowler:=false;
    v_bowler_after:=null;
    v_free_hit_after:=false;
  end if;

  select coalesce(max(sequence_no),0)+1 into v_sequence
  from public.match_scoring_events where match_id=p_match_id;

  insert into public.match_scoring_events(
    match_id,innings_id,sequence_no,event_type,over_no,ball_no,
    striker_id,non_striker_id,bowler_id,legal_delivery,
    runs_off_bat,wide_runs,no_ball_runs,bye_runs,leg_bye_runs,
    is_wicket,wicket_kind,dismissed_player_id,incoming_batter_id,delivery_label,
    state_after,created_by
  ) values(
    p_match_id,s.innings_id,v_sequence,'DELIVERY',v_over_no,v_ball_no,
    s.striker_id,s.non_striker_id,s.bowler_id,v_legal,
    v_runs_off_bat,v_wide,v_no_ball,v_bye,v_leg_bye,
    v_wicket is not null,v_wicket,v_dismissed,p_incoming_batter_id,v_label,
    jsonb_build_object(
      'innings_no',s.innings_no,'runs',v_runs_after,'wickets',v_wickets_after,'legal_balls',v_legal_after,
      'striker_id',v_striker_after,'non_striker_id',v_non_striker_after,'bowler_id',v_bowler_after,
      'previous_bowler_id',v_previous_bowler_after,'awaiting_bowler',v_awaiting_bowler,
      'innings_complete',v_innings_end,'free_hit',v_free_hit_after,'target_runs',s.target_runs
    ),
    auth.uid()
  ) returning id into v_event_id;

  update public.match_innings
  set total_runs=v_runs_after,wickets=v_wickets_after,legal_balls=v_legal_after,
      status=case when v_innings_end then 'COMPLETED' else 'OPEN' end,
      completed_at=case when v_innings_end then now() else null end
  where id=s.innings_id;

  update public.match_live_state
  set striker_id=v_striker_after,non_striker_id=v_non_striker_after,
      bowler_id=v_bowler_after,previous_bowler_id=v_previous_bowler_after,
      total_runs=v_runs_after,wickets=v_wickets_after,legal_balls=v_legal_after,
      awaiting_bowler=v_awaiting_bowler,innings_complete=v_innings_end,
      free_hit=v_free_hit_after,last_event_id=v_event_id,updated_at=now()
  where match_id=p_match_id;

  if v_innings_end and s.innings_no=2 then
    update public.matches set status='COMPLETED' where id=p_match_id;
  end if;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(auth.uid(),'SCORING_DELIVERY_RECORDED','match',p_match_id,
    jsonb_build_object(
      'innings_no',s.innings_no,'sequence_no',v_sequence,'label',v_label,
      'runs_after',v_runs_after,'wickets_after',v_wickets_after,'legal_balls_after',v_legal_after,
      'wicket_kind',v_wicket,'dismissed_player_id',v_dismissed
    ));

  return public.ips_scoring_context(p_match_id);
end
$$;

revoke all on function public.ips_score_delivery(uuid,smallint,text,smallint,text,uuid,uuid) from public,anon;
grant execute on function public.ips_score_delivery(uuid,smallint,text,smallint,text,uuid,uuid) to authenticated,service_role;

commit;
