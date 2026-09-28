'use client';

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import Link from 'next/link';
import {createClient} from '@/lib/supabase/client';

type SlotState={slot:number;deviceId:string;label:string;status:'IDLE'|'LIVE'|'ERROR';error?:string;source?:'LOCAL'|'REMOTE';connectionId?:string};
type Chunk={blob:Blob;at:number};
type BufferState={header:Blob|null;chunks:Chunk[];mime:string;startedAt:number};
type ReplayAngle={slot:number;label:string;url:string;mime:string;blob:Blob;publicUrl?:string};
type ReplayClip={id:string;kind:'FOUR'|'SIX'|'WICKET'|'MANUAL';source:'SCORER'|'MANUAL';title:string;createdAt:number;durationSec:number;angles:ReplayAngle[]};
type CameraSession={id:string;match_id:string;pin:string;realtime_key:string;expires_at:string;active:boolean};
type RemoteCamera={connectionId:string;channelNo:number;label:string;quality?:string;lastSeen:number;status:'READY'|'LIVE'|'ERROR'};

const SLOT_COUNT=4;
const BUFFER_MS=45000;
const REMOTE_RTC_CONFIG:RTCConfiguration={
  iceServers:[
    {urls:'stun:stun.l.google.com:19302'},
    {urls:'stun:stun1.l.google.com:19302'}
  ]
};

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
  const [readyClipId,setReadyClipId]=useState<string|null>(null);
  const [replayTakeBusy,setReplayTakeBusy]=useState(false);
  const [replayTakeError,setReplayTakeError]=useState<string|null>(null);
  const [cameraSession,setCameraSession]=useState<CameraSession|null>(null);
  const [remoteLink,setRemoteLink]=useState<'CONNECTING'|'READY'|'ERROR'>('CONNECTING');
  const [remoteCameras,setRemoteCameras]=useState<(RemoteCamera|null)[]>(()=>Array(SLOT_COUNT).fill(null));

  const streamsRef=useRef<(MediaStream|null)[]>(Array(SLOT_COUNT).fill(null));
  const recordersRef=useRef<(MediaRecorder|null)[]>(Array(SLOT_COUNT).fill(null));
  const buffersRef=useRef<BufferState[]>(Array.from({length:SLOT_COUNT},()=>({header:null,chunks:[],mime:'',startedAt:0})));
  const videoRefs=useRef<(HTMLVideoElement|null)[]>([]);
  const channelRef=useRef<BroadcastChannel|null>(null);
  const pcRef=useRef<RTCPeerConnection|null>(null);
  const seenEventsRef=useRef(new Set<string>());
  const clipsRef=useRef<ReplayClip[]>([]);
  const previewVideoRef=useRef<HTMLVideoElement|null>(null);
  const remoteChannelRef=useRef<any>(null);
  const remotePeersRef=useRef<Map<string,RTCPeerConnection>>(new Map());
  const remoteCamerasRef=useRef<(RemoteCamera|null)[]>(Array(SLOT_COUNT).fill(null));
  const slotsRef=useRef<SlotState[]>(slots);
  const viewerIdRef=useRef(typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():'viewer-'+Date.now());

  useEffect(()=>{clipsRef.current=clips;},[clips]);
  useEffect(()=>{remoteCamerasRef.current=remoteCameras;},[remoteCameras]);
  useEffect(()=>{slotsRef.current=slots;},[slots]);

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
    setSlots(prev=>prev.map((s,i)=>i===index?{...s,status:'IDLE',error:undefined,source:undefined,connectionId:undefined}:s));
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
      setSlots(prev=>prev.map((s,i)=>i===index?{...s,status:'LIVE',label,error:undefined,source:'LOCAL',connectionId:undefined}:s));
      setNotice('CAM '+(index+1)+' rolling buffer is live.');
    }catch(e:any){
      setSlots(prev=>prev.map((s,i)=>i===index?{...s,status:'ERROR',error:e?.message||'Camera unavailable'}:s));
    }
  },[slots,stopSlot]);

  const attachRemoteStream=useCallback(async(index:number,stream:MediaStream,label:string,connectionId:string)=>{
    const previousRecorder=recordersRef.current[index];
    if(previousRecorder&&previousRecorder.state!=='inactive'){try{previousRecorder.stop();}catch{}}
    recordersRef.current[index]=null;

    const previousStream=streamsRef.current[index];
    if(previousStream&&previousStream!==stream){
      previousStream.getTracks().forEach(t=>{try{t.stop();}catch{}});
    }
    streamsRef.current[index]=stream;

    const video=videoRefs.current[index];
    if(video){
      video.srcObject=stream;
      await video.play().catch(()=>{});
    }

    try{
      const mime=supportedMime();
      const recorder=new MediaRecorder(stream,mime?{mimeType:mime,videoBitsPerSecond:5000000}:undefined);
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
      recorder.onerror=()=>setSlots(prev=>prev.map((slot,i)=>i===index?{...slot,status:'ERROR',error:'Remote recorder error'}:slot));
      recorder.start(500);
      recordersRef.current[index]=recorder;
      setSlots(prev=>prev.map((slot,i)=>i===index?{
        ...slot,
        deviceId:'',
        label,
        status:'LIVE',
        error:undefined,
        source:'REMOTE',
        connectionId
      }:slot));
      setRemoteCameras(prev=>prev.map((cam,i)=>i===index&&cam?{...cam,status:'LIVE'}:cam));
      setNotice('REMOTE CAM '+(index+1)+' is live and recording into the central 45s buffer.');
    }catch(e:any){
      setSlots(prev=>prev.map((slot,i)=>i===index?{...slot,status:'ERROR',error:e?.message||'Remote recorder unavailable',source:'REMOTE',connectionId}:slot));
    }
  },[]);

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
      angles.push({slot:i,label:slots[i]?.label||'CAM '+(i+1),url:URL.createObjectURL(blob),mime:blob.type,blob});
    }
    if(!angles.length){setNotice('Replay marker received, but no rolling camera buffer is armed.');return;}
    const clip:ReplayClip={id:crypto.randomUUID(),kind,source,title,createdAt:now,durationSec:preRollSec,angles};
    setClips(prev=>{
      const next=[clip,...prev];
      for(const old of next.slice(24)){
        for(const angle of old.angles){try{URL.revokeObjectURL(angle.url);}catch{}}
      }
      return next.slice(0,24);
    });
    setSelectedClipId(clip.id);
    setSelectedAngle(angles[0].slot);
    setReadyClipId(clip.id);
    setReplayTakeError(null);
    setNotice('REPLAY READY · '+kind+' · '+angles.length+' angle'+(angles.length===1?'':'s')+'.');
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

  const loadCameraSession=useCallback(async(rotate=false)=>{
    setRemoteLink('CONNECTING');
    const {data,error}=await supabase.rpc('ips_camera_session_get_or_create',{p_match_id:matchId,p_rotate:rotate});
    if(error){
      setRemoteLink('ERROR');
      setNotice('Remote camera session failed: '+error.message);
      return;
    }
    setCameraSession(data as CameraSession);
  },[supabase,matchId]);

  useEffect(()=>{void loadCameraSession(false);},[loadCameraSession]);

  useEffect(()=>{
    const session=cameraSession;
    if(!session?.realtime_key)return;
    const viewerId=viewerIdRef.current;
    let alive=true;
    const channel=supabase.channel('ips-camera-'+session.realtime_key)
      .on('broadcast',{event:'camera-ready'},({payload}:any)=>{
        if(!alive)return;
        const p=payload||{};
        const channelNo=Number(p.channelNo);
        if(!p.connectionId||channelNo<1||channelNo>SLOT_COUNT)return;
        const index=channelNo-1;
        const existing=remoteCamerasRef.current[index];
        if(existing&&existing.connectionId!==p.connectionId){
          const oldPeer=remotePeersRef.current.get(existing.connectionId);
          if(oldPeer){try{oldPeer.close();}catch{}remotePeersRef.current.delete(existing.connectionId);}
          if(slotsRef.current[index]?.source==='REMOTE'&&slotsRef.current[index]?.connectionId===existing.connectionId)stopSlot(index);
        }
        const info:RemoteCamera={
          connectionId:p.connectionId,
          channelNo,
          label:p.label||('CAM '+channelNo),
          quality:p.quality,
          lastSeen:Date.now(),
          status:existing?.connectionId===p.connectionId&&existing.status==='LIVE'?'LIVE':'READY'
        };
        setRemoteCameras(prev=>prev.map((cam,i)=>i===index?info:cam));
        void channel.send({type:'broadcast',event:'control-ready',payload:{viewerId,connectionId:p.connectionId,channelNo}});
      })
      .on('broadcast',{event:'offer'},async({payload}:any)=>{
        const p=payload||{};
        if(p.viewerId!==viewerId||!p.connectionId||!p.sdp)return;
        const channelNo=Number(p.channelNo);
        if(channelNo<1||channelNo>SLOT_COUNT)return;
        const index=channelNo-1;

        const current=remotePeersRef.current.get(p.connectionId);
        if(current){try{current.close();}catch{}}
        const pc=new RTCPeerConnection(REMOTE_RTC_CONFIG);
        remotePeersRef.current.set(p.connectionId,pc);

        pc.ontrack=e=>{
          const stream=e.streams?.[0]??new MediaStream([e.track]);
          void attachRemoteStream(index,stream,p.label||('CAM '+channelNo),p.connectionId);
        };
        pc.onicecandidate=e=>{
          if(e.candidate)void channel.send({type:'broadcast',event:'control-ice',payload:{
            viewerId,
            connectionId:p.connectionId,
            channelNo,
            candidate:e.candidate.toJSON()
          }});
        };
        pc.onconnectionstatechange=()=>{
          if(pc.connectionState==='connected'){
            setRemoteCameras(prev=>prev.map((cam,i)=>i===index&&cam?.connectionId===p.connectionId?{...cam,status:'LIVE',lastSeen:Date.now()}:cam));
          }
          if(pc.connectionState==='failed'){
            setRemoteCameras(prev=>prev.map((cam,i)=>i===index&&cam?.connectionId===p.connectionId?{...cam,status:'ERROR'}:cam));
          }
        };
        await pc.setRemoteDescription(p.sdp).catch(()=>{});
        const answer=await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await channel.send({type:'broadcast',event:'answer',payload:{
          viewerId,
          connectionId:p.connectionId,
          channelNo,
          sdp:answer
        }});
      })
      .on('broadcast',{event:'camera-ice'},async({payload}:any)=>{
        const p=payload||{};
        if(p.viewerId!==viewerId||!p.connectionId||!p.candidate)return;
        const pc=remotePeersRef.current.get(p.connectionId);
        if(pc)await pc.addIceCandidate(p.candidate).catch(()=>{});
      })
      .on('broadcast',{event:'camera-offline'},({payload}:any)=>{
        const p=payload||{};
        const channelNo=Number(p.channelNo);
        if(channelNo<1||channelNo>SLOT_COUNT)return;
        const index=channelNo-1;
        const pc=remotePeersRef.current.get(p.connectionId);
        if(pc){try{pc.close();}catch{}remotePeersRef.current.delete(p.connectionId);}
        if(slotsRef.current[index]?.source==='REMOTE'&&slotsRef.current[index]?.connectionId===p.connectionId)stopSlot(index);
        setRemoteCameras(prev=>prev.map((cam,i)=>i===index&&cam?.connectionId===p.connectionId?null:cam));
      })
      .subscribe((status:string)=>{
        if(status==='SUBSCRIBED'){
          setRemoteLink('READY');
          void channel.send({type:'broadcast',event:'control-ready',payload:{viewerId}});
        }
        if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){
          setRemoteLink('ERROR');
        }
      });

    remoteChannelRef.current=channel;
    const hello=window.setInterval(()=>void channel.send({type:'broadcast',event:'control-ready',payload:{viewerId}}),4000);
    const stale=window.setInterval(()=>{
      const now=Date.now();
      remoteCamerasRef.current.forEach((cam,index)=>{
        if(!cam||now-cam.lastSeen<11000)return;
        const pc=remotePeersRef.current.get(cam.connectionId);
        if(pc){try{pc.close();}catch{}remotePeersRef.current.delete(cam.connectionId);}
        if(slotsRef.current[index]?.source==='REMOTE'&&slotsRef.current[index]?.connectionId===cam.connectionId)stopSlot(index);
        setRemoteCameras(prev=>prev.map((value,i)=>i===index?null:value));
      });
    },3000);

    return()=>{
      alive=false;
      window.clearInterval(hello);
      window.clearInterval(stale);
      for(const pc of remotePeersRef.current.values()){try{pc.close();}catch{}}
      remotePeersRef.current.clear();
      remoteChannelRef.current=null;
      void supabase.removeChannel(channel);
    };
  },[cameraSession?.realtime_key,supabase,attachRemoteStream,stopSlot]);

  const openCameraPublisher=()=>{
    const base=window.location.pathname.startsWith('/replay')?'/replay':'';
    window.open(base+'/camera','_blank','noopener,noreferrer');
  };

  const selectedClip=clips.find(c=>c.id===selectedClipId)??clips[0]??null;
  const selectedReplayAngle=selectedClip?.angles.find(a=>a.slot===selectedAngle)??selectedClip?.angles[0]??null;
  const readyClip=clips.find(c=>c.id===readyClipId)??null;

  useEffect(()=>{
    const video=previewVideoRef.current;
    if(!video)return;
    video.defaultPlaybackRate=speed;
    video.playbackRate=speed;
  },[speed,selectedReplayAngle?.url]);

  const replayStoragePath=(clip:ReplayClip,angle:ReplayAngle)=>{
    const ext=angle.mime.startsWith('video/mp4')?'mp4':'webm';
    return matchId+'/'+clip.id+'/cam-'+(angle.slot+1)+'.'+ext;
  };

  const releaseClipMemory=(clip:ReplayClip)=>{
    for(const angle of clip.angles){
      try{URL.revokeObjectURL(angle.url);}catch{}
    }
  };

  const deleteClip=async(clip:ReplayClip)=>{
    if(programMode==='REPLAY'){
      setNotice('Return LIVE before deleting replay clips.');
      return;
    }
    const remotePaths=clip.angles.filter(a=>a.publicUrl).map(a=>replayStoragePath(clip,a));
    if(remotePaths.length){
      const {error}=await supabase.storage.from('ips-replay').remove(remotePaths);
      if(error)setNotice('Replay deleted locally; storage cleanup failed: '+error.message);
    }
    releaseClipMemory(clip);
    const remaining=clips.filter(c=>c.id!==clip.id);
    setClips(remaining);
    if(selectedClipId===clip.id){
      setSelectedClipId(remaining[0]?.id??null);
      setSelectedAngle(remaining[0]?.angles[0]?.slot??0);
    }
    if(readyClipId===clip.id)setReadyClipId(null);
    setNotice('Replay clip deleted and memory released.');
  };

  const clearAllClips=async()=>{
    if(programMode==='REPLAY'){
      setNotice('Return LIVE before clearing replay clips.');
      return;
    }
    const current=[...clipsRef.current];
    if(!current.length)return;
    const remotePaths=current.flatMap(c=>c.angles.filter(a=>a.publicUrl).map(a=>replayStoragePath(c,a)));
    if(remotePaths.length){
      const {error}=await supabase.storage.from('ips-replay').remove(remotePaths);
      if(error)setNotice('Local clips cleared; some stored replay files could not be removed: '+error.message);
    }
    for(const clip of current)releaseClipMemory(clip);
    setClips([]);
    setSelectedClipId(null);
    setSelectedAngle(0);
    setReadyClipId(null);
    setNotice('All replay clips cleared and browser memory released.');
  };

  const ensureReplayUrl=async(clip:ReplayClip,angle:ReplayAngle)=>{
    if(angle.publicUrl)return angle.publicUrl;
    const isMp4=angle.mime.startsWith('video/mp4');
    const ext=isMp4?'mp4':'webm';
    const contentType=isMp4?'video/mp4':'video/webm';
    const storagePath=matchId+'/'+clip.id+'/cam-'+(angle.slot+1)+'.'+ext;
    const {error:uploadError}=await supabase.storage.from('ips-replay').upload(storagePath,angle.blob,{contentType,upsert:false,cacheControl:'3600'});
    if(uploadError)throw uploadError;
    const {data:publicData}=supabase.storage.from('ips-replay').getPublicUrl(storagePath);
    const publicUrl=publicData.publicUrl;
    setClips(prev=>prev.map(c=>c.id===clip.id?{...c,angles:c.angles.map(a=>a.slot===angle.slot?{...a,publicUrl}:a)}:c));
    return publicUrl;
  };

  const takeReplay=async(clipOverride?:ReplayClip,angleOverride?:ReplayAngle)=>{
    const clip=clipOverride??selectedClip;
    const angle=angleOverride??selectedReplayAngle;
    if(!clip||!angle){setNotice('Choose a saved replay clip first.');return;}
    setReplayTakeBusy(true);
    setReplayTakeError(null);
    try{
      setNotice('Preparing replay for PRISM overlay…');
      const videoUrl=await ensureReplayUrl(clip,angle);
      const stingMs=1100;
      const durationMs=Math.min(120000,Math.max(2500,Math.round(stingMs+(clip.durationSec*1000/Math.max(speed,.25))+800)));
      const {error:commandError}=await supabase.rpc('ips_broadcast_program_command',{
        p_match_id:matchId,
        p_command:{
          type:'TAKE',
          variantKey:'replay.fullscreen',
          durationMs,
          payload:{replay:{
            videoUrl,
            speed,
            title:clip.title,
            kind:clip.kind,
            angle:angle.label,
            clipId:clip.id,
            durationSec:clip.durationSec,
            stingMs
          }}
        }
      });
      if(commandError)throw commandError;
      setProgramMode('REPLAY');
      setReadyClipId(null);
      channelRef.current?.postMessage({type:'REPLAY',clipId:clip.id,url:angle.url,speed,title:clip.title,kind:clip.kind,angle:angle.label});
      setNotice('REPLAY ON AIR · '+angle.label+' · '+speed+'×');
      window.setTimeout(()=>setProgramMode('LIVE'),durationMs);
    }catch(e:any){
      const message=e?.message||'Replay could not be taken to air.';
      setReplayTakeError(message);
      setNotice('Replay take failed: '+message);
    }finally{
      setReplayTakeBusy(false);
    }
  };
  const returnLive=async()=>{
    setProgramMode('LIVE');
    channelRef.current?.postMessage({type:'LIVE'});
    try{await supabase.rpc('ips_broadcast_program_command',{p_match_id:matchId,p_command:{type:'CLEAR_TEMPORARY'}});}catch{}
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

    <div className="status-strip"><span>SCORER MARKERS <b className={scorerLink==='LIVE'?'good':''}>{scorerLink}</b></span><span>REMOTE CAMERAS <b className={remoteLink==='READY'?'good':''}>{remoteLink}</b></span><span>PROGRAM LINK <b className={programPeer==='CONNECTED'?'good':''}>{programPeer}</b></span><span>BUFFER <b>45s CENTRAL</b></span><span>{notice}</span></div>

    <section className="replay-grid">
      <div className="camera-column">
        <section className="replay-panel camera-panel">
          <header><div><span>CENTRAL CAMERA INGEST</span><h2>Remote phones + local fallback</h2></div><div className="panel-actions"><button onClick={openCameraPublisher}>OPEN CAMERA PAGE ↗</button><button onClick={enablePermissions}>LOCAL CAMERAS</button><button className="primary" onClick={startAll}>START LOCAL</button></div></header>
          <div className="remote-camera-session">
            <div><span>CAMERA PIN</span><strong>{cameraSession?.pin||'—— ——'}</strong><small>{cameraSession?'Valid until '+new Date(cameraSession.expires_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'Creating secure camera session…'}</small></div>
            <div><span>CONNECTED</span><strong>{remoteCameras.filter(Boolean).length}/4</strong><small>Phones only need this PIN + channel number.</small></div>
            <button disabled={!cameraSession} onClick={()=>void loadCameraSession(true)}>ROTATE PIN</button>
          </div>
          <div className="camera-grid">{slots.map((slot,i)=><article className={'camera-card '+slot.status.toLowerCase()} key={i}>
            <div className="camera-video"><video ref={el=>{videoRefs.current[i]=el;}} autoPlay muted playsInline/><span>CAM {i+1}</span><b>{slot.status}</b></div>
            <div className="camera-controls">
              {slot.source==='REMOTE'?<div className="remote-source-label"><b>REMOTE PHONE</b><span>{remoteCameras[i]?.quality||'WEBRTC'} · {remoteCameras[i]?.label||slot.label}</span></div>:<select value={slot.deviceId} onChange={e=>setSlots(prev=>prev.map((s,j)=>j===i?{...s,deviceId:e.target.value,label:devices.find(d=>d.deviceId===e.target.value)?.label||s.label}:s))}>
                <option value="">Choose local camera…</option>{devices.map((d,j)=><option key={d.deviceId} value={d.deviceId}>{d.label||'Camera '+(j+1)}</option>)}
              </select>}
              <button disabled={slot.source==='REMOTE'} onClick={()=>slot.status==='LIVE'?stopSlot(i):void startSlot(i)}>{slot.source==='REMOTE'?'REMOTE':slot.status==='LIVE'?'STOP':'ARM LOCAL'}</button>
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
          <header><div><span>SAVED THIS SESSION</span><h2>Replay timeline</h2></div><div className="clips-head-actions"><b>{clips.length} CLIPS</b><button disabled={!clips.length||programMode==='REPLAY'} onClick={()=>void clearAllClips()}>CLEAR ALL</button></div></header>
          <div className="clip-list">{clips.length?clips.map(c=><div className={'clip-row '+(selectedClip?.id===c.id?'active':'')} key={c.id}>
            <button className="clip-select" onClick={()=>{setSelectedClipId(c.id);setSelectedAngle(c.angles[0]?.slot??0);}}>
              <em>{c.kind}</em><div><strong>{c.title}</strong><span>{formatClock(c.createdAt)} · {c.angles.length} angles · {c.source}</span></div><b>{c.durationSec}s</b>
            </button>
            <button className="clip-delete" disabled={programMode==='REPLAY'} onClick={()=>void deleteClip(c)}>DELETE</button>
          </div>):<p>No replay clips yet. FOUR, SIX and WICKET from the scorer will appear here automatically while this dashboard is open.</p>}</div>
        </section>
      </div>

      <aside className="replay-operation">
        <section className="replay-panel preview-panel">
          <header><div><span>REPLAY PREVIEW</span><h2>{selectedClip?.kind||'No clip selected'}</h2></div>{selectedReplayAngle&&<b>{selectedReplayAngle.label}</b>}</header>
          <div className="replay-preview">{selectedReplayAngle?<video ref={previewVideoRef} key={selectedReplayAngle.url} src={selectedReplayAngle.url} controls playsInline onLoadedMetadata={e=>{e.currentTarget.defaultPlaybackRate=speed;e.currentTarget.playbackRate=speed;}}/>:<div>Capture an event to preview replay.</div>}</div>
          {selectedClip&&<div className="angle-tabs">{selectedClip.angles.map(a=><button className={a.slot===selectedReplayAngle?.slot?'active':''} key={a.slot} onClick={()=>setSelectedAngle(a.slot)}>CAM {a.slot+1}</button>)}</div>}
          <div className="speed-row"><span>SPEED</span>{[1,.75,.5,.25].map(v=><button className={speed===v?'active':''} key={v} onClick={()=>{setSpeed(v);if(previewVideoRef.current){previewVideoRef.current.defaultPlaybackRate=v;previewVideoRef.current.playbackRate=v;}}}>{v}×</button>)}</div>
        </section>

        <section className="replay-panel take-panel">
          <header><span>PROGRAM CONTROL</span><b>{programMode}</b></header>
          <button className="take-replay" disabled={!selectedReplayAngle||replayTakeBusy} onClick={()=>void takeReplay()}>{replayTakeBusy?'PREPARING…':'TAKE REPLAY'}</button>
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

    {readyClip&&<div className="replay-ready-backdrop">
      <section className="replay-ready-card">
        <header><div><span>SCORER EVENT</span><h2>REPLAY READY</h2></div><b className={'ready-kind '+readyClip.kind.toLowerCase()}>{readyClip.kind}</b></header>
        <div className="ready-summary"><strong>{readyClip.title}</strong><span>{readyClip.angles.length} ANGLE{readyClip.angles.length===1?'':'S'} · {readyClip.durationSec}s BUFFER</span></div>
        <div className="ready-angle-row">{readyClip.angles.map(a=><button key={a.slot} className={selectedAngle===a.slot?'active':''} onClick={()=>{setSelectedClipId(readyClip.id);setSelectedAngle(a.slot);}}>CAM {a.slot+1}</button>)}</div>
        <div className="ready-speed-row"><span>SPEED</span>{[1,.75,.5,.25].map(v=><button key={v} className={speed===v?'active':''} onClick={()=>{setSpeed(v);if(previewVideoRef.current){previewVideoRef.current.defaultPlaybackRate=v;previewVideoRef.current.playbackRate=v;}}}>{v}×</button>)}</div>
        {replayTakeError&&<p className="replay-ready-error">{replayTakeError}</p>}
        <div className="ready-actions">
          <button className="dismiss" onClick={()=>setReadyClipId(null)}>KEEP FOR LATER</button>
          <button className="manual" onClick={()=>{setReadyClipId(null);setSelectedClipId(readyClip.id);setNotice('Manual replay setup: choose angle/speed or create a new manual marker.');}}>MANUAL SET</button>
          <button className="take" disabled={replayTakeBusy} onClick={()=>{
            setSelectedClipId(readyClip.id);
            const modalAngle=readyClip.angles.find(a=>a.slot===selectedAngle)??readyClip.angles[0];
            void takeReplay(readyClip,modalAngle);
          }}>{replayTakeBusy?'PREPARING…':'TAKE REPLAY'}</button>
        </div>
      </section>
    </div>}
  </main>;
}
