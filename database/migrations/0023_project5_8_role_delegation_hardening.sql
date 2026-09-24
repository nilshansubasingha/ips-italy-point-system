-- IPS Project 5.8.1 — harden hierarchical role delegation RPC exposure.
-- Internal authorization helpers stay SECURITY DEFINER but are not directly callable
-- by browser-authenticated roles. Only guarded role-management API functions remain exposed.

begin;

revoke all on function public.ips_role_scope_city(public.ips_scope_type,uuid) from public,anon,authenticated;
revoke all on function public.ips_role_scope_club(public.ips_scope_type,uuid) from public,anon,authenticated;
revoke all on function public.ips_role_scope_team(public.ips_scope_type,uuid) from public,anon,authenticated;
revoke all on function public.ips_can_delegate_role(public.ips_role,public.ips_scope_type,uuid) from public,anon,authenticated;
revoke all on function public.ips_role_grant_visible(uuid,public.ips_role,public.ips_scope_type,uuid) from public,anon,authenticated;

revoke all on function public.ips_role_management_grants() from public,anon;
revoke all on function public.ips_role_management_cities(text,integer) from public,anon;
revoke all on function public.ips_role_management_search(text,uuid,integer) from public,anon;
revoke all on function public.ips_create_role_grant(uuid,public.ips_role,public.ips_scope_type,uuid,text) from public,anon;
revoke all on function public.ips_revoke_role_grant(uuid) from public,anon;

grant execute on function public.ips_role_management_grants() to authenticated;
grant execute on function public.ips_role_management_cities(text,integer) to authenticated;
grant execute on function public.ips_role_management_search(text,uuid,integer) to authenticated;
grant execute on function public.ips_create_role_grant(uuid,public.ips_role,public.ips_scope_type,uuid,text) to authenticated;
grant execute on function public.ips_revoke_role_grant(uuid) to authenticated;

commit;
