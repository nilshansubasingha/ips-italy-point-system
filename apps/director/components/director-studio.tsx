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
type Sponsor={id:string;name:string;logo_url:string|null;message:string|null;metadata:any};
type Snapshot={match_id:string;session:any;program:{revision:number;preview:any;active_layers:Layer[];queue:any[];persistent_snapshot:Layer[]};release:{id:string;version:number;manifest:{variants:Record<string,Meta>};theme:any};data:any;signal:any;event_config:EventConfig[];suggestions:Suggestion[];available_releases?:ReleaseOption[]};

const OVERLAY_URL=process.env.NEXT_PUBLIC_IPS_OVERLAY_URL??'http://localhost:3002';

function age(ts:string){const sec=Math.max(0,Math.round((Date.now()-Date.parse(ts))/1000));return sec<60?sec+'s':Math.floor(sec/60)+'m';}
function sceneLabel(key:string){return key.replaceAll('_',' ').replaceAll('-',' ').replace(/\b\w/g,c=>c.toUpperCase());}
function graphicLabel(name:string){return name.replace(/^PRISM\s+/i,'');}

export function DirectorStudio({matchId,initial}:{matchId:string;initial:Snapshot}){
  const [snap,setSnap]=useState<Snapshot>(initial);
  const [selected,setSelected]=useState<string>('six.fullscreen');
  const [view,setView]=useState<'live'|'graphics'|'automation'|'sponsors'>('live');
  const [defaults,setDefaults]=useState<Record<string,string>>({four:'four.fullscreen',six:'six.fullscreen',wicket:'wicket.fullscreen'});
  const [notice,setNotice]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [search,setSearch]=useState('');
  const [releaseChoice,setReleaseChoice]=useState(initial.release?.id??'');
  const [showBatterPhotos,setShowBatterPhotos]=useState(false);
  const [sponsors,setSponsors]=useState<Sponsor[]>([]);
  const [sponsorId,setSponsorId]=useState('');
  const [sponsorEnabled,setSponsorEnabled]=useState(false);
  const [sponsorPlacement,setSponsorPlacement]=useState<'auto'|'lower-third'|'scorebar'|'top-right'|'bottom-right'|'fullscreen'>('auto');
  const [pending,startTransition]=useTransition();
  const supabase=useMemo(()=>createClient(),[]);

  const refresh=useCallback(async()=>{
    const {data,error}=await supabase.rpc('ips_broadcast_director_snapshot',{p_match_id:matchId});
    if(error){setError(error.message);return;}
    if(data)setSnap(data as Snapshot);
  },[supabase,matchId]);

  useEffect(()=>{
    const channel=supabase.channel('director-'+matchId)
      .on('postgres_changes',{event:'*',schema:'public',table:'broadcast_realtime_signals',filter:'match_id=eq.'+matchId},()=>void refresh())
      .subscribe();
    const timer=setInterval(()=>void refresh(),3500);
    return()=>{clearInterval(timer);void supabase.removeChannel(channel);};
  },[supabase,matchId,refresh]);

  useEffect(()=>{if(snap.release?.id)setReleaseChoice(current=>current||snap.release.id);},[snap.release?.id]);

  useEffect(()=>{
    const next={...defaults};
    for(const cfg of snap.event_config??[]){
      const key=cfg.event_key.toLowerCase();
      if(key==='four'||key==='six'||key==='wicket')next[key]=cfg.default_variant_key;
    }
    setDefaults(prev=>Object.keys(next).every(k=>prev[k]===next[k])?prev:next);
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
  const selectedSponsor=useMemo(()=>sponsors.find(s=>s.id===sponsorId)??null,[sponsors,sponsorId]);

  useEffect(()=>{
    const tournamentId=match.tournament?.id||match.tournament_id;
    if(!tournamentId){setSponsors([]);setSponsorId('');return;}
    let alive=true;
    void supabase.from('broadcast_sponsors').select('id,name,logo_url,message,metadata').eq('tournament_id',tournamentId).eq('status','ACTIVE').order('name').then(({data})=>{
      if(!alive)return;
      const list=(data??[]) as Sponsor[];
      setSponsors(list);
      setSponsorId(current=>current&&list.some(x=>x.id===current)?current:(list[0]?.id??''));
    });
    return()=>{alive=false;};
  },[supabase,match.tournament?.id,match.tournament_id]);

  const sponsorPayload=(placement=sponsorPlacement)=>selectedSponsor&&sponsorEnabled?{
    sponsor:{id:selectedSponsor.id,name:selectedSponsor.name,logo_url:selectedSponsor.logo_url,message:selectedSponsor.message||'SPONSORED BY',placement}
  }:{};
  const payloadFor=(extra:Record<string,unknown>={},placement=sponsorPlacement)=>({...extra,...sponsorPayload(placement)});

  const command=(payload:Record<string,unknown>)=>{
    setNotice(null);setError(null);
    startTransition(async()=>{
      const {data,error}=await supabase.rpc('ips_broadcast_program_command',{p_match_id:matchId,p_command:payload});
      if(error){setError(error.message);return;}
      if(data)setSnap(prev=>({...prev,...data,event_config:prev.event_config,suggestions:prev.suggestions}) as Snapshot);
      await refresh();
    });
  };

  const take=(key:string,persistent=false,extra:Record<string,unknown>={})=>command({type:'TAKE',variantKey:key,persistent,payload:payloadFor(extra)});
  const preview=(key:string,extra:Record<string,unknown>={})=>{setSelected(key);command({type:'PREVIEW',variantKey:key,payload:payloadFor(extra)});};
  const queueAdd=(key:string,extra:Record<string,unknown>={})=>command({type:'QUEUE_ADD',variantKey:key,payload:payloadFor(extra)});
  const queueRemove=(id:string)=>command({type:'QUEUE_REMOVE',queueId:id});
  const applyScorebar=()=>command({type:'TAKE',variantKey:'scorebar.default',persistent:true,payload:payloadFor({scorebar:{showBatterPhotos}},'scorebar')});

  const loadRelease=()=>{
    if(!releaseChoice||releaseChoice===snap.release?.id)return;
    const target=releases.find(r=>r.release_id===releaseChoice);
    if(!target)return;
    const ok=window.confirm('Load '+target.package_name+' release '+target.version+' for this match? Preview, queue and temporary graphics will be cleared.');
    if(!ok)return;
    setError(null);setNotice(null);
    startTransition(async()=>{
      const {data,error}=await supabase.rpc('ips_broadcast_set_match_release',{p_match_id:matchId,p_release_id:releaseChoice});
      if(error){setError(error.message);return;}
      if(data){
        setSnap(data as Snapshot);
        setSelected('six.fullscreen');
        setNotice(target.package_name+' release '+target.version+' loaded.');
      }
    });
  };

  const suggestion=(id:string,action:'take'|'dismiss')=>{
    setError(null);
    startTransition(async()=>{
      const rpc=action==='take'?'ips_broadcast_take_suggestion':'ips_broadcast_dismiss_suggestion';
      const {data,error}=await supabase.rpc(rpc,{p_suggestion_id:id});
      if(error){setError(error.message);return;}
      if(data)setSnap(data as Snapshot);
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
  const liveKeys=new Set<string>(quick);
  const directGraphics=variantList.filter(v=>v.meta.directTake);
  const flowGraphics=directGraphics.filter(v=>!liveKeys.has(v.meta.sceneKey)).slice(0,12);
  const searchable=variantList.filter(v=>(v.meta.name+' '+v.meta.sceneKey+' '+v.meta.presentation).toLowerCase().includes(search.toLowerCase()));

  return <main className="studio-shell">
    <header className="studio-top">
      <div className="director-wordmark"><b>IPS</b><span>PRISM DIRECTOR</span></div>
      <div className="match-ident">
        <span>{match.tournament?.name||'IPS LIVE'}</span>
        <strong>{match.home_team?.name||match.home_team?.short_name} <i>v</i> {match.away_team?.name||match.away_team?.short_name}</strong>
        <small>{match.code} · {match.status}</small>
      </div>
      <div className="top-status"><span className="live-dot"/>PROGRAM CONNECTED <b>R{snap.program?.revision??0}</b></div>
      <div className="director-nav"><a href={"/replay/matches/"+matchId}>REPLAY</a><Link href="/">← MATCHES</Link></div>
    </header>

    <nav className="control-tabs">
      <button className={view==='live'?'active':''} onClick={()=>setView('live')}><b>LIVE CONTROL</b><span>On-air operation</span></button>
      <button className={view==='graphics'?'active':''} onClick={()=>setView('graphics')}><b>GRAPHICS</b><span>{variantList.length} published</span></button>
      <button className={view==='automation'?'active':''} onClick={()=>setView('automation')}><b>AUTOMATION</b><span>{snap.session?.automation_enabled?'Enabled':'Manual'}</span></button>
      <button className={view==='sponsors'?'active':''} onClick={()=>setView('sponsors')}><b>SPONSORS</b><span>{sponsorEnabled&&selectedSponsor?selectedSponsor.name:'Control center'}</span></button>
      <div className="tab-spacer"/>
      <button className="utility" onClick={()=>command({type:'CLEAR_TEMPORARY'})}>CLEAR TEMP</button>
      <button className="utility danger" onClick={()=>command({type:'CLEAR_ALL'})}>CLEAR ALL</button>
    </nav>

    {(notice||error)&&<div className={'director-toast '+(error?'error':'')}>{error??notice}</div>}

    <section className="director-body">
      <div className="director-main">
        <section className="monitor-deck">
          <article className="monitor preview-monitor">
            <header><span>PREVIEW</span><strong>{selectedMeta?graphicLabel(selectedMeta.name):'Select a graphic'}</strong></header>
            <div className="monitor-screen">{selectedMeta?<FitSceneCanvas document={selectedMeta.document} data={snap.data}/>:<div className="monitor-empty">Select a graphic to prepare it.</div>}</div>
            <footer>
              <button className="queue-action" disabled={!selectedMeta||pending} onClick={()=>selectedMeta&&queueAdd(selected)}>+ QUEUE</button>
              <button className="take-action" disabled={!selectedMeta||pending} onClick={()=>selectedMeta&&take(selected)}>TAKE →</button>
            </footer>
          </article>

          <article className="monitor program-monitor">
            <header><span>PROGRAM</span><strong><i className="on-air-dot"/> ON AIR</strong></header>
            <div className="monitor-screen"><iframe title="IPS PRISM Program" src={OVERLAY_URL+'/?match='+matchId}/></div>
            <footer><span>{active.length} active layer{active.length===1?'':'s'}</span><a target="_blank" rel="noreferrer" href={OVERLAY_URL+'/?match='+matchId}>CLEAN OUTPUT ↗</a></footer>
          </article>
        </section>

        {view==='live'&&<>
          <section className="live-config-strip">
            <div><span>SCOREBAR</span><b>Live layout</b></div>
            <label><input type="checkbox" checked={showBatterPhotos} onChange={e=>setShowBatterPhotos(e.target.checked)}/> BATTER PHOTOS</label>
            <button onClick={applyScorebar}>APPLY SCOREBAR</button>
            <div className={'sponsor-live-state '+(sponsorEnabled?'active':'')}><span>SPONSOR</span><b>{sponsorEnabled&&selectedSponsor?selectedSponsor.name:'OFF'}</b></div>
          </section>
          <section className="live-events">
            <header className="section-head"><div><span>LIVE EVENTS</span><h2>One-click match control</h2></div><small>Scorer-linked events remain automatic when enabled.</small></header>
            <div className="event-hero-grid">
              {quick.map(scene=>{
                const cfg=eventConfigFor(scene);
                const key=cfg?.default_variant_key??defaults[scene]??scene+'.fullscreen';
                const fs=presentationVariant(scene,'FULLSCREEN');
                const lt=presentationVariant(scene,'LOWER_THIRD');
                const activePresentation=variants[key]?.presentation??'FULLSCREEN';
                return <article className={'event-hero '+scene} key={scene}>
                  <button className="event-take" disabled={pending||!variants[key]} onClick={()=>take(key)}>
                    <span>{scene==='four'?'BOUNDARY':scene==='six'?'MAXIMUM':'DISMISSAL'}</span>
                    <strong>{scene==='four'?'4':scene==='six'?'6':'W'}</strong>
                    <small>TAKE NOW</small>
                  </button>
                  <div className="event-route">
                    <button className={activePresentation==='FULLSCREEN'?'active':''} disabled={!fs||pending} onClick={()=>setScorerPresentation(scene,'FULLSCREEN')}>FULL</button>
                    <button className={activePresentation==='LOWER_THIRD'?'active':''} disabled={!lt||pending} onClick={()=>setScorerPresentation(scene,'LOWER_THIRD')}>LOWER</button>
                    <button disabled={!variants[key]||pending} onClick={()=>preview(key)}>PREVIEW</button>
                  </div>
                </article>;
              })}
            </div>
          </section>

          <section className="flow-panel">
            <header className="section-head"><div><span>MATCH FLOW</span><h2>Broadcast moments</h2></div><button onClick={()=>setView('graphics')}>ALL GRAPHICS →</button></header>
            <div className="flow-grid">
              {flowGraphics.length?flowGraphics.map(v=><article key={v.key} className={selected===v.key?'selected':''}>
                <button className="flow-main" onClick={()=>preview(v.key)}>
                  <span>{sceneLabel(v.meta.sceneKey)}</span>
                  <strong>{graphicLabel(v.meta.name)}</strong>
                  <small>{v.meta.presentation.replace('_',' ')}</small>
                </button>
                <button className="flow-take" disabled={pending} onClick={()=>take(v.key)}>TAKE</button>
              </article>):<p className="empty-inline">No direct-take graphics are published in this release.</p>}
            </div>
          </section>
        </>}

        {view==='graphics'&&<section className="graphics-workspace">
          <header className="section-head graphics-head">
            <div><span>GRAPHICS LIBRARY</span><h2>{currentRelease?.package_name??'Loaded package'} · R{snap.release?.version??'—'}</h2></div>
            <input placeholder="Search graphics…" value={search} onChange={e=>setSearch(e.target.value)}/>
          </header>
          <div className="clean-library-grid">
            {searchable.map(v=><article className={selected===v.key?'selected':''} key={v.key}>
              <button className="graphic-select" onClick={()=>preview(v.key)}>
                <span>{sceneLabel(v.meta.sceneKey)}</span>
                <strong>{graphicLabel(v.meta.name)}</strong>
                <small>{v.meta.presentation.replace('_',' ')} · P{v.meta.priority}</small>
              </button>
              <div><button onClick={()=>preview(v.key)}>PREVIEW</button><button className="take" onClick={()=>take(v.key)}>TAKE</button><button onClick={()=>queueAdd(v.key)}>QUEUE</button></div>
            </article>)}
          </div>
        </section>}


        {view==='sponsors'&&<section className="sponsor-workspace">
          <section className="settings-card sponsor-center-card">
            <header><div><span>SPONSOR CENTER</span><h2>Brand any live graphic</h2></div><b>{sponsorEnabled?'ARMED':'OFF'}</b></header>
            <div className="sponsor-controls">
              <label><span>SPONSOR</span><select value={sponsorId} onChange={e=>setSponsorId(e.target.value)}><option value="">No sponsor</option>{sponsors.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
              <label><span>PLACEMENT</span><select value={sponsorPlacement} onChange={e=>setSponsorPlacement(e.target.value as any)}><option value="auto">AUTO BY GRAPHIC</option><option value="lower-third">LOWER THIRD</option><option value="scorebar">SCOREBAR</option><option value="top-right">TOP RIGHT</option><option value="bottom-right">BOTTOM RIGHT</option><option value="fullscreen">FULLSCREEN BRAND</option></select></label>
              <button className={sponsorEnabled?'active':''} disabled={!selectedSponsor} onClick={()=>setSponsorEnabled(v=>!v)}>{sponsorEnabled?'SPONSOR ATTACH ON':'ATTACH SPONSOR TO TAKES'}</button>
            </div>
            <div className="sponsor-preview">
              <div>{selectedSponsor?.logo_url?<img src={selectedSponsor.logo_url} alt=""/>:<b>{selectedSponsor?.name||'NO ACTIVE SPONSOR'}</b>}</div>
              <span>{selectedSponsor?.message||'SPONSORED BY'}</span>
              <p>When armed, sponsor branding travels with Preview, Take and Queue commands. Placement can be lower-third, scorebar, corner or fullscreen.</p>
            </div>
          </section>
          <section className="settings-card sponsor-actions-card">
            <header><div><span>QUICK BRANDING</span><h2>Scorebar & lower thirds</h2></div></header>
            <div className="sponsor-action-grid">
              <button disabled={!selectedSponsor} onClick={()=>{setSponsorEnabled(true);setSponsorPlacement('lower-third');}}>ARM LOWER THIRD</button>
              <button disabled={!selectedSponsor} onClick={()=>{setSponsorEnabled(true);setSponsorPlacement('top-right');}}>ARM CORNER BUG</button>
              <button disabled={!selectedSponsor} onClick={()=>{setSponsorEnabled(true);setSponsorPlacement('fullscreen');}}>ARM FULLSCREEN</button>
              <button disabled={!selectedSponsor} onClick={()=>{setSponsorEnabled(true);setSponsorPlacement('scorebar');setTimeout(applyScorebar,0);}}>SPONSOR SCOREBAR</button>
            </div>
          </section>
        </section>}

        {view==='automation'&&<section className="automation-workspace">
          <section className="settings-card package-card">
            <header><div><span>BROADCAST PACKAGE</span><h2>{currentRelease?.package_name??'Pinned Package'} · R{snap.release?.version??'—'}</h2></div><b>{currentRelease?.variant_count??variantList.length} GRAPHICS</b></header>
            <div className="package-controls">
              <select value={releaseChoice} onChange={e=>setReleaseChoice(e.target.value)}>{releases.map(r=><option key={r.release_id} value={r.release_id}>{r.package_name} · Release {r.version}{r.is_current?' · ON AIR':''}</option>)}</select>
              <button disabled={pending||!selectedRelease||releaseChoice===snap.release?.id} onClick={loadRelease}>{releaseChoice===snap.release?.id?'LOADED':'LOAD RELEASE'}</button>
            </div>
          </section>

          <section className="settings-card">
            <header><div><span>EVENT AUTOMATION</span><h2>Scorer → graphics routing</h2></div><b>{snap.session?.automation_enabled?'ENABLED':'DISABLED'}</b></header>
            <div className="automation-list">
              {(snap.event_config??[]).map(cfg=>{
                const meta=variants[cfg.default_variant_key];
                return <div className="automation-row" key={cfg.event_key}>
                  <div><strong>{cfg.event_key}</strong><small>{meta?graphicLabel(meta.name):cfg.default_variant_key}</small></div>
                  <select value={cfg.mode} disabled={pending} onChange={e=>setEventConfig(cfg,e.target.value)}><option>MANUAL</option><option>ASSISTED</option><option>AUTOMATIC</option></select>
                </div>;
              })}
            </div>
            <button className="automation-master" onClick={()=>command({type:'SET_AUTOMATION',enabled:!snap.session?.automation_enabled})}>{snap.session?.automation_enabled?'DISABLE AUTOMATION':'ENABLE AUTOMATION'}</button>
          </section>

          <section className="settings-card safety-card">
            <header><div><span>OPERATOR SAFETY</span><h2>Emergency controls</h2></div></header>
            <div className="safety-grid">
              <button onClick={()=>command({type:'CLEAR_TEMPORARY'})}>CLEAR TEMPORARY</button>
              <button onClick={()=>command({type:'RESTORE_PERSISTENT'})}>RESTORE PERSISTENT</button>
              <button onClick={()=>command({type:'SET_SCOREBAR_LOCK',enabled:!snap.session?.scorebar_locked})} className={snap.session?.scorebar_locked?'active':''}>{snap.session?.scorebar_locked?'SCOREBAR LOCKED':'LOCK SCOREBAR'}</button>
              <button onClick={()=>command({type:'EMERGENCY_SPONSOR_OFF',enabled:!snap.session?.emergency_sponsor_off})} className={snap.session?.emergency_sponsor_off?'danger active':''}>SPONSOR OFF</button>
              <button className="danger" onClick={()=>command({type:'CLEAR_ALL'})}>CLEAR ALL</button>
              <button className={'panic '+(snap.session?.clean_feed?'active':'')} onClick={()=>command({type:snap.session?.clean_feed?'PANIC_OFF':'PANIC_ON'})}>{snap.session?.clean_feed?'RESTORE PROGRAM':'PANIC / CLEAN FEED'}</button>
            </div>
          </section>
        </section>}
      </div>

      <aside className="director-rail">
        <section className="rail-card match-now">
          <header><span>MATCH NOW</span><i>LIVE</i></header>
          <strong>{innings.score_display??'—'}</strong>
          <small>{innings.overs??'0.0'} overs</small>
          <div><span>STRIKER <b>{snap.data?.current?.striker?.name??'—'}</b></span><span>BOWLER <b>{snap.data?.current?.bowler?.name??'—'}</b></span>{innings.runs_required!=null&&<span>CHASE <b>Need {innings.runs_required} from {innings.balls_remaining}</b></span>}</div>
        </section>

        <section className="rail-card on-air-card">
          <header><span>ON AIR</span><b>{active.length}</b></header>
          <div className="rail-list">{active.length?active.map(l=><article key={l.instanceId}><i className={l.persistent?'persistent':''}/><div><strong>{graphicLabel(variants[l.variantKey]?.name??l.variantKey)}</strong><span>{l.persistent?'PERSISTENT':'TEMPORARY'}</span></div></article>):<p className="empty-inline">Clean feed. No active graphics.</p>}</div>
        </section>

        <section className="rail-card queue-card">
          <header><span>UP NEXT</span><b>{queue.length}</b></header>
          <div className="rail-list">{queue.length?queue.map((q:any,index:number)=><article key={q.queueId}><em>{String(index+1).padStart(2,'0')}</em><div><strong>{graphicLabel(variants[q.variantKey]?.name??q.variantKey)}</strong><span>{q.variantKey}</span></div><button onClick={()=>queueRemove(q.queueId)}>×</button></article>):<p className="empty-inline">Queue is empty.</p>}</div>
        </section>

        <section className="rail-card suggestions-card">
          <header><span>ASSISTED</span><b>{snap.suggestions?.length??0}</b></header>
          <div className="rail-list">{snap.suggestions?.length?snap.suggestions.map(s=><article key={s.id}><div><strong>{s.title}</strong><span>{s.subtitle||sceneLabel(s.suggestion_key)} · {age(s.created_at)}</span></div><div className="suggestion-actions"><button onClick={()=>preview(s.variant_key)}>P</button><button className="take" onClick={()=>suggestion(s.id,'take')}>TAKE</button><button onClick={()=>suggestion(s.id,'dismiss')}>×</button></div></article>):<p className="empty-inline">Nothing waiting.</p>}</div>
        </section>

        <section className="rail-card rail-status">
          <header><span>SYSTEM</span><b>{snap.session?.automation_enabled?'AUTO':'MANUAL'}</b></header>
          <div><span>Package <b>R{snap.release?.version??'—'}</b></span><span>Scorebar <b>{snap.session?.scorebar_locked?'LOCKED':'LIVE'}</b></span><span>Sponsors <b>{snap.session?.emergency_sponsor_off?'OFF':'ON'}</b></span></div>
        </section>
      </aside>
    </section>
  </main>;
}
