begin;

create or replace function public.ips_broadcast_clear_variant(
  p_match_id uuid,
  p_variant_key text
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_active jsonb;
  v_persistent jsonb;
  v_rev bigint;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.ips_can_direct_match(p_match_id) then
    raise exception 'Not allowed to direct this match.';
  end if;

  perform public.ips_broadcast_ensure_match_session(p_match_id);

  select coalesce(jsonb_agg(x) filter (where x->>'variantKey'<>p_variant_key),'[]'::jsonb)
  into v_active
  from public.broadcast_program_state s
  cross join lateral jsonb_array_elements(public.ips_broadcast_prune_layers(s.active_layers)) x
  where s.match_id=p_match_id;

  select coalesce(jsonb_agg(x) filter (where x->>'variantKey'<>p_variant_key),'[]'::jsonb)
  into v_persistent
  from public.broadcast_program_state s
  cross join lateral jsonb_array_elements(s.persistent_snapshot) x
  where s.match_id=p_match_id;

  update public.broadcast_program_state
  set active_layers=coalesce(v_active,'[]'::jsonb),
      persistent_snapshot=coalesce(v_persistent,'[]'::jsonb),
      preview=null,
      revision=revision+1,
      updated_by=auth.uid(),
      updated_at=now()
  where match_id=p_match_id
  returning revision into v_rev;

  insert into public.broadcast_program_events(match_id,revision,event_type,payload,actor_user_id)
  values(p_match_id,v_rev,'CLEAR_VARIANT',jsonb_build_object('variantKey',p_variant_key),auth.uid());

  perform public.ips_broadcast_signal_program(p_match_id);
  return public.ips_broadcast_program_snapshot(p_match_id);
end;
$$;

revoke all on function public.ips_broadcast_clear_variant(uuid,text) from public;
grant execute on function public.ips_broadcast_clear_variant(uuid,text) to authenticated,service_role;

commit;
