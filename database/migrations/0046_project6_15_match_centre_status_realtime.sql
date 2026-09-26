-- IPS Project 6.15 — publish match status changes to Supabase Realtime.
begin;

alter publication supabase_realtime add table public.matches;

commit;
