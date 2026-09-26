-- IPS Project 6.11 — remove legacy overload that made PostgREST RPC resolution ambiguous.
begin;

drop function if exists public.ips_override_match_format(
  uuid,smallint,smallint,smallint,smallint,smallint,text
);

notify pgrst,'reload schema';

commit;
