'use client';

import {useEffect,useRef,useState} from 'react';
import {
  ConnectionState,
  LocalVideoTrack,
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  createLocalVideoTrack
} from 'livekit-client';

type JoinInfo={
  session_id:string;
  match_id:string;
  match_code?:string;
  home_name:string;
  away_name:string;
  connection_id:string;
  channel_no:number;
  label:string;
  expires_at:string;
};

type TokenResponse={
  token:string;
  url:string;
  room:string;
  join:JoinInfo;
  error?:string;
};

const QUALITY_PRESET={
  '540p':VideoPresets.h540,
  '720p':VideoPresets.h720,
  '1080p':VideoPresets.h1080
} as const;

export function CameraPublisher(){
  const [pin,setPin]=useState('');
  const [channelNo,setChannelNo]=useState(1);
  const [label,setLabel]=useState('');
  const [facing,setFacing]=useState<'environment'|'user'>('environment');
  const [quality,setQuality]=useState<'540p'|'720p'|'1080p'>('720p');
  const [join,setJoin]=useState<JoinInfo|null>(null);
  const [status,setStatus]=useState<'IDLE'|'JOINING'|'READY'|'LIVE'|'ERROR'>('IDLE');
  const [message,setMessage]=useState('Enter the six-digit Replay PIN.');
  const [viewerState,setViewerState]=useState('NOT CONNECTED');

  const videoRef=useRef<HTMLVideoElement|null>(null);
  const roomRef=useRef<Room|null>(null);
  const trackRef=useRef<LocalVideoTrack|null>(null);
  const wakeLockRef=useRef<any>(null);
  const intentionalStopRef=useRef(false);

  const attachPreview=()=>{
    const track=trackRef.current;
    const video=videoRef.current;
    if(!track||!video)return;
    try{
      track.detach();
      track.attach(video);
      video.muted=true;
      video.playsInline=true;
      void video.play().catch(()=>{});
    }catch{}
  };

  const stopTransmission=async()=>{
    intentionalStopRef.current=true;
    const room=roomRef.current;
    roomRef.current=null;
    const track=trackRef.current;
    trackRef.current=null;

    try{
      if(room&&track)await room.localParticipant.unpublishTrack(track);
    }catch{}
    try{track?.detach();}catch{}
    try{track?.stop();}catch{}
    try{room?.disconnect();}catch{}
    if(videoRef.current)videoRef.current.srcObject=null;
    try{await wakeLockRef.current?.release?.();}catch{}
    wakeLockRef.current=null;

    setJoin(null);
    setStatus('IDLE');
    setViewerState('NOT CONNECTED');
    setMessage('Transmission stopped. Enter the PIN to connect again.');
    window.setTimeout(()=>{intentionalStopRef.current=false;},0);
  };

  const startTransmission=async()=>{
    const cleanPin=pin.replace(/\D/g,'');
    if(cleanPin.length!==6){
      setMessage('Enter the six-digit camera PIN.');
      return;
    }

    setStatus('JOINING');
    setViewerState('CONNECTING TO IPS MEDIA SERVER');
    setMessage('Validating PIN and opening camera…');

    try{
      const base=window.location.pathname.startsWith('/replay')?'/replay':'';
      const response=await fetch(base+'/api/camera-token',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({
          role:'publisher',
          pin:cleanPin,
          channelNo,
          label:label||('CAM '+channelNo)
        })
      });
      const auth=await response.json() as TokenResponse;
      if(!response.ok||!auth?.token||!auth?.url||!auth?.join){
        throw new Error(auth?.error||'Could not join the IPS camera session.');
      }

      const preset=QUALITY_PRESET[quality];
      const track=await createLocalVideoTrack({
        facingMode:facing,
        resolution:preset.resolution
      });
      trackRef.current=track;
      setJoin(auth.join);

      const room=new Room({
        adaptiveStream:false,
        dynacast:false,
        disconnectOnPageLeave:true
      });
      roomRef.current=room;

      room.on(RoomEvent.ConnectionStateChanged,(state:ConnectionState)=>{
        if(state===ConnectionState.Connected){
          setStatus('LIVE');
          setViewerState('CONNECTED TO IPS MEDIA SERVER');
          setMessage('Camera is live. Replay Control can now monitor and record this channel.');
        }else if(state===ConnectionState.Reconnecting){
          setStatus('READY');
          setViewerState('RECONNECTING');
          setMessage('Network changed. IPS is reconnecting the camera automatically…');
        }else if(state===ConnectionState.Disconnected&&!intentionalStopRef.current){
          setStatus('ERROR');
          setViewerState('MEDIA SERVER DISCONNECTED');
          setMessage('Camera lost the media server connection. Stop and reconnect if it does not recover.');
        }
      });

      room.on(RoomEvent.MediaDevicesError,(error:Error)=>{
        setStatus('ERROR');
        setMessage(error?.message||'Phone camera error.');
      });

      setStatus('READY');
      setMessage('Connecting camera to IPS media server…');
      await room.connect(auth.url,auth.token,{
        autoSubscribe:false
      });

      await room.localParticipant.publishTrack(track,{
        name:'CAM '+channelNo,
        source:Track.Source.Camera,
        simulcast:false
      });

      setStatus('LIVE');
      setViewerState('CONNECTED TO IPS MEDIA SERVER');
      setMessage('Camera is live. Keep this page visible during transmission.');

      try{wakeLockRef.current=await (navigator as any).wakeLock?.request?.('screen');}catch{}
      window.setTimeout(attachPreview,0);
    }catch(e:any){
      try{trackRef.current?.detach();}catch{}
      try{trackRef.current?.stop();}catch{}
      trackRef.current=null;
      try{roomRef.current?.disconnect();}catch{}
      roomRef.current=null;
      setJoin(null);
      setStatus('ERROR');
      setViewerState('CONNECTION FAILED');
      setMessage(e?.message||'Camera connection failed.');
    }
  };

  useEffect(()=>{
    if(join)attachPreview();
  },[join]);

  useEffect(()=>()=>{
    intentionalStopRef.current=true;
    try{trackRef.current?.stop();}catch{}
    try{roomRef.current?.disconnect();}catch{}
  },[]);

  return <main className="camera-publisher-shell">
    <header className="camera-publisher-top">
      <div className="replay-wordmark"><b>IPS</b><span>CAMERA</span></div>
      <div className={'camera-link-state '+status.toLowerCase()}><i/>{status}</div>
    </header>

    {!join?<section className="camera-join-card">
      <p className="eyebrow">CENTRAL CAMERA CONTRIBUTION</p>
      <h1>Join Replay Camera</h1>
      <p className="camera-join-copy">Enter the PIN shown in Replay Control. The phone publishes directly to the IPS media server; no camera operator is needed at the Replay workstation.</p>

      <label className="camera-pin-field"><span>CAMERA PIN</span><input inputMode="numeric" pattern="[0-9]*" maxLength={6} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="000000"/></label>

      <div className="camera-join-grid">
        <label><span>CHANNEL</span><select value={channelNo} onChange={e=>setChannelNo(Number(e.target.value))}>{[1,2,3,4].map(n=><option key={n} value={n}>CAM {n}</option>)}</select></label>
        <label><span>CAMERA</span><select value={facing} onChange={e=>setFacing(e.target.value as any)}><option value="environment">BACK CAMERA</option><option value="user">FRONT CAMERA</option></select></label>
        <label><span>QUALITY</span><select value={quality} onChange={e=>setQuality(e.target.value as any)}><option value="540p">540p / 30</option><option value="720p">720p / 30</option><option value="1080p">1080p / 30</option></select></label>
        <label><span>LABEL</span><input value={label} onChange={e=>setLabel(e.target.value)} placeholder={'CAM '+channelNo}/></label>
      </div>

      <button className="camera-start-button" disabled={status==='JOINING'} onClick={()=>void startTransmission()}>{status==='JOINING'?'CONNECTING…':'START TRANSMISSION'}</button>
      <p className={'camera-message '+(status==='ERROR'?'error':'')}>{message}</p>
    </section>:<section className="camera-live-card">
      <div className="camera-live-meta">
        <div><span>MATCH</span><strong>{join.home_name} <i>v</i> {join.away_name}</strong><small>{join.match_code||join.match_id}</small></div>
        <div><span>CHANNEL</span><strong>CAM {join.channel_no}</strong><small>{viewerState}</small></div>
      </div>

      <div className="camera-phone-preview"><video ref={videoRef} autoPlay muted playsInline disablePictureInPicture/><div><b>CAM {join.channel_no}</b><span>{quality} · {facing==='environment'?'BACK':'FRONT'} · SFU</span></div></div>
      <p className="camera-message">{message}</p>
      <button className="camera-stop-button" onClick={()=>void stopTransmission()}>STOP TRANSMISSION</button>
      <p className="camera-keep-open">Keep this page visible and the phone awake. Network recovery is handled by the IPS media server.</p>
    </section>}
  </main>;
}
