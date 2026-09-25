-- IPS Project 7.5 — Director package/release switching for published editor graphics.

begin;

create or replace function public.ips_broadcast_available_releases(p_match_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path=public,auth
as $$
declare
  v_tournament uuid;
begin
  if not public.ips_can_direct_match(p_match_id) then raise exception 'Not allowed to direct this match.'; end if;
  select tournament_id into v_tournament from public.matches where id=p_match_id;
  if v_tournament is null then raise exception 'Match not found.'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'release_id',x.release_id,
      'package_id',x.package_id,
      'package_name',x.package_name,
      'package_slug',x.package_slug,
      'is_factory',x.is_factory,
      'version',x.version_no,
      'published_at',x.published_at,
      'variant_count',x.variant_count,
      'is_current',x.release_id=(select s.package_release_id from public.broadcast_match_sessions s where s.match_id=p_match_id)
    ) order by x.published_at desc nulls last,x.package_name)
    from (
      select distinct on(p.id)
        r.id release_id,p.id package_id,p.name package_name,p.slug package_slug,p.is_factory,
        r.version_no,r.published_at,
        (select count(*) from jsonb_object_keys(coalesce(r.manifest->'variants','{}'::jsonb))) variant_count
      from public.broadcast_packages p
      join public.broadcast_package_releases r on r.package_id=p.id
      where p.status='ACTIVE'
        and (p.tournament_id is null or p.tournament_id=v_tournament)
      order by p.id,r.version_no desc
    ) x
  ),'[]'::jsonb);
end
$$;
revoke all on function public.ips_broadcast_available_releases(uuid) from public,anon;
grant execute on function public.ips_broadcast_available_releases(uuid) to authenticated,service_role;

create or replace function public.ips_broadcast_set_match_release(p_match_id uuid,p_release_id uuid)
returns jsonb
language plpgsql security definer
set search_path=public,auth
as $$
declare
  v_release public.broadcast_package_releases;
  v_package public.broadcast_packages;
  v_tournament uuid;
  v_manifest jsonb;
  v_scorebar jsonb;
  v_layers jsonb:='[]'::jsonb;
  v_revision bigint;
begin
  if not public.ips_can_direct_match(p_match_id) then raise exception 'Not allowed to direct this match.'; end if;
  select tournament_id into v_tournament from public.matches where id=p_match_id;
  if v_tournament is null then raise exception 'Match not found.'; end if;

  select * into v_release from public.broadcast_package_releases where id=p_release_id;
  if v_release.id is null then raise exception 'Broadcast release not found.'; end if;
  select * into v_package from public.broadcast_packages where id=v_release.package_id and status='ACTIVE';
  if v_package.id is null then raise exception 'Broadcast package is not active.'; end if;
  if v_package.tournament_id is not null and v_package.tournament_id<>v_tournament then
    raise exception 'This package belongs to a different tournament.';
  end if;

  v_manifest:=v_release.manifest;
  if v_manifest#>'{variants,scorebar.default}' is not null then
    v_scorebar:=jsonb_build_object(
      'instanceId',gen_random_uuid(),'variantKey','scorebar.default',
      'priority',coalesce((v_manifest#>>'{variants,scorebar.default,priority}')::integer,50),
      'replacementGroup',coalesce(v_manifest#>>'{variants,scorebar.default,replacementGroup}','scorebar'),
      'startedAt',now(),'expiresAt',null,'persistent',true,'payload','{}'::jsonb,'source','PACKAGE_SWITCH'
    );
    v_layers:=jsonb_build_array(v_scorebar);
  end if;

  insert into public.broadcast_match_sessions(match_id,package_release_id,updated_by,updated_at)
  values(p_match_id,p_release_id,auth.uid(),now())
  on conflict(match_id) do update
    set package_release_id=excluded.package_release_id,updated_by=auth.uid(),updated_at=now();

  insert into public.broadcast_program_state(match_id,revision,preview,active_layers,queue,persistent_snapshot,updated_by,updated_at)
  values(p_match_id,1,null,v_layers,'[]'::jsonb,v_layers,auth.uid(),now())
  on conflict(match_id) do update
    set revision=public.broadcast_program_state.revision+1,
        preview=null,
        active_layers=v_layers,
        queue='[]'::jsonb,
        persistent_snapshot=v_layers,
        updated_by=auth.uid(),
        updated_at=now()
  returning revision into v_revision;

  insert into public.broadcast_program_events(match_id,revision,event_type,payload,actor_user_id)
  values(p_match_id,v_revision,'PACKAGE_RELEASE_LOADED',
    jsonb_build_object('release_id',v_release.id,'package_id',v_package.id,'package_name',v_package.name,'version',v_release.version_no),
    auth.uid());

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(auth.uid(),'BROADCAST_RELEASE_LOADED','match',p_match_id,
    jsonb_build_object('release_id',v_release.id,'package_id',v_package.id,'package_name',v_package.name,'version',v_release.version_no));

  return public.ips_broadcast_director_snapshot(p_match_id);
end
$$;
revoke all on function public.ips_broadcast_set_match_release(uuid,uuid) from public,anon;
grant execute on function public.ips_broadcast_set_match_release(uuid,uuid) to authenticated,service_role;

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
      'suggestions',coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at desc) from public.broadcast_suggestions s where s.match_id=p_match_id and s.status='AVAILABLE'),'[]'::jsonb),
      'available_releases',public.ips_broadcast_available_releases(p_match_id)
    );
end
$$;
revoke all on function public.ips_broadcast_director_snapshot(uuid) from public,anon;
grant execute on function public.ips_broadcast_director_snapshot(uuid) to authenticated,service_role;

commit;
