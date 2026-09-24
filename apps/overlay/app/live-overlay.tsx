'use client';

import {useCallback,useEffect,useMemo,useState} from 'react';
import {createClient,type RealtimeChannel} from '@supabase/supabase-js';
import {SceneRenderer} from './scene-renderer';

type Snapshot={
  match_id:string;
  session:any;
  program:any;
  release:any;
  data:any;
  signal:any;
};

const URL=process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY??process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function activeNow(layer:any,now:number){
  if(!layer?.expiresAt)return true;
  const t=Date.parse(layer.expiresAt);
  return !Number.isFinite(t)||now<t;
}

function shouldExit(layer:any,now:number){
  if(!layer?.expiresAt)return false;
  const t=Date.parse(layer.expiresAt);
  return Number.isFinite(t)&&t-now<=380&&t-now>0;
}

export function LiveOverlay({matchId,debug=false}:{matchId:string|null;debug?:boolean}){
  const supabase=useMemo(()=>URL&&KEY?createClient(URL,KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}):null,[]);
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [connection,setConnection]=useState<'CONNECTING'|'LIVE'|'RECONNECTING'|'OFFLINE'>('CONNECTING');
  const [now,setNow]=useState(()=>Date.now());
  const [scale,setScale]=useState(1);

  const refresh=useCallback(async()=>{
    if(!supabase||!matchId)return;
    const {data,error}=await supabase.rpc('ips_broadcast_program_snapshot',{p_match_id:matchId});
    if(error){
      setError(error.message);
      setConnection(current=>current==='LIVE'?'RECONNECTING':'OFFLINE');
      return;
    }
    if(data){
      setSnapshot(data as Snapshot);
      setError(null);
    }
  },[supabase,matchId]);

  useEffect(()=>{
    const resize=()=>{
      const sx=window.innerWidth/1920;
      const sy=window.innerHeight/1080;
      setScale(Math.min(sx,sy));
    };
    resize();
    window.addEventListener('resize',resize);
    return()=>window.removeEventListener('resize',resize);
  },[]);

  useEffect(()=>{
    const timer=setInterval(()=>setNow(Date.now()),100);
    return()=>clearInterval(timer);
  },[]);

  useEffect(()=>{
    if(!supabase||!matchId)return;
    void refresh();
    let channel:RealtimeChannel|null=supabase.channel('ips-program:'+matchId,{config:{broadcast:{self:false}}});
    channel
      .on('postgres_changes',{event:'*',schema:'public',table:'broadcast_realtime_signals',filter:'match_id=eq.'+matchId},()=>void refresh())
      .subscribe(status=>{
        if(status==='SUBSCRIBED')setConnection('LIVE');
        else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')setConnection('RECONNECTING');
        else if(status==='CLOSED')setConnection('OFFLINE');
      });
    const heartbeat=setInterval(()=>void refresh(),5000);
    return()=>{
      clearInterval(heartbeat);
      if(channel)void supabase.removeChannel(channel);
      channel=null;
    };
  },[supabase,matchId,refresh]);

  const layers=useMemo(()=>{
    const all=Array.isArray(snapshot?.program?.active_layers)?snapshot!.program.active_layers:[];
    const alive=all.filter((item:any)=>activeNow(item,now));
    const manifest=snapshot?.release?.manifest?.variants??{};
    const hasExclusive=alive.some((item:any)=>manifest[item.variantKey]?.conflictBehavior==='EXCLUSIVE');
    const hidesScorebar=alive.some((item:any)=>manifest[item.variantKey]?.conflictBehavior==='HIDE_SCOREBAR');
    return alive.filter((item:any)=>{
      const meta=manifest[item.variantKey];
      if(!meta)return false;
      if(hasExclusive&&meta.conflictBehavior!=='EXCLUSIVE')return false;
      if(hidesScorebar&&meta.replacementGroup==='scorebar')return false;
      return true;
    }).sort((a:any,b:any)=>(a.priority??0)-(b.priority??0));
  },[snapshot,now]);

  if(!matchId||!supabase){
    return <main className="program-shell">{debug&&<div className="renderer-diagnostic">Renderer configuration missing or invalid match ID.</div>}</main>;
  }

  const cleanFeed=!!snapshot?.session?.clean_feed;
  const manifest=snapshot?.release?.manifest?.variants??{};

  return <main className="program-shell">
    <div className="program-canvas" style={{transform:`translate(-50%,-50%) scale(${scale})`}}>
      {!cleanFeed&&layers.map((layer:any)=>{
        const meta=manifest[layer.variantKey];
        if(!meta?.document)return null;
        return <SceneRenderer
          key={layer.instanceId}
          document={meta.document}
          data={{...(snapshot?.data??{}),trigger:layer.payload??{}}}
          exiting={shouldExit(layer,now)}
          className={'layer-'+String(meta.presentation||'custom').toLowerCase()}
        />;
      })}
    </div>
    {debug&&<div className={'renderer-status status-'+connection.toLowerCase()}>
      <b>{connection}</b><span>{snapshot?.data?.match?.code??'WAITING'}</span><em>rev {snapshot?.program?.revision??0}</em>{error&&<small>{error}</small>}
    </div>}
  </main>;
}
