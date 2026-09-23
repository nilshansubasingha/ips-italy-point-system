-- IPS Project 5.6 — registration, duplicate resolution, provisional rosters and transfers.
-- Product terminology:
--   public.clubs = Team identity (legacy physical table name)
--   public.teams = Competitive side

begin;

-- ---------- Private account/profile registration fields ----------
alter table public.profiles
  add column if not exists full_name text,
  add column if not exists date_of_birth date,
  add column if not exists phone text,
  add column if not exists city_id uuid references public.cities(id) on delete set null;

-- Canonical private identity data is deliberately separated from the public players table.
create table if not exists public.player_private_identities (
  player_id uuid primary key references public.players(id) on delete cascade,
  full_name text,
  date_of_birth date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- New Team request ----------
create table if not exists public.team_registration_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references auth.users(id) on delete cascade,
  city_id uuid not null references public.cities(id) on delete restrict,
  proposed_name text not null,
  proposed_short_name text,
  proposed_structure text not null default 'SINGLE' check (proposed_structure in ('SINGLE','A_B','A_B_C')),
  category text not null default 'OPEN',
  status text not null default 'PENDING_EMAIL' check (status in ('PENDING_EMAIL','PENDING','CHANGES_REQUESTED','APPROVED','REJECTED')),
  approved_team_identity_id uuid references public.clubs(id) on delete set null,
  reviewer_id uuid references auth.users(id) on delete set null,
  reviewer_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ix_team_registration_requests_city_status on public.team_registration_requests(city_id,status);
create index if not exists ix_team_registration_requests_requester on public.team_registration_requests(requested_by);

-- Provisional names never become official players automatically.
create table if not exists public.team_request_members (
  id uuid primary key default gen_random_uuid(),
  team_request_id uuid not null references public.team_registration_requests(id) on delete cascade,
  account_user_id uuid references auth.users(id) on delete set null,
  full_name text not null,
  display_name text not null,
  date_of_birth date,
  email text,
  phone text,
  requested_side_label text not null default 'MAIN',
  primary_role text,
  matched_player_id uuid references public.players(id) on delete set null,
  approved_player_id uuid references public.players(id) on delete set null,
  status text not null default 'PROVISIONAL' check (status in ('PROVISIONAL','POSSIBLE_MATCH','ACCOUNT_REQUEST','APPROVED','TRANSFER_REQUIRED','REJECTED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ix_team_request_members_request on public.team_request_members(team_request_id);
create index if not exists ix_team_request_members_match on public.team_request_members(matched_player_id);

-- ---------- Player account registration ----------
create table if not exists public.player_registration_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  display_name text not null,
  date_of_birth date,
  phone text,
  city_id uuid not null references public.cities(id) on delete restrict,
  requested_team_identity_id uuid references public.clubs(id) on delete set null,
  requested_side_id uuid references public.teams(id) on delete set null,
  requested_side_label text,
  linked_team_request_id uuid references public.team_registration_requests(id) on delete set null,
  primary_role text,
  status text not null default 'PENDING_EMAIL' check (status in ('PENDING_EMAIL','PENDING','POSSIBLE_MATCH','CHANGES_REQUESTED','TRANSFER_REQUIRED','APPROVED','REJECTED')),
  matched_player_id uuid references public.players(id) on delete set null,
  approved_player_id uuid references public.players(id) on delete set null,
  reviewer_id uuid references auth.users(id) on delete set null,
  reviewer_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ux_player_registration_open_user
  on public.player_registration_requests(user_id)
  where status in ('PENDING_EMAIL','PENDING','POSSIBLE_MATCH','CHANGES_REQUESTED','TRANSFER_REQUIRED');
create index if not exists ix_player_registration_city_status on public.player_registration_requests(city_id,status);
create index if not exists ix_player_registration_team_status on public.player_registration_requests(requested_team_identity_id,status);

-- ---------- Team transfers ----------
create table if not exists public.player_transfer_requests (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete restrict,
  from_team_identity_id uuid not null references public.clubs(id) on delete restrict,
  from_side_id uuid references public.teams(id) on delete set null,
  to_team_identity_id uuid not null references public.clubs(id) on delete restrict,
  to_side_id uuid not null references public.teams(id) on delete restrict,
  player_registration_request_id uuid references public.player_registration_requests(id) on delete set null,
  team_request_member_id uuid references public.team_request_members(id) on delete set null,
  requested_by uuid references auth.users(id) on delete set null,
  status text not null default 'REQUESTED' check (status in ('REQUESTED','RELEASED','APPROVED','REJECTED','CANCELLED')),
  release_by uuid references auth.users(id) on delete set null,
  released_at timestamptz,
  final_review_by uuid references auth.users(id) on delete set null,
  final_review_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ux_open_player_transfer
  on public.player_transfer_requests(player_id,to_team_identity_id)
  where status in ('REQUESTED','RELEASED');
create index if not exists ix_player_transfers_status on public.player_transfer_requests(status);

-- ---------- RLS ----------
alter table public.player_private_identities enable row level security;
alter table public.team_registration_requests enable row level security;
alter table public.team_request_members enable row level security;
alter table public.player_registration_requests enable row level security;
alter table public.player_transfer_requests enable row level security;

drop policy if exists "players read own private identity" on public.player_private_identities;
create policy "players read own private identity" on public.player_private_identities
for select to authenticated
using (
  exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.linked_player_id=player_id)
  or public.ips_is_owner()
);

drop policy if exists "users read own player registration" on public.player_registration_requests;
create policy "users read own player registration" on public.player_registration_requests
for select to authenticated using (user_id=(select auth.uid()));

drop policy if exists "requesters read own team registration" on public.team_registration_requests;
create policy "requesters read own team registration" on public.team_registration_requests
for select to authenticated using (requested_by=(select auth.uid()));

drop policy if exists "requesters read own team request members" on public.team_request_members;
create policy "requesters read own team request members" on public.team_request_members
for select to authenticated
using (exists(
  select 1 from public.team_registration_requests r
  where r.id=team_request_id and r.requested_by=(select auth.uid())
));

drop policy if exists "players read own transfers" on public.player_transfer_requests;
create policy "players read own transfers" on public.player_transfer_requests
for select to authenticated
using (exists(
  select 1 from public.profiles p
  where p.id=(select auth.uid()) and p.linked_player_id=player_id
));

-- ---------- Helpers ----------
create or replace function public.ips_try_uuid(p_value text)
returns uuid
language plpgsql immutable
set search_path=public as $$
begin
  if nullif(trim(coalesce(p_value,'')),'') is null then return null; end if;
  return trim(p_value)::uuid;
exception when others then return null;
end $$;

create or replace function public.ips_safe_normalize_phone(p_value text)
returns text
language plpgsql immutable
set search_path=public as $$
begin
  if nullif(trim(coalesce(p_value,'')),'') is null then return null; end if;
  return public.ips_normalize_phone(p_value);
exception when others then return null;
end $$;

create or replace function public.ips_registration_account_confirmed(p_user_id uuid)
returns boolean
language sql stable security definer
set search_path=public,auth as $$
  select coalesce((select email_confirmed_at is not null or phone_confirmed_at is not null from auth.users where id=p_user_id),false);
$$;

create or replace function public.ips_can_review_player_registration(p_request_id uuid)
returns boolean
language sql stable security definer
set search_path=public,auth as $$
  select exists(
    select 1
    from public.player_registration_requests r
    where r.id=p_request_id
      and (
        public.ips_is_owner()
        or public.ips_has_role('ADMIN','GLOBAL',null)
        or public.ips_has_role('ADMIN','CITY',r.city_id)
        or (r.requested_team_identity_id is not null and (
          public.ips_has_role('ADMIN','CLUB',r.requested_team_identity_id)
          or public.ips_has_role('LEADER','CLUB',r.requested_team_identity_id)
        ))
        or (r.requested_side_id is not null and (
          public.ips_has_role('ADMIN','TEAM',r.requested_side_id)
          or public.ips_has_role('LEADER','TEAM',r.requested_side_id)
        ))
      )
  );
$$;

create or replace function public.ips_can_review_team_registration(p_request_id uuid)
returns boolean
language sql stable security definer
set search_path=public,auth as $$
  select exists(
    select 1 from public.team_registration_requests r
    where r.id=p_request_id
      and (
        public.ips_is_owner()
        or public.ips_has_role('ADMIN','GLOBAL',null)
        or public.ips_has_role('ADMIN','CITY',r.city_id)
      )
  );
$$;

create or replace function public.ips_can_review_team_request_member(p_member_id uuid)
returns boolean
language sql stable security definer
set search_path=public,auth as $$
  select exists(
    select 1
    from public.team_request_members m
    join public.team_registration_requests r on r.id=m.team_request_id
    where m.id=p_member_id
      and (
        public.ips_is_owner()
        or public.ips_has_role('ADMIN','GLOBAL',null)
        or public.ips_has_role('ADMIN','CITY',r.city_id)
        or (r.approved_team_identity_id is not null and (
          public.ips_has_role('ADMIN','CLUB',r.approved_team_identity_id)
          or public.ips_has_role('LEADER','CLUB',r.approved_team_identity_id)
        ))
      )
  );
$$;

-- ---------- Auth lifecycle ----------
create or replace function public.ips_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path='' as $$
declare
  v_city uuid;
  v_team uuid;
  v_side uuid;
  v_team_req uuid;
  v_full text;
  v_display text;
  v_dob date;
  v_phone text;
  v_missing boolean;
  v_team_name text;
  v_structure text;
  v_side_label text;
begin
  v_city := public.ips_try_uuid(NEW.raw_user_meta_data->>'city_id');
  v_team := public.ips_try_uuid(NEW.raw_user_meta_data->>'team_identity_id');
  v_side := public.ips_try_uuid(NEW.raw_user_meta_data->>'side_id');
  v_full := nullif(trim(coalesce(NEW.raw_user_meta_data->>'full_name','')),'');
  v_display := coalesce(nullif(trim(NEW.raw_user_meta_data->>'display_name'),''),v_full,split_part(coalesce(NEW.email,''),'@',1));
  v_phone := nullif(trim(coalesce(NEW.raw_user_meta_data->>'phone','')),'');
  v_missing := coalesce((NEW.raw_user_meta_data->>'team_not_listed')::boolean,false);
  v_team_name := nullif(trim(coalesce(NEW.raw_user_meta_data->>'proposed_team_name','')),'');
  v_structure := upper(coalesce(nullif(trim(NEW.raw_user_meta_data->>'proposed_team_structure'),''),'SINGLE'));
  v_side_label := upper(coalesce(nullif(trim(NEW.raw_user_meta_data->>'requested_side_label'),''),'MAIN'));
  begin v_dob := nullif(NEW.raw_user_meta_data->>'date_of_birth','')::date; exception when others then v_dob := null; end;

  insert into public.profiles(id,email,display_name,avatar_url,full_name,date_of_birth,phone,city_id)
  values(NEW.id,NEW.email,v_display,NEW.raw_user_meta_data->>'avatar_url',v_full,v_dob,v_phone,v_city)
  on conflict(id) do update set
    email=excluded.email,
    display_name=coalesce(public.profiles.display_name,excluded.display_name),
    full_name=coalesce(public.profiles.full_name,excluded.full_name),
    date_of_birth=coalesce(public.profiles.date_of_birth,excluded.date_of_birth),
    phone=coalesce(public.profiles.phone,excluded.phone),
    city_id=coalesce(public.profiles.city_id,excluded.city_id),
    updated_at=now();

  if NEW.raw_user_meta_data->>'registration_intent'='PLAYER' and v_city is not null and v_full is not null then
    if v_missing and v_team_name is not null then
      if v_structure not in ('SINGLE','A_B','A_B_C') then v_structure:='SINGLE'; end if;
      insert into public.team_registration_requests(
        requested_by,city_id,proposed_name,proposed_short_name,proposed_structure,category,status
      ) values(
        NEW.id,v_city,v_team_name,nullif(trim(NEW.raw_user_meta_data->>'proposed_team_short_name'),''),
        v_structure,coalesce(nullif(trim(NEW.raw_user_meta_data->>'proposed_team_category'),''),'OPEN'),'PENDING_EMAIL'
      ) returning id into v_team_req;

      insert into public.team_request_members(
        team_request_id,account_user_id,full_name,display_name,date_of_birth,email,phone,requested_side_label,primary_role,status
      ) values(
        v_team_req,NEW.id,v_full,v_display,v_dob,NEW.email,v_phone,v_side_label,
        nullif(trim(NEW.raw_user_meta_data->>'primary_role'),''),
        'ACCOUNT_REQUEST'
      );
    end if;

    insert into public.player_registration_requests(
      user_id,full_name,display_name,date_of_birth,phone,city_id,
      requested_team_identity_id,requested_side_id,requested_side_label,linked_team_request_id,
      primary_role,status
    ) values(
      NEW.id,v_full,v_display,v_dob,v_phone,v_city,
      case when v_missing then null else v_team end,
      case when v_missing then null else v_side end,
      v_side_label,v_team_req,nullif(trim(NEW.raw_user_meta_data->>'primary_role'),''),
      'PENDING_EMAIL'
    )
    on conflict do nothing;
  end if;

  return NEW;
end $$;

create or replace function public.ips_handle_user_confirmation()
returns trigger
language plpgsql
security definer
set search_path='' as $$
begin
  if (NEW.email_confirmed_at is not null or NEW.phone_confirmed_at is not null)
     and (coalesce(OLD.email_confirmed_at,OLD.phone_confirmed_at) is null) then
    update public.player_registration_requests
      set status=case when linked_team_request_id is null then 'PENDING' else 'PENDING' end,updated_at=now()
      where user_id=NEW.id and status='PENDING_EMAIL';
    update public.team_registration_requests
      set status='PENDING',updated_at=now()
      where requested_by=NEW.id and status='PENDING_EMAIL';
  end if;
  return NEW;
end $$;

drop trigger if exists on_ips_auth_user_confirmed on auth.users;
create trigger on_ips_auth_user_confirmed
after update of email_confirmed_at,phone_confirmed_at on auth.users
for each row execute function public.ips_handle_user_confirmation();

-- ---------- Self-service status and provisional roster ----------
create or replace function public.ips_my_registration_status()
returns jsonb
language sql stable security definer
set search_path=public,auth as $$
  select jsonb_build_object(
    'player_request',(
      select jsonb_build_object(
        'id',r.id,'status',r.status,'full_name',r.full_name,'display_name',r.display_name,
        'city',c.name,
        'team_identity_id',r.requested_team_identity_id,
        'team_name',coalesce(ti.name,tr.proposed_name),
        'side_id',r.requested_side_id,
        'side_name',s.name,
        'team_request_id',r.linked_team_request_id,
        'approved_player_id',r.approved_player_id,
        'matched_player_id',r.matched_player_id,
        'reviewer_note',r.reviewer_note,
        'created_at',r.created_at
      )
      from public.player_registration_requests r
      join public.cities c on c.id=r.city_id
      left join public.clubs ti on ti.id=r.requested_team_identity_id
      left join public.teams s on s.id=r.requested_side_id
      left join public.team_registration_requests tr on tr.id=r.linked_team_request_id
      where r.user_id=auth.uid()
      order by r.created_at desc limit 1
    ),
    'team_request',(
      select jsonb_build_object(
        'id',tr.id,'status',tr.status,'name',tr.proposed_name,'structure',tr.proposed_structure,
        'city',c.name,'approved_team_identity_id',tr.approved_team_identity_id,
        'reviewer_note',tr.reviewer_note,
        'member_count',(select count(*) from public.team_request_members m where m.team_request_id=tr.id)
      )
      from public.team_registration_requests tr
      join public.cities c on c.id=tr.city_id
      where tr.requested_by=auth.uid()
      order by tr.created_at desc limit 1
    )
  );
$$;

create or replace function public.ips_add_team_request_member(
  p_team_request_id uuid,
  p_full_name text,
  p_display_name text default null,
  p_date_of_birth date default null,
  p_email text default null,
  p_phone text default null,
  p_side_label text default 'MAIN',
  p_primary_role text default null
)
returns uuid
language plpgsql security definer
set search_path=public,auth as $$
declare v_id uuid; v_structure text; v_label text;
begin
  if not exists(
    select 1 from public.team_registration_requests
    where id=p_team_request_id and requested_by=auth.uid() and status in ('PENDING_EMAIL','PENDING','CHANGES_REQUESTED')
  ) then raise exception 'You cannot edit this Team request.'; end if;
  if coalesce(trim(p_full_name),'')='' then raise exception 'Full name is required.'; end if;
  select proposed_structure into v_structure from public.team_registration_requests where id=p_team_request_id;
  v_label:=upper(coalesce(nullif(trim(p_side_label),''),'MAIN'));
  if v_structure='SINGLE' then v_label:='MAIN'; end if;
  if v_structure='A_B' and v_label not in ('A','B') then raise exception 'Choose A or B for this Team request.'; end if;
  if v_structure='A_B_C' and v_label not in ('A','B','C') then raise exception 'Choose A, B or C for this Team request.'; end if;

  insert into public.team_request_members(
    team_request_id,full_name,display_name,date_of_birth,email,phone,requested_side_label,primary_role,status
  ) values(
    p_team_request_id,trim(p_full_name),coalesce(nullif(trim(p_display_name),''),trim(p_full_name)),
    p_date_of_birth,nullif(lower(trim(coalesce(p_email,''))),''),
    nullif(trim(coalesce(p_phone,'')),''),
    v_label,nullif(trim(coalesce(p_primary_role,'')),''),
    'PROVISIONAL'
  ) returning id into v_id;

  update public.team_registration_requests set updated_at=now() where id=p_team_request_id;
  return v_id;
end $$;

create or replace function public.ips_remove_team_request_member(p_member_id uuid)
returns void
language plpgsql security definer
set search_path=public,auth as $$
begin
  if not exists(
    select 1 from public.team_request_members m
    join public.team_registration_requests r on r.id=m.team_request_id
    where m.id=p_member_id and r.requested_by=auth.uid()
      and m.account_user_id is null
      and r.status in ('PENDING_EMAIL','PENDING','CHANGES_REQUESTED')
  ) then raise exception 'This provisional member cannot be removed.'; end if;
  delete from public.team_request_members where id=p_member_id;
end $$;

-- ---------- Duplicate candidates ----------
create or replace function public.ips_registration_possible_matches(p_request_id uuid)
returns table(
  player_id uuid,ips_code text,display_name text,current_team_name text,current_city_name text,
  birth_year integer,match_reason text,strong_match boolean
)
language plpgsql stable security definer
set search_path=public,auth as $$
declare r public.player_registration_requests; v_email text; v_phone text;
begin
  if not public.ips_can_review_player_registration(p_request_id)
     and not exists(select 1 from public.player_registration_requests x where x.id=p_request_id and x.user_id=auth.uid())
  then raise exception 'Not authorised to inspect this registration.'; end if;

  select * into r from public.player_registration_requests where id=p_request_id;
  if not found then raise exception 'Registration not found.'; end if;
  select lower(email) into v_email from auth.users where id=r.user_id;
  v_phone:=public.ips_safe_normalize_phone(r.phone);

  return query
  select p.id,p.ips_code,p.display_name,cur.team_name,cur.city_name,
    extract(year from pi.date_of_birth)::integer,
    case
      when v_email is not null and exists(select 1 from public.player_contacts pc where pc.player_id=p.id and pc.contact_type='EMAIL' and lower(pc.value_normalized)=v_email) then 'Exact verified email'
      when v_phone is not null and exists(select 1 from public.player_contacts pc where pc.player_id=p.id and pc.contact_type='PHONE' and pc.value_normalized=v_phone) then 'Exact phone'
      when r.date_of_birth is not null and pi.date_of_birth=r.date_of_birth and lower(coalesce(pi.full_name,''))=lower(r.full_name) then 'Full name + date of birth'
      when lower(p.display_name)=lower(r.display_name) then 'Same display name'
      else 'Similar identity'
    end,
    (
      (v_email is not null and exists(select 1 from public.player_contacts pc where pc.player_id=p.id and pc.contact_type='EMAIL' and lower(pc.value_normalized)=v_email))
      or (v_phone is not null and exists(select 1 from public.player_contacts pc where pc.player_id=p.id and pc.contact_type='PHONE' and pc.value_normalized=v_phone))
      or (r.date_of_birth is not null and pi.date_of_birth=r.date_of_birth and lower(coalesce(pi.full_name,''))=lower(r.full_name))
    )
  from public.players p
  left join public.player_private_identities pi on pi.player_id=p.id
  left join lateral(
    select t.name team_name,cit.name city_name
    from public.team_memberships tm
    join public.teams t on t.id=tm.team_id
    join public.clubs c on c.id=t.club_id
    join public.cities cit on cit.id=c.city_id
    where tm.player_id=p.id and tm.status='ACTIVE' and tm.end_on is null
    order by tm.is_primary desc,tm.start_on desc limit 1
  ) cur on true
  where p.status='ACTIVE' and (
    lower(p.display_name)=lower(r.display_name)
    or lower(coalesce(pi.full_name,''))=lower(r.full_name)
    or (r.date_of_birth is not null and pi.date_of_birth=r.date_of_birth)
    or (v_email is not null and exists(select 1 from public.player_contacts pc where pc.player_id=p.id and pc.contact_type='EMAIL' and lower(pc.value_normalized)=v_email))
    or (v_phone is not null and exists(select 1 from public.player_contacts pc where pc.player_id=p.id and pc.contact_type='PHONE' and pc.value_normalized=v_phone))
  )
  order by strong_match desc,p.display_name,p.ips_code
  limit 15;
end $$;

create or replace function public.ips_team_member_possible_matches(p_member_id uuid)
returns table(
  player_id uuid,ips_code text,display_name text,current_team_name text,current_city_name text,
  birth_year integer,match_reason text,strong_match boolean
)
language plpgsql stable security definer
set search_path=public,auth as $$
declare m public.team_request_members; v_phone text;
begin
  if not public.ips_can_review_team_request_member(p_member_id)
     and not exists(
       select 1 from public.team_request_members mm
       join public.team_registration_requests rr on rr.id=mm.team_request_id
       where mm.id=p_member_id and rr.requested_by=auth.uid()
     )
  then raise exception 'Not authorised to inspect this member.'; end if;
  select * into m from public.team_request_members where id=p_member_id;
  if not found then raise exception 'Member not found.'; end if;
  v_phone:=public.ips_safe_normalize_phone(m.phone);

  return query
  select p.id,p.ips_code,p.display_name,cur.team_name,cur.city_name,
    extract(year from pi.date_of_birth)::integer,
    case
      when m.email is not null and exists(select 1 from public.player_contacts pc where pc.player_id=p.id and pc.contact_type='EMAIL' and lower(pc.value_normalized)=lower(m.email)) then 'Exact email'
      when v_phone is not null and exists(select 1 from public.player_contacts pc where pc.player_id=p.id and pc.contact_type='PHONE' and pc.value_normalized=v_phone) then 'Exact phone'
      when m.date_of_birth is not null and pi.date_of_birth=m.date_of_birth and lower(coalesce(pi.full_name,''))=lower(m.full_name) then 'Full name + date of birth'
      when lower(p.display_name)=lower(m.display_name) then 'Same display name'
      else 'Similar identity'
    end,
    (
      (m.email is not null and exists(select 1 from public.player_contacts pc where pc.player_id=p.id and pc.contact_type='EMAIL' and lower(pc.value_normalized)=lower(m.email)))
      or (v_phone is not null and exists(select 1 from public.player_contacts pc where pc.player_id=p.id and pc.contact_type='PHONE' and pc.value_normalized=v_phone))
      or (m.date_of_birth is not null and pi.date_of_birth=m.date_of_birth and lower(coalesce(pi.full_name,''))=lower(m.full_name))
    )
  from public.players p
  left join public.player_private_identities pi on pi.player_id=p.id
  left join lateral(
    select t.name team_name,cit.name city_name
    from public.team_memberships tm
    join public.teams t on t.id=tm.team_id
    join public.clubs c on c.id=t.club_id
    join public.cities cit on cit.id=c.city_id
    where tm.player_id=p.id and tm.status='ACTIVE' and tm.end_on is null
    order by tm.is_primary desc,tm.start_on desc limit 1
  ) cur on true
  where p.status='ACTIVE' and (
    lower(p.display_name)=lower(m.display_name)
    or lower(coalesce(pi.full_name,''))=lower(m.full_name)
    or (m.date_of_birth is not null and pi.date_of_birth=m.date_of_birth)
    or (m.email is not null and exists(select 1 from public.player_contacts pc where pc.player_id=p.id and pc.contact_type='EMAIL' and lower(pc.value_normalized)=lower(m.email)))
    or (v_phone is not null and exists(select 1 from public.player_contacts pc where pc.player_id=p.id and pc.contact_type='PHONE' and pc.value_normalized=v_phone))
  )
  order by strong_match desc,p.display_name,p.ips_code
  limit 15;
end $$;

-- ---------- Management queues ----------
create or replace function public.ips_registration_queue()
returns jsonb
language plpgsql stable security definer
set search_path=public,auth as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;

  select jsonb_build_object(
    'players',coalesce((
      select jsonb_agg(x order by x->>'created_at')
      from (
        select jsonb_build_object(
          'id',r.id,'status',r.status,'display_name',r.display_name,'full_name',r.full_name,
          'birth_year',extract(year from r.date_of_birth)::integer,
          'city_id',r.city_id,'city_name',ci.name,
          'team_identity_id',r.requested_team_identity_id,
          'team_name',coalesce(c.name,tr.proposed_name),
          'side_id',r.requested_side_id,'side_name',s.name,
          'team_request_id',r.linked_team_request_id,
          'created_at',r.created_at
        ) x
        from public.player_registration_requests r
        join public.cities ci on ci.id=r.city_id
        left join public.clubs c on c.id=r.requested_team_identity_id
        left join public.teams s on s.id=r.requested_side_id
        left join public.team_registration_requests tr on tr.id=r.linked_team_request_id
        where r.status in ('PENDING','POSSIBLE_MATCH','CHANGES_REQUESTED','TRANSFER_REQUIRED')
          and public.ips_can_review_player_registration(r.id)
      ) q
    ),'[]'::jsonb),
    'teams',coalesce((
      select jsonb_agg(x order by x->>'created_at')
      from (
        select jsonb_build_object(
          'id',r.id,'status',r.status,'name',r.proposed_name,'structure',r.proposed_structure,
          'city_id',r.city_id,'city_name',ci.name,
          'member_count',(select count(*) from public.team_request_members m where m.team_request_id=r.id),
          'created_at',r.created_at
        ) x
        from public.team_registration_requests r
        join public.cities ci on ci.id=r.city_id
        where r.status in ('PENDING','CHANGES_REQUESTED')
          and public.ips_can_review_team_registration(r.id)
      ) q
    ),'[]'::jsonb),
    'transfers',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',tr.id,'status',tr.status,'player_id',tr.player_id,'player_name',p.display_name,'ips_code',p.ips_code,
        'from_team_id',tr.from_team_identity_id,'from_team_name',fc.name,
        'to_team_id',tr.to_team_identity_id,'to_team_name',tc.name,
        'to_side_id',tr.to_side_id,'to_side_name',ts.name,'created_at',tr.created_at
      ) order by tr.created_at)
      from public.player_transfer_requests tr
      join public.players p on p.id=tr.player_id
      join public.clubs fc on fc.id=tr.from_team_identity_id
      join public.clubs tc on tc.id=tr.to_team_identity_id
      join public.teams ts on ts.id=tr.to_side_id
      where tr.status in ('REQUESTED','RELEASED')
        and (
          public.ips_is_owner() or public.ips_has_role('ADMIN','GLOBAL',null)
          or public.ips_has_role('ADMIN','CLUB',tr.from_team_identity_id)
          or public.ips_has_role('LEADER','CLUB',tr.from_team_identity_id)
          or public.ips_has_role('ADMIN','CLUB',tr.to_team_identity_id)
          or public.ips_has_role('LEADER','CLUB',tr.to_team_identity_id)
          or exists(select 1 from public.clubs c where c.id in (tr.from_team_identity_id,tr.to_team_identity_id) and public.ips_has_role('ADMIN','CITY',c.city_id))
        )
    ),'[]'::jsonb)
  ) into result;

  return result;
end $$;

create or replace function public.ips_registration_queue_counts()
returns jsonb
language sql stable security definer
set search_path=public,auth as $$
  select jsonb_build_object(
    'players',(select count(*) from public.player_registration_requests r where r.status in ('PENDING','POSSIBLE_MATCH','CHANGES_REQUESTED','TRANSFER_REQUIRED') and public.ips_can_review_player_registration(r.id)),
    'teams',(select count(*) from public.team_registration_requests r where r.status in ('PENDING','CHANGES_REQUESTED') and public.ips_can_review_team_registration(r.id)),
    'transfers',(select count(*) from public.player_transfer_requests tr where tr.status in ('REQUESTED','RELEASED') and (
      public.ips_is_owner() or public.ips_has_role('ADMIN','GLOBAL',null)
      or public.ips_has_role('ADMIN','CLUB',tr.from_team_identity_id)
      or public.ips_has_role('LEADER','CLUB',tr.from_team_identity_id)
      or public.ips_has_role('ADMIN','CLUB',tr.to_team_identity_id)
      or public.ips_has_role('LEADER','CLUB',tr.to_team_identity_id)
      or exists(select 1 from public.clubs c where c.id in (tr.from_team_identity_id,tr.to_team_identity_id) and public.ips_has_role('ADMIN','CITY',c.city_id))
    ))
  );
$$;

create or replace function public.ips_registration_request_detail(p_request_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path=public,auth as $$
declare result jsonb;
begin
  if not public.ips_can_review_player_registration(p_request_id) then raise exception 'Not authorised to review this registration.'; end if;
  select jsonb_build_object(
    'id',r.id,'status',r.status,'full_name',r.full_name,'display_name',r.display_name,
    'date_of_birth',r.date_of_birth,'phone_masked',case when r.phone is null then null else left(r.phone,4)||'••••'||right(r.phone,2) end,
    'email_masked',case when u.email is null then null else left(u.email,2)||'••••@'||split_part(u.email,'@',2) end,
    'account_confirmed',(u.email_confirmed_at is not null or u.phone_confirmed_at is not null),
    'city_id',r.city_id,'city_name',ci.name,
    'team_identity_id',r.requested_team_identity_id,'team_name',coalesce(c.name,tr.proposed_name),
    'side_id',r.requested_side_id,'side_name',s.name,'requested_side_label',r.requested_side_label,
    'primary_role',r.primary_role,'team_request_id',r.linked_team_request_id,
    'matched_player_id',r.matched_player_id,'approved_player_id',r.approved_player_id,
    'reviewer_note',r.reviewer_note,'created_at',r.created_at
  ) into result
  from public.player_registration_requests r
  join auth.users u on u.id=r.user_id
  join public.cities ci on ci.id=r.city_id
  left join public.clubs c on c.id=r.requested_team_identity_id
  left join public.teams s on s.id=r.requested_side_id
  left join public.team_registration_requests tr on tr.id=r.linked_team_request_id
  where r.id=p_request_id;
  return result;
end $$;

create or replace function public.ips_team_registration_detail(p_request_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path=public,auth as $$
declare result jsonb;
begin
  if not public.ips_can_review_team_registration(p_request_id)
     and not exists(select 1 from public.team_registration_requests r where r.id=p_request_id and r.requested_by=auth.uid())
  then raise exception 'Not authorised to review this Team request.'; end if;

  select jsonb_build_object(
    'id',r.id,'status',r.status,'name',r.proposed_name,'short_name',r.proposed_short_name,
    'structure',r.proposed_structure,'category',r.category,'city_id',r.city_id,'city_name',ci.name,
    'approved_team_identity_id',r.approved_team_identity_id,'reviewer_note',r.reviewer_note,
    'created_at',r.created_at,
    'members',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',m.id,'account_user_id',m.account_user_id,'full_name',m.full_name,'display_name',m.display_name,
        'birth_year',extract(year from m.date_of_birth)::integer,
        'email_masked',case when m.email is null then null else left(m.email,2)||'••••@'||split_part(m.email,'@',2) end,
        'phone_masked',case when m.phone is null then null else left(m.phone,4)||'••••'||right(m.phone,2) end,
        'side_label',m.requested_side_label,'primary_role',m.primary_role,'status',m.status,
        'matched_player_id',m.matched_player_id,'approved_player_id',m.approved_player_id
      ) order by m.created_at)
      from public.team_request_members m where m.team_request_id=r.id
    ),'[]'::jsonb)
  ) into result
  from public.team_registration_requests r
  join public.cities ci on ci.id=r.city_id
  where r.id=p_request_id;
  return result;
end $$;

-- ---------- Approval helpers ----------
create or replace function public.ips_link_user_to_player(p_user_id uuid,p_player_id uuid,p_actor uuid)
returns void
language plpgsql security definer
set search_path=public,auth as $$
begin
  if exists(select 1 from public.profiles where linked_player_id=p_player_id and id<>p_user_id) then
    raise exception 'This IPS player identity is already linked to another account.';
  end if;
  update public.profiles set linked_player_id=p_player_id,updated_at=now() where id=p_user_id;
  if not exists(select 1 from public.role_grants rg where rg.user_id=p_user_id and rg.role='PLAYER' and rg.scope_type='PLAYER' and rg.player_id=p_player_id and public.ips_role_grant_is_active(rg)) then
    insert into public.role_grants(user_id,role,scope_type,player_id,granted_by,note)
    values(p_user_id,'PLAYER','PLAYER',p_player_id,p_actor,'Approved through IPS registration workflow');
  end if;
end $$;

revoke all on function public.ips_link_user_to_player(uuid,uuid,uuid) from public,anon,authenticated;

create or replace function public.ips_approve_player_registration(
  p_request_id uuid,
  p_existing_player_id uuid default null,
  p_side_id uuid default null,
  p_reviewer_note text default null
)
returns jsonb
language plpgsql security definer
set search_path=public,auth as $$
declare
  r public.player_registration_requests;
  v_player public.players;
  v_player_id uuid;
  v_side uuid;
  v_target_team uuid;
  v_current_team uuid;
  v_current_side uuid;
  v_email text;
  v_phone text;
  v_code text;
  v_slug text;
  v_transfer uuid;
begin
  if not public.ips_can_review_player_registration(p_request_id) then raise exception 'Not authorised to approve this registration.'; end if;
  select * into r from public.player_registration_requests where id=p_request_id for update;
  if not found then raise exception 'Registration not found.'; end if;
  if r.status not in ('PENDING','POSSIBLE_MATCH','CHANGES_REQUESTED') then raise exception 'This registration is not awaiting approval.'; end if;
  if not public.ips_registration_account_confirmed(r.user_id) then raise exception 'The account email/phone must be confirmed before approval.'; end if;

  v_side:=coalesce(p_side_id,r.requested_side_id);
  if r.linked_team_request_id is not null and r.requested_team_identity_id is null then
    raise exception 'Approve the requested Team before approving this player.';
  end if;

  if r.requested_team_identity_id is not null then
    if v_side is null then
      select id into v_side from public.teams where club_id=r.requested_team_identity_id and status='ACTIVE' order by side_order limit 1;
      if (select count(*) from public.teams where club_id=r.requested_team_identity_id and status='ACTIVE')>1 then
        raise exception 'Select the A/B/C competitive side before approval.';
      end if;
    end if;
    select club_id into v_target_team from public.teams where id=v_side and status='ACTIVE';
    if v_target_team is distinct from r.requested_team_identity_id then raise exception 'Selected side does not belong to the requested Team.'; end if;
  end if;

  select lower(email) into v_email from auth.users where id=r.user_id;
  v_phone:=public.ips_safe_normalize_phone(r.phone);

  if p_existing_player_id is null then
    if exists(
      select 1 from public.players p
      left join public.player_private_identities pi on pi.player_id=p.id
      where p.status='ACTIVE' and (
        (v_email is not null and exists(select 1 from public.player_contacts pc where pc.player_id=p.id and pc.contact_type='EMAIL' and lower(pc.value_normalized)=v_email))
        or (v_phone is not null and exists(select 1 from public.player_contacts pc where pc.player_id=p.id and pc.contact_type='PHONE' and pc.value_normalized=v_phone))
        or (r.date_of_birth is not null and pi.date_of_birth=r.date_of_birth and lower(coalesce(pi.full_name,''))=lower(r.full_name))
      )
    ) then
      update public.player_registration_requests set status='POSSIBLE_MATCH',reviewer_note='A strong existing identity match must be resolved before creating a new player.',updated_at=now() where id=r.id;
      raise exception 'Strong existing player match found. Select the existing IPS player instead of creating a duplicate.';
    end if;

    v_code:=public.ips_next_player_code();
    v_slug:=public.ips_slug_base(r.display_name)||'-'||lower(replace(v_code,'-',''));
    if v_slug='' or v_slug ~ '^-|-$' then v_slug:=lower(replace(v_code,'-','')); end if;
    insert into public.players(ips_code,slug,display_name,primary_role,status)
    values(v_code,v_slug,r.display_name,r.primary_role,'ACTIVE') returning * into v_player;
    v_player_id:=v_player.id;
    insert into public.player_private_identities(player_id,full_name,date_of_birth)
    values(v_player_id,r.full_name,r.date_of_birth)
    on conflict(player_id) do update set full_name=excluded.full_name,date_of_birth=excluded.date_of_birth,updated_at=now();

    if v_email is not null then
      insert into public.player_contacts(player_id,contact_type,value_original,value_normalized,is_login_identifier,verified_at,created_by)
      values(v_player_id,'EMAIL',v_email,v_email,true,now(),auth.uid());
    end if;
    if v_phone is not null then
      insert into public.player_contacts(player_id,contact_type,value_original,value_normalized,is_login_identifier,is_whatsapp,created_by)
      values(v_player_id,'PHONE',r.phone,v_phone,true,true,auth.uid());
    end if;
  else
    select * into v_player from public.players where id=p_existing_player_id and status='ACTIVE';
    if not found then raise exception 'Existing player not found.'; end if;
    v_player_id:=v_player.id;
    insert into public.player_private_identities(player_id,full_name,date_of_birth)
    values(v_player_id,r.full_name,r.date_of_birth)
    on conflict(player_id) do update
      set full_name=coalesce(public.player_private_identities.full_name,excluded.full_name),
          date_of_birth=coalesce(public.player_private_identities.date_of_birth,excluded.date_of_birth),
          updated_at=now();
  end if;

  perform public.ips_link_user_to_player(r.user_id,v_player_id,auth.uid());

  if v_target_team is not null then
    select t.club_id,tm.team_id into v_current_team,v_current_side
    from public.team_memberships tm
    join public.teams t on t.id=tm.team_id
    where tm.player_id=v_player_id and tm.status='ACTIVE' and tm.end_on is null
    order by tm.is_primary desc,tm.start_on desc limit 1;

    if v_current_team is not null and v_current_team<>v_target_team then
      insert into public.player_transfer_requests(
        player_id,from_team_identity_id,from_side_id,to_team_identity_id,to_side_id,
        player_registration_request_id,requested_by,status,note
      ) values(
        v_player_id,v_current_team,v_current_side,v_target_team,v_side,r.id,r.user_id,'REQUESTED','Created from approved account registration'
      ) returning id into v_transfer;

      update public.player_registration_requests
      set status='TRANSFER_REQUIRED',matched_player_id=v_player_id,approved_player_id=v_player_id,
          requested_side_id=v_side,reviewer_id=auth.uid(),reviewer_note=p_reviewer_note,reviewed_at=now(),updated_at=now()
      where id=r.id;

      insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
      values(auth.uid(),'PLAYER_REGISTRATION_TRANSFER_REQUIRED','PLAYER',v_player_id,jsonb_build_object('request_id',r.id,'transfer_id',v_transfer));
      return jsonb_build_object('status','TRANSFER_REQUIRED','player_id',v_player_id,'transfer_id',v_transfer);
    end if;

    if v_current_team=v_target_team and v_current_side is distinct from v_side then
      update public.team_memberships tm set end_on=current_date,status='FORMER',is_primary=false,updated_at=now()
      from public.teams t
      where tm.team_id=t.id and tm.player_id=v_player_id and tm.status='ACTIVE' and tm.end_on is null and t.club_id=v_target_team and tm.team_id<>v_side;
    end if;

    if not exists(select 1 from public.team_memberships where player_id=v_player_id and team_id=v_side and status='ACTIVE' and end_on is null) then
      insert into public.team_memberships(player_id,team_id,start_on,status,is_primary,team_role)
      values(v_player_id,v_side,current_date,'ACTIVE',true,coalesce(r.primary_role,'Player'));
    end if;
  end if;

  update public.player_registration_requests
  set status='APPROVED',matched_player_id=p_existing_player_id,approved_player_id=v_player_id,
      requested_side_id=v_side,reviewer_id=auth.uid(),reviewer_note=p_reviewer_note,reviewed_at=now(),updated_at=now()
  where id=r.id;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(auth.uid(),'PLAYER_REGISTRATION_APPROVED','PLAYER',v_player_id,jsonb_build_object('request_id',r.id,'existing',p_existing_player_id is not null));

  return jsonb_build_object('status','APPROVED','player_id',v_player_id);
end $$;

create or replace function public.ips_set_player_registration_decision(
  p_request_id uuid,p_action text,p_note text default null
)
returns void
language plpgsql security definer
set search_path=public,auth as $$
declare v_status text;
begin
  if not public.ips_can_review_player_registration(p_request_id) then raise exception 'Not authorised.'; end if;
  v_status:=case upper(p_action) when 'REJECT' then 'REJECTED' when 'CHANGES' then 'CHANGES_REQUESTED' else null end;
  if v_status is null then raise exception 'Unsupported action.'; end if;
  update public.player_registration_requests
  set status=v_status,reviewer_id=auth.uid(),reviewer_note=nullif(trim(coalesce(p_note,'')),''),reviewed_at=now(),updated_at=now()
  where id=p_request_id and status not in ('APPROVED','REJECTED');
end $$;

create or replace function public.ips_approve_team_registration(
  p_request_id uuid,p_note text default null
)
returns uuid
language plpgsql security definer
set search_path=public,auth as $$
declare r public.team_registration_requests; v_identity public.clubs; v_side uuid;
begin
  if not public.ips_can_review_team_registration(p_request_id) then raise exception 'Not authorised to approve this Team.'; end if;
  select * into r from public.team_registration_requests where id=p_request_id for update;
  if not found then raise exception 'Team request not found.'; end if;
  if r.status not in ('PENDING','CHANGES_REQUESTED') then raise exception 'This Team request is not awaiting approval.'; end if;

  select * into v_identity from public.ips_create_team_identity(r.city_id,r.proposed_name,r.proposed_short_name,r.category,r.proposed_structure);

  update public.team_registration_requests
  set status='APPROVED',approved_team_identity_id=v_identity.id,reviewer_id=auth.uid(),reviewer_note=p_note,reviewed_at=now(),updated_at=now()
  where id=r.id;

  update public.player_registration_requests pr
  set requested_team_identity_id=v_identity.id,
      requested_side_id=(
        select t.id from public.teams t
        where t.club_id=v_identity.id and t.status='ACTIVE'
          and (
            (r.proposed_structure='SINGLE' and t.side_label='MAIN')
            or (r.proposed_structure<>'SINGLE' and t.side_label=coalesce(nullif(pr.requested_side_label,''),'A'))
          )
        order by t.side_order limit 1
      ),
      status=case when pr.status='PENDING_EMAIL' then pr.status else 'PENDING' end,
      updated_at=now()
  where pr.linked_team_request_id=r.id;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(auth.uid(),'TEAM_REGISTRATION_APPROVED','TEAM_IDENTITY',v_identity.id,jsonb_build_object('request_id',r.id,'name',v_identity.name));

  return v_identity.id;
end $$;

create or replace function public.ips_set_team_registration_decision(
  p_request_id uuid,p_action text,p_note text default null
)
returns void
language plpgsql security definer
set search_path=public,auth as $$
declare v_status text;
begin
  if not public.ips_can_review_team_registration(p_request_id) then raise exception 'Not authorised.'; end if;
  v_status:=case upper(p_action) when 'REJECT' then 'REJECTED' when 'CHANGES' then 'CHANGES_REQUESTED' else null end;
  if v_status is null then raise exception 'Unsupported action.'; end if;
  update public.team_registration_requests
  set status=v_status,reviewer_id=auth.uid(),reviewer_note=nullif(trim(coalesce(p_note,'')),''),reviewed_at=now(),updated_at=now()
  where id=p_request_id and status<>'APPROVED';
  if v_status='REJECTED' then
    update public.player_registration_requests set status='CHANGES_REQUESTED',reviewer_note='Requested Team was rejected. Select another Team or contact an administrator.',updated_at=now()
    where linked_team_request_id=p_request_id and status not in ('APPROVED','REJECTED');
  end if;
end $$;

create or replace function public.ips_resolve_team_request_member(
  p_member_id uuid,
  p_existing_player_id uuid default null,
  p_note text default null
)
returns jsonb
language plpgsql security definer
set search_path=public,auth as $$
declare
  m public.team_request_members; r public.team_registration_requests; v_side uuid; v_player_id uuid;
  v_code text; v_slug text; v_phone text; v_current_team uuid; v_current_side uuid; v_transfer uuid;
begin
  if not public.ips_can_review_team_request_member(p_member_id) then raise exception 'Not authorised to resolve this member.'; end if;
  select * into m from public.team_request_members where id=p_member_id for update;
  select * into r from public.team_registration_requests where id=m.team_request_id;
  if r.status<>'APPROVED' or r.approved_team_identity_id is null then raise exception 'Approve the Team before creating or linking roster players.'; end if;
  if m.status='APPROVED' then raise exception 'This member is already resolved.'; end if;

  select id into v_side from public.teams
  where club_id=r.approved_team_identity_id and status='ACTIVE'
    and side_label=case when r.proposed_structure='SINGLE' then 'MAIN' else m.requested_side_label end
  order by side_order limit 1;
  if v_side is null then raise exception 'Requested competitive side does not exist.'; end if;

  if p_existing_player_id is null then
    v_phone:=public.ips_safe_normalize_phone(m.phone);
    if exists(
      select 1 from public.players p
      left join public.player_private_identities pi on pi.player_id=p.id
      where p.status='ACTIVE' and (
        (m.email is not null and exists(select 1 from public.player_contacts pc where pc.player_id=p.id and pc.contact_type='EMAIL' and lower(pc.value_normalized)=lower(m.email)))
        or (v_phone is not null and exists(select 1 from public.player_contacts pc where pc.player_id=p.id and pc.contact_type='PHONE' and pc.value_normalized=v_phone))
        or (m.date_of_birth is not null and pi.date_of_birth=m.date_of_birth and lower(coalesce(pi.full_name,''))=lower(m.full_name))
      )
    ) then
      update public.team_request_members set status='POSSIBLE_MATCH',updated_at=now() where id=m.id;
      raise exception 'Strong existing player match found. Link the existing IPS identity instead.';
    end if;

    v_code:=public.ips_next_player_code();
    v_slug:=public.ips_slug_base(m.display_name)||'-'||lower(replace(v_code,'-',''));
    if v_slug='' or v_slug ~ '^-|-$' then v_slug:=lower(replace(v_code,'-','')); end if;
    insert into public.players(ips_code,slug,display_name,primary_role,status)
    values(v_code,v_slug,m.display_name,m.primary_role,'ACTIVE') returning id into v_player_id;
    insert into public.player_private_identities(player_id,full_name,date_of_birth) values(v_player_id,m.full_name,m.date_of_birth);

    if nullif(trim(coalesce(m.email,'')),'') is not null then
      insert into public.player_contacts(player_id,contact_type,value_original,value_normalized,is_login_identifier,created_by)
      values(v_player_id,'EMAIL',lower(trim(m.email)),lower(trim(m.email)),true,auth.uid());
    end if;
    if v_phone is not null then
      insert into public.player_contacts(player_id,contact_type,value_original,value_normalized,is_login_identifier,is_whatsapp,created_by)
      values(v_player_id,'PHONE',m.phone,v_phone,true,true,auth.uid());
    end if;
  else
    if not exists(select 1 from public.players where id=p_existing_player_id and status='ACTIVE') then raise exception 'Existing player not found.'; end if;
    v_player_id:=p_existing_player_id;
  end if;

  select t.club_id,tm.team_id into v_current_team,v_current_side
  from public.team_memberships tm join public.teams t on t.id=tm.team_id
  where tm.player_id=v_player_id and tm.status='ACTIVE' and tm.end_on is null
  order by tm.is_primary desc,tm.start_on desc limit 1;

  if v_current_team is not null and v_current_team<>r.approved_team_identity_id then
    insert into public.player_transfer_requests(
      player_id,from_team_identity_id,from_side_id,to_team_identity_id,to_side_id,team_request_member_id,requested_by,status,note
    ) values(
      v_player_id,v_current_team,v_current_side,r.approved_team_identity_id,v_side,m.id,r.requested_by,'REQUESTED',p_note
    ) returning id into v_transfer;
    update public.team_request_members set status='TRANSFER_REQUIRED',matched_player_id=v_player_id,approved_player_id=v_player_id,updated_at=now() where id=m.id;
    return jsonb_build_object('status','TRANSFER_REQUIRED','player_id',v_player_id,'transfer_id',v_transfer);
  end if;

  if v_current_team=r.approved_team_identity_id and v_current_side is distinct from v_side then
    update public.team_memberships tm set end_on=current_date,status='FORMER',is_primary=false,updated_at=now()
    from public.teams t where tm.team_id=t.id and tm.player_id=v_player_id and tm.status='ACTIVE' and tm.end_on is null and t.club_id=r.approved_team_identity_id and tm.team_id<>v_side;
  end if;
  if not exists(select 1 from public.team_memberships where player_id=v_player_id and team_id=v_side and status='ACTIVE' and end_on is null) then
    insert into public.team_memberships(player_id,team_id,start_on,status,is_primary,team_role)
    values(v_player_id,v_side,current_date,'ACTIVE',true,coalesce(m.primary_role,'Player'));
  end if;

  update public.team_request_members set status='APPROVED',matched_player_id=p_existing_player_id,approved_player_id=v_player_id,updated_at=now() where id=m.id;
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(auth.uid(),'TEAM_REQUEST_MEMBER_APPROVED','PLAYER',v_player_id,jsonb_build_object('member_id',m.id,'team_request_id',r.id));
  return jsonb_build_object('status','APPROVED','player_id',v_player_id);
end $$;

-- ---------- Transfer workflow ----------
create or replace function public.ips_release_transfer(p_transfer_id uuid,p_approve boolean,p_note text default null)
returns void
language plpgsql security definer
set search_path=public,auth as $$
declare tr public.player_transfer_requests; v_allowed boolean;
begin
  select * into tr from public.player_transfer_requests where id=p_transfer_id for update;
  if not found then raise exception 'Transfer not found.'; end if;
  v_allowed:=public.ips_is_owner() or public.ips_has_role('ADMIN','GLOBAL',null)
    or public.ips_has_role('ADMIN','CLUB',tr.from_team_identity_id)
    or public.ips_has_role('LEADER','CLUB',tr.from_team_identity_id)
    or exists(select 1 from public.clubs c where c.id=tr.from_team_identity_id and public.ips_has_role('ADMIN','CITY',c.city_id));
  if not v_allowed then raise exception 'Only the current Team or authorised City/Global Admin can release this player.'; end if;
  if tr.status<>'REQUESTED' then raise exception 'Transfer is not awaiting release.'; end if;
  update public.player_transfer_requests
  set status=case when p_approve then 'RELEASED' else 'REJECTED' end,
      release_by=auth.uid(),released_at=now(),note=coalesce(nullif(trim(coalesce(p_note,'')),''),note),updated_at=now()
  where id=p_transfer_id;
end $$;

create or replace function public.ips_finalize_transfer(p_transfer_id uuid,p_approve boolean,p_note text default null)
returns void
language plpgsql security definer
set search_path=public,auth as $$
declare tr public.player_transfer_requests; v_allowed boolean;
begin
  select * into tr from public.player_transfer_requests where id=p_transfer_id for update;
  if not found then raise exception 'Transfer not found.'; end if;
  v_allowed:=public.ips_is_owner() or public.ips_has_role('ADMIN','GLOBAL',null)
    or exists(select 1 from public.clubs c where c.id=tr.to_team_identity_id and public.ips_has_role('ADMIN','CITY',c.city_id));
  if not v_allowed then raise exception 'A destination City Admin or Global Admin must finalise this transfer.'; end if;
  if tr.status<>'RELEASED' and not (public.ips_is_owner() or public.ips_has_role('ADMIN','GLOBAL',null)) then
    raise exception 'The current Team must release the player first.';
  end if;

  if not p_approve then
    update public.player_transfer_requests set status='REJECTED',final_review_by=auth.uid(),final_review_at=now(),note=coalesce(nullif(trim(coalesce(p_note,'')),''),note),updated_at=now() where id=p_transfer_id;
    return;
  end if;

  update public.team_memberships tm
  set end_on=current_date,status='FORMER',is_primary=false,updated_at=now()
  from public.teams t
  where tm.team_id=t.id and tm.player_id=tr.player_id and tm.status='ACTIVE' and tm.end_on is null and t.club_id<>tr.to_team_identity_id;

  update public.team_memberships tm
  set end_on=current_date,status='FORMER',is_primary=false,updated_at=now()
  from public.teams t
  where tm.team_id=t.id and tm.player_id=tr.player_id and tm.status='ACTIVE' and tm.end_on is null and t.club_id=tr.to_team_identity_id and tm.team_id<>tr.to_side_id;

  if not exists(select 1 from public.team_memberships where player_id=tr.player_id and team_id=tr.to_side_id and status='ACTIVE' and end_on is null) then
    insert into public.team_memberships(player_id,team_id,start_on,status,is_primary,team_role)
    values(tr.player_id,tr.to_side_id,current_date,'ACTIVE',true,'Player');
  end if;

  update public.player_transfer_requests
  set status='APPROVED',final_review_by=auth.uid(),final_review_at=now(),note=coalesce(nullif(trim(coalesce(p_note,'')),''),note),updated_at=now()
  where id=p_transfer_id;

  if tr.player_registration_request_id is not null then
    update public.player_registration_requests set status='APPROVED',updated_at=now() where id=tr.player_registration_request_id;
  end if;
  if tr.team_request_member_id is not null then
    update public.team_request_members set status='APPROVED',updated_at=now() where id=tr.team_request_member_id;
  end if;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(auth.uid(),'PLAYER_TRANSFER_APPROVED','PLAYER',tr.player_id,jsonb_build_object('transfer_id',tr.id,'from_team',tr.from_team_identity_id,'to_team',tr.to_team_identity_id,'to_side',tr.to_side_id));
end $$;

-- ---------- Execute grants ----------
revoke all on function public.ips_my_registration_status() from public,anon;
grant execute on function public.ips_my_registration_status() to authenticated;

revoke all on function public.ips_add_team_request_member(uuid,text,text,date,text,text,text,text) from public,anon;
grant execute on function public.ips_add_team_request_member(uuid,text,text,date,text,text,text,text) to authenticated;

revoke all on function public.ips_remove_team_request_member(uuid) from public,anon;
grant execute on function public.ips_remove_team_request_member(uuid) to authenticated;

revoke all on function public.ips_registration_possible_matches(uuid) from public,anon;
grant execute on function public.ips_registration_possible_matches(uuid) to authenticated;

revoke all on function public.ips_team_member_possible_matches(uuid) from public,anon;
grant execute on function public.ips_team_member_possible_matches(uuid) to authenticated;

revoke all on function public.ips_registration_queue() from public,anon;
grant execute on function public.ips_registration_queue() to authenticated;

revoke all on function public.ips_registration_queue_counts() from public,anon;
grant execute on function public.ips_registration_queue_counts() to authenticated;

revoke all on function public.ips_registration_request_detail(uuid) from public,anon;
grant execute on function public.ips_registration_request_detail(uuid) to authenticated;

revoke all on function public.ips_team_registration_detail(uuid) from public,anon;
grant execute on function public.ips_team_registration_detail(uuid) to authenticated;

revoke all on function public.ips_approve_player_registration(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.ips_approve_player_registration(uuid,uuid,uuid,text) to authenticated;

revoke all on function public.ips_set_player_registration_decision(uuid,text,text) from public,anon;
grant execute on function public.ips_set_player_registration_decision(uuid,text,text) to authenticated;

revoke all on function public.ips_approve_team_registration(uuid,text) from public,anon;
grant execute on function public.ips_approve_team_registration(uuid,text) to authenticated;

revoke all on function public.ips_set_team_registration_decision(uuid,text,text) from public,anon;
grant execute on function public.ips_set_team_registration_decision(uuid,text,text) to authenticated;

revoke all on function public.ips_resolve_team_request_member(uuid,uuid,text) from public,anon;
grant execute on function public.ips_resolve_team_request_member(uuid,uuid,text) to authenticated;

revoke all on function public.ips_release_transfer(uuid,boolean,text) from public,anon;
grant execute on function public.ips_release_transfer(uuid,boolean,text) to authenticated;

revoke all on function public.ips_finalize_transfer(uuid,boolean,text) from public,anon;
grant execute on function public.ips_finalize_transfer(uuid,boolean,text) to authenticated;

notify pgrst,'reload schema';
commit;
