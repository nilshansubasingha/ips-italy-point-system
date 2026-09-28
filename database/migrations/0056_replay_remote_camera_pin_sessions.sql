begin;

create table if not exists public.broadcast_camera_sessions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null unique references public.matches(id) on delete cascade,
  pin text not null,
  realtime_key uuid not null default gen_random_uuid(),
  active boolean not null default true,
  expires_at timestamptz not null default (now()+interval '12 hours'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint broadcast_camera_sessions_pin_format check (pin ~ '^[0-9]{6}$')
);

alter table public.broadcast_camera_sessions enable row level security;

create or replace function public.ips_camera_session_get_or_create(
  p_match_id uuid,
  p_rotate boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_session public.broadcast_camera_sessions%rowtype;
  v_pin text;
  v_tries integer:=0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.ips_can_direct_match(p_match_id) then
    raise exception 'Not authorized for this match';
  end if;

  select * into v_session
  from public.broadcast_camera_sessions
  where match_id=p_match_id
  for update;

  if found and not p_rotate and v_session.active and v_session.expires_at>now() then
    return jsonb_build_object(
      'id',v_session.id,
      'match_id',v_session.match_id,
      'pin',v_session.pin,
      'realtime_key',v_session.realtime_key,
      'expires_at',v_session.expires_at,
      'active',v_session.active
    );
  end if;

  loop
    v_pin:=lpad((floor(random()*900000)+100000)::int::text,6,'0');
    exit when not exists (
      select 1 from public.broadcast_camera_sessions
      where pin=v_pin and active and expires_at>now() and match_id<>p_match_id
    );
    v_tries:=v_tries+1;
    if v_tries>20 then raise exception 'Could not allocate camera PIN'; end if;
  end loop;

  insert into public.broadcast_camera_sessions(
    match_id,pin,realtime_key,active,expires_at,created_by,updated_at
  )
  values(
    p_match_id,v_pin,gen_random_uuid(),true,now()+interval '12 hours',auth.uid(),now()
  )
  on conflict(match_id) do update set
    pin=excluded.pin,
    realtime_key=excluded.realtime_key,
    active=true,
    expires_at=excluded.expires_at,
    created_by=auth.uid(),
    updated_at=now()
  returning * into v_session;

  return jsonb_build_object(
    'id',v_session.id,
    'match_id',v_session.match_id,
    'pin',v_session.pin,
    'realtime_key',v_session.realtime_key,
    'expires_at',v_session.expires_at,
    'active',v_session.active
  );
end;
$$;

create or replace function public.ips_camera_join(
  p_pin text,
  p_channel_no integer,
  p_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_session public.broadcast_camera_sessions%rowtype;
  v_connection_id uuid:=gen_random_uuid();
  v_match record;
begin
  if p_channel_no not between 1 and 4 then
    raise exception 'Camera channel must be between 1 and 4';
  end if;

  select * into v_session
  from public.broadcast_camera_sessions
  where pin=regexp_replace(coalesce(p_pin,''),'[^0-9]','','g')
    and active
    and expires_at>now()
  order by updated_at desc
  limit 1;

  if not found then
    raise exception 'Invalid or expired camera PIN';
  end if;

  select
    m.id,
    m.match_code,
    coalesce(h.name,'HOME') as home_name,
    coalesce(a.name,'AWAY') as away_name
  into v_match
  from public.matches m
  left join public.teams h on h.id=m.home_team_id
  left join public.teams a on a.id=m.away_team_id
  where m.id=v_session.match_id;

  return jsonb_build_object(
    'session_id',v_session.id,
    'match_id',v_session.match_id,
    'match_code',v_match.match_code,
    'home_name',v_match.home_name,
    'away_name',v_match.away_name,
    'realtime_key',v_session.realtime_key,
    'connection_id',v_connection_id,
    'channel_no',p_channel_no,
    'label',coalesce(nullif(trim(p_label),''),'CAM '||p_channel_no),
    'expires_at',v_session.expires_at
  );
end;
$$;

create or replace function public.ips_camera_session_close(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path=public,auth
as $$
begin
  if auth.uid() is null or not public.ips_can_direct_match(p_match_id) then
    raise exception 'Not authorized for this match';
  end if;
  update public.broadcast_camera_sessions
  set active=false,updated_at=now()
  where match_id=p_match_id;
end;
$$;

revoke all on function public.ips_camera_session_get_or_create(uuid,boolean) from public;
revoke all on function public.ips_camera_join(text,integer,text) from public;
revoke all on function public.ips_camera_session_close(uuid) from public;

grant execute on function public.ips_camera_session_get_or_create(uuid,boolean) to authenticated,service_role;
grant execute on function public.ips_camera_session_close(uuid) to authenticated,service_role;
grant execute on function public.ips_camera_join(text,integer,text) to anon,authenticated,service_role;

commit;
