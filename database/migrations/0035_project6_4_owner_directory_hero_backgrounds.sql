-- IPS Project 6.4 — owner-managed directory hero backgrounds.
-- Adds persistent hero images for All Italy and city-specific public directory headers.

begin;

create table if not exists public.directory_hero_backgrounds (
  scope_key text primary key,
  city_id uuid unique references public.cities(id) on delete cascade,
  image_path text not null,
  image_url text not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint directory_hero_scope_check check (
    (scope_key='italy' and city_id is null)
    or
    (scope_key like 'city:%' and city_id is not null)
  )
);

alter table public.directory_hero_backgrounds enable row level security;

drop policy if exists "public read directory hero backgrounds" on public.directory_hero_backgrounds;
create policy "public read directory hero backgrounds"
on public.directory_hero_backgrounds
for select
to anon, authenticated
using (true);

drop policy if exists "owner insert directory hero backgrounds" on public.directory_hero_backgrounds;
create policy "owner insert directory hero backgrounds"
on public.directory_hero_backgrounds
for insert
to authenticated
with check (public.ips_is_owner());

drop policy if exists "owner update directory hero backgrounds" on public.directory_hero_backgrounds;
create policy "owner update directory hero backgrounds"
on public.directory_hero_backgrounds
for update
to authenticated
using (public.ips_is_owner())
with check (public.ips_is_owner());

drop policy if exists "owner delete directory hero backgrounds" on public.directory_hero_backgrounds;
create policy "owner delete directory hero backgrounds"
on public.directory_hero_backgrounds
for delete
to authenticated
using (public.ips_is_owner());

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
  begin
    entity_id := entity_text::uuid;
  exception when others then
    return false;
  end;

  if kind='players' then return public.ips_can_admin_player(entity_id); end if;
  if kind='clubs' then return public.ips_can_manage_club(entity_id); end if;
  if kind='teams' then return public.ips_can_manage_team(entity_id); end if;
  return false;
end $$;

notify pgrst,'reload schema';

commit;
