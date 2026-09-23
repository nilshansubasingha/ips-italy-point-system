-- IPS Project 5.6.1 — transfer review detail.

begin;

create or replace function public.ips_transfer_detail(p_transfer_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path=public,auth as $$
declare
  tr public.player_transfer_requests;
  v_can_view boolean;
  v_can_release boolean;
  v_can_finalize boolean;
  result jsonb;
begin
  select * into tr from public.player_transfer_requests where id=p_transfer_id;
  if not found then raise exception 'Transfer not found.'; end if;

  v_can_release:=public.ips_is_owner()
    or public.ips_has_role('ADMIN','GLOBAL',null)
    or public.ips_has_role('ADMIN','CLUB',tr.from_team_identity_id)
    or public.ips_has_role('LEADER','CLUB',tr.from_team_identity_id)
    or exists(select 1 from public.clubs c where c.id=tr.from_team_identity_id and public.ips_has_role('ADMIN','CITY',c.city_id));

  v_can_finalize:=public.ips_is_owner()
    or public.ips_has_role('ADMIN','GLOBAL',null)
    or exists(select 1 from public.clubs c where c.id=tr.to_team_identity_id and public.ips_has_role('ADMIN','CITY',c.city_id));

  v_can_view:=v_can_release or v_can_finalize
    or public.ips_has_role('ADMIN','CLUB',tr.to_team_identity_id)
    or public.ips_has_role('LEADER','CLUB',tr.to_team_identity_id)
    or exists(select 1 from public.profiles p where p.id=auth.uid() and p.linked_player_id=tr.player_id);

  if not v_can_view then raise exception 'Not authorised to view this transfer.'; end if;

  select jsonb_build_object(
    'id',tr.id,'status',tr.status,'created_at',tr.created_at,'note',tr.note,
    'player_id',p.id,'player_name',p.display_name,'ips_code',p.ips_code,
    'from_team_id',fc.id,'from_team_name',fc.name,
    'from_side_id',fs.id,'from_side_name',fs.name,
    'to_team_id',tc.id,'to_team_name',tc.name,
    'to_side_id',ts.id,'to_side_name',ts.name,
    'released_at',tr.released_at,'final_review_at',tr.final_review_at,
    'can_release',v_can_release,
    'can_finalize',v_can_finalize
  ) into result
  from public.player_transfer_requests x
  join public.players p on p.id=x.player_id
  join public.clubs fc on fc.id=x.from_team_identity_id
  left join public.teams fs on fs.id=x.from_side_id
  join public.clubs tc on tc.id=x.to_team_identity_id
  join public.teams ts on ts.id=x.to_side_id
  where x.id=p_transfer_id;

  return result;
end $$;

revoke all on function public.ips_transfer_detail(uuid) from public,anon;
grant execute on function public.ips_transfer_detail(uuid) to authenticated;

notify pgrst,'reload schema';
commit;
