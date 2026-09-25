-- IPS Project 7.9 — make scorer WICKET trigger automatic by default.
begin;

create or replace function public.ips_broadcast_seed_event_config()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  insert into public.broadcast_event_config(match_id,event_key,mode,default_variant_key,enabled)
  values
    (new.match_id,'FOUR','AUTOMATIC','four.fullscreen',true),
    (new.match_id,'SIX','AUTOMATIC','six.fullscreen',true),
    (new.match_id,'WICKET','AUTOMATIC','wicket.fullscreen',true),
    (new.match_id,'50','ASSISTED','50.fullscreen',true),
    (new.match_id,'100','ASSISTED','100.fullscreen',true)
  on conflict(match_id,event_key) do nothing;
  return new;
end
$$;

commit;
