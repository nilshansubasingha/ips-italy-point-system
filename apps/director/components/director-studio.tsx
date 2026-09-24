'use client';

import {useCallback,useEffect,useMemo,useState,useTransition} from 'react';
import Link from 'next/link';
import {FitSceneCanvas} from '@ips/graphics-react';
import {createClient} from '@/lib/supabase/client';

type Meta={variantVersionId:string;sceneKey:string;variantKey:string;name:string;presentation:string;priority:number;replacementGroup:string|null;conflictBehavior:string;durationMs:number|null;directTake:boolean;automationEligible:boolean;document:any};
type Layer={instanceId:string;variantKey:string;priority:number;replacementGroup:string|null;startedAt:string;expiresAt?:string|null;persistent:boolean;payload?:Record<string,unknown>};
type Suggestion={id:string;suggestion_key:string;variant_key:string;title:string;subtitle:string|null;payload:Record<string,unknown>;created_at:string};
type EventConfig={event_key:string;mode:'MANUAL'|'ASSISTED'|'AUTOMATIC';default_variant_key:string;enabled:boolean};
type Snapshot={match_id:string;session:any;program:{revision:number;preview:any;active_layers:Layer[];queue:any[];persistent_snapshot:Layer[]};release:{id:string;version:number;manifest:{variants:Record<string,Meta>};theme:any};data:any;signal:any;event_config:EventConfig[];suggestions:Suggestion[]};

const OVERLAY_URL=process.env.NEXT_PUBLIC_IPS_OVERLAY_URL??'http://localhost:3002';

function age(ts:string){const sec=Math.max(0,Math.round((Date.now()-Date.parse(ts))/1000));return sec<60?sec+'s':Math.floor(sec/60)+'m';}
function sceneLabel(key:string){return key.replaceAll('_',' ').replaceAll('-',' ').replace(/w/g,c=>c.toUpperCase());}

export function DirectorStudio({matchId,initial}:{matchId:string;initial:Snapshot}){
  const [snap,setSnap]=useState<Snapshot>(initial);
  const [selected,setSelected]=useState<string>('six.fullscreen');
  const [defaults,setDefaults]=useState<Record<string,string>>({four:'four.fullscreen',six:'six.fullscreen',wicket:'wicket.fullscreen'});
  const [notice,setNotice]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [search,setSearch]=useState('');
  const [pending,startTransition]=useTransition();
  const supabase=useMemo(()=>createClient(),[]);

  const refresh=useCallback(async()=>{
    const {data,error}=await supabase.rpc('ips_broadcast_director_snapshot',{p_match_id:matchId});
    if(error){setError(error.message);return;} if(data)setSnap(data as Snapshot);
  },[supabase,matchId]);

  useEffect(()=>{
    const channel=supabase.channel('director-'+matchId)
      .on('postgres_changes',{event:'*',schema:'public',table:'broadcast_realtime_signals',filter:'match_id=eq.'+matchId},()=>void refresh())
      .subscribe();
    return()=>{void supabase.removeChannel(channel);};
  },[supabase,matchId,refresh]);

  const variants=snap.release?.manifest?.variants??{};
  const variantList=useMemo(()=>Object.entries(variants).map(([key,meta])=>({key,meta})),[variants]);
  const selectedMeta=variants[selected]??null;
  const active=snap.program?.active_layers??[];
  const queue=snap.program?.queue??[];
  const match=snap.data?.match??{};
  const innings=snap.data?.innings??{};

  const command=(payload:Record<string,unknown>)=>{
    setNotice(null);setError(null);
    startTransition(async()=>{
      const {data,error}=await supabase.rpc('ips_broadcast_program_command',{p_match_id:matchId,p_command:payload});
      if(error){setError(error.message);return;}
      if(data)setSnap((prev)=>({...prev,...data,event_config:prev.event_config,suggestions:prev.suggestions}) as Snapshot);
      await refresh();
    });
  };
  const take=(key:string,persistent=false)=>command({type:'TAKE',variantKey:key,persistent,payload:{}});
  const preview=(key:string)=>{setSelected(key);command({type:'PREVIEW',variantKey:key,payload:{}});};
  const queueAdd=(key:string)=>command({type:'QUEUE_ADD',variantKey:key,payload:{}});
  const queueRemove=(id:string)=>command({type:'QUEUE_REMOVE',queueId:id});

  const suggestion=(id:string,action:'take'|'dismiss')=>{
    setError(null);
    startTransition(async()=>{
      const rpc=action==='take'?'ips_broadcast_take_suggestion':'ips_broadcast_dismiss_suggestion';
      const {data,error}=await supabase.rpc(rpc,{p_suggestion_id:id});
      if(error){setError(error.message);return;} if(data)setSnap(data as Snapshot);
    });
  };
  const setEventConfig=(cfg:EventConfig,mode:string,variantKey=cfg.default_variant_key)=>{
    startTransition(async()=>{
      const {error}=await supabase.rpc('ips_broadcast_set_event_config',{p_match_id:matchId,p_event_key:cfg.event_key,p_mode:mode,p_variant_key:variantKey,p_enabled:cfg.enabled});
      if(error){setError(error.message);return;}await refresh();
    });
  };

  const quick=['four','six','wicket'] as const;
  const searchable=variantList.filter(v=>(v.meta.name+' '+v.meta.sceneKey+' '+v.meta.presentation).toLowerCase().includes(search.toLowerCase()));

  return <main className="studio-shell">
    <header className="studio-top">
      <div className="director-wordmark"><b>IPS</b><span>PRISM DIRECTOR</span></div>
      <div className="match-ident"><span>{match.tournament?.name||'IPS'}</span><strong>{match.home_team?.short_name||match.home_team?.name} <i>v</i> {match.away_team?.short_name||match.away_team?.name}</strong><small>{match.code} · {match.status}</small></div>
      <div className="top-status"><span className="live-dot"/>PROGRAM CONNECTED <b>R{snap.program?.revision??0}</b></div>
      <Link href="/">← MATCHES</Link>
    </header>

    {(notice||error)&&<div className={'director-toast '+(error?'error':'')}>{error??notice}</div>}

    <section className="monitor-grid">
      <div className="monitor">
        <header><span>PREVIEW</span><div>{selectedMeta?.name??'Select a graphic'}</div></header>
        <div className="monitor-screen">{selectedMeta?<FitSceneCanvas document={selectedMeta.document} data={snap.data}/>:<div className="monitor-empty">Prepare a graphic from the trigger panel.</div>}</div>
        <footer><button disabled={!selectedMeta||pending} onClick={()=>selectedMeta&&take(selected)}>TAKE → PROGRAM</button><button disabled={!selectedMeta||pending} onClick={()=>selectedMeta&&queueAdd(selected)}>ADD TO UP NEXT</button></footer>
      </div>
      <div className="monitor program">
        <header><span>PROGRAM</span><div><i className="on-air-dot"/> ON AIR</div></header>
        <div className="monitor-screen"><iframe title="IPS PRISM Program" src={OVERLAY_URL+'/?match='+matchId}/></div>
        <footer><span>{active.length} active layer{active.length===1?'':'s'}</span><a target="_blank" rel="noreferrer" href={OVERLAY_URL+'/?match='+matchId}>OPEN CLEAN OUTPUT ↗</a></footer>
      </div>
    </section>

    <section className="workspace">
      <div className="trigger-column">
        <section className="panel quick-panel">
          <header><div><span>QUICK EVENTS</span><h2>One-tap live events</h2></div><button className="clear-temp" onClick={()=>command({type:'CLEAR_TEMPORARY'})}>CLEAR TEMP</button></header>
          <div className="quick-grid">
            {quick.map(scene=>{
              const key=defaults[scene]??scene+'.fullscreen';
              const options=variantList.filter(v=>v.meta.sceneKey===scene);
              return <div className={'quick-cell '+scene} key={scene}>
                <button className="quick-take" disabled={pending||!variants[key]} onClick={()=>take(key)}><strong>{scene.toUpperCase()}</strong><small>{variants[key]?.presentation?.replace('_',' ')||'UNAVAILABLE'}</small></button>
                <select value={key} onChange={e=>{setDefaults(d=>({...d,[scene]:e.target.value}));setSelected(e.target.value);}}>{options.map(o=><option value={o.key} key={o.key}>{o.meta.presentation.replace('_',' ')}</option>)}</select>
                <button className="preview-mini" disabled={!variants[key]} onClick={()=>preview(key)}>PREVIEW</button>
              </div>;
            })}
          </div>
          <div className="secondary-events">{variantList.filter(v=>!quick.includes(v.meta.sceneKey as any)&&v.meta.directTake).map(v=><button key={v.key} onClick={()=>take(v.key)}>{v.meta.name}</button>)}</div>
        </section>

        <section className="panel library-panel">
          <header><div><span>GRAPHICS LIBRARY</span><h2>Published in this match release</h2></div><input placeholder="Search graphics…" value={search} onChange={e=>setSearch(e.target.value)}/></header>
          <div className="library-grid">{searchable.map(v=><article className={selected===v.key?'selected':''} key={v.key} onClick={()=>setSelected(v.key)}><div><span>{sceneLabel(v.meta.sceneKey)}</span><b>{v.meta.name}</b><small>{v.meta.presentation.replace('_',' ')} · P{v.meta.priority}</small></div><div className="card-actions"><button onClick={e=>{e.stopPropagation();preview(v.key)}}>PREVIEW</button><button onClick={e=>{e.stopPropagation();take(v.key)}}>TAKE</button><button onClick={e=>{e.stopPropagation();queueAdd(v.key)}}>+ QUEUE</button></div></article>)}</div>
        </section>
      </div>

      <aside className="operation-column">
        <section className="panel situation-panel">
          <header><span>MATCH NOW</span><h2>{innings.score_display??'—'} <i>{innings.overs??'0.0'} ov</i></h2></header>
          <div className="situation-data"><span>STRIKER <b>{snap.data?.current?.striker?.name??'—'}</b></span><span>BOWLER <b>{snap.data?.current?.bowler?.name??'—'}</b></span>{innings.runs_required!=null&&<span>CHASE <b>Need {innings.runs_required} from {innings.balls_remaining}</b></span>}</div>
        </section>

        <section className="panel suggestions-panel">
          <header><span>SMART SUGGESTIONS</span><b>{snap.suggestions?.length??0}</b></header>
          <div>{snap.suggestions?.length?snap.suggestions.map(s=><article key={s.id}><div><strong>{s.title}</strong><span>{s.subtitle||sceneLabel(s.suggestion_key)} · {age(s.created_at)}</span></div><div><button onClick={()=>preview(s.variant_key)}>PREVIEW</button><button className="take" onClick={()=>suggestion(s.id,'take')}>TAKE</button><button onClick={()=>suggestion(s.id,'dismiss')}>×</button></div></article>):<p className="empty-inline">No assisted graphics waiting.</p>}</div>
        </section>

        <section className="panel onair-panel">
          <header><span>ON AIR</span><b>{active.length}</b></header>
          <div>{active.map(l=><article key={l.instanceId}><i className={l.persistent?'persistent':'temporary'}/><div><strong>{variants[l.variantKey]?.name??l.variantKey}</strong><span>P{l.priority} · {l.persistent?'PERSISTENT':'TEMPORARY'}</span></div></article>)}</div>
        </section>

        <section className="panel queue-panel">
          <header><span>UP NEXT</span><b>{queue.length}</b></header>
          <div>{queue.length?queue.map((q:any,index:number)=><article key={q.queueId}><em>{String(index+1).padStart(2,'0')}</em><div><strong>{variants[q.variantKey]?.name??q.variantKey}</strong><span>{q.variantKey}</span></div><button onClick={()=>queueRemove(q.queueId)}>×</button></article>):<p className="empty-inline">Queue is empty.</p>}</div>
        </section>

        <section className="panel automation-panel">
          <header><span>EVENT AUTOMATION</span><b>{snap.session?.automation_enabled?'ENABLED':'DISABLED'}</b></header>
          {(snap.event_config??[]).map(cfg=><div className="automation-row" key={cfg.event_key}><strong>{cfg.event_key}</strong><select value={cfg.mode} disabled={pending} onChange={e=>setEventConfig(cfg,e.target.value)}><option>MANUAL</option><option>ASSISTED</option><option>AUTOMATIC</option></select></div>)}
          <button className="automation-master" onClick={()=>command({type:'SET_AUTOMATION',enabled:!snap.session?.automation_enabled})}>{snap.session?.automation_enabled?'DISABLE ALL AUTOMATION':'ENABLE AUTOMATION'}</button>
        </section>

        <section className="panel safety-panel">
          <header><span>OPERATOR SAFETY</span></header>
          <div className="safety-grid"><button onClick={()=>command({type:'CLEAR_TEMPORARY'})}>CLEAR TEMPORARY</button><button onClick={()=>command({type:'RESTORE_PERSISTENT'})}>RESTORE PERSISTENT</button><button onClick={()=>command({type:'SET_SCOREBAR_LOCK',enabled:!snap.session?.scorebar_locked})} className={snap.session?.scorebar_locked?'active':''}>{snap.session?.scorebar_locked?'SCOREBAR LOCKED':'LOCK SCOREBAR'}</button><button onClick={()=>command({type:'EMERGENCY_SPONSOR_OFF',enabled:!snap.session?.emergency_sponsor_off})} className={snap.session?.emergency_sponsor_off?'danger active':''}>SPONSOR OFF</button><button className="danger" onClick={()=>command({type:'CLEAR_ALL'})}>CLEAR ALL</button><button className={'panic '+(snap.session?.clean_feed?'active':'')} onClick={()=>command({type:snap.session?.clean_feed?'PANIC_OFF':'PANIC_ON'})}>{snap.session?.clean_feed?'RESTORE PROGRAM':'PANIC / CLEAN FEED'}</button></div>
        </section>
      </aside>
    </section>
  </main>;
}
