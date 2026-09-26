-- IPS Project 6.20 — bulk player registration / team roster entry.
begin;

create or replace function public.ips_bulk_add_team_request_members(
  p_team_request_id uuid,
  p_members jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_item jsonb;
  v_id uuid;
  v_created integer:=0;
  v_failed jsonb:='[]'::jsonb;
  v_name text;
  v_index integer:=0;
begin
  if jsonb_typeof(p_members)<>'array' then raise exception 'Members must be an array.'; end if;
  if jsonb_array_length(p_members)=0 then raise exception 'Add at least one player.'; end if;
  if jsonb_array_length(p_members)>50 then raise exception 'A maximum of 50 players can be added at once.'; end if;

  for v_item in select value from jsonb_array_elements(p_members)
  loop
    v_index:=v_index+1;
    v_name:=trim(coalesce(v_item->>'full_name',''));

    if v_name='' then
      continue;
    end if;

    begin
      v_id:=public.ips_add_team_request_member(
        p_team_request_id,
        v_name,
        nullif(trim(coalesce(v_item->>'display_name','')),''),
        nullif(v_item->>'date_of_birth','')::date,
        nullif(trim(coalesce(v_item->>'email','')),''),
        nullif(trim(coalesce(v_item->>'phone','')),''),
        coalesce(nullif(trim(coalesce(v_item->>'side_label','')),''),'MAIN'),
        nullif(trim(coalesce(v_item->>'primary_role','')),'')
      );
      v_created:=v_created+1;
    exception when others then
      v_failed:=v_failed||jsonb_build_array(jsonb_build_object(
        'row',v_index,'full_name',v_name,'error',sqlerrm
      ));
    end;
  end loop;

  return jsonb_build_object(
    'created',v_created,
    'failed',v_failed,
    'failed_count',jsonb_array_length(v_failed)
  );
end
$$;

revoke all on function public.ips_bulk_add_team_request_members(uuid,jsonb) from public;
grant execute on function public.ips_bulk_add_team_request_members(uuid,jsonb) to authenticated;

create or replace function public.ips_bulk_create_players_for_team(
  p_team_id uuid,
  p_players jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_item jsonb;
  v_player public.players;
  v_created integer:=0;
  v_failed jsonb:='[]'::jsonb;
  v_created_players jsonb:='[]'::jsonb;
  v_name text;
  v_display text;
  v_index integer:=0;
  v_shirt smallint;
begin
  if jsonb_typeof(p_players)<>'array' then raise exception 'Players must be an array.'; end if;
  if jsonb_array_length(p_players)=0 then raise exception 'Add at least one player.'; end if;
  if jsonb_array_length(p_players)>50 then raise exception 'A maximum of 50 players can be created at once.'; end if;

  for v_item in select value from jsonb_array_elements(p_players)
  loop
    v_index:=v_index+1;
    v_name:=trim(coalesce(v_item->>'full_name',''));
    v_display:=trim(coalesce(v_item->>'display_name',''));

    if v_name='' and v_display='' then
      continue;
    end if;
    if v_display='' then v_display:=v_name; end if;

    begin
      v_shirt:=case when nullif(v_item->>'shirt_number','') is null then null else (v_item->>'shirt_number')::smallint end;

      select * into v_player
      from public.ips_create_player_for_team_v2(
        p_team_id,
        v_name,
        v_display,
        nullif(v_item->>'date_of_birth','')::date,
        nullif(trim(coalesce(v_item->>'primary_role','')),''),
        nullif(trim(coalesce(v_item->>'batting_style','')),''),
        nullif(trim(coalesce(v_item->>'bowling_style','')),''),
        v_shirt,
        nullif(trim(coalesce(v_item->>'email','')),''),
        nullif(trim(coalesce(v_item->>'phone','')),''),
        coalesce((v_item->>'whatsapp_consent')::boolean,false)
      );

      v_created:=v_created+1;
      v_created_players:=v_created_players||jsonb_build_array(jsonb_build_object(
        'id',v_player.id,'display_name',v_player.display_name,'ips_code',v_player.ips_code
      ));
    exception when others then
      v_failed:=v_failed||jsonb_build_array(jsonb_build_object(
        'row',v_index,'full_name',coalesce(nullif(v_name,''),v_display),'error',sqlerrm
      ));
    end;
  end loop;

  return jsonb_build_object(
    'created',v_created,
    'players',v_created_players,
    'failed',v_failed,
    'failed_count',jsonb_array_length(v_failed)
  );
end
$$;

revoke all on function public.ips_bulk_create_players_for_team(uuid,jsonb) from public;
grant execute on function public.ips_bulk_create_players_for_team(uuid,jsonb) to authenticated;

create or replace function public.ips_bulk_request_existing_players_for_team(
  p_team_id uuid,
  p_players jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_item jsonb;
  v_result jsonb;
  v_requested integer:=0;
  v_failed jsonb:='[]'::jsonb;
  v_index integer:=0;
  v_player_id uuid;
  v_shirt smallint;
begin
  if jsonb_typeof(p_players)<>'array' then raise exception 'Players must be an array.'; end if;
  if jsonb_array_length(p_players)=0 then raise exception 'Select at least one player.'; end if;
  if jsonb_array_length(p_players)>50 then raise exception 'A maximum of 50 player requests can be sent at once.'; end if;

  for v_item in select value from jsonb_array_elements(p_players)
  loop
    v_index:=v_index+1;
    begin
      v_player_id:=(v_item->>'player_id')::uuid;
      v_shirt:=case when nullif(v_item->>'shirt_number','') is null then null else (v_item->>'shirt_number')::smallint end;
      v_result:=public.ips_request_existing_player_for_team(p_team_id,v_player_id,v_shirt);
      v_requested:=v_requested+1;
    exception when others then
      v_failed:=v_failed||jsonb_build_array(jsonb_build_object(
        'row',v_index,'player_id',v_item->>'player_id','error',sqlerrm
      ));
    end;
  end loop;

  return jsonb_build_object(
    'requested',v_requested,
    'failed',v_failed,
    'failed_count',jsonb_array_length(v_failed)
  );
end
$$;

revoke all on function public.ips_bulk_request_existing_players_for_team(uuid,jsonb) from public;
grant execute on function public.ips_bulk_request_existing_players_for_team(uuid,jsonb) to authenticated;

notify pgrst,'reload schema';

commit;
