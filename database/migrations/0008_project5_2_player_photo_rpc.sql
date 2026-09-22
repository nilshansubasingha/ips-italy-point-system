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

notify pgrst,'reload schema';
