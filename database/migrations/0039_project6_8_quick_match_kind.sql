-- IPS Project 6.8 — distinguish full tournaments from Quick Match containers.
begin;

alter table public.tournaments
  add column if not exists competition_kind text not null default 'TOURNAMENT';

alter table public.tournaments
  drop constraint if exists tournaments_competition_kind_check;

alter table public.tournaments
  add constraint tournaments_competition_kind_check
  check (competition_kind in ('TOURNAMENT','QUICK_MATCH'));

notify pgrst,'reload schema';

commit;
