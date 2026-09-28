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
type Sponsor={id:string;name:string;logo_url:string|null;message:string|null;status:'ACTIVE'|'INACTIVE'|'ARCHIVED';metadata:any};
type SponsorPlaylistItem={sponsor_id:string;position:number;duration_ms:number|null;sponsor:Sponsor};
type SponsorPlaylist={id:string;name:string;rotation_interval_ms:number;shine_enabled:boolean;items:SponsorPlaylistItem[]};
type SponsorDraft={id?:string;name:string;message:string;logo_url:string;status:'ACTIVE'|'INACTIVE'|'ARCHIVED';metadata:any};
type Snapshot={match_id:string;session:any;program:{revision:number;preview:any;active_layers:Layer[];queue:any[];persistent_snapshot:Layer[]};release:{id:string;version:number;manifest:{variants:Record<string,Meta>};theme:any};data:any;signal:any;event_config:EventConfig[];suggestions:Suggestion[];available_releases?:ReleaseOption[]};

const OVERLAY_URL=process.env.NEXT_PUBLIC_IPS_OVERLAY_URL??'http://localhost:3002';
const SPONSOR_PLACEMENTS=[
  ['auto','AUTO BY GRAPHIC'],['scorebar','SCOREBAR SPONSOR'],['lower-third','LOWER THIRD SPONSOR'],
  ['top-right','TOP RIGHT BUG'],['top-left','TOP LEFT BUG'],['bottom-right','BOTTOM RIGHT BUG'],['fullscreen','FULLSCREEN SPONSOR'],
  ['boundary','BOUNDARY SPONSOR'],['six','SIX SPONSOR'],['wicket','WICKET SPONSOR'],['over','OVER SPONSOR'],
  ['batting-scorecard','BATTING SCORECARD'],['bowling-scorecard','BOWLING SCORECARD'],['player-info','PLAYER INFO'],
  ['match-intro','MATCH INTRO'],['vs-graphic','VS GRAPHIC'],['playing-xi','PLAYING XI'],['result','RESULT'],['replay','REPLAY']
] as const;

function age(ts:string){const sec=Math.max(0,Math.round((Date.now()-Date.parse(ts))/1000));return sec<60?sec+'s':Math.floor(sec/60)+'m';}
function sceneLabel(key:string){return key.replaceAll('_',' ').replaceAll('-',' ').replace(/\b\w/g,c=>c.toUpperCase());}
function graphicLabel(name:string){return name.replace(/^PRISM\s+/i,'');}
function safeFilePart(value:string){return value.toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'')||'sponsor';}
async function adjustedSponsorBlob(file:File,zoom:number,posX:number,posY:number,fit:'contain'|'cover'){
  const source=URL.createObjectURL(file);
  try{
    const img=new Image();
    img.decoding='async';
    img.src=source;
    await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(new Error('Could not read sponsor image.'));});
    const width=1200,height=500;
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Image editor is unavailable.');
    ctx.clearRect(0,0,width,height);
    const contain=Math.min(width/img.naturalWidth,height/img.naturalHeight);
    const cover=Math.max(width/img.naturalWidth,height/img.naturalHeight);
    const scale=(fit==='cover'?cover:contain)*Math.max(.5,Math.min(3,zoom));
    const dw=img.naturalWidth*scale,dh=img.naturalHeight*scale;
    const x=(width-dw)/2+((posX-50)/50)*width*.32;
    const y=(height-dh)/2+((posY-50)/50)*height*.32;
    ctx.drawImage(img,x,y,dw,dh);
    return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not prepare sponsor image.')),'image/png',.96));
  }finally{URL.revokeObjectURL(source);}
}

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
  const [matchInfoAuto,setMatchInfoAuto]=useState(true);
  const [matchInfoInterval,setMatchInfoInterval]=useState(4000);
  const [matchInfoPin,setMatchInfoPin]=useState('AUTO');
  const [matchCardShow,setMatchCardShow]=useState(true);
  const [matchCardMode,setMatchCardMode]=useState('AUTO');
  const [matchCardInterval,setMatchCardInterval]=useState(5000);
  const [matchCardLogos,setMatchCardLogos]=useState(true);
  const [matchCardPlacement,setMatchCardPlacement]=useState('TOP_LEFT');
  const [includeSponsorInScorebar,setIncludeSponsorInScorebar]=useState(false);
  const [durationOverrideMs,setDurationOverrideMs]=useState<number|null>(null);
  const [sponsors,setSponsors]=useState<Sponsor[]>([]);
  const [sponsorPlaylists,setSponsorPlaylists]=useState<SponsorPlaylist[]>([]);
  const [sponsorId,setSponsorId]=useState('');
  const [sponsorPlaylistId,setSponsorPlaylistId]=useState('');
  const [sponsorRotationEnabled,setSponsorRotationEnabled]=useState(false);
  const [sponsorEnabled,setSponsorEnabled]=useState(false);
  const [sponsorPlacement,setSponsorPlacement]=useState('auto');
  const [sponsorDraft,setSponsorDraft]=useState<SponsorDraft|null>(null);
  const [sponsorFile,setSponsorFile]=useState<File|null>(null);
  const [sponsorFilePreview,setSponsorFilePreview]=useState('');
  const [sponsorZoom,setSponsorZoom]=useState(1);
  const [sponsorPosX,setSponsorPosX]=useState(50);
  const [sponsorPosY,setSponsorPosY]=useState(50);
  const [sponsorFit,setSponsorFit]=useState<'contain'|'cover'>('contain');
  const [sponsorSaving,setSponsorSaving]=useState(false);
  const [playlistName,setPlaylistName]=useState('Sponsor Rotation');
  const [playlistInterval,setPlaylistInterval]=useState(10000);
  const [playlistSponsorIds,setPlaylistSponsorIds]=useState<string[]>([]);
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
  const selectedPlaylist=useMemo(()=>sponsorPlaylists.find(p=>p.id===sponsorPlaylistId)??null,[sponsorPlaylists,sponsorPlaylistId]);
  const activeSponsors=useMemo(()=>sponsors.filter(s=>s.status==='ACTIVE'),[sponsors]);
  const sponsorReady=Boolean(sponsorRotationEnabled?selectedPlaylist?.items?.some(i=>i.sponsor?.status==='ACTIVE'):selectedSponsor?.status==='ACTIVE');

  const loadSponsorState=useCallback(async()=>{
    const {data,error}=await supabase.rpc('ips_broadcast_sponsor_state',{p_match_id:matchId});
    if(error){setError(error.message);return;}
    const nextSponsors=(data?.sponsors??[]) as Sponsor[];
    const nextPlaylists=(data?.playlists??[]) as SponsorPlaylist[];
    setSponsors(nextSponsors);setSponsorPlaylists(nextPlaylists);
    setSponsorId(current=>current&&nextSponsors.some(x=>x.id===current)?current:(nextSponsors.find(x=>x.status==='ACTIVE')?.id??nextSponsors[0]?.id??''));
    setSponsorPlaylistId(current=>current&&nextPlaylists.some(x=>x.id===current)?current:(nextPlaylists[0]?.id??''));
  },[supabase,matchId]);

  useEffect(()=>{void loadSponsorState();},[loadSponsorState]);

  useEffect(()=>{
    if(!sponsorFile){setSponsorFilePreview('');return;}
    const url=URL.createObjectURL(sponsorFile);setSponsorFilePreview(url);
    return()=>URL.revokeObjectURL(url);
  },[sponsorFile]);

  useEffect(()=>{
    const p=sponsorPlaylists.find(x=>x.id===sponsorPlaylistId);
    if(!p)return;
    setPlaylistName(p.name);setPlaylistInterval(p.rotation_interval_ms);setPlaylistSponsorIds(p.items.map(i=>i.sponsor_id));
  },[sponsorPlaylistId,sponsorPlaylists]);

  const sponsorPayload=(placement=sponsorPlacement,force=false)=>{
    if(!force&&!sponsorEnabled)return {};
    if(sponsorRotationEnabled&&selectedPlaylist?.items?.length){
      return {
        sponsor:{placement},
        sponsorPlaylist:{
          id:selectedPlaylist.id,name:selectedPlaylist.name,rotation_interval_ms:selectedPlaylist.rotation_interval_ms,
          sponsors:selectedPlaylist.items.filter(i=>i.sponsor?.status==='ACTIVE').sort((a,b)=>a.position-b.position).map(i=>i.sponsor)
        }
      };
    }
    return selectedSponsor&&selectedSponsor.status==='ACTIVE'?{
      sponsor:{id:selectedSponsor.id,name:selectedSponsor.name,logo_url:selectedSponsor.logo_url,message:selectedSponsor.message||'SPONSORED BY',placement}
    }:{};
  };
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

  const take=(key:string,persistent=false,extra:Record<string,unknown>={})=>command({type:'TAKE',variantKey:key,persistent,payload:payloadFor(extra),...(!persistent&&durationOverrideMs?{durationMs:durationOverrideMs}:{})});
  const preview=(key:string,extra:Record<string,unknown>={})=>{setSelected(key);command({type:'PREVIEW',variantKey:key,payload:payloadFor(extra)});};
  const queueAdd=(key:string,extra:Record<string,unknown>={})=>command({type:'QUEUE_ADD',variantKey:key,payload:payloadFor(extra)});
  const queueRemove=(id:string)=>command({type:'QUEUE_REMOVE',queueId:id});
  const scorebarSettings=()=>({
    showBatterPhotos,
    matchInfo:{autoRotate:matchInfoAuto,intervalMs:matchInfoInterval,pin:matchInfoPin},
    matchCard:{show:matchCardShow,mode:matchCardMode,intervalMs:matchCardInterval,showTeamLogos:matchCardLogos,placement:matchCardPlacement},
    includeSponsorInRotation:includeSponsorInScorebar
  });
  const applyScorebar=()=>command({type:'TAKE',variantKey:'scorebar.default',persistent:true,payload:payloadFor({scorebar:scorebarSettings()},'scorebar')});
  const applySponsoredScorebar=()=>{setSponsorEnabled(true);command({type:'TAKE',variantKey:'scorebar.default',persistent:true,payload:{scorebar:scorebarSettings(),...sponsorPayload('scorebar',true)}});};

  const consumeSponsorState=(data:any)=>{
    const nextSponsors=(data?.sponsors??[]) as Sponsor[];
    const nextPlaylists=(data?.playlists??[]) as SponsorPlaylist[];
    setSponsors(nextSponsors);setSponsorPlaylists(nextPlaylists);
    setSponsorId(current=>current&&nextSponsors.some(x=>x.id===current)?current:(nextSponsors.find(x=>x.status==='ACTIVE')?.id??nextSponsors[0]?.id??''));
    setSponsorPlaylistId(current=>current&&nextPlaylists.some(x=>x.id===current)?current:(nextPlaylists[0]?.id??''));
  };

  const openSponsorEditor=(sponsor?:Sponsor)=>{
    setSponsorDraft(sponsor?{id:sponsor.id,name:sponsor.name,message:sponsor.message||'SPONSORED BY',logo_url:sponsor.logo_url||'',status:sponsor.status,metadata:sponsor.metadata||{}}:{name:'',message:'SPONSORED BY',logo_url:'',status:'ACTIVE',metadata:{}});
    setSponsorFile(null);setSponsorZoom(1);setSponsorPosX(50);setSponsorPosY(50);setSponsorFit('contain');
  };

  const saveSponsor=async()=>{
    if(!sponsorDraft)return;
    if(!sponsorDraft.name.trim()){setError('Sponsor name is required.');return;}
    const tournamentId=match.tournament?.id||match.tournament_id;
    if(!tournamentId){setError('Tournament is unavailable for this match.');return;}
    setSponsorSaving(true);setError(null);
    try{
      let logoUrl=sponsorDraft.logo_url||null;
      if(sponsorFile){
        if(!['image/png','image/jpeg','image/webp','image/svg+xml'].includes(sponsorFile.type))throw new Error('Use PNG, JPG/JPEG, WEBP or SVG.');
        if(sponsorFile.size>10*1024*1024)throw new Error('Sponsor image must be 10 MB or smaller.');
        const blob=await adjustedSponsorBlob(sponsorFile,sponsorZoom,sponsorPosX,sponsorPosY,sponsorFit);
        const objectPath='sponsors/'+tournamentId+'/'+crypto.randomUUID()+'-'+safeFilePart(sponsorDraft.name)+'.png';
        const {error:uploadError}=await supabase.storage.from('ips-media').upload(objectPath,blob,{contentType:'image/png',upsert:false});
        if(uploadError)throw uploadError;
        logoUrl=supabase.storage.from('ips-media').getPublicUrl(objectPath).data.publicUrl;
      }
      const {data,error}=await supabase.rpc('ips_broadcast_save_sponsor',{
        p_match_id:matchId,p_sponsor_id:sponsorDraft.id??null,p_name:sponsorDraft.name.trim(),
        p_message:sponsorDraft.message.trim()||'SPONSORED BY',p_logo_url:logoUrl,p_status:sponsorDraft.status,
        p_metadata:{...(sponsorDraft.metadata||{}),image_fit:sponsorFit,image_zoom:sponsorZoom,image_position:{x:sponsorPosX,y:sponsorPosY}}
      });
      if(error)throw error;
      consumeSponsorState(data);setSponsorDraft(null);setSponsorFile(null);setNotice('Sponsor saved.');
    }catch(reason:any){setError(reason?.message||'Sponsor could not be saved.');}
    finally{setSponsorSaving(false);}
  };

  const setSponsorStatus=async(id:string,status:'ACTIVE'|'INACTIVE'|'ARCHIVED')=>{
    setError(null);
    const {data,error}=await supabase.rpc('ips_broadcast_set_sponsor_status',{p_match_id:matchId,p_sponsor_id:id,p_status:status});
    if(error){setError(error.message);return;}
    consumeSponsorState(data);setNotice(status==='ARCHIVED'?'Sponsor archived.':'Sponsor '+status.toLowerCase()+'.');
  };

  const togglePlaylistSponsor=(id:string)=>setPlaylistSponsorIds(ids=>ids.includes(id)?ids.filter(x=>x!==id):[...ids,id]);
  const saveSponsorPlaylist=async()=>{
    setError(null);
    const {data,error}=await supabase.rpc('ips_broadcast_save_sponsor_playlist',{
      p_match_id:matchId,p_playlist_id:sponsorPlaylistId||null,p_name:playlistName.trim()||'Sponsor Rotation',
      p_rotation_interval_ms:playlistInterval,p_sponsor_ids:playlistSponsorIds
    });
    if(error){setError(error.message);return;}
    consumeSponsorState(data);setNotice('Sponsor playlist saved.');
  };

  const sponsorScenePayload=(placement=sponsorPlacement)=>sponsorPayload(placement,true);
  const previewSponsorFullscreen=()=>{setSelected('sponsor.fullscreen');command({type:'PREVIEW',variantKey:'sponsor.fullscreen',payload:sponsorScenePayload('fullscreen')});};
  const takeSponsorFullscreen=()=>command({type:'TAKE',variantKey:'sponsor.fullscreen',persistent:false,payload:sponsorScenePayload('fullscreen'),...(durationOverrideMs?{durationMs:durationOverrideMs}:{})});
  const queueSponsorFullscreen=()=>command({type:'QUEUE_ADD',variantKey:'sponsor.fullscreen',payload:sponsorScenePayload('fullscreen')});

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
      <div className="director-nav"><a className="overlay-open" target="_blank" rel="noreferrer" href={OVERLAY_URL+"/?match="+matchId}>OPEN OVERLAY ↗</a><a href={"/replay/matches/"+matchId}>REPLAY</a><Link href="/">← MATCHES</Link></div>
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
            <div className="monitor-screen">{selected==='sponsor.fullscreen'&&sponsorReady?<div className="director-sponsor-preview"><span>{selectedSponsor?.message||'SPONSORED BY'}</span>{selectedSponsor?.logo_url?<img src={selectedSponsor.logo_url} alt=""/>:<strong>{selectedSponsor?.name||selectedPlaylist?.name||'SPONSOR'}</strong>}</div>:selectedMeta?<FitSceneCanvas document={selectedMeta.document} data={snap.data}/>:<div className="monitor-empty">Select a graphic to prepare it.</div>}</div>
            <footer>
              <label className="duration-control"><span>AUTO HIDE</span><select value={durationOverrideMs??''} onChange={e=>setDurationOverrideMs(e.target.value?Number(e.target.value):null)}>
                <option value="">DEFAULT {selectedMeta?.durationMs?Math.round(selectedMeta.durationMs/100)/10+'s':'5s'}</option>
                <option value="2000">2s</option><option value="3000">3s</option><option value="5000">5s</option><option value="8000">8s</option><option value="10000">10s</option><option value="15000">15s</option><option value="30000">30s</option>
              </select></label>
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
            <div><span>SCOREBAR</span><b>Compact live layout</b></div>
            <label><input type="checkbox" checked={showBatterPhotos} onChange={e=>setShowBatterPhotos(e.target.checked)}/> BATTER PHOTOS</label>
            <button onClick={applyScorebar}>APPLY SCOREBAR</button>
            <div className={'sponsor-live-state '+(sponsorEnabled?'active':'')}><span>SPONSOR</span><b>{sponsorEnabled?(sponsorRotationEnabled?(selectedPlaylist?.name||'ROTATION'):(selectedSponsor?.name||'ON')):'OFF'}</b></div>
          </section>
          <section className="live-config-details">
            <details>
              <summary><div><span>MATCH INFO ROTATION</span><b>{matchInfoPin==='AUTO'?(matchInfoAuto?'AUTO · '+matchInfoInterval/1000+'s':'STATIC'):matchInfoPin.replace('_',' ')}</b></div><i>Configure</i></summary>
              <div className="compact-config-grid">
                <label><span>AUTO ROTATE</span><input type="checkbox" checked={matchInfoAuto} onChange={e=>setMatchInfoAuto(e.target.checked)}/></label>
                <label><span>ROTATION SPEED</span><select value={matchInfoInterval} onChange={e=>setMatchInfoInterval(Number(e.target.value))}><option value={3000}>3 sec</option><option value={4000}>4 sec</option><option value={5000}>5 sec</option><option value={7000}>7 sec</option><option value={10000}>10 sec</option></select></label>
                <label><span>PIN ITEM</span><select value={matchInfoPin} onChange={e=>setMatchInfoPin(e.target.value)}><option>AUTO</option><option>CRR</option><option>RRR</option><option>TARGET</option><option value="NEED_FROM">NEED FROM</option><option>OVERS</option><option>PARTNERSHIP</option><option value="LAST_WICKET">LAST WICKET</option></select></label>
                <label><span>SPONSOR IN ROTATION</span><input type="checkbox" checked={includeSponsorInScorebar} onChange={e=>setIncludeSponsorInScorebar(e.target.checked)}/></label>
              </div>
            </details>
            <details>
              <summary><div><span>MATCH IDENTIFIER CARD</span><b>{matchCardShow?matchCardMode.replace('_',' ')+' · '+matchCardPlacement.replace('_',' '):'HIDDEN'}</b></div><i>Configure</i></summary>
              <div className="compact-config-grid">
                <label><span>SHOW CARD</span><input type="checkbox" checked={matchCardShow} onChange={e=>setMatchCardShow(e.target.checked)}/></label>
                <label><span>MODE</span><select value={matchCardMode} onChange={e=>setMatchCardMode(e.target.value)}><option>AUTO</option><option>TEAMS</option><option value="MATCH_NUMBER">MATCH NUMBER</option><option value="MATCH_STAGE">MATCH STAGE</option></select></label>
                <label><span>ROTATION</span><select value={matchCardInterval} onChange={e=>setMatchCardInterval(Number(e.target.value))}><option value={3000}>3 sec</option><option value={5000}>5 sec</option><option value={7000}>7 sec</option><option value={10000}>10 sec</option></select></label>
                <label><span>TEAM LOGOS</span><input type="checkbox" checked={matchCardLogos} onChange={e=>setMatchCardLogos(e.target.checked)}/></label>
                <label><span>PLACEMENT</span><select value={matchCardPlacement} onChange={e=>setMatchCardPlacement(e.target.value)}><option>TOP_LEFT</option><option>TOP_CENTER</option><option>TOP_RIGHT</option></select></label>
              </div>
            </details>
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


        {view==='sponsors'&&<section className="sponsor-workspace sponsor-workspace-full">
          <section className="settings-card sponsor-manager-card">
            <header><div><span>SPONSOR CONTROL CENTER</span><h2>Partners & on-air branding</h2></div><button className="header-action" onClick={()=>openSponsorEditor()}>+ ADD SPONSOR</button></header>
            <div className="sponsor-card-grid">
              {sponsors.length?sponsors.map(sp=><article className={'sponsor-card status-'+sp.status.toLowerCase()} key={sp.id}>
                <div className="sponsor-logo-box">{sp.logo_url?<img src={sp.logo_url} alt=""/>:<b>{sp.name.slice(0,2).toUpperCase()}</b>}</div>
                <div className="sponsor-card-copy"><span>{sp.message||'SPONSORED BY'}</span><strong>{sp.name}</strong><small>{sp.status}</small></div>
                <div className="sponsor-card-actions">
                  <button onClick={()=>openSponsorEditor(sp)}>EDIT</button>
                  {sp.status==='ACTIVE'?<button onClick={()=>void setSponsorStatus(sp.id,'INACTIVE')}>DEACTIVATE</button>:sp.status!=='ARCHIVED'&&<button onClick={()=>void setSponsorStatus(sp.id,'ACTIVE')}>ACTIVATE</button>}
                  {sp.status!=='ARCHIVED'&&<button className="danger" onClick={()=>void setSponsorStatus(sp.id,'ARCHIVED')}>ARCHIVE</button>}
                </div>
              </article>):<p className="empty-inline">No sponsors yet. Add the first sponsor and upload its logo from this device.</p>}
            </div>
          </section>

          <section className="settings-card sponsor-onair-card">
            <header><div><span>ON-AIR SPONSOR</span><h2>Reusable SponsorSlot</h2></div><b>{sponsorEnabled?'ARMED':'OFF'}</b></header>
            <div className="sponsor-control-grid">
              <label><span>MODE</span><select value={sponsorRotationEnabled?'AUTO':'MANUAL'} onChange={e=>setSponsorRotationEnabled(e.target.value==='AUTO')}><option>MANUAL</option><option>AUTO</option></select></label>
              {sponsorRotationEnabled?<label><span>PLAYLIST</span><select value={sponsorPlaylistId} onChange={e=>setSponsorPlaylistId(e.target.value)}><option value="">Choose playlist</option>{sponsorPlaylists.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
                :<label><span>SPONSOR</span><select value={sponsorId} onChange={e=>setSponsorId(e.target.value)}><option value="">Choose sponsor</option>{activeSponsors.map(sp=><option key={sp.id} value={sp.id}>{sp.name}</option>)}</select></label>}
              <label className="wide"><span>PLACEMENT</span><select value={sponsorPlacement} onChange={e=>setSponsorPlacement(e.target.value)}>{SPONSOR_PLACEMENTS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
              <button className={sponsorEnabled?'armed':''} disabled={!sponsorReady} onClick={()=>setSponsorEnabled(v=>!v)}>{sponsorEnabled?'ATTACHMENT ARMED':'ARM SPONSOR'}</button>
            </div>
            <div className="sponsor-current-preview">
              <div>{selectedSponsor?.logo_url?<img src={selectedSponsor.logo_url} alt=""/>:<b>{sponsorRotationEnabled?(selectedPlaylist?.name||'PLAYLIST'):(selectedSponsor?.name||'NO SPONSOR')}</b>}</div>
              <p><span>{sponsorRotationEnabled?'AUTO ROTATION':'MANUAL'}</span>{sponsorRotationEnabled&&selectedPlaylist?<><strong>{selectedPlaylist.items.length} sponsors</strong><small>{selectedPlaylist.rotation_interval_ms/1000}s rotation</small></>:selectedSponsor?<><strong>{selectedSponsor.name}</strong><small>{selectedSponsor.message||'SPONSORED BY'}</small></>:<small>Select an active sponsor.</small>}</p>
            </div>
          </section>

          <section className="settings-card sponsor-fullscreen-card">
            <header><div><span>FULLSCREEN SPONSOR</span><h2>Dedicated sponsor break</h2></div><b>AUTO HIDE</b></header>
            <div className="sponsor-fullscreen-actions">
              <button disabled={!sponsorReady} onClick={previewSponsorFullscreen}>PREVIEW</button>
              <button className="take" disabled={!sponsorReady} onClick={takeSponsorFullscreen}>TAKE</button>
              <button disabled={!sponsorReady} onClick={queueSponsorFullscreen}>QUEUE</button>
              <label><span>DURATION</span><select value={durationOverrideMs??''} onChange={e=>setDurationOverrideMs(e.target.value?Number(e.target.value):null)}><option value="">DEFAULT 5s</option><option value="2000">2s</option><option value="3000">3s</option><option value="5000">5s</option><option value="8000">8s</option><option value="10000">10s</option><option value="15000">15s</option><option value="30000">30s</option></select></label>
            </div>
          </section>

          <section className="settings-card sponsor-playlist-card">
            <header><div><span>SPONSOR PLAYLIST</span><h2>Rotation & exposure schedule</h2></div><button className="header-action" onClick={()=>{setSponsorPlaylistId('');setPlaylistName('Sponsor Rotation');setPlaylistInterval(10000);setPlaylistSponsorIds([]);}}>NEW PLAYLIST</button></header>
            <div className="playlist-config">
              <label><span>PLAYLIST NAME</span><input value={playlistName} onChange={e=>setPlaylistName(e.target.value)}/></label>
              <label><span>ROTATION</span><select value={playlistInterval} onChange={e=>setPlaylistInterval(Number(e.target.value))}><option value={5000}>5 sec</option><option value={10000}>10 sec</option><option value={15000}>15 sec</option><option value={30000}>30 sec</option><option value={60000}>60 sec</option></select></label>
              <div className="playlist-sponsors"><span>ACTIVE SPONSORS</span>{activeSponsors.map(sp=><label key={sp.id}><input type="checkbox" checked={playlistSponsorIds.includes(sp.id)} onChange={()=>togglePlaylistSponsor(sp.id)}/>{sp.logo_url&&<img src={sp.logo_url} alt=""/>}<b>{sp.name}</b></label>)}</div>
              <button className="save-playlist" disabled={!playlistSponsorIds.length} onClick={()=>void saveSponsorPlaylist()}>SAVE PLAYLIST</button>
            </div>
          </section>

          <section className="settings-card sponsor-scorebar-card">
            <header><div><span>SCOREBAR SPONSOR</span><h2>Rotation without hiding cricket</h2></div></header>
            <div className="sponsor-scorebar-actions"><label><input type="checkbox" checked={includeSponsorInScorebar} onChange={e=>setIncludeSponsorInScorebar(e.target.checked)}/> INCLUDE SPONSOR IN SCOREBAR ROTATION</label><button disabled={!sponsorReady} onClick={applySponsoredScorebar}>APPLY TO SCOREBAR</button></div>
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

      {sponsorDraft&&<div className="sponsor-editor-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!sponsorSaving)setSponsorDraft(null);}}>
        <section className="sponsor-editor-modal">
          <header><div><span>{sponsorDraft.id?'EDIT SPONSOR':'ADD SPONSOR'}</span><h2>{sponsorDraft.name||'New sponsor'}</h2></div><button disabled={sponsorSaving} onClick={()=>setSponsorDraft(null)}>×</button></header>
          <div className="sponsor-editor-body">
            <div className="sponsor-form-fields">
              <label><span>SPONSOR NAME</span><input value={sponsorDraft.name} onChange={e=>setSponsorDraft({...sponsorDraft,name:e.target.value})}/></label>
              <label><span>SPONSOR MESSAGE</span><input value={sponsorDraft.message} onChange={e=>setSponsorDraft({...sponsorDraft,message:e.target.value})} placeholder="SPONSORED BY"/></label>
              <label><span>STATUS</span><select value={sponsorDraft.status} onChange={e=>setSponsorDraft({...sponsorDraft,status:e.target.value as SponsorDraft['status']})}><option>ACTIVE</option><option>INACTIVE</option><option>ARCHIVED</option></select></label>
              <label className="upload-field"><span>LOGO / PHOTO</span><input type="file" accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml" onChange={e=>setSponsorFile(e.target.files?.[0]||null)}/><small>PNG, JPG/JPEG, WEBP or SVG · max 10 MB</small></label>
            </div>
            <div className="sponsor-image-editor">
              <div className="sponsor-crop-preview">
                {(sponsorFilePreview||sponsorDraft.logo_url)?<img src={sponsorFilePreview||sponsorDraft.logo_url} alt="" style={{objectFit:sponsorFit,transform:`translate(${(sponsorPosX-50)*.45}%,${(sponsorPosY-50)*.45}%) scale(${sponsorZoom})`}}/>:<b>UPLOAD LOGO</b>}
              </div>
              <div className="image-adjust-controls">
                <label><span>FIT</span><select value={sponsorFit} onChange={e=>setSponsorFit(e.target.value as 'contain'|'cover')}><option value="contain">CONTAIN</option><option value="cover">COVER / CROP</option></select></label>
                <label><span>ZOOM {sponsorZoom.toFixed(2)}×</span><input type="range" min=".5" max="3" step=".05" value={sponsorZoom} onChange={e=>setSponsorZoom(Number(e.target.value))}/></label>
                <label><span>POSITION X</span><input type="range" min="0" max="100" value={sponsorPosX} onChange={e=>setSponsorPosX(Number(e.target.value))}/></label>
                <label><span>POSITION Y</span><input type="range" min="0" max="100" value={sponsorPosY} onChange={e=>setSponsorPosY(Number(e.target.value))}/></label>
                <button onClick={()=>{setSponsorZoom(1);setSponsorPosX(50);setSponsorPosY(50);setSponsorFit('contain');}}>RESET IMAGE</button>
              </div>
            </div>
          </div>
          <footer><button disabled={sponsorSaving} onClick={()=>setSponsorDraft(null)}>CANCEL</button><button className="save" disabled={sponsorSaving||!sponsorDraft.name.trim()} onClick={()=>void saveSponsor()}>{sponsorSaving?'SAVING…':'SAVE SPONSOR'}</button></footer>
        </section>
      </div>}

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
