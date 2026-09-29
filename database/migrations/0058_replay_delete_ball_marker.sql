begin;

create or replace function public.ips_replay_delete_ball_marker(
  p_match_id uuid,
  p_marker_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_deleted integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.ips_can_direct_match(p_match_id) then
    raise exception 'Not authorized for this match';
  end if;

  delete from public.broadcast_replay_ball_markers
  where id=p_marker_id
    and match_id=p_match_id;

  get diagnostics v_deleted = row_count;
  return v_deleted>0;
end;
$$;

revoke all on function public.ips_replay_delete_ball_marker(uuid,uuid) from public;
grant execute on function public.ips_replay_delete_ball_marker(uuid,uuid) to authenticated,service_role;

commit;
