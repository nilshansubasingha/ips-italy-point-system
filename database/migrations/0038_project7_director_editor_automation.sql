-- IPS Project 7.1 — Director/editor operations and deterministic broadcast automation.

begin;

create table if not exists public.broadcast_event_config (
  match_id uuid not null references public.matches(id) on update cascade on delete cascade,
  event_key text not null,
  mode text not null check (mode in ('MANUAL','ASSISTED','AUTOMATIC')),
  default_variant_key text not null,
  enabled boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key(match_id,event_key)
);

create table if not exists public.broadcast_suggestions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on update cascade on delete cascade,
  suggestion_key text not null,
  variant_key text not null,
  title text not null,
  subtitle text,
  payload jsonb not null default '{}'::jsonb,
  source_event_id uuid references public.match_scoring_events(id) on delete cascade,
  status text not null default 'AVAILABLE' check (status in ('AVAILABLE','TAKEN','DISMISSED','EXPIRED')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);
create unique index if not exists broadcast_suggestion_source_unique
  on public.broadcast_suggestions(source_event_id,suggestion_key) where source_event_id is not null;
create index if not exists broadcast_suggestion_match_status_idx
  on public.broadcast_suggestions(match_id,status,created_at desc);

alter table public.broadcast_event_config enable row level security;
alter table public.broadcast_suggestions enable row level security;
revoke insert,update,delete on public.broadcast_event_config,public.broadcast_suggestions from anon,authenticated;
grant select on public.broadcast_event_config,public.broadcast_suggestions to authenticated;

drop policy if exists "broadcast director config read" on public.broadcast_event_config;
create policy "broadcast director config read" on public.broadcast_event_config
for select to authenticated using (public.ips_can_direct_match(match_id));

drop policy if exists "broadcast director suggestion read" on public.broadcast_suggestions;
create policy "broadcast director suggestion read" on public.broadcast_suggestions
for select to authenticated using (public.ips_can_direct_match(match_id));

create or replace function public.ips_broadcast_build_release_manifest(p_package_id uuid)
returns jsonb
language sql stable security definer
set search_path=public
as $$
with latest as (
  select distinct on(v.id)
    v.id variant_id,s.scene_key,v.variant_key,v.name,v.presentation,v.priority,
    v.replacement_group,v.conflict_behavior,v.default_duration_ms,v.direct_take,
    v.automation_eligible,vv.id version_id,vv.document
  from public.broadcast_scenes s
  join public.broadcast_variants v on v.scene_id=s.id
  join public.broadcast_variant_versions vv on vv.variant_id=v.id and vv.status='PUBLISHED'
  where s.package_id=p_package_id
  order by v.id,vv.version_no desc
)
select jsonb_build_object(
 'schemaVersion',1,
 'variants',coalesce(jsonb_object_agg(
   scene_key||'.'||variant_key,
   jsonb_build_object(
     'variantVersionId',version_id,'sceneKey',scene_key,'variantKey',variant_key,
     'name',name,'presentation',presentation,'priority',priority,
     'replacementGroup',replacement_group,'conflictBehavior',conflict_behavior,
     'durationMs',default_duration_ms,'directTake',direct_take,
     'automationEligible',automation_eligible,'document',document
   )
 ),'{}'::jsonb)
)
from latest;
$$;
revoke all on function public.ips_broadcast_build_release_manifest(uuid) from public,anon;
grant execute on function public.ips_broadcast_build_release_manifest(uuid) to authenticated,service_role;

create or replace function public.ips_broadcast_director_matches()
returns jsonb
language sql stable security definer
set search_path=public,auth
as $$
select coalesce(jsonb_agg(jsonb_build_object(
 'id',m.id,'match_code',m.match_code,'status',m.status,'scheduled_at',m.scheduled_at,
 'tournament_id',m.tournament_id,'tournament_name',t.name,
 'home_team',jsonb_build_object('id',h.id,'name',h.name,'short_name',h.short_name,'logo_url',h.logo_url),
 'away_team',jsonb_build_object('id',a.id,'name',a.name,'short_name',a.short_name,'logo_url',a.logo_url),
 'has_session',s.match_id is not null,'session_status',s.status,
 'package_release_id',s.package_release_id
) order by m.scheduled_at desc),'[]'::jsonb)
from public.matches m
join public.tournaments t on t.id=m.tournament_id
join public.teams h on h.id=m.home_team_id
join public.teams a on a.id=m.away_team_id
left join public.broadcast_match_sessions s on s.match_id=m.id
where public.ips_can_direct_match(m.id);
$$;
revoke all on function public.ips_broadcast_director_matches() from public,anon;
grant execute on function public.ips_broadcast_director_matches() to authenticated,service_role;

create or replace function public.ips_broadcast_editor_catalog()
returns jsonb
language sql stable security definer
set search_path=public,auth
as $$
select coalesce(jsonb_agg(pkg order by pkg->>'name'),'[]'::jsonb)
from (
 select jsonb_build_object(
   'id',p.id,'name',p.name,'slug',p.slug,'description',p.description,'is_factory',p.is_factory,
   'theme',p.theme,'can_edit',public.ips_can_manage_broadcast_package(p.id),
   'latest_release',(select max(r.version_no) from public.broadcast_package_releases r where r.package_id=p.id),
   'scenes',coalesce((
     select jsonb_agg(jsonb_build_object(
       'id',s.id,'scene_key',s.scene_key,'name',s.name,'category',s.category,'factory_locked',s.factory_locked,
       'director_visible',s.director_visible,'director_label',s.director_label,
       'variants',coalesce((
         select jsonb_agg(jsonb_build_object(
           'id',v.id,'variant_key',v.variant_key,'name',v.name,'presentation',v.presentation,'is_default',v.is_default,
           'priority',v.priority,'direct_take',v.direct_take,'automation_eligible',v.automation_eligible,
           'draft_version',(select vv.version_no from public.broadcast_variant_versions vv where vv.variant_id=v.id and vv.status='DRAFT' limit 1),
           'published_version',(select max(vv.version_no) from public.broadcast_variant_versions vv where vv.variant_id=v.id and vv.status='PUBLISHED')
         ) order by v.is_default desc,v.name)
         from public.broadcast_variants v where v.scene_id=s.id
       ),'[]'::jsonb)
     ) order by s.category,s.name)
     from public.broadcast_scenes s where s.package_id=p.id
   ),'[]'::jsonb)
 ) pkg
 from public.broadcast_packages p
 where p.status='ACTIVE'
) q;
$$;
revoke all on function public.ips_broadcast_editor_catalog() from public,anon;
grant execute on function public.ips_broadcast_editor_catalog() to authenticated,service_role;

create or replace function public.ips_broadcast_variant_document(p_variant_id uuid)
returns jsonb
language sql stable security definer
set search_path=public,auth
as $$
select jsonb_build_object(
 'variant',jsonb_build_object(
   'id',v.id,'variant_key',v.variant_key,'name',v.name,'presentation',v.presentation,
   'priority',v.priority,'replacement_group',v.replacement_group,'conflict_behavior',v.conflict_behavior,
   'default_duration_ms',v.default_duration_ms,'direct_take',v.direct_take,'automation_eligible',v.automation_eligible
 ),
 'scene',jsonb_build_object('id',s.id,'scene_key',s.scene_key,'name',s.name,'category',s.category),
 'package',jsonb_build_object('id',p.id,'name',p.name,'slug',p.slug,'is_factory',p.is_factory,'theme',p.theme,'can_edit',public.ips_can_manage_broadcast_package(p.id)),
 'version',coalesce(
   (select jsonb_build_object('id',vv.id,'version_no',vv.version_no,'status',vv.status,'document',vv.document)
    from public.broadcast_variant_versions vv where vv.variant_id=v.id and vv.status='DRAFT' order by vv.version_no desc limit 1),
   (select jsonb_build_object('id',vv.id,'version_no',vv.version_no,'status',vv.status,'document',vv.document)
    from public.broadcast_variant_versions vv where vv.variant_id=v.id and vv.status='PUBLISHED' order by vv.version_no desc limit 1)
 )
)
from public.broadcast_variants v
join public.broadcast_scenes s on s.id=v.scene_id
join public.broadcast_packages p on p.id=s.package_id
where v.id=p_variant_id;
$$;
revoke all on function public.ips_broadcast_variant_document(uuid) from public,anon;
grant execute on function public.ips_broadcast_variant_document(uuid) to authenticated,service_role;

create or replace function public.ips_broadcast_save_variant_draft(p_variant_id uuid,p_document jsonb)
returns jsonb
language plpgsql security definer
set search_path=public,auth
as $$
declare
  v_package uuid;
  v_factory boolean;
  v_version integer;
  v_id uuid;
begin
  select s.package_id,p.is_factory into v_package,v_factory
  from public.broadcast_variants v join public.broadcast_scenes s on s.id=v.scene_id join public.broadcast_packages p on p.id=s.package_id
  where v.id=p_variant_id;
  if v_package is null then raise exception 'Variant not found.'; end if;
  if v_factory then raise exception 'Factory PRISM is protected. Duplicate the package before editing.'; end if;
  if not public.ips_can_manage_broadcast_package(v_package) then raise exception 'Not allowed to edit this package.'; end if;
  if jsonb_typeof(p_document)<>'object' or p_document#>>'{canvas,width}'<>'1920' or p_document#>>'{canvas,height}'<>'1080' then
    raise exception 'Scene document must be a 1920x1080 object.';
  end if;

  select id,version_no into v_id,v_version from public.broadcast_variant_versions where variant_id=p_variant_id and status='DRAFT' limit 1;
  if v_id is null then
    select coalesce(max(version_no),0)+1 into v_version from public.broadcast_variant_versions where variant_id=p_variant_id;
    insert into public.broadcast_variant_versions(variant_id,version_no,status,document,source,created_by)
    values(p_variant_id,v_version,'DRAFT',p_document,'EDITOR',auth.uid()) returning id into v_id;
  else
    update public.broadcast_variant_versions set document=p_document where id=v_id;
  end if;

  return jsonb_build_object('id',v_id,'version_no',v_version,'status','DRAFT','document',p_document);
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
  v_package uuid;
  v_factory boolean;
  v_draft public.broadcast_variant_versions;
  v_release_no integer;
  v_release_id uuid;
  v_manifest jsonb;
  v_theme jsonb;
begin
  select s.package_id,p.is_factory,p.theme into v_package,v_factory,v_theme
  from public.broadcast_variants v join public.broadcast_scenes s on s.id=v.scene_id join public.broadcast_packages p on p.id=s.package_id
  where v.id=p_variant_id;
  if v_package is null then raise exception 'Variant not found.'; end if;
  if v_factory then raise exception 'Factory PRISM is protected. Duplicate the package before publishing changes.'; end if;
  if not public.ips_can_manage_broadcast_package(v_package) then raise exception 'Not allowed to publish this package.'; end if;

  select * into v_draft from public.broadcast_variant_versions where variant_id=p_variant_id and status='DRAFT' limit 1 for update;
  if v_draft.id is null then raise exception 'No draft exists for this variant.'; end if;

  update public.broadcast_variant_versions
  set status='PUBLISHED',published_by=auth.uid(),published_at=now()
  where id=v_draft.id;

  v_manifest:=public.ips_broadcast_build_release_manifest(v_package);
  select coalesce(max(version_no),0)+1 into v_release_no from public.broadcast_package_releases where package_id=v_package;
  insert into public.broadcast_package_releases(package_id,version_no,manifest,theme,published_by)
  values(v_package,v_release_no,v_manifest,v_theme,auth.uid())
  returning id into v_release_id;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(auth.uid(),'BROADCAST_VARIANT_PUBLISHED','broadcast_variant',p_variant_id,jsonb_build_object('release_id',v_release_id,'release_version',v_release_no,'variant_version',v_draft.version_no));

  return jsonb_build_object('variant_id',p_variant_id,'variant_version',v_draft.version_no,'release_id',v_release_id,'release_version',v_release_no);
end
$$;
revoke all on function public.ips_broadcast_publish_variant(uuid) from public,anon;
grant execute on function public.ips_broadcast_publish_variant(uuid) to authenticated,service_role;

create or replace function public.ips_broadcast_clone_package(p_source_package_id uuid,p_name text,p_slug text)
returns jsonb
language plpgsql security definer
set search_path=public,auth
as $$
declare
  src public.broadcast_packages;
  np public.broadcast_packages;
  s record;
  v record;
  ns uuid;
  nv uuid;
  doc jsonb;
  release_id uuid;
begin
  select * into src from public.broadcast_packages where id=p_source_package_id;
  if src.id is null then raise exception 'Source package not found.'; end if;
  if not public.ips_is_owner() and src.status<>'ACTIVE' then raise exception 'Package unavailable.'; end if;
  if trim(coalesce(p_name,''))='' or trim(coalesce(p_slug,''))='' then raise exception 'Name and slug are required.'; end if;

  insert into public.broadcast_packages(name,slug,description,is_factory,base_package_id,tournament_id,theme,status,created_by)
  values(trim(p_name),lower(trim(p_slug)),'Custom package based on '||src.name,false,src.id,src.tournament_id,src.theme,'ACTIVE',auth.uid())
  returning * into np;

  for s in select * from public.broadcast_scenes where package_id=src.id order by created_at loop
    insert into public.broadcast_scenes(package_id,scene_key,name,category,description,factory_locked,director_visible,director_label,replacement_group,default_priority,created_by)
    values(np.id,s.scene_key,s.name,s.category,s.description,false,s.director_visible,s.director_label,s.replacement_group,s.default_priority,auth.uid())
    returning id into ns;

    for v in select * from public.broadcast_variants where scene_id=s.id order by created_at loop
      insert into public.broadcast_variants(scene_id,variant_key,name,presentation,is_default,priority,replacement_group,conflict_behavior,default_duration_ms,direct_take,retrigger_policy,automation_eligible)
      values(ns,v.variant_key,v.name,v.presentation,v.is_default,v.priority,v.replacement_group,v.conflict_behavior,v.default_duration_ms,v.direct_take,v.retrigger_policy,v.automation_eligible)
      returning id into nv;
      select vv.document into doc from public.broadcast_variant_versions vv where vv.variant_id=v.id and vv.status='PUBLISHED' order by vv.version_no desc limit 1;
      if doc is not null then
        insert into public.broadcast_variant_versions(variant_id,version_no,status,document,source,created_by,published_by,published_at)
        values(nv,1,'PUBLISHED',doc,'DUPLICATE',auth.uid(),auth.uid(),now());
      end if;
    end loop;
  end loop;

  insert into public.broadcast_package_releases(package_id,version_no,manifest,theme,published_by)
  values(np.id,1,public.ips_broadcast_build_release_manifest(np.id),np.theme,auth.uid())
  returning id into release_id;

  return jsonb_build_object('package_id',np.id,'release_id',release_id,'name',np.name,'slug',np.slug);
end
$$;
revoke all on function public.ips_broadcast_clone_package(uuid,text,text) from public,anon;
grant execute on function public.ips_broadcast_clone_package(uuid,text,text) to authenticated,service_role;

create or replace function public.ips_broadcast_prune_layers(p_layers jsonb)
returns jsonb
language sql stable
as $$
  select coalesce(jsonb_agg(x),'[]'::jsonb)
  from jsonb_array_elements(coalesce(p_layers,'[]'::jsonb)) x
  where x->>'expiresAt' is null or (x->>'expiresAt')::timestamptz>now();
$$;

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
  duration:=(meta->>'durationMs')::integer;
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
    duration:=coalesce((p_command->>'durationMs')::integer,(meta->>'durationMs')::integer);
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

create or replace function public.ips_broadcast_ensure_match_session(p_match_id uuid)
returns jsonb
language plpgsql security definer
set search_path=public,auth
as $$
declare
  rel_id uuid;
  manifest jsonb;
  scorebar jsonb;
begin
  if not public.ips_can_direct_match(p_match_id) then raise exception 'Not allowed to direct this match.'; end if;
  if not exists(select 1 from public.matches where id=p_match_id) then raise exception 'Match not found.'; end if;

  select package_release_id into rel_id from public.broadcast_match_sessions where match_id=p_match_id;
  if rel_id is null then
    rel_id:=public.ips_broadcast_default_release();
    if rel_id is null then raise exception 'IPS PRISM release is unavailable.'; end if;
    insert into public.broadcast_match_sessions(match_id,package_release_id,updated_by)
    values(p_match_id,rel_id,auth.uid()) on conflict(match_id) do nothing;
  end if;

  select r.manifest into manifest from public.broadcast_package_releases r join public.broadcast_match_sessions s on s.package_release_id=r.id where s.match_id=p_match_id;
  scorebar:=jsonb_build_object('instanceId',gen_random_uuid(),'variantKey','scorebar.default','priority',coalesce((manifest#>>'{variants,scorebar.default,priority}')::integer,50),'replacementGroup','scorebar','startedAt',now(),'expiresAt',null,'persistent',true,'payload','{}'::jsonb,'source','RESTORE');

  insert into public.broadcast_program_state(match_id,revision,active_layers,persistent_snapshot,updated_by)
  values(p_match_id,1,jsonb_build_array(scorebar),jsonb_build_array(scorebar),auth.uid()) on conflict(match_id) do nothing;

  insert into public.broadcast_realtime_signals(match_id,score_revision,program_revision)
  values(p_match_id,0,coalesce((select revision from public.broadcast_program_state where match_id=p_match_id),0)) on conflict(match_id) do nothing;

  insert into public.broadcast_event_config(match_id,event_key,mode,default_variant_key,updated_by)
  values
   (p_match_id,'FOUR','AUTOMATIC','four.fullscreen',auth.uid()),
   (p_match_id,'SIX','AUTOMATIC','six.fullscreen',auth.uid()),
   (p_match_id,'WICKET','ASSISTED','wicket.fullscreen',auth.uid())
  on conflict(match_id,event_key) do nothing;

  return public.ips_broadcast_program_snapshot(p_match_id);
end
$$;
revoke all on function public.ips_broadcast_ensure_match_session(uuid) from public,anon;
grant execute on function public.ips_broadcast_ensure_match_session(uuid) to authenticated,service_role;

create or replace function public.ips_broadcast_director_snapshot(p_match_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path=public,auth
as $$
begin
  if not public.ips_can_direct_match(p_match_id) then raise exception 'Not allowed to direct this match.'; end if;
  return public.ips_broadcast_program_snapshot(p_match_id)
    || jsonb_build_object(
      'event_config',coalesce((select jsonb_agg(to_jsonb(c) order by c.event_key) from public.broadcast_event_config c where c.match_id=p_match_id),'[]'::jsonb),
      'suggestions',coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at desc) from public.broadcast_suggestions s where s.match_id=p_match_id and s.status='AVAILABLE'),'[]'::jsonb)
    );
end
$$;
revoke all on function public.ips_broadcast_director_snapshot(uuid) from public,anon;
grant execute on function public.ips_broadcast_director_snapshot(uuid) to authenticated,service_role;

create or replace function public.ips_broadcast_set_event_config(p_match_id uuid,p_event_key text,p_mode text,p_variant_key text,p_enabled boolean default true)
returns jsonb
language plpgsql security definer
set search_path=public,auth
as $$
begin
 if not public.ips_can_direct_match(p_match_id) then raise exception 'Not allowed to direct this match.'; end if;
 if upper(p_mode) not in ('MANUAL','ASSISTED','AUTOMATIC') then raise exception 'Invalid automation mode.'; end if;
 insert into public.broadcast_event_config(match_id,event_key,mode,default_variant_key,enabled,updated_by,updated_at)
 values(p_match_id,upper(p_event_key),upper(p_mode),p_variant_key,p_enabled,auth.uid(),now())
 on conflict(match_id,event_key) do update set mode=excluded.mode,default_variant_key=excluded.default_variant_key,enabled=excluded.enabled,updated_by=auth.uid(),updated_at=now();
 return (select to_jsonb(c) from public.broadcast_event_config c where c.match_id=p_match_id and c.event_key=upper(p_event_key));
end
$$;
revoke all on function public.ips_broadcast_set_event_config(uuid,text,text,text,boolean) from public,anon;
grant execute on function public.ips_broadcast_set_event_config(uuid,text,text,text,boolean) to authenticated,service_role;

create or replace function public.ips_broadcast_take_suggestion(p_suggestion_id uuid)
returns jsonb
language plpgsql security definer
set search_path=public,auth
as $$
declare s public.broadcast_suggestions;
begin
 select * into s from public.broadcast_suggestions where id=p_suggestion_id for update;
 if s.id is null then raise exception 'Suggestion not found.'; end if;
 if not public.ips_can_direct_match(s.match_id) then raise exception 'Not allowed.'; end if;
 if s.status<>'AVAILABLE' then raise exception 'Suggestion is no longer available.'; end if;
 perform public.ips_broadcast_internal_take(s.match_id,s.variant_key,s.payload,'SUGGESTION');
 update public.broadcast_suggestions set status='TAKEN',resolved_at=now(),resolved_by=auth.uid() where id=s.id;
 return public.ips_broadcast_director_snapshot(s.match_id);
end
$$;
revoke all on function public.ips_broadcast_take_suggestion(uuid) from public,anon;
grant execute on function public.ips_broadcast_take_suggestion(uuid) to authenticated,service_role;

create or replace function public.ips_broadcast_dismiss_suggestion(p_suggestion_id uuid)
returns jsonb
language plpgsql security definer
set search_path=public,auth
as $$
declare s public.broadcast_suggestions;
begin
 select * into s from public.broadcast_suggestions where id=p_suggestion_id for update;
 if s.id is null then raise exception 'Suggestion not found.'; end if;
 if not public.ips_can_direct_match(s.match_id) then raise exception 'Not allowed.'; end if;
 update public.broadcast_suggestions set status='DISMISSED',resolved_at=now(),resolved_by=auth.uid() where id=s.id and status='AVAILABLE';
 return public.ips_broadcast_director_snapshot(s.match_id);
end
$$;
revoke all on function public.ips_broadcast_dismiss_suggestion(uuid) from public,anon;
grant execute on function public.ips_broadcast_dismiss_suggestion(uuid) to authenticated,service_role;

create or replace function public.ips_broadcast_on_scoring_event()
returns trigger
language plpgsql security definer
set search_path=public
as $$
declare
 cfg public.broadcast_event_config;
 event_key text;
 title text;
begin
 if new.event_type<>'DELIVERY' then return new; end if;
 if not exists(select 1 from public.broadcast_match_sessions s where s.match_id=new.match_id and s.automation_enabled and not s.clean_feed) then return new; end if;

 if new.is_wicket then event_key:='WICKET';title:='WICKET AVAILABLE';
 elsif new.runs_off_bat=6 then event_key:='SIX';title:='SIX';
 elsif new.runs_off_bat=4 then event_key:='FOUR';title:='FOUR';
 else return new;
 end if;

 select * into cfg from public.broadcast_event_config c where c.match_id=new.match_id and c.event_key=event_key and c.enabled;
 if cfg.match_id is null or cfg.mode='MANUAL' then return new; end if;

 if cfg.mode='AUTOMATIC' then
   perform public.ips_broadcast_internal_take(new.match_id,cfg.default_variant_key,jsonb_build_object('source_event_id',new.id,'sequence_no',new.sequence_no,'event_key',event_key),'AUTOMATION');
 else
   insert into public.broadcast_suggestions(match_id,suggestion_key,variant_key,title,subtitle,payload,source_event_id)
   values(new.match_id,event_key,cfg.default_variant_key,title,new.delivery_label,jsonb_build_object('source_event_id',new.id,'sequence_no',new.sequence_no,'event_key',event_key),new.id)
   on conflict do nothing;
 end if;
 return new;
end
$$;

drop trigger if exists broadcast_automation_from_scoring_event on public.match_scoring_events;
create trigger broadcast_automation_from_scoring_event
after insert on public.match_scoring_events
for each row execute function public.ips_broadcast_on_scoring_event();

commit;
