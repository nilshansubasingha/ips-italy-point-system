'use client';

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import Link from 'next/link';
import {createClient} from '@/lib/supabase/client';
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication
} from 'livekit-client';

type SlotState={slot:number;deviceId:string;label:string;status:'IDLE'|'LIVE'|'ERROR';error?:string;source?:'LOCAL'|'REMOTE';connectionId?:string};
type Chunk={blob:Blob;at:number};
type BufferState={header:Blob|null;chunks:Chunk[];mime:string;startedAt:number};
type ReplayAngle={slot:number;label:string;url:string;mime:string;blob:Blob;publicUrl?:string};
type ReplayClip={id:string;kind:'FOUR'|'SIX'|'WICKET'|'MANUAL';source:'SCORER'|'MANUAL';title:string;createdAt:number;durationSec:number;angles:ReplayAngle[]};
type CameraSession={id:string;match_id:string;pin:string;realtime_key:string;expires_at:string;active:boolean};
type RemoteCamera={connectionId:string;channelNo:number;label:string;quality?:string;lastSeen:number;status:'READY'|'LIVE'|'ERROR'};
type BallMarker={id:string;marked_at:string;linked_at?:string|null;scoring_event_id?:string|null;sequence_no?:number|null;over_no?:number|null;ball_no?:number|null;delivery_label?:string|null;score_state?:any};

const SLOT_COUNT=4;
const BUFFER_MS=45000;
function recorderMimeCandidates(){
  if(typeof MediaRecorder==='undefined')return [] as string[];
  const choices=['video/webm;codecs=vp8','video/webm','video/mp4',''];
  return choices.filter(mime=>!mime||MediaRecorder.isTypeSupported(mime));
}

async function waitForIceGathering(pc:RTCPeerConnection){
  if(pc.iceGatheringState==='complete')return;
  await new Promise<void>(resolve=>{
    const done=()=>{
      if(pc.iceGatheringState!=='complete')return;
      pc.removeEventListener('icegatheringstatechange',done);
      resolve();
    };
    pc.addEventListener('icegatheringstatechange',done);
    window.setTimeout(()=>{
      pc.removeEventListener('icegatheringstatechange',done);
      resolve();
    },2500);
  });
}

async function waitForVideoReady(stream:MediaStream,video?:HTMLVideoElement|null){
  const track=stream.getVideoTracks()[0];
  if(!track)throw new Error('No live video track is available for recording.');
  if(track.readyState==='ended')throw new Error('Video track ended before recording started.');
  if(!track.muted&&(!video||video.readyState>=2))return;

  await new Promise<void>(resolve=>{
    let finished=false;
    const done=()=>{
      if(finished)return;
      finished=true;
      track.removeEventListener('unmute',done);
      video?.removeEventListener('loadeddata',done);
      resolve();
    };
    track.addEventListener('unmute',done,{once:true});
    video?.addEventListener('loadeddata',done,{once:true});
    window.setTimeout(done,3500);
  });

  if(stream.getVideoTracks()[0]?.readyState==='ended')throw new Error('Video track ended before MediaRecorder could start.');
}

function startRollingRecorder(
  stream:MediaStream,
  buffer:BufferState,
  onRecorderError:(message:string)=>void
){
  if(typeof MediaRecorder==='undefined')throw new Error('MediaRecorder is not supported by this browser.');
  let lastError:any=null;

  for(const mime of recorderMimeCandidates()){
    let recorder:MediaRecorder|null=null;
    try{
      recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);
      buffer.mime=recorder.mimeType||mime||'video/webm';
      recorder.ondataavailable=e=>{
        if(!e.data?.size)return;
        const now=Date.now();
        if(!buffer.header)buffer.header=e.data;
        buffer.chunks.push({blob:e.data,at:now});
        const cutoff=now-BUFFER_MS;
        buffer.chunks=buffer.chunks.filter((c,j)=>j===0||c.at>=cutoff);
      };
      recorder.onerror=(event:any)=>{
        const message=event?.error?.message||event?.name||'MediaRecorder error';
        onRecorderError(message);
      };
      recorder.start(1000);
      if(recorder.state!=='recording')throw new Error('Recorder did not enter recording state.');
      return recorder;
    }catch(e){
      lastError=e;
      if(recorder&&recorder.state!=='inactive'){
        try{recorder.stop();}catch{}
      }
    }
  }

  throw lastError??new Error('No compatible MediaRecorder format could be started.');
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
  const [recording,setRecording]=useState<boolean[]>(()=>Array(SLOT_COUNT).fill(false));
  const [ballMarkers,setBallMarkers]=useState<BallMarker[]>([]);
  const [markingBall,setMarkingBall]=useState(false);

  const streamsRef=useRef<(MediaStream|null)[]>(Array(SLOT_COUNT).fill(null));
  const recordersRef=useRef<(MediaRecorder|null)[]>(Array(SLOT_COUNT).fill(null));
  const buffersRef=useRef<BufferState[]>(Array.from({length:SLOT_COUNT},()=>({header:null,chunks:[],mime:'',startedAt:0})));
  const videoRefs=useRef<(HTMLVideoElement|null)[]>([]);
  const channelRef=useRef<BroadcastChannel|null>(null);
  const pcRef=useRef<RTCPeerConnection|null>(null);
  const seenEventsRef=useRef(new Set<string>());
  const clipsRef=useRef<ReplayClip[]>([]);
  const previewVideoRef=useRef<HTMLVideoElement|null>(null);
  const livekitRoomRef=useRef<Room|null>(null);
  const remoteCamerasRef=useRef<(RemoteCamera|null)[]>(Array(SLOT_COUNT).fill(null));
  const recordingRef=useRef<boolean[]>(Array(SLOT_COUNT).fill(false));

  useEffect(()=>{clipsRef.current=clips;},[clips]);
  useEffect(()=>{remoteCamerasRef.current=remoteCameras;},[remoteCameras]);
  useEffect(()=>{recordingRef.current=recording;},[recording]);

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

  const stopRecording=useCallback((index:number,quiet=false)=>{
    const recorder=recordersRef.current[index];
    if(recorder&&recorder.state!=='inactive'){try{recorder.stop();}catch{}}
    recordersRef.current[index]=null;
    recordingRef.current[index]=false;
    setRecording(prev=>prev.map((value,i)=>i===index?false:value));
    if(!quiet)setNotice('CAM '+(index+1)+' recording stopped. Live preview remains connected.');
  },[]);

  const startRecording=useCallback(async(index:number,quiet=false)=>{
    const stream=streamsRef.current[index];
    if(!stream){
      if(!quiet)setNotice('CAM '+(index+1)+' has no live video to record.');
      return false;
    }
    const existing=recordersRef.current[index];
    if(existing&&existing.state==='recording'){
      recordingRef.current[index]=true;
      setRecording(prev=>prev.map((value,i)=>i===index?true:value));
      return true;
    }
    try{
      const video=videoRefs.current[index];
      await waitForVideoReady(stream,video);
      const buffer:BufferState={header:null,chunks:[],mime:'',startedAt:Date.now()};
      buffersRef.current[index]=buffer;
      const recorder=startRollingRecorder(stream,buffer,message=>{
        recordingRef.current[index]=false;
        setRecording(prev=>prev.map((value,i)=>i===index?false:value));
        setSlots(prev=>prev.map((slot,i)=>i===index?{...slot,status:'LIVE',error:'BUFFER: '+message}:slot));
      });
      recordersRef.current[index]=recorder;
      recordingRef.current[index]=true;
      setRecording(prev=>prev.map((value,i)=>i===index?true:value));
      setSlots(prev=>prev.map((slot,i)=>i===index?{...slot,error:undefined}:slot));
      if(!quiet)setNotice('CAM '+(index+1)+' central 45s recording buffer started.');
      return true;
    }catch(e:any){
      recordingRef.current[index]=false;
      setRecording(prev=>prev.map((value,i)=>i===index?false:value));
      setSlots(prev=>prev.map((slot,i)=>i===index?{...slot,status:'LIVE',error:'BUFFER UNAVAILABLE: '+(e?.message||'MediaRecorder could not start')}:slot));
      if(!quiet)setNotice('CAM '+(index+1)+' video is live, but recording could not start.');
      return false;
    }
  },[]);

  const stopSlot=useCallback((index:number)=>{
    stopRecording(index,true);
    streamsRef.current[index]?.getTracks().forEach(t=>t.stop());
    streamsRef.current[index]=null;
    const video=videoRefs.current[index];if(video)video.srcObject=null;
    buffersRef.current[index]={header:null,chunks:[],mime:'',startedAt:0};
    setSlots(prev=>prev.map((s,i)=>i===index?{...s,status:'IDLE',error:undefined,source:undefined,connectionId:undefined}:s));
  },[stopRecording]);

  const startSlot=useCallback(async(index:number)=>{
    stopSlot(index);
    const selected=slots[index]?.deviceId;
    try{
      const stream=await navigator.mediaDevices.getUserMedia({video:selected?{deviceId:{exact:selected},width:{ideal:1920},height:{ideal:1080},frameRate:{ideal:30}}:{width:{ideal:1920},height:{ideal:1080}},audio:false});
      streamsRef.current[index]=stream;
      const video=videoRefs.current[index];
      if(video){
        video.srcObject=stream;
        await video.play().catch(()=>{});
      }
      await waitForVideoReady(stream,video);
      const label=stream.getVideoTracks()[0]?.label||slots[index]?.label||'CAM '+(index+1);
      setSlots(prev=>prev.map((s,i)=>i===index?{...s,status:'LIVE',label,error:undefined,source:'LOCAL',connectionId:undefined}:s));
      setNotice('CAM '+(index+1)+' local video is live. Press START REC to arm its replay buffer.');
    }catch(e:any){
      setSlots(prev=>prev.map((s,i)=>i===index?{...s,status:'ERROR',error:e?.message||'Camera unavailable'}:s));
    }
  },[slots,stopSlot]);

  const attachRemoteStream=useCallback(async(index:number,stream:MediaStream,label:string,connectionId:string)=>{
    const resumeRecording=recordingRef.current[index];
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
      video.muted=true;
      video.playsInline=true;
      await video.play().catch(()=>{});
    }

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
    setNotice('REMOTE CAM '+(index+1)+' video is live. Press START REC or use START ALL RECORDING.');

    if(resumeRecording){
      await startRecording(index,true);
      setNotice('REMOTE CAM '+(index+1)+' reconnected and its recording buffer resumed.');
    }
  },[startRecording]);

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

  const loadBallMarkers=useCallback(async()=>{
    const {data,error}=await supabase.rpc('ips_replay_ball_markers',{p_match_id:matchId});
    if(!error&&Array.isArray(data))setBallMarkers(data as BallMarker[]);
  },[supabase,matchId]);

  useEffect(()=>{void loadBallMarkers();},[loadBallMarkers]);

  const markBall=useCallback(async()=>{
    if(markingBall)return;
    setMarkingBall(true);
    try{
      const {data,error}=await supabase.rpc('ips_replay_mark_ball',{p_match_id:matchId});
      if(error)throw error;
      const marker=data as BallMarker;
      setBallMarkers(prev=>[marker,...prev.filter(m=>m.id!==marker.id)].slice(0,100));
      setNotice('BALL TIMESTAMP '+formatClock(new Date(marker.marked_at).getTime())+' saved — waiting for the scorer delivery to attach score data.');
    }catch(e:any){
      setNotice('Ball timestamp failed: '+(e?.message||'unknown error'));
    }finally{
      setMarkingBall(false);
    }
  },[supabase,matchId,markingBall]);

  useEffect(()=>{
    const ch=supabase.channel('ips-replay-score-'+matchId)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'match_scoring_events',filter:'match_id=eq.'+matchId},payload=>{
        const row=payload.new as any;
        if(!row?.id||seenEventsRef.current.has(row.id))return;
        seenEventsRef.current.add(row.id);
        if(row.event_type!=='DELIVERY')return;
        void supabase.rpc('ips_replay_link_latest_pending_marker',{p_match_id:matchId,p_event_id:row.id}).then(({data,error})=>{
          if(error||!data)return;
          const marker=data as BallMarker;
          setBallMarkers(prev=>[marker,...prev.filter(m=>m.id!==marker.id)].slice(0,100));
          const state=marker.score_state||{};
          setNotice('BALL '+String(marker.over_no??'—')+'.'+String(marker.ball_no??'—')+' linked · '+String(marker.delivery_label||'DELIVERY')+' · '+String(state.runs??'—')+'/'+String(state.wickets??'—'));
        });
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
    let cancelled=false;
    const base=window.location.pathname.startsWith('/replay')?'/replay':'';

    const cameraMeta=(participant:RemoteParticipant)=>{
      try{
        const parsed=JSON.parse(participant.metadata||'{}');
        const channelNo=Number(parsed.channelNo);
        if(parsed.role!=='camera'||channelNo<1||channelNo>SLOT_COUNT)return null;
        return {
          channelNo,
          label:String(parsed.label||('CAM '+channelNo)),
          connectionId:String(parsed.connectionId||participant.identity)
        };
      }catch{return null;}
    };

    const disconnectParticipant=(participant:RemoteParticipant)=>{
      const meta=cameraMeta(participant);
      if(!meta)return;
      const index=meta.channelNo-1;
      setRemoteCameras(prev=>prev.map((cam,i)=>i===index&&cam?.connectionId===meta.connectionId?null:cam));
      if(streamsRef.current[index])stopSlot(index);
    };

    async function connect(){
      setRemoteLink('CONNECTING');
      try{
        const response=await fetch(base+'/api/camera-token',{
          method:'POST',
          headers:{'content-type':'application/json'},
          body:JSON.stringify({role:'viewer',matchId})
        });
        const auth=await response.json();
        if(!response.ok||!auth?.token||!auth?.url)throw new Error(auth?.error||'Could not authorize Replay Control with the media server.');
        if(cancelled)return;
        if(auth.session)setCameraSession(auth.session as CameraSession);

        const room=new Room({
          adaptiveStream:true,
          dynacast:false,
          disconnectOnPageLeave:true
        });
        livekitRoomRef.current=room;

        room.on(RoomEvent.ConnectionStateChanged,(state:ConnectionState)=>{
          if(cancelled)return;
          if(state===ConnectionState.Connected)setRemoteLink('READY');
          else if(state===ConnectionState.Reconnecting)setRemoteLink('CONNECTING');
          else if(state===ConnectionState.Disconnected)setRemoteLink('ERROR');
        });

        room.on(RoomEvent.TrackSubscribed,(track:RemoteTrack,_publication:RemoteTrackPublication,participant:RemoteParticipant)=>{
          if(track.kind!==Track.Kind.Video)return;
          const meta=cameraMeta(participant);
          if(!meta)return;
          const index=meta.channelNo-1;
          const mediaTrack=track.mediaStreamTrack;
          const stream=new MediaStream([mediaTrack]);
          setRemoteCameras(prev=>prev.map((cam,i)=>i===index?{
            connectionId:meta.connectionId,
            channelNo:meta.channelNo,
            label:meta.label,
            quality:'SFU',
            lastSeen:Date.now(),
            status:'LIVE'
          }:cam));
          void attachRemoteStream(index,stream,meta.label,meta.connectionId);
        });

        room.on(RoomEvent.TrackUnsubscribed,(_track:RemoteTrack,_publication:RemoteTrackPublication,participant:RemoteParticipant)=>{
          disconnectParticipant(participant);
        });
        room.on(RoomEvent.ParticipantDisconnected,(participant:RemoteParticipant)=>{
          disconnectParticipant(participant);
        });

        await room.connect(auth.url,auth.token,{autoSubscribe:true});
        if(cancelled){room.disconnect();return;}
        setRemoteLink('READY');
        setNotice('IPS media server connected. Remote phones will appear here automatically.');
      }catch(e:any){
        if(cancelled)return;
        setRemoteLink('ERROR');
        setNotice('IPS media server connection failed: '+(e?.message||'unknown error'));
      }
    }

    void connect();
    return()=>{
      cancelled=true;
      const room=livekitRoomRef.current;
      livekitRoomRef.current=null;
      try{room?.disconnect();}catch{}
      remoteCamerasRef.current.forEach((cam,i)=>{
        if(cam&&streamsRef.current[i])stopSlot(i);
      });
      setRemoteCameras(Array(SLOT_COUNT).fill(null));
    };
  },[matchId,attachRemoteStream,stopSlot]);

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

  const liveRecordingIndices=slots.map((slot,i)=>slot.status==='LIVE'&&streamsRef.current[i]?i:-1).filter(i=>i>=0);
  const allLiveRecording=liveRecordingIndices.length>0&&liveRecordingIndices.every(i=>recording[i]);
  const toggleAllRecording=async()=>{
    if(!liveRecordingIndices.length){setNotice('No live camera channels are connected yet.');return;}
    if(allLiveRecording){
      liveRecordingIndices.forEach(i=>stopRecording(i,true));
      setNotice('ALL CAMERA RECORDING STOPPED. Live previews remain connected.');
      return;
    }
    let started=0;
    for(const i of liveRecordingIndices){if(recordingRef.current[i]||await startRecording(i,true))started++;}
    setNotice('MASTER RECORD · '+started+'/'+liveRecordingIndices.length+' live channels recording into 45s buffers.');
  };

  useEffect(()=>()=>{for(let i=0;i<SLOT_COUNT;i++)stopSlot(i);for(const c of clipsRef.current)for(const a of c.angles)URL.revokeObjectURL(a.url);},[stopSlot]);

  return <main className="replay-shell">
    <header className="replay-top workstation-top">
      <div className="replay-wordmark"><b>IPS</b><span>REPLAY ENGINE</span></div>
      <div className="match-ident"><small>{(match.tournaments as any)?.name||'IPS MATCH'}</small><strong>{shortTeam(match.home)} <i>v</i> {shortTeam(match.away)}</strong><span>{match.match_code} · {match.status}</span></div>
      <div className={'program-state '+programMode.toLowerCase()}><i/>{programMode==='LIVE'?'LIVE PROGRAM':'REPLAY ON AIR'}</div>
      <div className="head-links"><button onClick={openProgram}>OPEN IPS PROGRAM ↗</button><Link href="/director">DIRECTOR</Link></div>
    </header>

    <div className="status-strip"><span>SCORER MARKERS <b className={scorerLink==='LIVE'?'good':''}>{scorerLink}</b></span><span>REMOTE CAMERAS <b className={remoteLink==='READY'?'good':''}>{remoteLink}</b></span><span>PROGRAM LINK <b className={programPeer==='CONNECTED'?'good':''}>{programPeer}</b></span><span>RECORDING <b className={recording.some(Boolean)?'good':''}>{recording.filter(Boolean).length}/4</b></span><span>BUFFER <b>45s CENTRAL</b></span><span>{notice}</span></div>

    <section className="replay-grid">
      <div className="camera-column">
        <section className="replay-panel camera-panel">
          <header><div><span>CENTRAL CAMERA INGEST</span><h2>Remote phones + local fallback</h2></div><div className="panel-actions"><button className={'master-record '+(allLiveRecording?'active':'')} onClick={()=>void toggleAllRecording()}>{allLiveRecording?'■ STOP ALL RECORDING':'● START ALL RECORDING'}</button><button onClick={openCameraPublisher}>OPEN CAMERA PAGE ↗</button><button onClick={enablePermissions}>LOCAL CAMERAS</button><button onClick={startAll}>START LOCAL FEEDS</button></div></header>
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
              <button className={recording[i]?'recording-btn active':'recording-btn'} disabled={slot.status!=='LIVE'} onClick={()=>recording[i]?stopRecording(i):void startRecording(i)}>{recording[i]?'■ STOP REC':'● START REC'}</button>
              <button title="Select this camera as the live source for the separate IPS Program output. It does not start recording." className={programCamera===i?'program-cam':''} onClick={()=>setProgramCamera(i)}>{programCamera===i?'ON PROGRAM':'TAKE LIVE'}</button>
            </div>
            {slot.error&&<small className="camera-error">{slot.error}</small>}
          </article>)}</div>
        </section>

        <section className="replay-panel event-panel">
          <header><div><span>REPLAY MARKERS</span><h2>Ball timestamps + scorer-linked capture</h2></div></header>
          <div className="ball-marker-console">
            <button className="mark-ball-button" disabled={markingBall} onClick={()=>void markBall()}>{markingBall?'SAVING…':'MARK BALL'}<span>PRESS AT DELIVERY</span></button>
            <div className="ball-marker-history">{ballMarkers.slice(0,6).map(marker=>{const state=marker.score_state||{};return <div className={marker.scoring_event_id?'linked':'pending'} key={marker.id}><b>{formatClock(new Date(marker.marked_at).getTime())}</b><span>{marker.scoring_event_id?String(marker.over_no??'—')+'.'+String(marker.ball_no??'—')+' · '+String(marker.delivery_label||'BALL')+' · '+String(state.runs??'—')+'/'+String(state.wickets??'—'):'WAITING FOR SCORE'}</span></div>;})}{!ballMarkers.length&&<p>No ball timestamps yet.</p>}</div>
          </div>
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
