-- IPS Project 7 — editor publishing lifecycle + deterministic runtime timing.

begin;

create or replace function public.ips_validate_broadcast_document(p_document jsonb)
returns boolean
language plpgsql immutable
as $$
begin
  if p_document is null or jsonb_typeof(p_document)<>'object' then raise exception 'Broadcast document must be a JSON object.'; end if;
  if coalesce((p_document->>'schemaVersion')::integer,0)<>1 then raise exception 'Unsupported broadcast document schema version.'; end if;
  if coalesce((p_document#>>'{canvas,width}')::integer,0)<>1920 or coalesce((p_document#>>'{canvas,height}')::integer,0)<>1080 then
    raise exception 'Broadcast canvas must be exactly 1920x1080.';
  end if;
  if jsonb_typeof(p_document->'elements')<>'array' then raise exception 'Broadcast document elements must be an array.'; end if;
  return true;
end
$$;
revoke all on function public.ips_validate_broadcast_document(jsonb) from public,anon;
grant execute on function public.ips_validate_broadcast_document(jsonb) to authenticated,service_role;

create or replace function public.ips_broadcast_catalog(p_package_id uuid default null)
returns jsonb
language sql stable security definer
set search_path=public,auth
as $$
with packages as (
 select p.*
 from public.broadcast_packages p
 where p.status='ACTIVE'
   and (p.is_factory or public.ips_can_manage_broadcast_package(p.id) or p.id=p_package_id)
),
scene_data as (
 select
   p.id package_id,p.name package_name,p.slug package_slug,p.is_factory,
   s.id scene_id,s.scene_key,s.name scene_name,s.category,s.director_visible,s.director_label,
   v.id variant_id,v.variant_key,v.name variant_name,v.presentation,v.is_default,v.priority,v.replacement_group,
   v.conflict_behavior,v.default_duration_ms,v.direct_take,v.automation_eligible,
   (
     select jsonb_build_object('id',vv.id,'version',vv.version_no,'status',vv.status,'document',vv.document,'created_at',vv.created_at)
     from public.broadcast_variant_versions vv where vv.variant_id=v.id and vv.status='DRAFT'
     order by vv.version_no desc limit 1
   ) draft,
   (
     select jsonb_build_object('id',vv.id,'version',vv.version_no,'status',vv.status,'document',vv.document,'published_at',vv.published_at)
     from public.broadcast_variant_versions vv where vv.variant_id=v.id and vv.status='PUBLISHED'
     order by vv.version_no desc limit 1
   ) published
 from packages p
 join public.broadcast_scenes s on s.package_id=p.id
 join public.broadcast_variants v on v.scene_id=s.id
)
select jsonb_build_object(
 'packages',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'slug',p.slug,'description',p.description,'is_factory',p.is_factory,'tournament_id',p.tournament_id,'theme',p.theme) order by p.is_factory desc,p.name) from packages p),'[]'::jsonb),
 'variants',coalesce((select jsonb_agg(to_jsonb(sd) order by sd.category,sd.scene_name,sd.presentation) from scene_data sd),'[]'::jsonb)
);
$$;
revoke all on function public.ips_broadcast_catalog(uuid) from public,anon;
grant execute on function public.ips_broadcast_catalog(uuid) to authenticated,service_role;

create or replace function public.ips_broadcast_duplicate_factory_package(
  p_name text,p_slug text,p_tournament_id uuid default null
)
returns uuid
language plpgsql security definer
set search_path=public,auth
as $$
declare
  src public.broadcast_packages;
  dst_id uuid;
  s record;
  new_scene uuid;
  v record;
  new_variant uuid;
  latest_doc jsonb;
begin
  if not public.ips_is_owner() and (p_tournament_id is null or not public.ips_can_manage_tournament(p_tournament_id)) then
    raise exception 'Not allowed to create this broadcast package.';
  end if;
  select * into src from public.broadcast_packages where slug='ips-prism' and is_factory;
  if not found then raise exception 'IPS PRISM factory package is unavailable.'; end if;

  insert into public.broadcast_packages(name,slug,description,is_factory,base_package_id,tournament_id,theme,created_by)
  values(trim(p_name),lower(trim(p_slug)),'Customized from IPS PRISM',false,src.id,p_tournament_id,src.theme,auth.uid())
  returning id into dst_id;

  for s in select * from public.broadcast_scenes where package_id=src.id order by created_at loop
    insert into public.broadcast_scenes(package_id,scene_key,name,category,description,factory_locked,director_visible,director_label,replacement_group,default_priority,created_by)
    values(dst_id,s.scene_key,s.name,s.category,s.description,false,s.director_visible,s.director_label,s.replacement_group,s.default_priority,auth.uid())
    returning id into new_scene;

    for v in select * from public.broadcast_variants where scene_id=s.id order by created_at loop
      select vv.document into latest_doc from public.broadcast_variant_versions vv
      where vv.variant_id=v.id and vv.status='PUBLISHED' order by vv.version_no desc limit 1;

      insert into public.broadcast_variants(scene_id,variant_key,name,presentation,is_default,priority,replacement_group,conflict_behavior,default_duration_ms,direct_take,retrigger_policy,automation_eligible)
      values(new_scene,v.variant_key,v.name,v.presentation,v.is_default,v.priority,v.replacement_group,v.conflict_behavior,v.default_duration_ms,v.direct_take,v.retrigger_policy,v.automation_eligible)
      returning id into new_variant;

      insert into public.broadcast_variant_versions(variant_id,version_no,status,document,source,created_by,published_by,published_at)
      values(new_variant,1,'PUBLISHED',latest_doc,'DUPLICATE',auth.uid(),auth.uid(),now());
      insert into public.broadcast_variant_versions(variant_id,version_no,status,document,source,created_by)
      values(new_variant,2,'DRAFT',latest_doc,'DUPLICATE',auth.uid());
    end loop;
  end loop;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(auth.uid(),'BROADCAST_PACKAGE_DUPLICATED','broadcast_package',dst_id,jsonb_build_object('source',src.id,'name',p_name));

  return dst_id;
end
$$;
revoke all on function public.ips_broadcast_duplicate_factory_package(text,text,uuid) from public,anon;
grant execute on function public.ips_broadcast_duplicate_factory_package(text,text,uuid) to authenticated,service_role;

create or replace function public.ips_broadcast_create_variant_draft(p_variant_id uuid)
returns jsonb
language plpgsql security definer
set search_path=public,auth
as $$
declare
  pkg_id uuid;
  d public.broadcast_variant_versions;
  next_no integer;
  doc jsonb;
begin
  select s.package_id into pkg_id from public.broadcast_variants v join public.broadcast_scenes s on s.id=v.scene_id where v.id=p_variant_id;
  if pkg_id is null or not public.ips_can_manage_broadcast_package(pkg_id) then raise exception 'Not allowed to edit this variant.'; end if;

  select * into d from public.broadcast_variant_versions where variant_id=p_variant_id and status='DRAFT' order by version_no desc limit 1;
  if found then return to_jsonb(d); end if;

  select coalesce(max(version_no),0)+1 into next_no from public.broadcast_variant_versions where variant_id=p_variant_id;
  select document into doc from public.broadcast_variant_versions where variant_id=p_variant_id and status='PUBLISHED' order by version_no desc limit 1;
  if doc is null then raise exception 'Variant has no published source document.'; end if;

  insert into public.broadcast_variant_versions(variant_id,version_no,status,document,source,created_by)
  values(p_variant_id,next_no,'DRAFT',doc,'EDITOR',auth.uid()) returning * into d;
  return to_jsonb(d);
end
$$;
revoke all on function public.ips_broadcast_create_variant_draft(uuid) from public,anon;
grant execute on function public.ips_broadcast_create_variant_draft(uuid) to authenticated,service_role;

create or replace function public.ips_broadcast_save_variant_draft(p_variant_id uuid,p_document jsonb)
returns jsonb
language plpgsql security definer
set search_path=public,auth
as $$
declare
  pkg_id uuid;
  d public.broadcast_variant_versions;
begin
  perform public.ips_validate_broadcast_document(p_document);
  select s.package_id into pkg_id from public.broadcast_variants v join public.broadcast_scenes s on s.id=v.scene_id where v.id=p_variant_id;
  if pkg_id is null or not public.ips_can_manage_broadcast_package(pkg_id) then raise exception 'Not allowed to edit this variant.'; end if;
  if exists(select 1 from public.broadcast_packages where id=pkg_id and is_factory) then raise exception 'Factory PRISM graphics are protected. Duplicate the package first.'; end if;

  perform public.ips_broadcast_create_variant_draft(p_variant_id);
  update public.broadcast_variant_versions
  set document=p_document
  where variant_id=p_variant_id and status='DRAFT'
  returning * into d;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(auth.uid(),'BROADCAST_DRAFT_SAVED','broadcast_variant',p_variant_id,jsonb_build_object('version',d.version_no));
  return to_jsonb(d);
end
$$;
revoke all on function public.ips_broadcast_save_variant_draft(uuid,jsonb) from public,anon;
grant execute on function public.ips_broadcast_save_variant_draft(uuid,jsonb) to authenticated,service_role;

create or replace function public.ips_broadcast_publish_variant(p_variant_id uuid)
returns jsonb
language plpgsql security definer
set search_path=public,auth
as $$
declare
  pkg_id uuid;
  d public.broadcast_variant_versions;
begin
  select s.package_id into pkg_id from public.broadcast_variants v join public.broadcast_scenes s on s.id=v.scene_id where v.id=p_variant_id;
  if pkg_id is null or not public.ips_can_manage_broadcast_package(pkg_id) then raise exception 'Not allowed to publish this variant.'; end if;
  if exists(select 1 from public.broadcast_packages where id=pkg_id and is_factory) then raise exception 'Factory PRISM graphics are protected.'; end if;

  select * into d from public.broadcast_variant_versions where variant_id=p_variant_id and status='DRAFT' order by version_no desc limit 1 for update;
  if not found then raise exception 'No draft exists for this variant.'; end if;
  perform public.ips_validate_broadcast_document(d.document);

  update public.broadcast_variant_versions set status='PUBLISHED',published_by=auth.uid(),published_at=now() where id=d.id returning * into d;
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(auth.uid(),'BROADCAST_VARIANT_PUBLISHED','broadcast_variant',p_variant_id,jsonb_build_object('version',d.version_no));
  return to_jsonb(d);
end
$$;
revoke all on function public.ips_broadcast_publish_variant(uuid) from public,anon;
grant execute on function public.ips_broadcast_publish_variant(uuid) to authenticated,service_role;

create or replace function public.ips_broadcast_create_scene(
  p_package_id uuid,p_scene_key text,p_name text,p_category text,p_variant_key text,p_presentation text,p_document jsonb
)
returns jsonb
language plpgsql security definer
set search_path=public,auth
as $$
declare
  sid uuid;vid uuid;vv public.broadcast_variant_versions;
begin
  if not public.ips_can_manage_broadcast_package(p_package_id) then raise exception 'Not allowed to create graphics in this package.'; end if;
  if exists(select 1 from public.broadcast_packages where id=p_package_id and is_factory) then raise exception 'Factory PRISM is protected.'; end if;
  perform public.ips_validate_broadcast_document(p_document);

  insert into public.broadcast_scenes(package_id,scene_key,name,category,director_visible,director_label,replacement_group,default_priority,created_by)
  values(p_package_id,lower(trim(p_scene_key)),trim(p_name),upper(trim(p_category)),true,upper(trim(p_name)),lower(trim(p_scene_key)),60,auth.uid())
  returning id into sid;

  insert into public.broadcast_variants(scene_id,variant_key,name,presentation,is_default,priority,replacement_group,conflict_behavior,default_duration_ms,direct_take,automation_eligible)
  values(sid,lower(trim(p_variant_key)),trim(p_name),upper(trim(p_presentation)),true,60,lower(trim(p_scene_key)),'REPLACE_GROUP',5000,false,false)
  returning id into vid;

  insert into public.broadcast_variant_versions(variant_id,version_no,status,document,source,created_by)
  values(vid,1,'DRAFT',p_document,'EDITOR',auth.uid()) returning * into vv;

  return jsonb_build_object('scene_id',sid,'variant_id',vid,'draft',to_jsonb(vv));
end
$$;
revoke all on function public.ips_broadcast_create_scene(uuid,text,text,text,text,text,jsonb) from public,anon;
grant execute on function public.ips_broadcast_create_scene(uuid,text,text,text,text,text,jsonb) to authenticated,service_role;

create or replace function public.ips_broadcast_publish_package(p_package_id uuid)
returns jsonb
language plpgsql security definer
set search_path=public,auth
as $$
declare
  p public.broadcast_packages;
  next_no integer;
  manifest jsonb;
  r public.broadcast_package_releases;
begin
  if not public.ips_can_manage_broadcast_package(p_package_id) then raise exception 'Not allowed to publish this package.'; end if;
  select * into p from public.broadcast_packages where id=p_package_id;
  if p.is_factory then raise exception 'Factory PRISM releases are protected.'; end if;

  with latest as (
    select distinct on(v.id)
      s.scene_key,v.variant_key,v.name,v.presentation,v.priority,v.replacement_group,v.conflict_behavior,
      v.default_duration_ms,v.direct_take,v.automation_eligible,vv.id version_id,vv.document
    from public.broadcast_scenes s
    join public.broadcast_variants v on v.scene_id=s.id
    join public.broadcast_variant_versions vv on vv.variant_id=v.id and vv.status='PUBLISHED'
    where s.package_id=p_package_id
    order by v.id,vv.version_no desc
  )
  select jsonb_build_object(
    'schemaVersion',1,'package',p.name,
    'variants',coalesce(jsonb_object_agg(
      latest.scene_key||'.'||latest.variant_key,
      jsonb_build_object(
       'variantVersionId',latest.version_id,'sceneKey',latest.scene_key,'variantKey',latest.variant_key,
       'name',latest.name,'presentation',latest.presentation,'priority',latest.priority,
       'replacementGroup',latest.replacement_group,'conflictBehavior',latest.conflict_behavior,
       'durationMs',latest.default_duration_ms,'directTake',latest.direct_take,
       'automationEligible',latest.automation_eligible,'document',latest.document
      )
    ),'{}'::jsonb)
  ) into manifest from latest;

  if coalesce(jsonb_object_length(manifest->'variants'),0)=0 then raise exception 'Package has no published variants.'; end if;
  select coalesce(max(version_no),0)+1 into next_no from public.broadcast_package_releases where package_id=p_package_id;

  insert into public.broadcast_package_releases(package_id,version_no,manifest,theme,published_by,checksum)
  values(p_package_id,next_no,manifest,p.theme,auth.uid(),'release-'||next_no::text||'-'||extract(epoch from now())::bigint::text)
  returning * into r;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(auth.uid(),'BROADCAST_PACKAGE_PUBLISHED','broadcast_package',p_package_id,jsonb_build_object('release_id',r.id,'version',r.version_no));
  return to_jsonb(r);
end
$$;
revoke all on function public.ips_broadcast_publish_package(uuid) from public,anon;
grant execute on function public.ips_broadcast_publish_package(uuid) to authenticated,service_role;

create or replace function public.ips_broadcast_select_release(p_match_id uuid,p_release_id uuid)
returns jsonb
language plpgsql security definer
set search_path=public,auth
as $$
begin
  if not public.ips_can_direct_match(p_match_id) then raise exception 'Not allowed to direct this match.'; end if;
  if not exists(select 1 from public.broadcast_package_releases where id=p_release_id) then raise exception 'Broadcast release not found.'; end if;
  insert into public.broadcast_match_sessions(match_id,package_release_id,updated_by)
  values(p_match_id,p_release_id,auth.uid())
  on conflict(match_id) do update set package_release_id=excluded.package_release_id,updated_by=auth.uid(),updated_at=now();
  update public.broadcast_program_state set active_layers='[]'::jsonb,persistent_snapshot='[]'::jsonb,preview=null,queue='[]'::jsonb,revision=revision+1,updated_by=auth.uid(),updated_at=now() where match_id=p_match_id;
  return public.ips_broadcast_program_snapshot(p_match_id);
end
$$;
revoke all on function public.ips_broadcast_select_release(uuid,uuid) from public,anon;
grant execute on function public.ips_broadcast_select_release(uuid,uuid) to authenticated,service_role;

create or replace function public.ips_broadcast_program_command(p_match_id uuid,p_command jsonb)
returns jsonb
language plpgsql security definer
set search_path=public,auth
as $$
declare
  st public.broadcast_program_state;
  sess public.broadcast_match_sessions;
  rel public.broadcast_package_releases;
  v_type text:=upper(coalesce(p_command->>'type',''));
  v_key text:=p_command->>'variantKey';
  v_meta jsonb;
  v_instance jsonb;
  v_active jsonb;
  v_queue jsonb;
  v_revision bigint;
  v_persistent boolean:=coalesce((p_command->>'persistent')::boolean,false);
  v_payload jsonb:=coalesce(p_command->'payload','{}'::jsonb);
  v_duration integer;
  v_started timestamptz:=clock_timestamp();
  v_expires timestamptz;
begin
  if not public.ips_can_direct_match(p_match_id) then raise exception 'Not allowed to direct this match.'; end if;
  perform public.ips_broadcast_ensure_match_session(p_match_id);
  select * into sess from public.broadcast_match_sessions where match_id=p_match_id for update;
  select * into st from public.broadcast_program_state where match_id=p_match_id for update;
  select * into rel from public.broadcast_package_releases where id=sess.package_release_id;

  if v_type in ('PREVIEW','TAKE','QUEUE_ADD') then
    v_meta:=rel.manifest#>(array['variants',v_key]);
    if v_meta is null then raise exception 'Variant % is not in the pinned package release.',v_key; end if;
  end if;

  v_active:=st.active_layers;
  v_queue:=st.queue;
  v_duration:=coalesce((p_command->>'durationMs')::integer,(v_meta->>'durationMs')::integer);
  if not v_persistent and v_duration is not null then v_expires:=v_started+make_interval(secs=>v_duration/1000.0); end if;

  if v_type='PREVIEW' then
    update public.broadcast_program_state
    set preview=jsonb_build_object('variantKey',v_key,'payload',v_payload,'durationMs',v_duration,'preparedAt',v_started),
        revision=revision+1,updated_by=auth.uid(),updated_at=now()
    where match_id=p_match_id returning revision into v_revision;

  elsif v_type='TAKE' then
    if v_meta->>'replacementGroup' is not null then
      select coalesce(jsonb_agg(x),'[]'::jsonb) into v_active
      from jsonb_array_elements(st.active_layers) x
      where coalesce(x->>'replacementGroup','')<>coalesce(v_meta->>'replacementGroup','');
    end if;
    v_instance:=jsonb_build_object(
      'instanceId',gen_random_uuid(),'variantKey',v_key,'priority',coalesce((v_meta->>'priority')::integer,50),
      'replacementGroup',v_meta->>'replacementGroup','startedAt',v_started,'durationMs',v_duration,'expiresAt',v_expires,
      'persistent',v_persistent,'payload',v_payload,'source','DIRECTOR'
    );
    v_active:=v_active||jsonb_build_array(v_instance);
    update public.broadcast_program_state
    set active_layers=v_active,
        persistent_snapshot=case when v_persistent then
          coalesce((select jsonb_agg(x) from jsonb_array_elements(v_active) x where coalesce((x->>'persistent')::boolean,false)),'[]'::jsonb)
          else persistent_snapshot end,
        preview=null,revision=revision+1,updated_by=auth.uid(),updated_at=now()
    where match_id=p_match_id returning revision into v_revision;

  elsif v_type='CLEAR_TEMPORARY' then
    select coalesce(jsonb_agg(x),'[]'::jsonb) into v_active from jsonb_array_elements(st.active_layers) x where coalesce((x->>'persistent')::boolean,false);
    update public.broadcast_program_state set active_layers=v_active,preview=null,revision=revision+1,updated_by=auth.uid(),updated_at=now() where match_id=p_match_id returning revision into v_revision;
  elsif v_type='CLEAR_ALL' then
    update public.broadcast_program_state set active_layers='[]'::jsonb,preview=null,revision=revision+1,updated_by=auth.uid(),updated_at=now() where match_id=p_match_id returning revision into v_revision;
  elsif v_type='PANIC_ON' then
    update public.broadcast_match_sessions set clean_feed=true,updated_by=auth.uid(),updated_at=now() where match_id=p_match_id;
    update public.broadcast_program_state set revision=revision+1,updated_by=auth.uid(),updated_at=now() where match_id=p_match_id returning revision into v_revision;
  elsif v_type='PANIC_OFF' then
    update public.broadcast_match_sessions set clean_feed=false,updated_by=auth.uid(),updated_at=now() where match_id=p_match_id;
    update public.broadcast_program_state set revision=revision+1,updated_by=auth.uid(),updated_at=now() where match_id=p_match_id returning revision into v_revision;
  elsif v_type='RESTORE_PERSISTENT' then
    update public.broadcast_match_sessions set clean_feed=false,updated_by=auth.uid(),updated_at=now() where match_id=p_match_id;
    update public.broadcast_program_state set active_layers=persistent_snapshot,preview=null,revision=revision+1,updated_by=auth.uid(),updated_at=now() where match_id=p_match_id returning revision into v_revision;
  elsif v_type='QUEUE_ADD' then
    v_instance:=jsonb_build_object('queueId',gen_random_uuid(),'variantKey',v_key,'payload',v_payload,'durationMs',v_duration,'addedAt',v_started);
    update public.broadcast_program_state set queue=queue||jsonb_build_array(v_instance),revision=revision+1,updated_by=auth.uid(),updated_at=now() where match_id=p_match_id returning revision into v_revision;
  elsif v_type='QUEUE_REMOVE' then
    select coalesce(jsonb_agg(x),'[]'::jsonb) into v_queue from jsonb_array_elements(st.queue) x where x->>'queueId'<>p_command->>'queueId';
    update public.broadcast_program_state set queue=v_queue,revision=revision+1,updated_by=auth.uid(),updated_at=now() where match_id=p_match_id returning revision into v_revision;
  elsif v_type='SET_AUTOMATION' then
    update public.broadcast_match_sessions set automation_enabled=coalesce((p_command->>'enabled')::boolean,true),updated_by=auth.uid(),updated_at=now() where match_id=p_match_id;
    update public.broadcast_program_state set revision=revision+1,updated_by=auth.uid(),updated_at=now() where match_id=p_match_id returning revision into v_revision;
  elsif v_type='SET_SCOREBAR_LOCK' then
    update public.broadcast_match_sessions set scorebar_locked=coalesce((p_command->>'enabled')::boolean,false),updated_by=auth.uid(),updated_at=now() where match_id=p_match_id;
    update public.broadcast_program_state set revision=revision+1,updated_by=auth.uid(),updated_at=now() where match_id=p_match_id returning revision into v_revision;
  elsif v_type='EMERGENCY_SPONSOR_OFF' then
    update public.broadcast_match_sessions set emergency_sponsor_off=coalesce((p_command->>'enabled')::boolean,true),updated_by=auth.uid(),updated_at=now() where match_id=p_match_id;
    update public.broadcast_program_state set revision=revision+1,updated_by=auth.uid(),updated_at=now() where match_id=p_match_id returning revision into v_revision;
  else
    raise exception 'Unsupported broadcast program command %',v_type;
  end if;

  insert into public.broadcast_program_events(match_id,revision,event_type,payload,actor_user_id)
  values(p_match_id,v_revision,v_type,p_command,auth.uid());
  return public.ips_broadcast_program_snapshot(p_match_id);
end
$$;
revoke all on function public.ips_broadcast_program_command(uuid,jsonb) from public,anon;
grant execute on function public.ips_broadcast_program_command(uuid,jsonb) to authenticated,service_role;

commit;
