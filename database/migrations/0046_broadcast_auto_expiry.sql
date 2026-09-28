-- Ensure every temporary PRISM graphic auto-expires.
-- Package duration is used first; Director override wins; 5s is the safety fallback.
-- Persistent layers such as the scorebar continue without expiry.

begin;

create or replace function public.ips_broadcast_internal_take(p_match_id uuid,p_variant_key text,p_payload jsonb default '{}'::jsonb,p_source text default 'AUTOMATION')
returns bigint
language plpgsql security definer
set search_path=public
as $$
declare
  st public.broadcast_program_state;
  sess public.broadcast_match_sessions;
  rel public.broadcast_package_releases;
  meta jsonb;
  active jsonb;
  inst jsonb;
  rev bigint;
  duration integer;
begin
  select * into sess from public.broadcast_match_sessions where match_id=p_match_id for update;
  if sess.match_id is null or sess.clean_feed then return null; end if;
  select * into st from public.broadcast_program_state where match_id=p_match_id for update;
  select * into rel from public.broadcast_package_releases where id=sess.package_release_id;
  meta:=rel.manifest#>(array['variants',p_variant_key]);
  if meta is null then return null; end if;
  duration:=coalesce((meta->>'durationMs')::integer,5000);
  active:=public.ips_broadcast_prune_layers(st.active_layers);
  if meta->>'replacementGroup' is not null then
    select coalesce(jsonb_agg(x),'[]'::jsonb) into active
    from jsonb_array_elements(active) x
    where coalesce(x->>'replacementGroup','')<>coalesce(meta->>'replacementGroup','');
  end if;
  inst:=jsonb_build_object(
    'instanceId',gen_random_uuid(),'variantKey',p_variant_key,'priority',coalesce((meta->>'priority')::integer,50),
    'replacementGroup',meta->>'replacementGroup','startedAt',now(),
    'expiresAt',case when duration is null then null else now()+make_interval(secs=>duration/1000.0) end,
    'persistent',false,'payload',coalesce(p_payload,'{}'::jsonb),'source',p_source
  );
  update public.broadcast_program_state
  set active_layers=active||jsonb_build_array(inst),revision=revision+1,updated_at=now()
  where match_id=p_match_id returning revision into rev;
  insert into public.broadcast_program_events(match_id,revision,event_type,payload)
  values(p_match_id,rev,'AUTO_TAKE',jsonb_build_object('variantKey',p_variant_key,'payload',p_payload,'source',p_source));
  return rev;
end
$$;
revoke all on function public.ips_broadcast_internal_take(uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.ips_broadcast_internal_take(uuid,text,jsonb,text) to service_role;

create or replace function public.ips_broadcast_program_command(p_match_id uuid,p_command jsonb)
returns jsonb
language plpgsql security definer
set search_path=public,auth
as $$
declare
  st public.broadcast_program_state;
  sess public.broadcast_match_sessions;
  rel public.broadcast_package_releases;
  typ text:=upper(coalesce(p_command->>'type',''));
  key text:=p_command->>'variantKey';
  meta jsonb;
  inst jsonb;
  active jsonb;
  q jsonb;
  rev bigint;
  persist boolean:=coalesce((p_command->>'persistent')::boolean,false);
  payload jsonb:=coalesce(p_command->'payload','{}'::jsonb);
  duration integer;
begin
  if not public.ips_can_direct_match(p_match_id) then raise exception 'Not allowed to direct this match.'; end if;
  perform public.ips_broadcast_ensure_match_session(p_match_id);
  select * into sess from public.broadcast_match_sessions where match_id=p_match_id for update;
  select * into st from public.broadcast_program_state where match_id=p_match_id for update;
  select * into rel from public.broadcast_package_releases where id=sess.package_release_id;

  active:=public.ips_broadcast_prune_layers(st.active_layers);
  q:=st.queue;

  if typ in ('PREVIEW','TAKE','QUEUE_ADD') then
    meta:=rel.manifest#>(array['variants',key]);
    if meta is null then raise exception 'Variant % is not in the pinned package release.',key; end if;
    duration:=coalesce((p_command->>'durationMs')::integer,(meta->>'durationMs')::integer,5000);
    if duration<250 or duration>120000 then
      raise exception 'Graphic duration must be between 250 ms and 120000 ms.';
    end if;
  end if;

  if typ='PREVIEW' then
    update public.broadcast_program_state set preview=jsonb_build_object('variantKey',key,'payload',payload,'preparedAt',now()),active_layers=active,revision=revision+1,updated_by=auth.uid(),updated_at=now()
    where match_id=p_match_id returning revision into rev;
  elsif typ='TAKE' then
    if meta->>'replacementGroup' is not null then
      select coalesce(jsonb_agg(x),'[]'::jsonb) into active from jsonb_array_elements(active) x
      where coalesce(x->>'replacementGroup','')<>coalesce(meta->>'replacementGroup','');
    end if;
    inst:=jsonb_build_object(
      'instanceId',gen_random_uuid(),'variantKey',key,'priority',coalesce((meta->>'priority')::integer,50),
      'replacementGroup',meta->>'replacementGroup','startedAt',now(),
      'expiresAt',case when persist or duration is null then null else now()+make_interval(secs=>duration/1000.0) end,
      'persistent',persist,'payload',payload,'source','DIRECTOR'
    );
    active:=active||jsonb_build_array(inst);
    update public.broadcast_program_state set active_layers=active,
      persistent_snapshot=case when persist then coalesce((select jsonb_agg(x) from jsonb_array_elements(active) x where coalesce((x->>'persistent')::boolean,false)),'[]'::jsonb) else persistent_snapshot end,
      preview=null,revision=revision+1,updated_by=auth.uid(),updated_at=now()
    where match_id=p_match_id returning revision into rev;
  elsif typ='CLEAR_TEMPORARY' then
    select coalesce(jsonb_agg(x),'[]'::jsonb) into active from jsonb_array_elements(active) x where coalesce((x->>'persistent')::boolean,false);
    update public.broadcast_program_state set active_layers=active,preview=null,revision=revision+1,updated_by=auth.uid(),updated_at=now() where match_id=p_match_id returning revision into rev;
  elsif typ='CLEAR_ALL' then
    update public.broadcast_program_state set active_layers='[]'::jsonb,preview=null,revision=revision+1,updated_by=auth.uid(),updated_at=now() where match_id=p_match_id returning revision into rev;
  elsif typ='PANIC_ON' then
    update public.broadcast_match_sessions set clean_feed=true,updated_by=auth.uid(),updated_at=now() where match_id=p_match_id;
    update public.broadcast_program_state set revision=revision+1,updated_by=auth.uid(),updated_at=now() where match_id=p_match_id returning revision into rev;
  elsif typ='PANIC_OFF' then
    update public.broadcast_match_sessions set clean_feed=false,updated_by=auth.uid(),updated_at=now() where match_id=p_match_id;
    update public.broadcast_program_state set revision=revision+1,updated_by=auth.uid(),updated_at=now() where match_id=p_match_id returning revision into rev;
  elsif typ='RESTORE_PERSISTENT' then
    update public.broadcast_match_sessions set clean_feed=false,updated_by=auth.uid(),updated_at=now() where match_id=p_match_id;
    update public.broadcast_program_state set active_layers=persistent_snapshot,preview=null,revision=revision+1,updated_by=auth.uid(),updated_at=now() where match_id=p_match_id returning revision into rev;
  elsif typ='QUEUE_ADD' then
    inst:=jsonb_build_object('queueId',gen_random_uuid(),'variantKey',key,'payload',payload,'addedAt',now());
    update public.broadcast_program_state set queue=q||jsonb_build_array(inst),revision=revision+1,updated_by=auth.uid(),updated_at=now() where match_id=p_match_id returning revision into rev;
  elsif typ='QUEUE_REMOVE' then
    select coalesce(jsonb_agg(x),'[]'::jsonb) into q from jsonb_array_elements(q) x where x->>'queueId'<>p_command->>'queueId';
    update public.broadcast_program_state set queue=q,revision=revision+1,updated_by=auth.uid(),updated_at=now() where match_id=p_match_id returning revision into rev;
  elsif typ='SET_AUTOMATION' then
    update public.broadcast_match_sessions set automation_enabled=coalesce((p_command->>'enabled')::boolean,true),updated_by=auth.uid(),updated_at=now() where match_id=p_match_id;
    update public.broadcast_program_state set revision=revision+1,updated_by=auth.uid(),updated_at=now() where match_id=p_match_id returning revision into rev;
  elsif typ='SET_SCOREBAR_LOCK' then
    update public.broadcast_match_sessions set scorebar_locked=coalesce((p_command->>'enabled')::boolean,false),updated_by=auth.uid(),updated_at=now() where match_id=p_match_id;
    update public.broadcast_program_state set revision=revision+1,updated_by=auth.uid(),updated_at=now() where match_id=p_match_id returning revision into rev;
  elsif typ='EMERGENCY_SPONSOR_OFF' then
    update public.broadcast_match_sessions set emergency_sponsor_off=coalesce((p_command->>'enabled')::boolean,true),updated_by=auth.uid(),updated_at=now() where match_id=p_match_id;
    update public.broadcast_program_state set revision=revision+1,updated_by=auth.uid(),updated_at=now() where match_id=p_match_id returning revision into rev;
  else
    raise exception 'Unsupported broadcast program command %',typ;
  end if;

  insert into public.broadcast_program_events(match_id,revision,event_type,payload,actor_user_id)
  values(p_match_id,rev,typ,p_command,auth.uid());
  return public.ips_broadcast_program_snapshot(p_match_id);
end
$$;
revoke all on function public.ips_broadcast_program_command(uuid,jsonb) from public,anon;
grant execute on function public.ips_broadcast_program_command(uuid,jsonb) to authenticated,service_role;

commit;
