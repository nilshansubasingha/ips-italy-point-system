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
