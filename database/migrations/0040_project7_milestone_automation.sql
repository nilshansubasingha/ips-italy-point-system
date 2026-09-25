-- IPS Project 7.3 — deterministic batter milestone suggestions.

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
    (new.match_id,'WICKET','ASSISTED','wicket.fullscreen',true),
    (new.match_id,'50','ASSISTED','50.fullscreen',true),
    (new.match_id,'100','ASSISTED','100.fullscreen',true)
  on conflict(match_id,event_key) do nothing;
  return new;
end
$$;

drop trigger if exists broadcast_seed_event_config on public.broadcast_match_sessions;
create trigger broadcast_seed_event_config
after insert on public.broadcast_match_sessions
for each row execute function public.ips_broadcast_seed_event_config();

insert into public.broadcast_event_config(match_id,event_key,mode,default_variant_key,enabled)
select s.match_id,c.event_key,c.mode,c.variant_key,true
from public.broadcast_match_sessions s
cross join (values
 ('FOUR','AUTOMATIC','four.fullscreen'),
 ('SIX','AUTOMATIC','six.fullscreen'),
 ('WICKET','ASSISTED','wicket.fullscreen'),
 ('50','ASSISTED','50.fullscreen'),
 ('100','ASSISTED','100.fullscreen')
) c(event_key,mode,variant_key)
on conflict(match_id,event_key) do nothing;

create or replace function public.ips_broadcast_on_scoring_event()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  cfg public.broadcast_event_config;
  event_key text;
  title text;
  after_runs integer;
  before_runs integer;
  milestone_key text;
  milestone_cfg public.broadcast_event_config;
  batter_name text;
begin
  if new.event_type<>'DELIVERY' then return new; end if;
  if not exists(
    select 1 from public.broadcast_match_sessions s
    where s.match_id=new.match_id and s.automation_enabled and not s.clean_feed
  ) then return new; end if;

  -- Delivery event graphic.
  if new.is_wicket then event_key:='WICKET'; title:='WICKET AVAILABLE';
  elsif new.runs_off_bat=6 then event_key:='SIX'; title:='SIX';
  elsif new.runs_off_bat=4 then event_key:='FOUR'; title:='FOUR';
  else event_key:=null;
  end if;

  if event_key is not null then
    select * into cfg
    from public.broadcast_event_config c
    where c.match_id=new.match_id and c.event_key=event_key and c.enabled;

    if cfg.match_id is not null and cfg.mode<>'MANUAL' then
      if cfg.mode='AUTOMATIC' then
        perform public.ips_broadcast_internal_take(
          new.match_id,cfg.default_variant_key,
          jsonb_build_object('source_event_id',new.id,'sequence_no',new.sequence_no,'event_key',event_key),
          'AUTOMATION'
        );
      else
        insert into public.broadcast_suggestions(
          match_id,suggestion_key,variant_key,title,subtitle,payload,source_event_id
        )
        values(
          new.match_id,event_key,cfg.default_variant_key,title,new.delivery_label,
          jsonb_build_object('source_event_id',new.id,'sequence_no',new.sequence_no,'event_key',event_key),
          new.id
        )
        on conflict do nothing;
      end if;
    end if;
  end if;

  -- Batter milestones. Count only active deliveries in the same innings.
  if new.striker_id is not null and new.runs_off_bat>0 then
    select coalesce(sum(e.runs_off_bat),0)::integer into after_runs
    from public.match_scoring_events e
    where e.innings_id=new.innings_id
      and e.event_type='DELIVERY'
      and e.striker_id=new.striker_id
      and not exists(
        select 1 from public.match_scoring_events r
        where r.event_type='REVERSAL' and r.reverses_event_id=e.id
      );

    before_runs:=greatest(after_runs-new.runs_off_bat,0);
    milestone_key:=case
      when before_runs<100 and after_runs>=100 then '100'
      when before_runs<50 and after_runs>=50 then '50'
      else null
    end;

    if milestone_key is not null then
      select * into milestone_cfg
      from public.broadcast_event_config c
      where c.match_id=new.match_id and c.event_key=milestone_key and c.enabled;

      if milestone_cfg.match_id is not null and milestone_cfg.mode<>'MANUAL' then
        select display_name into batter_name from public.players where id=new.striker_id;

        if milestone_cfg.mode='AUTOMATIC' then
          perform public.ips_broadcast_internal_take(
            new.match_id,milestone_cfg.default_variant_key,
            jsonb_build_object(
              'source_event_id',new.id,'player_id',new.striker_id,
              'player_name',batter_name,'milestone',milestone_key,'runs',after_runs
            ),
            'AUTOMATION'
          );
        else
          insert into public.broadcast_suggestions(
            match_id,suggestion_key,variant_key,title,subtitle,payload,source_event_id
          )
          values(
            new.match_id,'BATTER_'||milestone_key,milestone_cfg.default_variant_key,
            case when milestone_key='100' then 'CENTURY AVAILABLE' else 'FIFTY AVAILABLE' end,
            coalesce(batter_name,'Batter')||' · '||after_runs::text,
            jsonb_build_object(
              'source_event_id',new.id,'player_id',new.striker_id,
              'player_name',batter_name,'milestone',milestone_key,'runs',after_runs
            ),
            new.id
          )
          on conflict do nothing;
        end if;
      end if;
    end if;
  end if;

  return new;
end
$$;

commit;
