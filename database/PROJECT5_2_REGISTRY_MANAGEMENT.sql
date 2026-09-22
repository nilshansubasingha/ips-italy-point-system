-- IPS Project 5.2 — Management & Registry UX
-- Canonical club/team/player management, private player contacts, account claiming,
-- admin-managed media and registry-safe operational RPCs.

begin;

-- ---------- Registry metadata ----------
alter table public.clubs
  add column if not exists description text,
  add column if not exists website_url text,
  add column if not exists logo_path text;

alter table public.teams
  add column if not exists category text not null default 'OPEN',
  add column if not exists logo_path text;

alter table public.players
  add column if not exists profile_image_path text;

-- One authenticated account may link to one cricket identity and a cricket identity
-- may only be claimed by one authenticated account.
create unique index if not exists ux_profiles_linked_player
  on public.profiles(linked_player_id)
  where linked_player_id is not null;

-- ---------- Private player contacts ----------
create table if not exists public.player_contacts (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on update cascade on delete cascade,
  contact_type text not null check (contact_type in ('EMAIL','PHONE')),
  value_original text not null,
  value_normalized text not null,
  is_login_identifier boolean not null default true,
  is_whatsapp boolean not null default false,
  notification_consent boolean not null default false,
  consent_at timestamptz,
  verified_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_player_one_login_contact_type
  on public.player_contacts(player_id, contact_type)
  where is_login_identifier;

create unique index if not exists ux_player_login_contact_value
  on public.player_contacts(contact_type, lower(value_normalized))
  where is_login_identifier;

create index if not exists ix_player_contacts_player on public.player_contacts(player_id);
create index if not exists ix_player_contacts_normalized on public.player_contacts(lower(value_normalized));

create or replace function public.ips_normalize_phone(p_value text)
returns text
language plpgsql immutable
set search_path=public as $$
declare v text;
begin
  v := regexp_replace(coalesce(trim(p_value),''), '[^0-9+]', '', 'g');
  if left(v,2)='00' then v := '+' || substring(v from 3); end if;
  if v !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Phone number must include the international country code, for example +393451234567.';
  end if;
  return v;
end $$;

create or replace function public.ips_prepare_player_contact()
returns trigger
language plpgsql
set search_path=public as $$
begin
  if new.contact_type='EMAIL' then
    new.value_normalized := lower(trim(new.value_original));
    if new.value_normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      raise exception 'Enter a valid email address.';
    end if;
    new.is_whatsapp := false;
  elsif new.contact_type='PHONE' then
    new.value_normalized := public.ips_normalize_phone(new.value_original);
  end if;
  if new.notification_consent and new.consent_at is null then new.consent_at := now(); end if;
  if not new.notification_consent then new.consent_at := null; end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists prepare_player_contact on public.player_contacts;
create trigger prepare_player_contact
before insert or update on public.player_contacts
for each row execute function public.ips_prepare_player_contact();

-- ---------- Scope helpers ----------
create or replace function public.ips_can_create_club(p_city_id uuid)
returns boolean
language sql stable security definer
set search_path=public,auth as $$
  select public.ips_is_owner()
    or public.ips_has_role('ADMIN','GLOBAL',null)
    or public.ips_has_role('ADMIN','CITY',p_city_id);
$$;

create or replace function public.ips_can_manage_club(p_club_id uuid)
returns boolean
language sql stable security definer
set search_path=public,auth as $$
  select public.ips_is_owner()
    or public.ips_has_role('ADMIN','GLOBAL',null)
    or public.ips_has_role('LEADER','CLUB',p_club_id)
    or exists (
      select 1 from public.clubs c
      where c.id=p_club_id
        and public.ips_has_role('ADMIN','CITY',c.city_id)
    );
$$;

create or replace function public.ips_can_admin_player(p_player_id uuid)
returns boolean
language sql stable security definer
set search_path=public,auth as $$
  select public.ips_is_owner()
    or public.ips_has_role('ADMIN','GLOBAL',null)
    or exists (
      select 1
      from public.team_memberships tm
      join public.teams t on t.id=tm.team_id
      join public.clubs c on c.id=t.club_id
      where tm.player_id=p_player_id
        and tm.status='ACTIVE' and tm.end_on is null
        and public.ips_has_role('ADMIN','CITY',c.city_id)
    );
$$;

create or replace function public.ips_can_manage_player_contact(p_player_id uuid)
returns boolean
language sql stable security definer
set search_path=public,auth as $$
  select public.ips_can_admin_player(p_player_id)
    or exists (
      select 1 from public.team_memberships tm
      where tm.player_id=p_player_id
        and tm.status='ACTIVE' and tm.end_on is null
        and public.ips_can_manage_team(tm.team_id)
    )
    or exists (
      select 1 from public.profiles p
      where p.id=auth.uid() and p.linked_player_id=p_player_id
    );
$$;

-- ---------- RLS for registry writes ----------
alter table public.player_contacts enable row level security;

drop policy if exists "project5_2 create clubs" on public.clubs;
create policy "project5_2 create clubs" on public.clubs
for insert to authenticated
with check (public.ips_can_create_club(city_id));

drop policy if exists "project5_2 update clubs" on public.clubs;
create policy "project5_2 update clubs" on public.clubs
for update to authenticated
using (public.ips_can_manage_club(id))
with check (public.ips_can_manage_club(id));

drop policy if exists "project5_2 create teams" on public.teams;
create policy "project5_2 create teams" on public.teams
for insert to authenticated
with check (public.ips_can_manage_club(club_id));

drop policy if exists "project5_2 update teams" on public.teams;
create policy "project5_2 update teams" on public.teams
for update to authenticated
using (public.ips_can_manage_team(id))
with check (public.ips_can_manage_team(id));

drop policy if exists "project5_2 managers read player contacts" on public.player_contacts;
create policy "project5_2 managers read player contacts" on public.player_contacts
for select to authenticated
using (public.ips_can_manage_player_contact(player_id));

-- Player contacts are mutated only through audited RPCs.
-- No direct INSERT/UPDATE/DELETE policies are granted.

grant select on public.player_contacts to authenticated;
grant insert, update on public.clubs, public.teams to authenticated;

-- Users must not be able to alter their own account/player linkage or avatar directly.
drop policy if exists "users update own profile" on public.profiles;
drop policy if exists "owners update profiles" on public.profiles;
create policy "owners update profiles" on public.profiles
for update to authenticated
using (public.ips_is_owner())
with check (public.ips_is_owner());

-- ---------- Utility helpers ----------
create or replace function public.ips_slug_base(p_value text)
returns text
language sql immutable
set search_path=public as $$
  select trim(both '-' from regexp_replace(lower(coalesce(p_value,'')), '[^a-z0-9]+', '-', 'g'));
$$;

-- ---------- Player creation / roster RPCs ----------
create or replace function public.ips_create_player_for_team(
  p_team_id uuid,
  p_display_name text,
  p_given_name text default null,
  p_family_name text default null,
  p_primary_role text default null,
  p_batting_style text default null,
  p_bowling_style text default null,
  p_shirt_number smallint default null,
  p_email text default null,
  p_phone text default null,
  p_whatsapp_consent boolean default false
)
returns public.players
language plpgsql security definer
set search_path=public,auth as $$
declare
  v_player public.players;
  v_code text;
  v_slug text;
  v_email text;
  v_phone text;
begin
  if not public.ips_can_manage_team(p_team_id) then raise exception 'Not authorised to add players to this team.'; end if;
  if coalesce(trim(p_display_name),'')='' then raise exception 'Player name is required.'; end if;
  if p_shirt_number is not null and (p_shirt_number<0 or p_shirt_number>999) then raise exception 'Shirt number must be between 0 and 999.'; end if;

  v_email := nullif(lower(trim(coalesce(p_email,''))), '');
  if v_email is not null and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid email address.'; end if;
  v_phone := case when nullif(trim(coalesce(p_phone,'')),'') is null then null else public.ips_normalize_phone(p_phone) end;

  if v_email is not null and exists(select 1 from public.player_contacts where contact_type='EMAIL' and is_login_identifier and lower(value_normalized)=v_email) then
    raise exception 'That email is already linked to an IPS player. Search for the existing player instead.';
  end if;
  if v_phone is not null and exists(select 1 from public.player_contacts where contact_type='PHONE' and is_login_identifier and value_normalized=v_phone) then
    raise exception 'That phone number is already linked to an IPS player. Search for the existing player instead.';
  end if;

  v_code := public.ips_next_player_code();
  v_slug := public.ips_slug_base(p_display_name) || '-' || lower(replace(v_code,'-',''));
  if v_slug ~ '^-|-$' or v_slug='' then v_slug := lower(replace(v_code,'-','')); end if;

  insert into public.players(ips_code,slug,display_name,given_name,family_name,primary_role,batting_style,bowling_style,status)
  values(v_code,v_slug,trim(p_display_name),nullif(trim(p_given_name),''),nullif(trim(p_family_name),''),nullif(trim(p_primary_role),''),nullif(trim(p_batting_style),''),nullif(trim(p_bowling_style),''),'ACTIVE')
  returning * into v_player;

  insert into public.team_memberships(player_id,team_id,start_on,shirt_number,status,is_primary)
  values(v_player.id,p_team_id,current_date,p_shirt_number,'ACTIVE',true);

  if v_email is not null then
    insert into public.player_contacts(player_id,contact_type,value_original,value_normalized,is_login_identifier,created_by)
    values(v_player.id,'EMAIL',v_email,v_email,true,auth.uid());
  end if;
  if v_phone is not null then
    insert into public.player_contacts(player_id,contact_type,value_original,value_normalized,is_login_identifier,is_whatsapp,notification_consent,consent_at,created_by)
    values(v_player.id,'PHONE',p_phone,v_phone,true,true,p_whatsapp_consent,case when p_whatsapp_consent then now() else null end,auth.uid());
  end if;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(auth.uid(),'PLAYER_CREATED','PLAYER',v_player.id,jsonb_build_object('team_id',p_team_id,'ips_code',v_player.ips_code));

  return v_player;
end $$;

create or replace function public.ips_add_existing_player_to_team(
  p_team_id uuid,
  p_player_id uuid,
  p_shirt_number smallint default null
)
returns public.team_memberships
language plpgsql security definer
set search_path=public,auth as $$
declare v public.team_memberships; v_primary boolean;
begin
  if not public.ips_can_manage_team(p_team_id) then raise exception 'Not authorised to manage this team.'; end if;
  if not exists(select 1 from public.players where id=p_player_id and status='ACTIVE') then raise exception 'Player not found.'; end if;
  if exists(select 1 from public.team_memberships where team_id=p_team_id and player_id=p_player_id and status='ACTIVE' and end_on is null) then
    raise exception 'This player is already an active member of the team.';
  end if;
  v_primary := not exists(select 1 from public.team_memberships where player_id=p_player_id and status='ACTIVE' and end_on is null and is_primary);
  insert into public.team_memberships(player_id,team_id,start_on,shirt_number,status,is_primary)
  values(p_player_id,p_team_id,current_date,p_shirt_number,'ACTIVE',v_primary)
  returning * into v;
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(auth.uid(),'TEAM_MEMBERSHIP_ADDED','PLAYER',p_player_id,jsonb_build_object('team_id',p_team_id,'membership_id',v.id,'is_primary',v_primary));
  return v;
end $$;

create or replace function public.ips_update_team_membership(
  p_membership_id uuid,
  p_shirt_number smallint default null
)
returns public.team_memberships
language plpgsql security definer
set search_path=public,auth as $$
declare v public.team_memberships;
begin
  select * into v from public.team_memberships where id=p_membership_id;
  if not found then raise exception 'Membership not found.'; end if;
  if not public.ips_can_manage_team(v.team_id) then raise exception 'Not authorised to manage this roster.'; end if;
  update public.team_memberships set shirt_number=p_shirt_number,updated_at=now() where id=p_membership_id returning * into v;
  return v;
end $$;

create or replace function public.ips_end_team_membership(p_membership_id uuid)
returns public.team_memberships
language plpgsql security definer
set search_path=public,auth as $$
declare v public.team_memberships;
begin
  select * into v from public.team_memberships where id=p_membership_id for update;
  if not found then raise exception 'Membership not found.'; end if;
  if not public.ips_can_manage_team(v.team_id) then raise exception 'Not authorised to manage this roster.'; end if;
  if v.end_on is not null or v.status<>'ACTIVE' then raise exception 'Membership is already inactive.'; end if;
  update public.team_memberships set end_on=current_date,status='FORMER',is_primary=false,updated_at=now() where id=p_membership_id returning * into v;
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(auth.uid(),'TEAM_MEMBERSHIP_ENDED','PLAYER',v.player_id,jsonb_build_object('team_id',v.team_id,'membership_id',v.id));
  return v;
end $$;

create or replace function public.ips_set_player_contacts(
  p_player_id uuid,
  p_email text default null,
  p_phone text default null,
  p_whatsapp_consent boolean default false
)
returns void
language plpgsql security definer
set search_path=public,auth as $$
declare v_email text; v_phone text;
begin
  if not public.ips_can_manage_player_contact(p_player_id) then raise exception 'Not authorised to manage this player contact.'; end if;
  v_email := nullif(lower(trim(coalesce(p_email,''))), '');
  v_phone := case when nullif(trim(coalesce(p_phone,'')),'') is null then null else public.ips_normalize_phone(p_phone) end;
  if v_email is not null and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid email address.'; end if;

  if v_email is null then
    delete from public.player_contacts where player_id=p_player_id and contact_type='EMAIL' and is_login_identifier;
  else
    insert into public.player_contacts(player_id,contact_type,value_original,value_normalized,is_login_identifier,created_by)
    values(p_player_id,'EMAIL',v_email,v_email,true,auth.uid())
    on conflict (player_id,contact_type) where is_login_identifier
    do update set value_original=excluded.value_original,value_normalized=excluded.value_normalized,verified_at=null,updated_at=now();
  end if;

  if v_phone is null then
    delete from public.player_contacts where player_id=p_player_id and contact_type='PHONE' and is_login_identifier;
  else
    insert into public.player_contacts(player_id,contact_type,value_original,value_normalized,is_login_identifier,is_whatsapp,notification_consent,consent_at,created_by)
    values(p_player_id,'PHONE',p_phone,v_phone,true,true,p_whatsapp_consent,case when p_whatsapp_consent then now() else null end,auth.uid())
    on conflict (player_id,contact_type) where is_login_identifier
    do update set value_original=excluded.value_original,value_normalized=excluded.value_normalized,is_whatsapp=true,
      notification_consent=excluded.notification_consent,consent_at=case when excluded.notification_consent then coalesce(public.player_contacts.consent_at,now()) else null end,
      verified_at=case when public.player_contacts.value_normalized=excluded.value_normalized then public.player_contacts.verified_at else null end,
      updated_at=now();
  end if;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(auth.uid(),'PLAYER_CONTACTS_UPDATED','PLAYER',p_player_id,jsonb_build_object('has_email',v_email is not null,'has_phone',v_phone is not null,'whatsapp_consent',p_whatsapp_consent));
end $$;

create or replace function public.ips_update_player_identity(
  p_player_id uuid,
  p_display_name text,
  p_given_name text default null,
  p_family_name text default null,
  p_primary_role text default null,
  p_batting_style text default null,
  p_bowling_style text default null
)
returns public.players
language plpgsql security definer
set search_path=public,auth as $$
declare v public.players;
begin
  if not public.ips_can_admin_player(p_player_id) then raise exception 'An IPS administrator is required to edit permanent player details.'; end if;
  if coalesce(trim(p_display_name),'')='' then raise exception 'Display name is required.'; end if;
  update public.players set display_name=trim(p_display_name),given_name=nullif(trim(p_given_name),''),family_name=nullif(trim(p_family_name),''),
    primary_role=nullif(trim(p_primary_role),''),batting_style=nullif(trim(p_batting_style),''),bowling_style=nullif(trim(p_bowling_style),''),updated_at=now()
  where id=p_player_id returning * into v;
  if not found then raise exception 'Player not found.'; end if;
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(auth.uid(),'PLAYER_IDENTITY_UPDATED','PLAYER',p_player_id,jsonb_build_object('ips_code',v.ips_code));
  return v;
end $$;

-- Search is intentionally permission-gated and never returns raw private contact values.
create or replace function public.ips_registry_player_search(p_team_id uuid, p_query text)
returns table(
  id uuid, ips_code text, display_name text, primary_role text, profile_image_url text,
  current_team_id uuid, current_team_name text, is_on_target_team boolean, has_account boolean, matched_by text
)
language plpgsql stable security definer
set search_path=public,auth as $$
declare q text; q_phone text; q_email text;
begin
  if not public.ips_can_manage_team(p_team_id) then raise exception 'Not authorised to search players for this team.'; end if;
  q := trim(coalesce(p_query,''));
  if length(q)<2 then return; end if;
  q_email := case when position('@' in q)>0 then lower(q) else null end;
  begin
    q_phone := case when q ~ '[0-9]' and (q like '+%' or q like '00%') then public.ips_normalize_phone(q) else null end;
  exception when others then q_phone := null;
  end;

  return query
  select p.id,p.ips_code,p.display_name,p.primary_role,p.profile_image_url,
    cur.team_id,cur.team_name,
    exists(select 1 from public.team_memberships x where x.player_id=p.id and x.team_id=p_team_id and x.status='ACTIVE' and x.end_on is null),
    exists(select 1 from public.profiles pr where pr.linked_player_id=p.id),
    case
      when upper(p.ips_code)=upper(q) then 'IPS ID'
      when q_email is not null and exists(select 1 from public.player_contacts pc where pc.player_id=p.id and pc.contact_type='EMAIL' and pc.is_login_identifier and lower(pc.value_normalized)=q_email) then 'Email match'
      when q_phone is not null and exists(select 1 from public.player_contacts pc where pc.player_id=p.id and pc.contact_type='PHONE' and pc.is_login_identifier and pc.value_normalized=q_phone) then 'Phone match'
      else 'Name match'
    end
  from public.players p
  left join lateral (
    select tm.team_id,t.name as team_name
    from public.team_memberships tm join public.teams t on t.id=tm.team_id
    where tm.player_id=p.id and tm.status='ACTIVE' and tm.end_on is null
    order by tm.is_primary desc,tm.start_on desc limit 1
  ) cur on true
  where p.status='ACTIVE' and (
    upper(p.ips_code)=upper(q)
    or p.display_name ilike '%'||q||'%'
    or (q_email is not null and exists(select 1 from public.player_contacts pc where pc.player_id=p.id and pc.contact_type='EMAIL' and pc.is_login_identifier and lower(pc.value_normalized)=q_email))
    or (q_phone is not null and exists(select 1 from public.player_contacts pc where pc.player_id=p.id and pc.contact_type='PHONE' and pc.is_login_identifier and pc.value_normalized=q_phone))
  )
  order by case when upper(p.ips_code)=upper(q) then 0 when lower(p.display_name)=lower(q) then 1 else 2 end,p.display_name
  limit 20;
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
      or (cur.club_id is not null and public.ips_has_role('LEADER','CLUB',cur.club_id))
      or (cur.team_id is not null and public.ips_has_role('LEADER','TEAM',cur.team_id))
    )
  order by p.display_name;
$$;

-- ---------- Safe account claim ----------
create or replace function public.ips_my_claim_candidates()
returns table(id uuid,ips_code text,display_name text,profile_image_url text,matched_by text)
language sql stable security definer
set search_path=public,auth as $$
  with me as (
    select id,lower(email) email,email_confirmed_at,phone,phone_confirmed_at from auth.users where id=auth.uid()
  )
  select distinct p.id,p.ips_code,p.display_name,p.profile_image_url,
    case when pc.contact_type='EMAIL' then 'Verified email' else 'Verified phone' end
  from me
  join public.player_contacts pc on pc.is_login_identifier and (
    (pc.contact_type='EMAIL' and me.email_confirmed_at is not null and lower(pc.value_normalized)=me.email)
    or (pc.contact_type='PHONE' and me.phone_confirmed_at is not null and pc.value_normalized=me.phone)
  )
  join public.players p on p.id=pc.player_id and p.status='ACTIVE'
  where not exists(select 1 from public.profiles px where px.linked_player_id=p.id and px.id<>auth.uid());
$$;

create or replace function public.ips_claim_my_player(p_player_id uuid)
returns public.players
language plpgsql security definer
set search_path=public,auth as $$
declare me auth.users; v public.players; matched boolean;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into me from auth.users where id=auth.uid();
  if not found then raise exception 'Account not found.'; end if;

  select exists(
    select 1 from public.player_contacts pc
    where pc.player_id=p_player_id and pc.is_login_identifier and (
      (pc.contact_type='EMAIL' and me.email_confirmed_at is not null and lower(pc.value_normalized)=lower(me.email))
      or (pc.contact_type='PHONE' and me.phone_confirmed_at is not null and pc.value_normalized=me.phone)
    )
  ) into matched;
  if not matched then raise exception 'Your verified email or phone does not match this player record.'; end if;
  if exists(select 1 from public.profiles where linked_player_id=p_player_id and id<>auth.uid()) then raise exception 'This player profile is already claimed.'; end if;

  update public.profiles set linked_player_id=p_player_id,updated_at=now() where id=auth.uid();
  update public.player_contacts set verified_at=coalesce(verified_at,now()),updated_at=now()
  where player_id=p_player_id and is_login_identifier and (
    (contact_type='EMAIL' and me.email_confirmed_at is not null and lower(value_normalized)=lower(me.email))
    or (contact_type='PHONE' and me.phone_confirmed_at is not null and value_normalized=me.phone)
  );

  if not exists(select 1 from public.role_grants rg where rg.user_id=auth.uid() and rg.role='PLAYER' and rg.scope_type='PLAYER' and rg.player_id=p_player_id and public.ips_role_grant_is_active(rg)) then
    insert into public.role_grants(user_id,role,scope_type,player_id,granted_by,note)
    values(auth.uid(),'PLAYER','PLAYER',p_player_id,auth.uid(),'Self-claimed through verified IPS contact');
  end if;

  select * into v from public.players where id=p_player_id;
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(auth.uid(),'PLAYER_ACCOUNT_CLAIMED','PLAYER',p_player_id,jsonb_build_object('ips_code',v.ips_code));
  return v;
end $$;

-- ---------- Media storage ----------
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('ips-media','ips-media',true,10485760,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true,file_size_limit=10485760,allowed_mime_types=array['image/jpeg','image/png','image/webp'];

create or replace function public.ips_can_manage_media_path(p_name text)
returns boolean
language plpgsql stable security definer
set search_path=public,auth as $$
declare kind text; entity_text text; entity_id uuid;
begin
  kind := split_part(p_name,'/',1);
  entity_text := split_part(p_name,'/',2);
  begin entity_id := entity_text::uuid; exception when others then return false; end;
  if kind='players' then return public.ips_can_admin_player(entity_id); end if;
  if kind='clubs' then return public.ips_can_manage_club(entity_id); end if;
  if kind='teams' then return public.ips_can_manage_team(entity_id); end if;
  return false;
end $$;

drop policy if exists "project5_2 public read ips media" on storage.objects;
create policy "project5_2 public read ips media" on storage.objects
for select to anon,authenticated
using (bucket_id='ips-media');

drop policy if exists "project5_2 manage ips media insert" on storage.objects;
create policy "project5_2 manage ips media insert" on storage.objects
for insert to authenticated
with check (bucket_id='ips-media' and public.ips_can_manage_media_path(name));

drop policy if exists "project5_2 manage ips media update" on storage.objects;
create policy "project5_2 manage ips media update" on storage.objects
for update to authenticated
using (bucket_id='ips-media' and public.ips_can_manage_media_path(name))
with check (bucket_id='ips-media' and public.ips_can_manage_media_path(name));

drop policy if exists "project5_2 manage ips media delete" on storage.objects;
create policy "project5_2 manage ips media delete" on storage.objects
for delete to authenticated
using (bucket_id='ips-media' and public.ips_can_manage_media_path(name));

-- ---------- Official player photo (admin only) ----------
create or replace function public.ips_set_player_profile_image(
  p_player_id uuid,
  p_profile_image_url text default null,
  p_profile_image_path text default null
)
returns public.players
language plpgsql
security definer
set search_path=public,auth as $$
declare
  v public.players;
begin
  if not public.ips_can_admin_player(p_player_id) then
    raise exception 'An IPS administrator is required to manage the official player photo.';
  end if;

  update public.players
  set profile_image_url=nullif(trim(coalesce(p_profile_image_url,'')),''),
      profile_image_path=nullif(trim(coalesce(p_profile_image_path,'')),''),
      updated_at=now()
  where id=p_player_id
  returning * into v;

  if not found then raise exception 'Player not found.'; end if;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(
    auth.uid(),
    case when v.profile_image_url is null then 'PLAYER_PHOTO_REMOVED' else 'PLAYER_PHOTO_UPDATED' end,
    'PLAYER',
    p_player_id,
    jsonb_build_object('ips_code',v.ips_code)
  );

  return v;
end $$;

revoke all on function public.ips_set_player_profile_image(uuid,text,text) from public,anon;
grant execute on function public.ips_set_player_profile_image(uuid,text,text) to authenticated;


-- ---------- Execute privileges ----------
revoke all on function public.ips_create_player_for_team(uuid,text,text,text,text,text,text,smallint,text,text,boolean) from public,anon;
grant execute on function public.ips_create_player_for_team(uuid,text,text,text,text,text,text,smallint,text,text,boolean) to authenticated;
revoke all on function public.ips_add_existing_player_to_team(uuid,uuid,smallint) from public,anon;
grant execute on function public.ips_add_existing_player_to_team(uuid,uuid,smallint) to authenticated;
revoke all on function public.ips_update_team_membership(uuid,smallint) from public,anon;
grant execute on function public.ips_update_team_membership(uuid,smallint) to authenticated;
revoke all on function public.ips_end_team_membership(uuid) from public,anon;
grant execute on function public.ips_end_team_membership(uuid) to authenticated;
revoke all on function public.ips_set_player_contacts(uuid,text,text,boolean) from public,anon;
grant execute on function public.ips_set_player_contacts(uuid,text,text,boolean) to authenticated;
revoke all on function public.ips_update_player_identity(uuid,text,text,text,text,text,text) from public,anon;
grant execute on function public.ips_update_player_identity(uuid,text,text,text,text,text,text) to authenticated;
revoke all on function public.ips_registry_player_search(uuid,text) from public,anon;
grant execute on function public.ips_registry_player_search(uuid,text) to authenticated;
revoke all on function public.ips_registry_players(text) from public,anon;
grant execute on function public.ips_registry_players(text) to authenticated;
revoke all on function public.ips_my_claim_candidates() from public,anon;
grant execute on function public.ips_my_claim_candidates() to authenticated;
revoke all on function public.ips_claim_my_player(uuid) from public,anon;
grant execute on function public.ips_claim_my_player(uuid) to authenticated;

revoke all on function public.ips_can_admin_player(uuid) from public,anon;
grant execute on function public.ips_can_admin_player(uuid) to authenticated;

revoke all on function public.ips_can_create_club(uuid) from public,anon;
grant execute on function public.ips_can_create_club(uuid) to authenticated;

revoke all on function public.ips_can_manage_club(uuid) from public,anon;
grant execute on function public.ips_can_manage_club(uuid) to authenticated;

revoke all on function public.ips_can_manage_media_path(text) from public,anon;
grant execute on function public.ips_can_manage_media_path(text) to authenticated;

revoke all on function public.ips_can_manage_player_contact(uuid) from public,anon;
grant execute on function public.ips_can_manage_player_contact(uuid) to authenticated;

notify pgrst,'reload schema';

commit;
