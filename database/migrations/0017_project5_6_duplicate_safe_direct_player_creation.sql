-- IPS Project 5.6.3 — duplicate-safe direct player creation/search for Team admins.

begin;

create or replace function public.ips_registry_player_search_v2(p_team_id uuid,p_query text)
returns table(
  id uuid,ips_code text,display_name text,primary_role text,profile_image_url text,
  current_team_id uuid,current_team_name text,current_team_identity_name text,current_city_name text,
  birth_year integer,is_on_target_team boolean,has_account boolean,matched_by text
)
language plpgsql stable security definer
set search_path=public,auth as $$
declare q text; q_phone text; q_email text;
begin
  if not public.ips_can_manage_team(p_team_id) then raise exception 'Not authorised to search players for this Team.'; end if;
  q:=trim(coalesce(p_query,''));
  if length(q)<2 then return; end if;
  q_email:=case when position('@' in q)>0 then lower(q) else null end;
  begin q_phone:=case when q ~ '[0-9]' and (q like '+%' or q like '00%') then public.ips_normalize_phone(q) else null end; exception when others then q_phone:=null; end;

  return query
  select p.id,p.ips_code,p.display_name,p.primary_role,p.profile_image_url,
    cur.team_id,cur.team_name,cur.team_identity_name,cur.city_name,
    extract(year from pi.date_of_birth)::integer,
    exists(select 1 from public.team_memberships x where x.player_id=p.id and x.team_id=p_team_id and x.status='ACTIVE' and x.end_on is null),
    exists(select 1 from public.profiles pr where pr.linked_player_id=p.id),
    case
      when upper(p.ips_code)=upper(q) then 'IPS ID'
      when q_email is not null and exists(select 1 from public.player_contacts pc where pc.player_id=p.id and pc.contact_type='EMAIL' and pc.is_login_identifier and lower(pc.value_normalized)=q_email) then 'Email match'
      when q_phone is not null and exists(select 1 from public.player_contacts pc where pc.player_id=p.id and pc.contact_type='PHONE' and pc.is_login_identifier and pc.value_normalized=q_phone) then 'Phone match'
      when lower(coalesce(pi.full_name,''))=lower(q) then 'Full-name match'
      else 'Name match'
    end
  from public.players p
  left join public.player_private_identities pi on pi.player_id=p.id
  left join lateral(
    select tm.team_id,t.name team_name,c.name team_identity_name,ci.name city_name
    from public.team_memberships tm
    join public.teams t on t.id=tm.team_id
    join public.clubs c on c.id=t.club_id
    join public.cities ci on ci.id=c.city_id
    where tm.player_id=p.id and tm.status='ACTIVE' and tm.end_on is null
    order by tm.is_primary desc,tm.start_on desc limit 1
  ) cur on true
  where p.status='ACTIVE' and (
    upper(p.ips_code)=upper(q)
    or p.display_name ilike '%'||q||'%'
    or coalesce(pi.full_name,'') ilike '%'||q||'%'
    or (q_email is not null and exists(select 1 from public.player_contacts pc where pc.player_id=p.id and pc.contact_type='EMAIL' and pc.is_login_identifier and lower(pc.value_normalized)=q_email))
    or (q_phone is not null and exists(select 1 from public.player_contacts pc where pc.player_id=p.id and pc.contact_type='PHONE' and pc.is_login_identifier and pc.value_normalized=q_phone))
  )
  order by case when upper(p.ips_code)=upper(q) then 0 when lower(p.display_name)=lower(q) then 1 when lower(coalesce(pi.full_name,''))=lower(q) then 2 else 3 end,p.display_name,p.ips_code
  limit 25;
end $$;

create or replace function public.ips_create_player_for_team_v2(
  p_team_id uuid,
  p_full_name text,
  p_display_name text,
  p_date_of_birth date default null,
  p_primary_role text default null,
  p_batting_style text default null,
  p_bowling_style text default null,
  p_shirt_number smallint default null,
  p_email text default null,
  p_phone text default null,
  p_whatsapp_consent boolean default false
)
returns public.players
language plpgsql security definer
set search_path=public,auth as $$
declare
  v_player public.players;
  v_code text;
  v_slug text;
  v_email text;
  v_phone text;
  v_role text;
begin
  if not public.ips_can_manage_team(p_team_id) then raise exception 'Not authorised to add players to this Team.'; end if;
  if coalesce(trim(p_full_name),'')='' then raise exception 'Full name is required.'; end if;
  if coalesce(trim(p_display_name),'')='' then raise exception 'Display name is required.'; end if;
  if p_shirt_number is not null and (p_shirt_number<0 or p_shirt_number>999) then raise exception 'Shirt number must be between 0 and 999.'; end if;

  v_role:=coalesce(nullif(trim(p_primary_role),''),'Player');
  v_email:=nullif(lower(trim(coalesce(p_email,''))),'');
  if v_email is not null and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid email address.'; end if;
  v_phone:=case when nullif(trim(coalesce(p_phone,'')),'') is null then null else public.ips_normalize_phone(p_phone) end;

  if exists(
    select 1 from public.players p
    left join public.player_private_identities pi on pi.player_id=p.id
    where p.status='ACTIVE' and (
      (v_email is not null and exists(select 1 from public.player_contacts pc where pc.player_id=p.id and pc.contact_type='EMAIL' and pc.is_login_identifier and lower(pc.value_normalized)=v_email))
      or (v_phone is not null and exists(select 1 from public.player_contacts pc where pc.player_id=p.id and pc.contact_type='PHONE' and pc.is_login_identifier and pc.value_normalized=v_phone))
      or (p_date_of_birth is not null and pi.date_of_birth=p_date_of_birth and lower(coalesce(pi.full_name,''))=lower(trim(p_full_name)))
    )
  ) then
    raise exception 'A strong existing IPS identity match was found. Search and select the existing player instead of creating a duplicate.';
  end if;

  v_code:=public.ips_next_player_code();
  v_slug:=public.ips_slug_base(p_display_name)||'-'||lower(replace(v_code,'-',''));
  if v_slug='' or v_slug ~ '^-|-$' then v_slug:=lower(replace(v_code,'-','')); end if;

  insert into public.players(ips_code,slug,display_name,primary_role,batting_style,bowling_style,status)
  values(v_code,v_slug,trim(p_display_name),nullif(trim(p_primary_role),''),nullif(trim(p_batting_style),''),nullif(trim(p_bowling_style),''),'ACTIVE')
  returning * into v_player;

  insert into public.player_private_identities(player_id,full_name,date_of_birth)
  values(v_player.id,trim(p_full_name),p_date_of_birth);

  insert into public.team_memberships(player_id,team_id,start_on,shirt_number,status,is_primary,team_role)
  values(v_player.id,p_team_id,current_date,p_shirt_number,'ACTIVE',true,v_role);

  if v_email is not null then
    insert into public.player_contacts(player_id,contact_type,value_original,value_normalized,is_login_identifier,created_by)
    values(v_player.id,'EMAIL',v_email,v_email,true,auth.uid());
  end if;
  if v_phone is not null then
    insert into public.player_contacts(player_id,contact_type,value_original,value_normalized,is_login_identifier,is_whatsapp,notification_consent,consent_at,created_by)
    values(v_player.id,'PHONE',p_phone,v_phone,true,true,p_whatsapp_consent,case when p_whatsapp_consent then now() else null end,auth.uid());
  end if;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(auth.uid(),'PLAYER_CREATED','PLAYER',v_player.id,
    jsonb_build_object('team_id',p_team_id,'ips_code',v_player.ips_code,'team_role',v_role,'source','DIRECT_ROSTER_V2'));

  return v_player;
end $$;

revoke all on function public.ips_registry_player_search_v2(uuid,text) from public,anon;
grant execute on function public.ips_registry_player_search_v2(uuid,text) to authenticated;

revoke all on function public.ips_create_player_for_team_v2(uuid,text,text,date,text,text,text,smallint,text,text,boolean) from public,anon;
grant execute on function public.ips_create_player_for_team_v2(uuid,text,text,date,text,text,text,smallint,text,text,boolean) to authenticated;

-- Prevent the old create RPC from bypassing private identity / DOB duplicate checks.
revoke execute on function public.ips_create_player_for_team(uuid,text,text,text,text,text,text,smallint,text,text,boolean) from authenticated;

notify pgrst,'reload schema';
commit;
