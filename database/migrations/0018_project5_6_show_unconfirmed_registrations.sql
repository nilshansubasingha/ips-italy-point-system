-- IPS Project 5.6.4 — show new signups to scoped admins immediately, even before email confirmation.
-- Approval functions still refuse to approve an unconfirmed account.

begin;

create or replace function public.ips_registration_queue()
returns jsonb
language plpgsql stable security definer
set search_path=public,auth as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;

  select jsonb_build_object(
    'players',coalesce((
      select jsonb_agg(x order by x->>'created_at')
      from (
        select jsonb_build_object(
          'id',r.id,'status',r.status,'display_name',r.display_name,'full_name',r.full_name,
          'birth_year',extract(year from r.date_of_birth)::integer,
          'city_id',r.city_id,'city_name',ci.name,
          'team_identity_id',r.requested_team_identity_id,
          'team_name',coalesce(c.name,tr.proposed_name),
          'side_id',r.requested_side_id,'side_name',s.name,
          'team_request_id',r.linked_team_request_id,
          'created_at',r.created_at
        ) x
        from public.player_registration_requests r
        join public.cities ci on ci.id=r.city_id
        left join public.clubs c on c.id=r.requested_team_identity_id
        left join public.teams s on s.id=r.requested_side_id
        left join public.team_registration_requests tr on tr.id=r.linked_team_request_id
        where r.status in ('PENDING_EMAIL','PENDING','POSSIBLE_MATCH','CHANGES_REQUESTED','TRANSFER_REQUIRED')
          and public.ips_can_review_player_registration(r.id)
      ) q
    ),'[]'::jsonb),
    'teams',coalesce((
      select jsonb_agg(x order by x->>'created_at')
      from (
        select jsonb_build_object(
          'id',r.id,'status',r.status,'name',r.proposed_name,'structure',r.proposed_structure,
          'city_id',r.city_id,'city_name',ci.name,
          'member_count',(select count(*) from public.team_request_members m where m.team_request_id=r.id),
          'created_at',r.created_at
        ) x
        from public.team_registration_requests r
        join public.cities ci on ci.id=r.city_id
        where r.status in ('PENDING_EMAIL','PENDING','CHANGES_REQUESTED')
          and public.ips_can_review_team_registration(r.id)
      ) q
    ),'[]'::jsonb),
    'transfers',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',tr.id,'status',tr.status,'player_id',tr.player_id,'player_name',p.display_name,'ips_code',p.ips_code,
        'from_team_id',tr.from_team_identity_id,'from_team_name',fc.name,
        'to_team_id',tr.to_team_identity_id,'to_team_name',tc.name,
        'to_side_id',tr.to_side_id,'to_side_name',ts.name,'created_at',tr.created_at
      ) order by tr.created_at)
      from public.player_transfer_requests tr
      join public.players p on p.id=tr.player_id
      join public.clubs fc on fc.id=tr.from_team_identity_id
      join public.clubs tc on tc.id=tr.to_team_identity_id
      join public.teams ts on ts.id=tr.to_side_id
      where tr.status in ('REQUESTED','RELEASED')
        and (
          public.ips_is_owner() or public.ips_has_role('ADMIN','GLOBAL',null)
          or public.ips_has_role('ADMIN','CLUB',tr.from_team_identity_id)
          or public.ips_has_role('LEADER','CLUB',tr.from_team_identity_id)
          or public.ips_has_role('ADMIN','CLUB',tr.to_team_identity_id)
          or public.ips_has_role('LEADER','CLUB',tr.to_team_identity_id)
          or exists(select 1 from public.clubs c where c.id in (tr.from_team_identity_id,tr.to_team_identity_id) and public.ips_has_role('ADMIN','CITY',c.city_id))
        )
    ),'[]'::jsonb)
  ) into result;

  return result;
end $$;

create or replace function public.ips_registration_queue_counts()
returns jsonb
language sql stable security definer
set search_path=public,auth as $$
  select jsonb_build_object(
    'players',(select count(*) from public.player_registration_requests r where r.status in ('PENDING_EMAIL','PENDING','POSSIBLE_MATCH','CHANGES_REQUESTED','TRANSFER_REQUIRED') and public.ips_can_review_player_registration(r.id)),
    'teams',(select count(*) from public.team_registration_requests r where r.status in ('PENDING_EMAIL','PENDING','CHANGES_REQUESTED') and public.ips_can_review_team_registration(r.id)),
    'transfers',(select count(*) from public.player_transfer_requests tr where tr.status in ('REQUESTED','RELEASED') and (
      public.ips_is_owner() or public.ips_has_role('ADMIN','GLOBAL',null)
      or public.ips_has_role('ADMIN','CLUB',tr.from_team_identity_id)
      or public.ips_has_role('LEADER','CLUB',tr.from_team_identity_id)
      or public.ips_has_role('ADMIN','CLUB',tr.to_team_identity_id)
      or public.ips_has_role('LEADER','CLUB',tr.to_team_identity_id)
      or exists(select 1 from public.clubs c where c.id in (tr.from_team_identity_id,tr.to_team_identity_id) and public.ips_has_role('ADMIN','CITY',c.city_id))
    ))
  );
$$;

notify pgrst,'reload schema';
commit;
