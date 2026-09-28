'use client';

import {useEffect,useRef,useState} from 'react';

export function ReplayProgram({matchId}:{matchId:string}){
  const liveRef=useRef<HTMLVideoElement|null>(null);
  const replayRef=useRef<HTMLVideoElement|null>(null);
  const pcRef=useRef<RTCPeerConnection|null>(null);
  const channelRef=useRef<BroadcastChannel|null>(null);
  const [mode,setMode]=useState<'LIVE'|'REPLAY'>('LIVE');
  const [replay,setReplay]=useState<{url:string;speed:number;title:string;kind:string;angle:string}|null>(null);
  const [link,setLink]=useState('WAITING FOR REPLAY DASHBOARD');

  useEffect(()=>{
    if(typeof BroadcastChannel==='undefined')return;
    const ch=new BroadcastChannel('ips-replay-'+matchId);channelRef.current=ch;
    const makePeer=()=>{
      try{pcRef.current?.close();}catch{}
      const pc=new RTCPeerConnection();pcRef.current=pc;
      pc.ontrack=e=>{const stream=e.streams[0];if(liveRef.current&&stream){liveRef.current.srcObject=stream;void liveRef.current.play().catch(()=>{});}setLink('LIVE FEED CONNECTED');};
      pc.onicecandidate=e=>{if(e.candidate)ch.postMessage({type:'PROGRAM_ICE',candidate:e.candidate.toJSON()});};
      return pc;
    };
    ch.onmessage=async e=>{
      const msg=e.data||{};
      if(msg.type==='OFFER'&&msg.sdp){
        const pc=makePeer();
        await pc.setRemoteDescription(msg.sdp);
        const answer=await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ch.postMessage({type:'ANSWER',sdp:answer});
      }
      if(msg.type==='HOST_ICE'&&msg.candidate&&pcRef.current)await pcRef.current.addIceCandidate(msg.candidate).catch(()=>{});
      if(msg.type==='NO_LIVE')setLink('DASHBOARD HAS NO PROGRAM CAMERA');
      if(msg.type==='REPLAY'){
        setReplay({url:msg.url,speed:Number(msg.speed)||1,title:msg.title||'IPS REPLAY',kind:msg.kind||'REPLAY',angle:msg.angle||''});
        setMode('REPLAY');
      }
      if(msg.type==='LIVE')setMode('LIVE');
    };
    ch.postMessage({type:'HELLO'});
    const hello=window.setInterval(()=>{if(!pcRef.current||pcRef.current.connectionState!=='connected')ch.postMessage({type:'HELLO'});},2500);
    return()=>{clearInterval(hello);ch.close();try{pcRef.current?.close();}catch{}};
  },[matchId]);

  useEffect(()=>{
    if(mode==='REPLAY'&&replayRef.current){
      replayRef.current.playbackRate=replay?.speed||1;
      replayRef.current.currentTime=0;
      void replayRef.current.play().catch(()=>{});
    }
    if(mode==='LIVE'&&liveRef.current)void liveRef.current.play().catch(()=>{});
  },[mode,replay]);

  const ended=()=>{channelRef.current?.postMessage({type:'REPLAY_ENDED'});};

  return <main className="program-output">
    <video ref={liveRef} className={mode==='LIVE'?'visible':''} autoPlay muted playsInline/>
    {replay&&<video ref={replayRef} className={mode==='REPLAY'?'visible':''} src={replay.url} muted playsInline onEnded={ended}/>}
    {mode==='REPLAY'&&replay&&<div className="replay-bug"><b>IPS REPLAY</b><span>{replay.kind} · {replay.angle} · {replay.speed}×</span></div>}
    {mode==='LIVE'&&<div className="program-link-state">{link}</div>}
  </main>;
}
