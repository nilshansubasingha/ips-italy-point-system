'use client';

import {useEffect,useMemo,useRef,useState} from 'react';
import {createClient} from '@/lib/supabase/client';

type JoinInfo={
  session_id:string;
  match_id:string;
  match_code?:string;
  home_name:string;
  away_name:string;
  realtime_key:string;
  connection_id:string;
  channel_no:number;
  label:string;
  expires_at:string;
};

const RTC_CONFIG:RTCConfiguration={
  iceServers:[
    {urls:'stun:stun.l.google.com:19302'},
    {urls:'stun:stun1.l.google.com:19302'}
  ]
};

const QUALITY:any={
  '540p':{width:960,height:540,frameRate:30},
  '720p':{width:1280,height:720,frameRate:30},
  '1080p':{width:1920,height:1080,frameRate:30}
};

export function CameraPublisher(){
  const supabase=useMemo(()=>createClient(),[]);
  const [pin,setPin]=useState('');
  const [channelNo,setChannelNo]=useState(1);
  const [label,setLabel]=useState('');
  const [facing,setFacing]=useState<'environment'|'user'>('environment');
  const [quality,setQuality]=useState<'540p'|'720p'|'1080p'>('720p');
  const [join,setJoin]=useState<JoinInfo|null>(null);
  const [status,setStatus]=useState<'IDLE'|'JOINING'|'READY'|'LIVE'|'ERROR'>('IDLE');
  const [message,setMessage]=useState('Enter the six-digit Replay PIN.');
  const [viewerState,setViewerState]=useState('WAITING FOR REPLAY CONTROL');

  const videoRef=useRef<HTMLVideoElement|null>(null);
  const streamRef=useRef<MediaStream|null>(null);
  const realtimeRef=useRef<any>(null);
  const peersRef=useRef<Map<string,RTCPeerConnection>>(new Map());
  const heartbeatRef=useRef<number|null>(null);
  const wakeLockRef=useRef<any>(null);

  const send=async(event:string,payload:any)=>{
    const ch=realtimeRef.current;
    if(!ch)return;
    await ch.send({type:'broadcast',event,payload}).catch(()=>{});
  };

  const closePeer=(viewerId:string)=>{
    const pc=peersRef.current.get(viewerId);
    if(pc){try{pc.close();}catch{}}
    peersRef.current.delete(viewerId);
  };

  const createOffer=async(viewerId:string)=>{
    const info=join;
    const stream=streamRef.current;
    if(!info||!stream)return;
    const existing=peersRef.current.get(viewerId);
    if(existing&&['connected','connecting'].includes(existing.connectionState))return;
    closePeer(viewerId);

    const pc=new RTCPeerConnection(RTC_CONFIG);
    peersRef.current.set(viewerId,pc);
    stream.getTracks().forEach(track=>pc.addTrack(track,stream));
    pc.onicecandidate=e=>{
      if(e.candidate)void send('camera-ice',{
        viewerId,
        connectionId:info.connection_id,
        channelNo:info.channel_no,
        candidate:e.candidate.toJSON()
      });
    };
    pc.onconnectionstatechange=()=>{
      if(pc.connectionState==='connected'){
        setStatus('LIVE');
        setViewerState('CONNECTED TO REPLAY CONTROL');
      }
      if(['failed','closed','disconnected'].includes(pc.connectionState)){
        setViewerState('WAITING FOR REPLAY CONTROL');
      }
    };
    const offer=await pc.createOffer({offerToReceiveAudio:false,offerToReceiveVideo:false});
    await pc.setLocalDescription(offer);
    await send('offer',{
      viewerId,
      connectionId:info.connection_id,
      channelNo:info.channel_no,
      label:info.label,
      sdp:offer
    });
  };

  const stopTransmission=async()=>{
    if(join)await send('camera-offline',{connectionId:join.connection_id,channelNo:join.channel_no});
    if(heartbeatRef.current)window.clearInterval(heartbeatRef.current);
    heartbeatRef.current=null;
    for(const viewerId of [...peersRef.current.keys()])closePeer(viewerId);
    if(realtimeRef.current){
      await supabase.removeChannel(realtimeRef.current).catch(()=>{});
      realtimeRef.current=null;
    }
    streamRef.current?.getTracks().forEach(t=>t.stop());
    streamRef.current=null;
    if(videoRef.current)videoRef.current.srcObject=null;
    try{await wakeLockRef.current?.release?.();}catch{}
    wakeLockRef.current=null;
    setJoin(null);
    setStatus('IDLE');
    setViewerState('WAITING FOR REPLAY CONTROL');
    setMessage('Transmission stopped. Enter a PIN to connect again.');
  };

  const startTransmission=async()=>{
    if(pin.replace(/\D/g,'').length!==6){
      setMessage('Enter the six-digit camera PIN.');
      return;
    }
    setStatus('JOINING');
    setMessage('Joining camera session…');
    try{
      const {data,error}=await supabase.rpc('ips_camera_join',{
        p_pin:pin.replace(/\D/g,''),
        p_channel_no:channelNo,
        p_label:label||('CAM '+channelNo)
      });
      if(error)throw error;
      const info=data as JoinInfo;
      if(!info?.realtime_key)throw new Error('Camera session could not be resolved.');

      const q=QUALITY[quality];
      const stream=await navigator.mediaDevices.getUserMedia({
        video:{
          facingMode:{ideal:facing},
          width:{ideal:q.width},
          height:{ideal:q.height},
          frameRate:{ideal:q.frameRate,max:30}
        },
        audio:false
      });
      streamRef.current=stream;
      if(videoRef.current){
        videoRef.current.srcObject=stream;
        await videoRef.current.play().catch(()=>{});
      }
      setJoin(info);

      const room='ips-camera-'+info.realtime_key;
      const realtime=supabase.channel(room)
        .on('broadcast',{event:'control-ready'},({payload}:any)=>{
          if(payload?.connectionId&&payload.connectionId!==info.connection_id)return;
          if(payload?.viewerId)void createOffer(payload.viewerId);
        })
        .on('broadcast',{event:'answer'},async({payload}:any)=>{
          if(payload?.connectionId!==info.connection_id||!payload?.viewerId)return;
          const pc=peersRef.current.get(payload.viewerId);
          if(pc&&payload.sdp)await pc.setRemoteDescription(payload.sdp).catch(()=>{});
        })
        .on('broadcast',{event:'control-ice'},async({payload}:any)=>{
          if(payload?.connectionId!==info.connection_id||!payload?.viewerId)return;
          const pc=peersRef.current.get(payload.viewerId);
          if(pc&&payload.candidate)await pc.addIceCandidate(payload.candidate).catch(()=>{});
        })
        .subscribe(async(state:string)=>{
          if(state==='SUBSCRIBED'){
            setStatus('READY');
            setMessage('Camera is transmitting. Keep this page open.');
            const ready=()=>void send('camera-ready',{
              connectionId:info.connection_id,
              channelNo:info.channel_no,
              label:info.label,
              quality,
              facing,
              at:Date.now()
            });
            ready();
            heartbeatRef.current=window.setInterval(ready,3000);
          }
          if(state==='CHANNEL_ERROR'||state==='TIMED_OUT'){
            setStatus('ERROR');
            setMessage('Realtime connection failed. Check network and reconnect.');
          }
        });
      realtimeRef.current=realtime;

      try{wakeLockRef.current=await (navigator as any).wakeLock?.request?.('screen');}catch{}
    }catch(e:any){
      streamRef.current?.getTracks().forEach(t=>t.stop());
      streamRef.current=null;
      setStatus('ERROR');
      setMessage(e?.message||'Camera connection failed.');
    }
  };

  useEffect(()=>()=>{void stopTransmission();},[]);

  return <main className="camera-publisher-shell">
    <header className="camera-publisher-top">
      <div className="replay-wordmark"><b>IPS</b><span>CAMERA</span></div>
      <div className={'camera-link-state '+status.toLowerCase()}><i/>{status}</div>
    </header>

    {!join?<section className="camera-join-card">
      <p className="eyebrow">REMOTE CAMERA CONTRIBUTION</p>
      <h1>Join Replay Camera</h1>
      <p className="camera-join-copy">Enter the PIN shown in the Replay workstation. No account is required on this camera phone.</p>

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

      <div className="camera-phone-preview"><video ref={videoRef} autoPlay muted playsInline/><div><b>CAM {join.channel_no}</b><span>{quality} · {facing==='environment'?'BACK':'FRONT'}</span></div></div>
      <p className="camera-message">{message}</p>
      <button className="camera-stop-button" onClick={()=>void stopTransmission()}>STOP TRANSMISSION</button>
      <p className="camera-keep-open">Keep this page visible and keep the phone awake while transmitting.</p>
    </section>}
  </main>;
}
