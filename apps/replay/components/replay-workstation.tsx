'use client';

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import Link from 'next/link';
import {createClient} from '@/lib/supabase/client';

type SlotState={slot:number;deviceId:string;label:string;status:'IDLE'|'LIVE'|'ERROR';error?:string};
type Chunk={blob:Blob;at:number};
type BufferState={header:Blob|null;chunks:Chunk[];mime:string;startedAt:number};
type ReplayAngle={slot:number;label:string;url:string;mime:string};
type ReplayClip={id:string;kind:'FOUR'|'SIX'|'WICKET'|'MANUAL';source:'SCORER'|'MANUAL';title:string;createdAt:number;durationSec:number;angles:ReplayAngle[]};

const SLOT_COUNT=4;
const BUFFER_MS=45000;

function supportedMime(){
  if(typeof MediaRecorder==='undefined')return '';
  const choices=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm','video/mp4'];
  return choices.find(x=>MediaRecorder.isTypeSupported(x))??'';
}
function shortTeam(team:any){return team?.short_name||team?.name||'TEAM';}
function formatClock(ms:number){return new Date(ms).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});}

export function ReplayWorkstation({matchId,match}:{matchId:string;match:any}){
  const supabase=useMemo(()=>createClient(),[]);
  const [devices,setDevices]=useState<MediaDeviceInfo[]>([]);
  const [slots,setSlots]=useState<SlotState[]>(()=>Array.from({length:SLOT_COUNT},(_,i)=>({slot:i,deviceId:'',label:'CAM '+(i+1),status:'IDLE'})));
  const [clips,setClips]=useState<ReplayClip[]>([]);
  const [selectedClipId,setSelectedClipId]=useState<string|null>(null);
  const [selectedAngle,setSelectedAngle]=useState(0);
  const [speed,setSpeed]=useState(1);
  const [programCamera,setProgramCamera]=useState(0);
  const [programMode,setProgramMode]=useState<'LIVE'|'REPLAY'>('LIVE');
  const [autoReturn,setAutoReturn]=useState(true);
  const [notice,setNotice]=useState('Enable cameras, assign angles, then start the rolling buffers.');
  const [scorerLink,setScorerLink]=useState<'CONNECTING'|'LIVE'|'UNAVAILABLE'>('CONNECTING');
  const [programPeer,setProgramPeer]=useState<'WAITING'|'CONNECTED'|'NO LIVE CAMERA'>('WAITING');

  const streamsRef=useRef<(MediaStream|null)[]>(Array(SLOT_COUNT).fill(null));
  const recordersRef=useRef<(MediaRecorder|null)[]>(Array(SLOT_COUNT).fill(null));
  const buffersRef=useRef<BufferState[]>(Array.from({length:SLOT_COUNT},()=>({header:null,chunks:[],mime:'',startedAt:0})));
  const videoRefs=useRef<(HTMLVideoElement|null)[]>([]);
  const channelRef=useRef<BroadcastChannel|null>(null);
  const pcRef=useRef<RTCPeerConnection|null>(null);
  const seenEventsRef=useRef(new Set<string>());
  const clipsRef=useRef<ReplayClip[]>([]);

  useEffect(()=>{clipsRef.current=clips;},[clips]);

  const enumerate=useCallback(async()=>{
    if(!navigator.mediaDevices?.enumerateDevices)return;
    const list=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput');
    setDevices(list);
    setSlots(prev=>prev.map((slot,i)=>slot.deviceId||!list[i]?slot:{...slot,deviceId:list[i].deviceId,label:list[i].label||'CAM '+(i+1)}));
  },[]);

  useEffect(()=>{void enumerate();navigator.mediaDevices?.addEventListener?.('devicechange',enumerate);return()=>navigator.mediaDevices?.removeEventListener?.('devicechange',enumerate);},[enumerate]);

  const enablePermissions=async()=>{
    try{
      const probe=await navigator.mediaDevices.getUserMedia({video:true,audio:false});
      probe.getTracks().forEach(t=>t.stop());
      await enumerate();
      setNotice('Camera permission granted. Assign each angle and start its buffer.');
    }catch(e:any){setNotice('Camera permission failed: '+(e?.message||'permission denied'));}
  };

  const stopSlot=useCallback((index:number)=>{
    const recorder=recordersRef.current[index];
    if(recorder&&recorder.state!=='inactive'){try{recorder.stop();}catch{}}
    recordersRef.current[index]=null;
    streamsRef.current[index]?.getTracks().forEach(t=>t.stop());
    streamsRef.current[index]=null;
    const video=videoRefs.current[index];if(video)video.srcObject=null;
    buffersRef.current[index]={header:null,chunks:[],mime:'',startedAt:0};
    setSlots(prev=>prev.map((s,i)=>i===index?{...s,status:'IDLE',error:undefined}:s));
  },[]);

  const startSlot=useCallback(async(index:number)=>{
    stopSlot(index);
    const selected=slots[index]?.deviceId;
    try{
      const stream=await navigator.mediaDevices.getUserMedia({video:selected?{deviceId:{exact:selected},width:{ideal:1920},height:{ideal:1080},frameRate:{ideal:30}}:{width:{ideal:1920},height:{ideal:1080}},audio:false});
      streamsRef.current[index]=stream;
      const video=videoRefs.current[index];if(video){video.srcObject=stream;await video.play().catch(()=>{});}
      const mime=supportedMime();
      const recorder=new MediaRecorder(stream,mime?{mimeType:mime,videoBitsPerSecond:6000000}:undefined);
      const buffer:BufferState={header:null,chunks:[],mime:recorder.mimeType||mime||'video/webm',startedAt:Date.now()};
      buffersRef.current[index]=buffer;
      recorder.ondataavailable=e=>{
        if(!e.data?.size)return;
        const now=Date.now();
        if(!buffer.header)buffer.header=e.data;
        buffer.chunks.push({blob:e.data,at:now});
        const cutoff=now-BUFFER_MS;
        buffer.chunks=buffer.chunks.filter((c,j)=>j===0||c.at>=cutoff);
      };
      recorder.onerror=()=>setSlots(prev=>prev.map((s,i)=>i===index?{...s,status:'ERROR',error:'Recorder error'}:s));
      recorder.start(500);
      recordersRef.current[index]=recorder;
      const label=stream.getVideoTracks()[0]?.label||slots[index]?.label||'CAM '+(index+1);
      setSlots(prev=>prev.map((s,i)=>i===index?{...s,status:'LIVE',label,error:undefined}:s));
      setNotice('CAM '+(index+1)+' rolling buffer is live.');
    }catch(e:any){
      setSlots(prev=>prev.map((s,i)=>i===index?{...s,status:'ERROR',error:e?.message||'Camera unavailable'}:s));
    }
  },[slots,stopSlot]);

  const buildClip=useCallback((kind:ReplayClip['kind'],source:ReplayClip['source'],title:string,preRollSec:number)=>{
    const now=Date.now();
    const cutoff=now-preRollSec*1000;
    const angles:ReplayAngle[]=[];
    for(let i=0;i<SLOT_COUNT;i++){
      const buf=buffersRef.current[i];
      if(!buf.header||!buf.chunks.length)continue;
      const recent=buf.chunks.filter(c=>c.at>=cutoff&&c.blob!==buf.header).map(c=>c.blob);
      if(!recent.length)continue;
      const blob=new Blob([buf.header,...recent],{type:buf.mime||'video/webm'});
      angles.push({slot:i,label:slots[i]?.label||'CAM '+(i+1),url:URL.createObjectURL(blob),mime:blob.type});
    }
    if(!angles.length){setNotice('Replay marker received, but no rolling camera buffer is armed.');return;}
    const clip:ReplayClip={id:crypto.randomUUID(),kind,source,title,createdAt:now,durationSec:preRollSec,angles};
    setClips(prev=>[clip,...prev].slice(0,24));
    setSelectedClipId(clip.id);
    setSelectedAngle(angles[0].slot);
    setNotice(kind+' replay captured from '+angles.length+' angle'+(angles.length===1?'':'s')+'.');
  },[slots]);

  const markEvent=useCallback((kind:ReplayClip['kind'],source:ReplayClip['source']='MANUAL',subtitle?:string)=>{
    const pre=kind==='WICKET'?20:kind==='SIX'?15:12;
    const post=kind==='WICKET'?2800:2200;
    setNotice((source==='SCORER'?'Scorer ':'')+kind+' marker received — capturing post-roll…');
    window.setTimeout(()=>buildClip(kind,source,subtitle||kind+' · '+shortTeam(match.home)+' vs '+shortTeam(match.away),pre),post);
  },[buildClip,match]);

  useEffect(()=>{
    const ch=supabase.channel('ips-replay-score-'+matchId)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'match_scoring_events',filter:'match_id=eq.'+matchId},payload=>{
        const row=payload.new as any;
        if(!row?.id||seenEventsRef.current.has(row.id))return;
        seenEventsRef.current.add(row.id);
        if(row.event_type!=='DELIVERY')return;
        if(row.is_wicket)markEvent('WICKET','SCORER',row.delivery_label||'WICKET');
        else if(Number(row.runs_off_bat)===6)markEvent('SIX','SCORER',row.delivery_label||'SIX');
        else if(Number(row.runs_off_bat)===4)markEvent('FOUR','SCORER',row.delivery_label||'FOUR');
      })
      .subscribe(status=>{
        if(status==='SUBSCRIBED')setScorerLink('LIVE');
        else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED')setScorerLink('UNAVAILABLE');
      });
    return()=>{void supabase.removeChannel(ch);};
  },[supabase,matchId,markEvent]);

  const closePeer=useCallback(()=>{try{pcRef.current?.close();}catch{}pcRef.current=null;setProgramPeer('WAITING');},[]);

  const createProgramOffer=useCallback(async()=>{
    closePeer();
    const stream=streamsRef.current[programCamera];
    if(!stream){setProgramPeer('NO LIVE CAMERA');channelRef.current?.postMessage({type:'NO_LIVE'});return;}
    const pc=new RTCPeerConnection();
    pcRef.current=pc;
    stream.getTracks().forEach(track=>pc.addTrack(track,stream));
    pc.onicecandidate=e=>{if(e.candidate)channelRef.current?.postMessage({type:'HOST_ICE',candidate:e.candidate.toJSON()});};
    pc.onconnectionstatechange=()=>{if(pc.connectionState==='connected')setProgramPeer('CONNECTED');};
    const offer=await pc.createOffer();
    await pc.setLocalDescription(offer);
    channelRef.current?.postMessage({type:'OFFER',sdp:offer});
  },[programCamera,closePeer]);

  useEffect(()=>{
    if(typeof BroadcastChannel==='undefined')return;
    const ch=new BroadcastChannel('ips-replay-'+matchId);channelRef.current=ch;
    ch.onmessage=async e=>{
      const msg=e.data||{};
      if(msg.type==='HELLO')await createProgramOffer();
      if(msg.type==='ANSWER'&&pcRef.current&&msg.sdp)await pcRef.current.setRemoteDescription(msg.sdp).catch(()=>{});
      if(msg.type==='PROGRAM_ICE'&&pcRef.current&&msg.candidate)await pcRef.current.addIceCandidate(msg.candidate).catch(()=>{});
      if(msg.type==='REPLAY_ENDED'&&autoReturn){setProgramMode('LIVE');ch.postMessage({type:'LIVE'});}
    };
    return()=>{ch.close();channelRef.current=null;closePeer();};
  },[matchId,autoReturn,createProgramOffer,closePeer]);

  useEffect(()=>{if(channelRef.current)void createProgramOffer();},[programCamera,createProgramOffer]);

  const selectedClip=clips.find(c=>c.id===selectedClipId)??clips[0]??null;
  const selectedReplayAngle=selectedClip?.angles.find(a=>a.slot===selectedAngle)??selectedClip?.angles[0]??null;

  const takeReplay=()=>{
    if(!selectedClip||!selectedReplayAngle){setNotice('Choose a saved replay clip first.');return;}
    setProgramMode('REPLAY');
    channelRef.current?.postMessage({type:'REPLAY',clipId:selectedClip.id,url:selectedReplayAngle.url,speed,title:selectedClip.title,kind:selectedClip.kind,angle:selectedReplayAngle.label});
    setNotice('REPLAY ON AIR · '+selectedReplayAngle.label+' · '+speed+'×');
  };
  const returnLive=()=>{
    setProgramMode('LIVE');
    channelRef.current?.postMessage({type:'LIVE'});
    setNotice('Returned to LIVE.');
  };
  const openProgram=()=>{
    const base=window.location.pathname.startsWith('/replay')?'/replay':'';
    window.open(base+'/program/'+matchId,'ips-replay-program','popup=yes,width=1280,height=720');
  };

  const startAll=async()=>{for(let i=0;i<SLOT_COUNT;i++){if(slots[i].deviceId||devices[i])await startSlot(i);}};

  useEffect(()=>()=>{for(let i=0;i<SLOT_COUNT;i++)stopSlot(i);for(const c of clipsRef.current)for(const a of c.angles)URL.revokeObjectURL(a.url);},[stopSlot]);

  return <main className="replay-shell">
    <header className="replay-top workstation-top">
      <div className="replay-wordmark"><b>IPS</b><span>REPLAY ENGINE</span></div>
      <div className="match-ident"><small>{(match.tournaments as any)?.name||'IPS MATCH'}</small><strong>{shortTeam(match.home)} <i>v</i> {shortTeam(match.away)}</strong><span>{match.match_code} · {match.status}</span></div>
      <div className={'program-state '+programMode.toLowerCase()}><i/>{programMode==='LIVE'?'LIVE PROGRAM':'REPLAY ON AIR'}</div>
      <div className="head-links"><button onClick={openProgram}>OPEN IPS PROGRAM ↗</button><Link href="/director">DIRECTOR</Link></div>
    </header>

    <div className="status-strip"><span>SCORER MARKERS <b className={scorerLink==='LIVE'?'good':''}>{scorerLink}</b></span><span>PROGRAM LINK <b className={programPeer==='CONNECTED'?'good':''}>{programPeer}</b></span><span>BUFFER <b>45s LOCAL</b></span><span>{notice}</span></div>

    <section className="replay-grid">
      <div className="camera-column">
        <section className="replay-panel camera-panel">
          <header><div><span>LOCAL CAMERA INGEST</span><h2>Rolling multi-camera buffer</h2></div><div className="panel-actions"><button onClick={enablePermissions}>ENABLE CAMERAS</button><button className="primary" onClick={startAll}>START ALL</button></div></header>
          <div className="camera-grid">{slots.map((slot,i)=><article className={'camera-card '+slot.status.toLowerCase()} key={i}>
            <div className="camera-video"><video ref={el=>{videoRefs.current[i]=el;}} autoPlay muted playsInline/><span>CAM {i+1}</span><b>{slot.status}</b></div>
            <div className="camera-controls">
              <select value={slot.deviceId} onChange={e=>setSlots(prev=>prev.map((s,j)=>j===i?{...s,deviceId:e.target.value,label:devices.find(d=>d.deviceId===e.target.value)?.label||s.label}:s))}>
                <option value="">Choose camera…</option>{devices.map((d,j)=><option key={d.deviceId} value={d.deviceId}>{d.label||'Camera '+(j+1)}</option>)}
              </select>
              <button onClick={()=>slot.status==='LIVE'?stopSlot(i):void startSlot(i)}>{slot.status==='LIVE'?'STOP':'ARM'}</button>
              <button className={programCamera===i?'program-cam':''} onClick={()=>setProgramCamera(i)}>PROGRAM LIVE</button>
            </div>
            {slot.error&&<small className="camera-error">{slot.error}</small>}
          </article>)}</div>
        </section>

        <section className="replay-panel event-panel">
          <header><div><span>REPLAY MARKERS</span><h2>Scorer-linked + manual capture</h2></div></header>
          <div className="event-buttons">
            <button className="four" onClick={()=>markEvent('FOUR')}>4 <span>MARK FOUR</span></button>
            <button className="six" onClick={()=>markEvent('SIX')}>6 <span>MARK SIX</span></button>
            <button className="wicket" onClick={()=>markEvent('WICKET')}>W <span>MARK WICKET</span></button>
            <button onClick={()=>markEvent('MANUAL')}>● <span>MANUAL MARK</span></button>
          </div>
        </section>

        <section className="replay-panel clips-panel">
          <header><div><span>SAVED THIS SESSION</span><h2>Replay timeline</h2></div><b>{clips.length} CLIPS</b></header>
          <div className="clip-list">{clips.length?clips.map(c=><button className={selectedClip?.id===c.id?'active':''} key={c.id} onClick={()=>{setSelectedClipId(c.id);setSelectedAngle(c.angles[0]?.slot??0);}}>
            <em>{c.kind}</em><div><strong>{c.title}</strong><span>{formatClock(c.createdAt)} · {c.angles.length} angles · {c.source}</span></div><b>{c.durationSec}s</b>
          </button>):<p>No replay clips yet. FOUR, SIX and WICKET from the scorer will appear here automatically while this dashboard is open.</p>}</div>
        </section>
      </div>

      <aside className="replay-operation">
        <section className="replay-panel preview-panel">
          <header><div><span>REPLAY PREVIEW</span><h2>{selectedClip?.kind||'No clip selected'}</h2></div>{selectedReplayAngle&&<b>{selectedReplayAngle.label}</b>}</header>
          <div className="replay-preview">{selectedReplayAngle?<video key={selectedReplayAngle.url} src={selectedReplayAngle.url} controls playsInline/>:<div>Capture an event to preview replay.</div>}</div>
          {selectedClip&&<div className="angle-tabs">{selectedClip.angles.map(a=><button className={a.slot===selectedReplayAngle?.slot?'active':''} key={a.slot} onClick={()=>setSelectedAngle(a.slot)}>CAM {a.slot+1}</button>)}</div>}
          <div className="speed-row"><span>SPEED</span>{[1,.75,.5,.25].map(v=><button className={speed===v?'active':''} key={v} onClick={()=>setSpeed(v)}>{v}×</button>)}</div>
        </section>

        <section className="replay-panel take-panel">
          <header><span>PROGRAM CONTROL</span><b>{programMode}</b></header>
          <button className="take-replay" disabled={!selectedReplayAngle} onClick={takeReplay}>TAKE REPLAY</button>
          <button className="return-live" onClick={returnLive}>RETURN LIVE</button>
          <button className="abort-live" onClick={returnLive}>ABORT TO LIVE</button>
          <label><input type="checkbox" checked={autoReturn} onChange={e=>setAutoReturn(e.target.checked)}/> AUTO RETURN WHEN CLIP ENDS</label>
        </section>

        <section className="replay-panel workflow-panel">
          <header><span>ON-AIR WORKFLOW</span></header>
          <ol><li><b>1</b>Keep camera buffers armed.</li><li><b>2</b>Scorer hits 4 / 6 / W and IPS marks it.</li><li><b>3</b>Select the best camera and speed.</li><li><b>4</b>TAKE REPLAY → IPS PROGRAM.</li><li><b>5</b>Auto-return or RETURN LIVE.</li></ol>
        </section>
      </aside>
    </section>
  </main>;
}
