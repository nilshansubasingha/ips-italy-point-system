-- IPS Project 7.8 — make broadcast automation variables unambiguous so scoring cannot be blocked.

begin;

create or replace function public.ips_broadcast_on_scoring_event()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  cfg public.broadcast_event_config;
  v_event_key text;
  v_title text;
  after_runs integer;
  before_runs integer;
  v_milestone_key text;
  milestone_cfg public.broadcast_event_config;
  batter_name text;
begin
  if new.event_type<>'DELIVERY' then return new; end if;
  if not exists(
    select 1 from public.broadcast_match_sessions s
    where s.match_id=new.match_id and s.automation_enabled and not s.clean_feed
  ) then return new; end if;

  if new.is_wicket then v_event_key:='WICKET'; v_title:='WICKET AVAILABLE';
  elsif new.runs_off_bat=6 then v_event_key:='SIX'; v_title:='SIX';
  elsif new.runs_off_bat=4 then v_event_key:='FOUR'; v_title:='FOUR';
  else v_event_key:=null;
  end if;

  if v_event_key is not null then
    select c.* into cfg
    from public.broadcast_event_config c
    where c.match_id=new.match_id
      and c.event_key=v_event_key
      and c.enabled;

    if cfg.match_id is not null and cfg.mode<>'MANUAL' then
      if cfg.mode='AUTOMATIC' then
        perform public.ips_broadcast_internal_take(
          new.match_id,cfg.default_variant_key,
          jsonb_build_object('source_event_id',new.id,'sequence_no',new.sequence_no,'event_key',v_event_key),
          'AUTOMATION'
        );
      else
        insert into public.broadcast_suggestions(
          match_id,suggestion_key,variant_key,title,subtitle,payload,source_event_id
        )
        values(
          new.match_id,v_event_key,cfg.default_variant_key,v_title,new.delivery_label,
          jsonb_build_object('source_event_id',new.id,'sequence_no',new.sequence_no,'event_key',v_event_key),
          new.id
        )
        on conflict do nothing;
      end if;
    end if;
  end if;

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
    v_milestone_key:=case
      when before_runs<100 and after_runs>=100 then '100'
      when before_runs<50 and after_runs>=50 then '50'
      else null
    end;

    if v_milestone_key is not null then
      select c.* into milestone_cfg
      from public.broadcast_event_config c
      where c.match_id=new.match_id
        and c.event_key=v_milestone_key
        and c.enabled;

      if milestone_cfg.match_id is not null and milestone_cfg.mode<>'MANUAL' then
        select p.display_name into batter_name
        from public.players p
        where p.id=new.striker_id;

        if milestone_cfg.mode='AUTOMATIC' then
          perform public.ips_broadcast_internal_take(
            new.match_id,milestone_cfg.default_variant_key,
            jsonb_build_object(
              'source_event_id',new.id,'player_id',new.striker_id,
              'player_name',batter_name,'milestone',v_milestone_key,'runs',after_runs
            ),
            'AUTOMATION'
          );
        else
          insert into public.broadcast_suggestions(
            match_id,suggestion_key,variant_key,title,subtitle,payload,source_event_id
          )
          values(
            new.match_id,'BATTER_'||v_milestone_key,milestone_cfg.default_variant_key,
            case when v_milestone_key='100' then 'CENTURY AVAILABLE' else 'FIFTY AVAILABLE' end,
            coalesce(batter_name,'Batter')||' · '||after_runs::text,
            jsonb_build_object(
              'source_event_id',new.id,'player_id',new.striker_id,
              'player_name',batter_name,'milestone',v_milestone_key,'runs',after_runs
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
