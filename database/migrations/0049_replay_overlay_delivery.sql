-- Replay delivery from the Replay workstation into the PRISM overlay.
begin;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('ips-replay','ips-replay',true,104857600,array['video/webm','video/mp4'])
on conflict (id) do update set
  public=excluded.public,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.ips_can_manage_replay_path(p_name text)
returns boolean
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  first_part text;
  match_uuid uuid;
begin
  first_part:=split_part(coalesce(p_name,''),'/',1);
  begin
    match_uuid:=first_part::uuid;
  exception when others then
    return false;
  end;
  return public.ips_can_direct_match(match_uuid);
end;
$$;

revoke all on function public.ips_can_manage_replay_path(text) from public;
grant execute on function public.ips_can_manage_replay_path(text) to authenticated,service_role;

drop policy if exists "ips replay upload" on storage.objects;
create policy "ips replay upload"
on storage.objects for insert
to authenticated
with check (bucket_id='ips-replay' and public.ips_can_manage_replay_path(name));

drop policy if exists "ips replay update" on storage.objects;
create policy "ips replay update"
on storage.objects for update
to authenticated
using (bucket_id='ips-replay' and public.ips_can_manage_replay_path(name))
with check (bucket_id='ips-replay' and public.ips_can_manage_replay_path(name));

drop policy if exists "ips replay delete" on storage.objects;
create policy "ips replay delete"
on storage.objects for delete
to authenticated
using (bucket_id='ips-replay' and public.ips_can_manage_replay_path(name));

update public.broadcast_package_releases r
set manifest=jsonb_set(
  r.manifest,
  '{variants,replay.fullscreen}',
  jsonb_build_object(
    'name','IPS Replay Fullscreen',
    'document',jsonb_build_object(
      'name','IPS Replay Fullscreen',
      'canvas',jsonb_build_object('width',1920,'height',1080,'transparent',true),
      'elements','[]'::jsonb,
      'metadata',jsonb_build_object('scene','replay','factory','IPS PRISM','variant','fullscreen'),
      'safeArea',jsonb_build_object('top',54,'left',96,'right',96,'bottom',54),
      'schemaVersion',1
    ),
    'priority',120,
    'sceneKey','replay',
    'directTake',false,
    'durationMs',20000,
    'variantKey','fullscreen',
    'presentation','FULLSCREEN',
    'conflictBehavior','HIDE_SCOREBAR',
    'replacementGroup','fullscreen',
    'variantVersionId',gen_random_uuid()::text,
    'automationEligible',false
  ),
  true
)
where r.package_id in (select id from public.broadcast_packages where slug='ips-prism')
  and not (coalesce(r.manifest->'variants','{}'::jsonb) ? 'replay.fullscreen');

commit;
