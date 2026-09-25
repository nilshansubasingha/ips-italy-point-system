'use client';

import {useCallback,useEffect,useMemo,useState,useTransition} from 'react';
import Link from 'next/link';
import {FitSceneCanvas} from '@ips/graphics-react';
import {createClient} from '@/lib/supabase/client';

type Meta={variantVersionId:string;sceneKey:string;variantKey:string;name:string;presentation:string;priority:number;replacementGroup:string|null;conflictBehavior:string;durationMs:number|null;directTake:boolean;automationEligible:boolean;document:any};
type Layer={instanceId:string;variantKey:string;priority:number;replacementGroup:string|null;startedAt:string;expiresAt?:string|null;persistent:boolean;payload?:Record<string,unknown>};
type Suggestion={id:string;suggestion_key:string;variant_key:string;title:string;subtitle:string|null;payload:Record<string,unknown>;created_at:string};
type EventConfig={event_key:string;mode:'MANUAL'|'ASSISTED'|'AUTOMATIC';default_variant_key:string;enabled:boolean};
type ReleaseOption={release_id:string;package_id:string;package_name:string;package_slug:string;is_factory:boolean;version:number;published_at:string;variant_count:number;is_current:boolean};
type Snapshot={match_id:string;session:any;program:{revision:number;preview:any;active_layers:Layer[];queue:any[];persistent_snapshot:Layer[]};release:{id:string;version:number;manifest:{variants:Record<string,Meta>};theme:any};data:any;signal:any;event_config:EventConfig[];suggestions:Suggestion[];available_releases?:ReleaseOption[]};

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
  const [releaseChoice,setReleaseChoice]=useState(initial.release?.id??'');
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
    const releasesTimer=setInterval(()=>void refresh(),3500);
    return()=>{clearInterval(releasesTimer);void supabase.removeChannel(channel);};
  },[supabase,matchId,refresh]);
  useEffect(()=>{if(snap.release?.id)setReleaseChoice(current=>current||snap.release.id);},[snap.release?.id]);
  useEffect(()=>{
    const next={...defaults};
    for(const cfg of snap.event_config??[]){
      const key=cfg.event_key.toLowerCase();
      if(key==='four'||key==='six'||key==='wicket')next[key]=cfg.default_variant_key;
    }
    setDefaults(prev=>{
      const same=Object.keys(next).every(k=>prev[k]===next[k]);
      return same?prev:next;
    });
  },[snap.event_config]);

  const variants=snap.release?.manifest?.variants??{};
  const releases=snap.available_releases??[];
  const currentRelease=releases.find(r=>r.release_id===snap.release?.id)||releases.find(r=>r.is_current)||null;
  const selectedRelease=releases.find(r=>r.release_id===releaseChoice)||currentRelease;
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
  const loadRelease=()=>{
    if(!releaseChoice||releaseChoice===snap.release?.id)return;
    const target=releases.find(r=>r.release_id===releaseChoice);
    if(!target)return;
    const ok=window.confirm('Load '+target.package_name+' release '+target.version+' for this match? Preview, queue and temporary graphics will be cleared so the Program renderer cannot mix package versions.');
    if(!ok)return;
    setError(null);setNotice(null);
    startTransition(async()=>{
      const {data,error}=await supabase.rpc('ips_broadcast_set_match_release',{p_match_id:matchId,p_release_id:releaseChoice});
      if(error){setError(error.message);return;}
      if(data){
        setSnap(data as Snapshot);
        setSelected('six.fullscreen');
        setNotice(target.package_name+' release '+target.version+' loaded. Published graphics are now available in Director.');
      }
    });
  };

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
      setError(null);setNotice(null);
      const {error}=await supabase.rpc('ips_broadcast_set_event_config',{p_match_id:matchId,p_event_key:cfg.event_key,p_mode:mode,p_variant_key:variantKey,p_enabled:cfg.enabled});
      if(error){setError(error.message);return;}
      setDefaults(d=>({...d,[cfg.event_key.toLowerCase()]:variantKey}));
      setNotice(cfg.event_key+' scorer trigger → '+(variants[variantKey]?.presentation?.replace('_',' ')||variantKey));
      await refresh();
    });
  };
  const eventConfigFor=(scene:string)=>(snap.event_config??[]).find(cfg=>cfg.event_key===scene.toUpperCase())??null;
  const presentationVariant=(scene:string,presentation:'FULLSCREEN'|'LOWER_THIRD')=>
    variantList.find(v=>v.meta.sceneKey===scene&&v.meta.presentation===presentation)?.key??null;
  const setScorerPresentation=(scene:string,presentation:'FULLSCREEN'|'LOWER_THIRD')=>{
    const cfg=eventConfigFor(scene);
    const key=presentationVariant(scene,presentation);
    if(!cfg||!key){setError(scene.toUpperCase()+' '+presentation.replace('_',' ')+' variant is not available in the loaded package.');return;}
    setSelected(key);
    setEventConfig(cfg,cfg.mode,key);
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
        <section className="panel package-panel">
          <header><div><span>BROADCAST PACKAGE</span><h2>{currentRelease?.package_name??'Pinned Package'} <i>R{snap.release?.version??'—'}</i></h2></div><b>{currentRelease?.variant_count??Object.keys(variants).length} GRAPHICS</b></header>
          <div className="package-controls">
            <div><label>PUBLISHED PACKAGE / RELEASE</label><select value={releaseChoice} onChange={e=>setReleaseChoice(e.target.value)}>{releases.map(r=><option key={r.release_id} value={r.release_id}>{r.package_name} · Release {r.version}{r.is_current?' · ON AIR PACKAGE':''}</option>)}</select></div>
            <button disabled={pending||!selectedRelease||releaseChoice===snap.release?.id} onClick={loadRelease}>{releaseChoice===snap.release?.id?'CURRENTLY LOADED':'LOAD PUBLISHED RELEASE'}</button>
          </div>
          {selectedRelease&&selectedRelease.release_id!==snap.release?.id&&<p className="package-note">This release contains {selectedRelease.variant_count} published graphics. Loading it makes its Editor-published versions available in this Director and keeps the Program renderer pinned to one stable release.</p>}
        </section>
        <section className="panel quick-panel">
          <header><div><span>QUICK EVENTS</span><h2>One-tap live events</h2></div><button className="clear-temp" onClick={()=>command({type:'CLEAR_TEMPORARY'})}>CLEAR TEMP</button></header>
          <div className="quick-grid">
            {quick.map(scene=>{
              const cfg=eventConfigFor(scene);
              const key=cfg?.default_variant_key??defaults[scene]??scene+'.fullscreen';
              const fs=presentationVariant(scene,'FULLSCREEN');
              const lt=presentationVariant(scene,'LOWER_THIRD');
              const activePresentation=variants[key]?.presentation??'FULLSCREEN';
              return <div className={'quick-cell '+scene} key={scene}>
                <button className="quick-take" disabled={pending||!variants[key]} onClick={()=>take(key)}><strong>{scene.toUpperCase()}</strong><small>TAKE NOW · {activePresentation.replace('_',' ')}</small></button>
                <div className="scorer-route">
                  <span>WHEN SCORER HITS {scene==='four'?'4':scene==='six'?'6':'W'}</span>
                  <div>
                    <button className={activePresentation==='FULLSCREEN'?'active':''} disabled={pending||!fs} onClick={()=>setScorerPresentation(scene,'FULLSCREEN')}>FULL SCREEN</button>
                    <button className={activePresentation==='LOWER_THIRD'?'active':''} disabled={pending||!lt} onClick={()=>setScorerPresentation(scene,'LOWER_THIRD')}>LOWER THIRD</button>
                  </div>
                </div>
                <button className="preview-mini" disabled={!variants[key]} onClick={()=>preview(key)}>PREVIEW {activePresentation.replace('_',' ')}</button>
              </div>;
            })}
          </div>
          <div className="secondary-events">{variantList.filter(v=>!quick.includes(v.meta.sceneKey as any)&&v.meta.directTake).map(v=><button key={v.key} onClick={()=>take(v.key)}>{v.meta.name}</button>)}</div>
        </section>

        <section className="panel library-panel">
          <header><div><span>GRAPHICS LIBRARY</span><h2>Published in loaded release · {currentRelease?.package_name??'Package'} R{snap.release?.version??'—'}</h2></div><input placeholder="Search graphics…" value={search} onChange={e=>setSearch(e.target.value)}/></header>
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
          {(snap.event_config??[]).map(cfg=>{
            const meta=variants[cfg.default_variant_key];
            return <div className="automation-row" key={cfg.event_key}><div><strong>{cfg.event_key}</strong><small>{meta?.presentation?.replace('_',' ')??cfg.default_variant_key}</small></div><select value={cfg.mode} disabled={pending} onChange={e=>setEventConfig(cfg,e.target.value)}><option>MANUAL</option><option>ASSISTED</option><option>AUTOMATIC</option></select></div>;
          })}
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
