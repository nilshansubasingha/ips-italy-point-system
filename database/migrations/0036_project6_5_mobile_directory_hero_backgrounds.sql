-- IPS Project 6.5 — separate mobile hero backgrounds from desktop.
-- Keeps the existing desktop hero untouched while allowing owner-controlled mobile crops.

begin;

alter table public.directory_hero_backgrounds
  add column if not exists mobile_image_path text,
  add column if not exists mobile_image_url text;

alter table public.directory_hero_backgrounds
  alter column image_path drop not null,
  alter column image_url drop not null;

notify pgrst,'reload schema';

commit;
