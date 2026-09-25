-- Keep a public tournament/match visible when an IPS match is actually live.

begin;

create or replace function public.ips_sync_tournament_live_status()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.status='LIVE' then
    update public.tournaments
      set status='LIVE',updated_at=now()
    where id=new.tournament_id
      and status in ('DRAFT','REGISTRATION_OPEN','READY');
  end if;
  return new;
end
$$;

drop trigger if exists match_sync_tournament_live_status on public.matches;
create trigger match_sync_tournament_live_status
after insert or update of status on public.matches
for each row execute function public.ips_sync_tournament_live_status();

update public.tournaments
set status='LIVE',updated_at=now()
where id='d8ec596e-0e52-40cc-b620-a6fd70f72c04'::uuid
  and exists(
    select 1 from public.matches m
    where m.tournament_id=public.tournaments.id and m.status='LIVE'
  );

commit;
