-- IPS Project 5.3.1 — allow ADMIN grants scoped to an individual TEAM.

begin;

alter table public.role_grants
  drop constraint if exists role_scope_allowed;

alter table public.role_grants
  add constraint role_scope_allowed check (
    (role='OWNER' and scope_type='GLOBAL')
    or (role='ADMIN' and scope_type in ('GLOBAL','CITY','TEAM','TOURNAMENT'))
    or (role='LEADER' and scope_type in ('CLUB','TEAM'))
    or (role='SCORER' and scope_type='MATCH')
    or (role='PLAYER' and scope_type='PLAYER')
  );

notify pgrst,'reload schema';

commit;
