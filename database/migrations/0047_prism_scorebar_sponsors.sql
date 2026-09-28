-- PRISM scorebar match-info + complete sponsor control center support.
begin;

alter table public.broadcast_sponsor_exposure
  add column if not exists exposure_key text;
create unique index if not exists broadcast_sponsor_exposure_key_idx
  on public.broadcast_sponsor_exposure(exposure_key)
  where exposure_key is not null;

create or replace function public.ips_can_manage_media_path(p_name text)
returns boolean
language plpgsql stable security definer
set search_path=public,auth
as $$
declare kind text; entity_text text; entity_id uuid;
begin
  kind := split_part(p_name,'/',1);
  if kind='city-heroes' then
    return public.ips_is_owner();
  end if;

  entity_text := split_part(p_name,'/',2);
  begin entity_id := entity_text::uuid; exception when others then return false; end;

  if kind='players' then return public.ips_can_admin_player(entity_id); end if;
  if kind='clubs' then return public.ips_can_manage_club(entity_id); end if;
  if kind='teams' then return public.ips_can_manage_team(entity_id); end if;
  if kind='sponsors' then return public.ips_can_manage_tournament(entity_id); end if;
  return false;
end
$$;

create or replace function public.ips_broadcast_match_data(p_match_id uuid)
returns jsonb
language sql stable security definer
set search_path=public
as $$
with m as (
  select m.*,t.name tournament_name,t.code tournament_code,t.logo_url tournament_logo,
         t.primary_color tournament_primary,t.secondary_color tournament_secondary,
         v.name venue_name
  from public.matches m
  join public.tournaments t on t.id=m.tournament_id
  left join public.venues v on v.id=m.venue_id
  where m.id=p_match_id
    and (t.status::text<>'DRAFT' or m.status::text in ('LIVE','COMPLETED','AWAITING_CERTIFICATION','OFFICIAL','LOCKED'))
),
s as (select * from public.match_live_state where match_id=p_match_id),
active as (
  select e.*,(e.runs_off_bat+e.wide_runs+e.no_ball_runs+e.bye_runs+e.leg_bye_runs)::integer delivery_runs
  from public.match_scoring_events e
  join s on e.innings_id=s.innings_id
  where e.match_id=p_match_id and e.event_type='DELIVERY'
    and not exists(select 1 from public.match_scoring_events r where r.event_type='REVERSAL' and r.reverses_event_id=e.id)
),
last_delivery as (select * from active order by sequence_no desc limit 1),
last_wicket as (select coalesce(max(sequence_no),0) seq from active where is_wicket),
partnership as (
 select coalesce(sum(delivery_runs),0)::integer runs,
        count(*) filter(where legal_delivery)::integer balls
 from active where sequence_no>(select seq from last_wicket)
),
batting_stats as (
 select xi.player_id,p.display_name,p.ips_code,p.profile_image_url,p.batting_style,p.bowling_style,p.primary_role,xi.lineup_order,
        coalesce(sum(case when a.striker_id=xi.player_id then a.runs_off_bat else 0 end),0)::integer runs,
        count(*) filter(where a.striker_id=xi.player_id and a.legal_delivery)::integer balls,
        count(*) filter(where a.striker_id=xi.player_id and a.runs_off_bat=4)::integer fours,
        count(*) filter(where a.striker_id=xi.player_id and a.runs_off_bat=6)::integer sixes,
        (array_agg(a.wicket_kind order by a.sequence_no) filter(where a.is_wicket and a.dismissed_player_id=xi.player_id))[1] dismissal
 from public.match_playing_xi xi
 join public.players p on p.id=xi.player_id
 left join active a on true
 where xi.match_id=p_match_id and xi.team_id=(select batting_team_id from s)
 group by xi.player_id,p.display_name,p.ips_code,p.profile_image_url,p.batting_style,p.bowling_style,p.primary_role,xi.lineup_order
),
bowler_over as (
 select bowler_id,over_no,sum(runs_off_bat+wide_runs+no_ball_runs)::integer conceded
 from active group by bowler_id,over_no
),
bowling_stats as (
 select xi.player_id,p.display_name,p.ips_code,p.profile_image_url,p.batting_style,p.bowling_style,p.primary_role,xi.lineup_order,
   count(*) filter(where a.bowler_id=xi.player_id and a.legal_delivery)::integer legal_balls,
   coalesce(sum(case when a.bowler_id=xi.player_id then a.runs_off_bat+a.wide_runs+a.no_ball_runs else 0 end),0)::integer runs,
   count(*) filter(where a.bowler_id=xi.player_id and a.is_wicket and a.wicket_kind in ('BOWLED','CAUGHT','HIT_WICKET'))::integer wickets,
   coalesce((select count(*) from bowler_over bo where bo.bowler_id=xi.player_id and bo.conceded=0),0)::integer maidens
 from public.match_playing_xi xi
 join public.players p on p.id=xi.player_id
 left join active a on true
 where xi.match_id=p_match_id and xi.team_id=(select bowling_team_id from s)
 group by xi.player_id,p.display_name,p.ips_code,p.profile_image_url,p.batting_style,p.bowling_style,p.primary_role,xi.lineup_order
),
over_groups as (
 select over_no,
   coalesce(sum(delivery_runs),0)::integer runs,
   count(*) filter(where is_wicket)::integer wickets,
   jsonb_agg(delivery_label order by sequence_no) balls
 from active group by over_no order by over_no desc
),
innings_rows as (
 select i.*,t.name batting_name,t.short_name batting_short,t.logo_url batting_logo
 from public.match_innings i join public.teams t on t.id=i.batting_team_id
 where i.match_id=p_match_id
)
select jsonb_build_object(
 'match',jsonb_build_object(
   'id',m.id,'code',m.match_code,'number',m.match_number,'status',m.status,'stage',m.stage,'round',m.round_label,
   'scheduled_at',m.scheduled_at,'venue',m.venue_name,
   'tournament',jsonb_build_object('id',m.tournament_id,'name',m.tournament_name,'code',m.tournament_code,'logo_url',m.tournament_logo,'primary_color',m.tournament_primary,'secondary_color',m.tournament_secondary),
   'home_team',jsonb_build_object('id',ht.id,'name',ht.name,'short_name',ht.short_name,'logo_url',ht.logo_url,'primary_color',coalesce(ht.primary_color,'#19d18f'),'secondary_color',coalesce(ht.secondary_color,'#071d2d')),
   'away_team',jsonb_build_object('id',at.id,'name',at.name,'short_name',at.short_name,'logo_url',at.logo_url,'primary_color',coalesce(at.primary_color,'#4f7cff'),'secondary_color',coalesce(at.secondary_color,'#071d2d'))
 ),
 'innings',jsonb_build_object(
   'started',s.innings_id is not null,'number',s.innings_no,'complete',coalesce(s.innings_complete,false),
   'batting_team',jsonb_build_object('id',bt.id,'name',bt.name,'short_name',coalesce(bt.short_name,bt.name),'logo_url',bt.logo_url,'primary_color',coalesce(bt.primary_color,'#19d18f'),'secondary_color',coalesce(bt.secondary_color,'#071d2d')),
   'bowling_team',jsonb_build_object('id',bw.id,'name',bw.name,'short_name',coalesce(bw.short_name,bw.name),'logo_url',bw.logo_url,'primary_color',coalesce(bw.primary_color,'#4f7cff'),'secondary_color',coalesce(bw.secondary_color,'#071d2d')),
   'runs',coalesce(s.total_runs,0),'wickets',coalesce(s.wickets,0),
   'score_display',coalesce(s.total_runs,0)::text||'/'||coalesce(s.wickets,0)::text,
   'legal_balls',coalesce(s.legal_balls,0),
   'overs',(coalesce(s.legal_balls,0)/greatest(m.format_balls_per_over,1))::text||'.'||(coalesce(s.legal_balls,0)%greatest(m.format_balls_per_over,1))::text,
   'target',s.target_runs,
   'runs_required',case when s.target_runs is null then null else greatest(s.target_runs-coalesce(s.total_runs,0),0) end,
   'balls_remaining',case when s.innings_id is null then null else greatest(m.format_overs_per_innings*m.format_balls_per_over-coalesce(s.legal_balls,0),0) end,
   'crr',case when coalesce(s.legal_balls,0)=0 then 0 else round((s.total_runs::numeric*m.format_balls_per_over)/s.legal_balls,2) end,
   'rrr',case when s.target_runs is null or greatest(m.format_overs_per_innings*m.format_balls_per_over-coalesce(s.legal_balls,0),0)=0 then null else round((greatest(s.target_runs-s.total_runs,0)::numeric*m.format_balls_per_over)/greatest(m.format_overs_per_innings*m.format_balls_per_over-s.legal_balls,1),2) end,
   'projected_score',case when coalesce(s.legal_balls,0)=0 then null else ceil((s.total_runs::numeric*(m.format_overs_per_innings*m.format_balls_per_over))/s.legal_balls)::integer end,
   'chase_display',case when s.target_runs is null then '' else 'NEED '||greatest(s.target_runs-s.total_runs,0)::text||' FROM '||greatest(m.format_overs_per_innings*m.format_balls_per_over-s.legal_balls,0)::text end,
   'free_hit',coalesce(s.free_hit,false),
   'extras',jsonb_build_object(
      'wide',coalesce((select sum(wide_runs) from active),0),
      'no_ball',coalesce((select sum(no_ball_runs) from active),0),
      'bye',coalesce((select sum(bye_runs) from active),0),
      'leg_bye',coalesce((select sum(leg_bye_runs) from active),0),
      'total',coalesce((select sum(wide_runs+no_ball_runs+bye_runs+leg_bye_runs) from active),0)
   )
 ),
 'current',jsonb_build_object(
   'striker',coalesce((select jsonb_build_object('id',bs.player_id,'name',bs.display_name,'photo_url',bs.profile_image_url,'ips_code',bs.ips_code,'role',bs.primary_role,'batting_style',bs.batting_style,'runs',bs.runs,'balls',bs.balls,'fours',bs.fours,'sixes',bs.sixes,'strike_rate',case when bs.balls=0 then 0 else round(bs.runs::numeric*100/bs.balls,1) end,'score_display',bs.runs::text||' ('||bs.balls::text||')') from batting_stats bs where bs.player_id=s.striker_id),'{}'::jsonb),
   'non_striker',coalesce((select jsonb_build_object('id',bs.player_id,'name',bs.display_name,'photo_url',bs.profile_image_url,'ips_code',bs.ips_code,'role',bs.primary_role,'batting_style',bs.batting_style,'runs',bs.runs,'balls',bs.balls,'fours',bs.fours,'sixes',bs.sixes,'strike_rate',case when bs.balls=0 then 0 else round(bs.runs::numeric*100/bs.balls,1) end,'score_display',bs.runs::text||' ('||bs.balls::text||')') from batting_stats bs where bs.player_id=s.non_striker_id),'{}'::jsonb),
   'bowler',coalesce((select jsonb_build_object('id',bs.player_id,'name',bs.display_name,'photo_url',bs.profile_image_url,'ips_code',bs.ips_code,'role',bs.primary_role,'bowling_style',bs.bowling_style,'runs',bs.runs,'wickets',bs.wickets,'maidens',bs.maidens,'legal_balls',bs.legal_balls,'overs',(bs.legal_balls/m.format_balls_per_over)::text||'.'||(bs.legal_balls%m.format_balls_per_over)::text,'economy',case when bs.legal_balls=0 then 0 else round(bs.runs::numeric*m.format_balls_per_over/bs.legal_balls,2) end,'figures_display',bs.wickets::text||'/'||bs.runs::text||' ('||(bs.legal_balls/m.format_balls_per_over)::text||'.'||(bs.legal_balls%m.format_balls_per_over)::text||')') from bowling_stats bs where bs.player_id=s.bowler_id),'{}'::jsonb),
   'partnership',jsonb_build_object('runs',(select runs from partnership),'balls',(select balls from partnership)),
   'last_wicket',coalesce((
      select jsonb_build_object(
        'sequence_no',d.sequence_no,
        'player_id',d.dismissed_player_id,
        'name',p.display_name,
        'photo_url',p.profile_image_url,
        'runs',coalesce(bs.runs,0),
        'balls',coalesce(bs.balls,0),
        'score_display',coalesce(bs.runs,0)::text||' ('||coalesce(bs.balls,0)::text||')',
        'wicket_kind',d.wicket_kind
      )
      from active d
      left join public.players p on p.id=d.dismissed_player_id
      left join batting_stats bs on bs.player_id=d.dismissed_player_id
      where d.is_wicket
      order by d.sequence_no desc
      limit 1
   ),'{}'::jsonb),
   'current_over',coalesce((select balls from over_groups order by over_no desc limit 1),'[]'::jsonb),
   'previous_over',coalesce((select jsonb_build_object('over_no',over_no+1,'runs',runs,'wickets',wickets,'balls',balls) from over_groups order by over_no desc offset 1 limit 1),'{}'::jsonb),
   'last_five_overs',coalesce((select jsonb_agg(jsonb_build_object('over_no',x.over_no+1,'runs',x.runs,'wickets',x.wickets,'balls',x.balls) order by x.over_no) from (select * from over_groups order by over_no desc limit 5) x),'[]'::jsonb)
 ),
 'batting_scorecard',coalesce((select jsonb_agg(jsonb_build_object('player_id',bs.player_id,'name',bs.display_name,'photo_url',bs.profile_image_url,'runs',bs.runs,'balls',bs.balls,'fours',bs.fours,'sixes',bs.sixes,'strike_rate',case when bs.balls=0 then 0 else round(bs.runs::numeric*100/bs.balls,1) end,'dismissal',bs.dismissal,'is_striker',bs.player_id=s.striker_id,'is_non_striker',bs.player_id=s.non_striker_id) order by bs.lineup_order) from batting_stats bs),'[]'::jsonb),
 'bowling_scorecard',coalesce((select jsonb_agg(jsonb_build_object('player_id',bs.player_id,'name',bs.display_name,'photo_url',bs.profile_image_url,'overs',(bs.legal_balls/m.format_balls_per_over)::text||'.'||(bs.legal_balls%m.format_balls_per_over)::text,'maidens',bs.maidens,'runs',bs.runs,'wickets',bs.wickets,'economy',case when bs.legal_balls=0 then 0 else round(bs.runs::numeric*m.format_balls_per_over/bs.legal_balls,2) end,'is_current',bs.player_id=s.bowler_id) order by bs.lineup_order) from bowling_stats bs where bs.legal_balls>0 or bs.player_id=s.bowler_id),'[]'::jsonb),
 'playing_xi',jsonb_build_object(
   'home',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'photo_url',p.profile_image_url,'role',p.primary_role,'batting_style',p.batting_style,'bowling_style',p.bowling_style,'order',xi.lineup_order) order by xi.lineup_order) from public.match_playing_xi xi join public.players p on p.id=xi.player_id where xi.match_id=p_match_id and xi.team_id=m.home_team_id),'[]'::jsonb),
   'away',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'photo_url',p.profile_image_url,'role',p.primary_role,'batting_style',p.batting_style,'bowling_style',p.bowling_style,'order',xi.lineup_order) order by xi.lineup_order) from public.match_playing_xi xi join public.players p on p.id=xi.player_id where xi.match_id=p_match_id and xi.team_id=m.away_team_id),'[]'::jsonb)
 ),
 'innings_history',coalesce((select jsonb_agg(jsonb_build_object('innings_no',i.innings_no,'team',i.batting_name,'team_short',i.batting_short,'team_logo',i.batting_logo,'runs',i.total_runs,'wickets',i.wickets,'legal_balls',i.legal_balls,'target',i.target_runs,'status',i.status) order by i.innings_no) from innings_rows i),'[]'::jsonb),
 'last_delivery',coalesce((select jsonb_build_object(
   'id',d.id,'sequence_no',d.sequence_no,'label',d.delivery_label,'runs_off_bat',d.runs_off_bat,'is_wicket',d.is_wicket,'wicket_kind',d.wicket_kind,
   'dismissed_player',coalesce((select jsonb_build_object('id',p.id,'name',p.display_name,'photo_url',p.profile_image_url) from public.players p where p.id=d.dismissed_player_id),'{}'::jsonb)
 ) from last_delivery d),'{}'::jsonb)
)
from m
left join s on true
left join public.teams ht on ht.id=m.home_team_id
left join public.teams at on at.id=m.away_team_id
left join public.teams bt on bt.id=s.batting_team_id
left join public.teams bw on bw.id=s.bowling_team_id;
$$;

revoke all on function public.ips_broadcast_match_data(uuid) from public;
grant execute on function public.ips_broadcast_match_data(uuid) to anon,authenticated,service_role;

create or replace function public.ips_broadcast_sponsor_state(p_match_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path=public,auth
as $$
declare tid uuid;
begin
  if not public.ips_can_direct_match(p_match_id) then raise exception 'Not allowed to manage sponsors for this match.'; end if;
  select tournament_id into tid from public.matches where id=p_match_id;
  if tid is null then raise exception 'Match not found.'; end if;

  return jsonb_build_object(
    'tournament_id',tid,
    'sponsors',coalesce((
      select jsonb_agg(to_jsonb(s) order by s.created_at desc)
      from public.broadcast_sponsors s
      where s.tournament_id=tid
    ),'[]'::jsonb),
    'playlists',coalesce((
      select jsonb_agg(
        to_jsonb(p) || jsonb_build_object(
          'items',coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'sponsor_id',i.sponsor_id,
                'position',i.position,
                'duration_ms',i.duration_ms,
                'sponsor',jsonb_build_object(
                  'id',s.id,'name',s.name,'logo_url',s.logo_url,'message',s.message,'status',s.status,'metadata',s.metadata
                )
              ) order by i.position
            )
            from public.broadcast_sponsor_playlist_items i
            join public.broadcast_sponsors s on s.id=i.sponsor_id
            where i.playlist_id=p.id
          ),'[]'::jsonb)
        ) order by p.created_at desc
      )
      from public.broadcast_sponsor_playlists p
      where p.tournament_id=tid
    ),'[]'::jsonb)
  );
end
$$;
revoke all on function public.ips_broadcast_sponsor_state(uuid) from public,anon;
grant execute on function public.ips_broadcast_sponsor_state(uuid) to authenticated,service_role;

create or replace function public.ips_broadcast_save_sponsor(
  p_match_id uuid,
  p_sponsor_id uuid,
  p_name text,
  p_message text default 'SPONSORED BY',
  p_logo_url text default null,
  p_status text default 'ACTIVE',
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql security definer
set search_path=public,auth
as $$
declare tid uuid; sid uuid;
begin
  if not public.ips_can_direct_match(p_match_id) then raise exception 'Not allowed to manage sponsors for this match.'; end if;
  select tournament_id into tid from public.matches where id=p_match_id;
  if tid is null then raise exception 'Match not found.'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'Sponsor name is required.'; end if;
  if upper(coalesce(p_status,'')) not in ('ACTIVE','INACTIVE','ARCHIVED') then raise exception 'Invalid sponsor status.'; end if;

  if p_sponsor_id is null then
    insert into public.broadcast_sponsors(tournament_id,name,logo_url,message,status,metadata,created_by)
    values(tid,trim(p_name),nullif(trim(p_logo_url),''),coalesce(nullif(trim(p_message),''),'SPONSORED BY'),upper(p_status),coalesce(p_metadata,'{}'::jsonb),auth.uid())
    returning id into sid;
  else
    update public.broadcast_sponsors
    set name=trim(p_name),
        logo_url=nullif(trim(p_logo_url),''),
        message=coalesce(nullif(trim(p_message),''),'SPONSORED BY'),
        status=upper(p_status),
        metadata=coalesce(p_metadata,'{}'::jsonb)
    where id=p_sponsor_id and tournament_id=tid
    returning id into sid;
    if sid is null then raise exception 'Sponsor not found for this tournament.'; end if;
  end if;

  return public.ips_broadcast_sponsor_state(p_match_id);
end
$$;
revoke all on function public.ips_broadcast_save_sponsor(uuid,uuid,text,text,text,text,jsonb) from public,anon;
grant execute on function public.ips_broadcast_save_sponsor(uuid,uuid,text,text,text,text,jsonb) to authenticated,service_role;

create or replace function public.ips_broadcast_set_sponsor_status(
  p_match_id uuid,p_sponsor_id uuid,p_status text
)
returns jsonb
language plpgsql security definer
set search_path=public,auth
as $$
declare tid uuid;
begin
  if not public.ips_can_direct_match(p_match_id) then raise exception 'Not allowed to manage sponsors for this match.'; end if;
  select tournament_id into tid from public.matches where id=p_match_id;
  if upper(coalesce(p_status,'')) not in ('ACTIVE','INACTIVE','ARCHIVED') then raise exception 'Invalid sponsor status.'; end if;
  update public.broadcast_sponsors set status=upper(p_status) where id=p_sponsor_id and tournament_id=tid;
  if not found then raise exception 'Sponsor not found for this tournament.'; end if;
  return public.ips_broadcast_sponsor_state(p_match_id);
end
$$;
revoke all on function public.ips_broadcast_set_sponsor_status(uuid,uuid,text) from public,anon;
grant execute on function public.ips_broadcast_set_sponsor_status(uuid,uuid,text) to authenticated,service_role;

create or replace function public.ips_broadcast_save_sponsor_playlist(
  p_match_id uuid,
  p_playlist_id uuid,
  p_name text,
  p_rotation_interval_ms integer,
  p_sponsor_ids uuid[]
)
returns jsonb
language plpgsql security definer
set search_path=public,auth
as $$
declare tid uuid; pid uuid; sid uuid; pos integer:=0;
begin
  if not public.ips_can_direct_match(p_match_id) then raise exception 'Not allowed to manage sponsor playlists for this match.'; end if;
  select tournament_id into tid from public.matches where id=p_match_id;
  if tid is null then raise exception 'Match not found.'; end if;
  if p_rotation_interval_ms not between 1000 and 600000 then raise exception 'Invalid sponsor rotation interval.'; end if;

  if p_playlist_id is null then
    insert into public.broadcast_sponsor_playlists(tournament_id,name,rotation_interval_ms,created_by)
    values(tid,coalesce(nullif(trim(p_name),''),'Sponsor Rotation'),p_rotation_interval_ms,auth.uid())
    returning id into pid;
  else
    update public.broadcast_sponsor_playlists
    set name=coalesce(nullif(trim(p_name),''),'Sponsor Rotation'),rotation_interval_ms=p_rotation_interval_ms
    where id=p_playlist_id and tournament_id=tid returning id into pid;
    if pid is null then raise exception 'Playlist not found.'; end if;
    delete from public.broadcast_sponsor_playlist_items where playlist_id=pid;
  end if;

  foreach sid in array coalesce(p_sponsor_ids,'{}'::uuid[]) loop
    if exists(select 1 from public.broadcast_sponsors s where s.id=sid and s.tournament_id=tid and s.status='ACTIVE') then
      insert into public.broadcast_sponsor_playlist_items(playlist_id,sponsor_id,position,duration_ms)
      values(pid,sid,pos,p_rotation_interval_ms);
      pos:=pos+1;
    end if;
  end loop;

  return public.ips_broadcast_sponsor_state(p_match_id);
end
$$;
revoke all on function public.ips_broadcast_save_sponsor_playlist(uuid,uuid,text,integer,uuid[]) from public,anon;
grant execute on function public.ips_broadcast_save_sponsor_playlist(uuid,uuid,text,integer,uuid[]) to authenticated,service_role;

create or replace function public.ips_broadcast_log_sponsor_exposure(
  p_match_id uuid,
  p_sponsor_id uuid,
  p_scene_key text,
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_duration_ms bigint,
  p_metadata jsonb,
  p_exposure_key text
)
returns uuid
language plpgsql security definer
set search_path=public
as $$
declare tid uuid; eid uuid;
begin
  select tournament_id into tid from public.matches where id=p_match_id;
  if tid is null then return null; end if;
  if not exists(select 1 from public.broadcast_sponsors s where s.id=p_sponsor_id and s.tournament_id=tid) then return null; end if;

  insert into public.broadcast_sponsor_exposure(match_id,sponsor_id,scene_key,started_at,ended_at,duration_ms,metadata,exposure_key)
  values(p_match_id,p_sponsor_id,nullif(p_scene_key,''),coalesce(p_started_at,now()),p_ended_at,p_duration_ms,coalesce(p_metadata,'{}'::jsonb),nullif(p_exposure_key,''))
  on conflict(exposure_key) where exposure_key is not null do update
    set ended_at=coalesce(excluded.ended_at,broadcast_sponsor_exposure.ended_at),
        duration_ms=coalesce(excluded.duration_ms,broadcast_sponsor_exposure.duration_ms),
        metadata=broadcast_sponsor_exposure.metadata||excluded.metadata
  returning id into eid;
  return eid;
end
$$;
revoke all on function public.ips_broadcast_log_sponsor_exposure(uuid,uuid,text,timestamptz,timestamptz,bigint,jsonb,text) from public;
grant execute on function public.ips_broadcast_log_sponsor_exposure(uuid,uuid,text,timestamptz,timestamptz,bigint,jsonb,text) to anon,authenticated,service_role;

update public.broadcast_package_releases
set manifest=jsonb_set(
  manifest,
  '{variants,sponsor.fullscreen}',
  jsonb_build_object(
    'name','Sponsor Fullscreen',
    'document',jsonb_build_object(
      'schemaVersion',1,
      'name','Sponsor Fullscreen',
      'canvas',jsonb_build_object('width',1920,'height',1080,'transparent',true),
      'safeArea',jsonb_build_object('top',54,'left',96,'right',96,'bottom',54),
      'elements','[]'::jsonb,
      'metadata',jsonb_build_object('scene','sponsor','variant','fullscreen','factory','IPS PRISM')
    ),
    'priority',95,
    'sceneKey','sponsor',
    'directTake',true,
    'durationMs',5000,
    'variantKey','fullscreen',
    'presentation','FULLSCREEN',
    'conflictBehavior','HIDE_SCOREBAR',
    'replacementGroup','fullscreen',
    'variantVersionId',gen_random_uuid()::text,
    'automationEligible',false
  ),
  true
)
where package_id in (select id from public.broadcast_packages where slug in ('ips-prism','ips-prism-custom'));

commit;
