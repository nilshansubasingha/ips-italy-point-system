-- IPS Project 5.9 — venue edit/delete management.
-- Global Owner/Admin may permanently delete a venue only when it is not part of
-- started/completed/official match history. Unstarted fixture references are cleared.

begin;

create or replace function public.ips_delete_venue(p_venue_id uuid)
returns void
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_name text;
  v_city_id uuid;
  v_fixture_count integer;
begin
  if not public.ips_can_global_registry_delete() then
    raise exception 'Only a GLOBAL OWNER or GLOBAL ADMIN can delete a venue.';
  end if;

  select name,city_id into v_name,v_city_id
  from public.venues
  where id=p_venue_id;

  if not found then
    raise exception 'Venue not found.';
  end if;

  if exists(
    select 1 from public.matches
    where venue_id=p_venue_id
      and status::text not in ('SCHEDULED','READY','CANCELLED')
  ) then
    raise exception 'This venue is used by started, completed or official match history and cannot be permanently deleted.';
  end if;

  select count(*) into v_fixture_count
  from public.matches
  where venue_id=p_venue_id;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(
    auth.uid(),'VENUE_DELETED','VENUE',p_venue_id,
    jsonb_build_object(
      'name',v_name,
      'city_id',v_city_id,
      'cleared_unstarted_fixture_refs',v_fixture_count
    )
  );

  update public.matches
  set venue_id=null
  where venue_id=p_venue_id;

  delete from public.venues
  where id=p_venue_id;
end;
$$;

revoke all on function public.ips_delete_venue(uuid) from public,anon;
grant execute on function public.ips_delete_venue(uuid) to authenticated;

commit;
