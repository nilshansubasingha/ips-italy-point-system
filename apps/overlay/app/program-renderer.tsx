'use client';

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {createClient,type RealtimeChannel} from '@supabase/supabase-js';
import {SceneCanvas} from '@ips/graphics-react';

type ActiveLayer={
  instanceId:string;
  variantKey:string;
  priority:number;
  replacementGroup:string|null;
  startedAt:string;
  persistent:boolean;
  payload?:Record<string,unknown>;
  source?:string;
};
type VariantMeta={
  variantVersionId:string;
  sceneKey:string;
  variantKey:string;
  name:string;
  presentation:string;
  priority:number;
  replacementGroup:string|null;
  conflictBehavior:string;
  durationMs:number|null;
  document:unknown;
};
type Snapshot={
  match_id:string;
  session:{
    package_release_id?:string;
    clean_feed?:boolean;
    scorebar_locked?:boolean;
    automation_enabled?:boolean;
    emergency_sponsor_off?:boolean;
  };
  program:{
    revision:number;
    preview:any;
    active_layers:ActiveLayer[];
    queue:any[];
    persistent_snapshot:ActiveLayer[];
    updated_at?:string;
  };
  release:{
    id?:string;
    version?:number;
    manifest?:{variants?:Record<string,VariantMeta>};
    theme?:Record<string,unknown>;
  };
  data:any;
  signal:{score_revision?:number;program_revision?:number;updated_at?:string};
};

const URL=process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

function makeClient(){
  if(!URL||!KEY)return null;
  return createClient(URL,KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},realtime:{params:{eventsPerSecond:12}}});
}
function snapshotUrl(){
  return String(URL||'')+'/rest/v1/rpc/ips_broadcast_program_snapshot';
}
async function fetchSnapshot(matchId:string,signal?:AbortSignal):Promise<Snapshot|null>{
  if(!URL||!KEY)throw new Error('Program Renderer Supabase configuration is missing.');
  const response=await fetch(snapshotUrl(),{
    method:'POST',
    headers:{apikey:KEY,'Content-Type':'application/json','Cache-Control':'no-store'},
    body:JSON.stringify({p_match_id:matchId}),
    cache:'no-store',
    signal
  });
  if(!response.ok){
    const body=await response.text();
    throw new Error('Program snapshot failed ('+response.status+'): '+body.slice(0,220));
  }
  return await response.json();
}
function layerMeta(snapshot:Snapshot,layer:ActiveLayer):VariantMeta|null{
  return snapshot.release?.manifest?.variants?.[layer.variantKey]??null;
}
function isExpired(layer:ActiveLayer,meta:VariantMeta|null,now:number){
  if(layer.persistent||!meta?.durationMs)return false;
  const started=Date.parse(layer.startedAt);
  return Number.isFinite(started)&&now>=started+meta.durationMs;
}
function compose(snapshot:Snapshot,now:number){
  if(snapshot.session?.clean_feed)return [] as Array<{layer:ActiveLayer;meta:VariantMeta}>;
  const items=(snapshot.program?.active_layers??[])
    .map(layer=>({layer,meta:layerMeta(snapshot,layer)}))
    .filter((x):x is {layer:ActiveLayer;meta:VariantMeta}=>!!x.meta&&!isExpired(x.layer,x.meta,now))
    .sort((a,b)=>a.layer.priority-b.layer.priority);

  const exclusive=items.filter(x=>x.meta.conflictBehavior==='EXCLUSIVE').sort((a,b)=>b.layer.priority-a.layer.priority)[0];
  if(exclusive)return [exclusive];

  const scorebarHidden=items.some(x=>x.meta.conflictBehavior==='HIDE_SCOREBAR');
  const highestHideLower=Math.max(-1,...items.filter(x=>x.meta.conflictBehavior==='HIDE_LOWER_PRIORITY').map(x=>x.layer.priority));
  return items.filter(x=>{
    if(scorebarHidden&&x.layer.replacementGroup==='scorebar')return false;
    if(highestHideLower>=0&&x.layer.priority<highestHideLower)return false;
    return true;
  });
}

function ProgramLayer({snapshot,item,now}:{snapshot:Snapshot;item:{layer:ActiveLayer;meta:VariantMeta};now:number}){
  const {layer,meta}=item;
  const started=Date.parse(layer.startedAt);
  const end=!layer.persistent&&meta.durationMs&&Number.isFinite(started)?started+meta.durationMs:null;
  const remaining=end?end-now:null;
  const exiting=remaining!=null&&remaining<=360;
  const data=useMemo(()=>({...snapshot.data,director:layer.payload??{},runtime:{variantKey:layer.variantKey,instanceId:layer.instanceId}}),[snapshot.data,layer.payload,layer.variantKey,layer.instanceId]);
  return <div className={'program-layer'+(exiting?' exiting':'')} style={{zIndex:layer.priority}}>
    <SceneCanvas document={meta.document} data={data}/>
  </div>;
}

export function ProgramRenderer({matchId}:{matchId:string|null}){
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [connection,setConnection]=useState<'CONNECTING'|'LIVE'|'RECONNECTING'|'OFFLINE'>('CONNECTING');
  const [now,setNow]=useState(()=>Date.now());
  const lastGood=useRef<Snapshot|null>(null);
  const channelRef=useRef<RealtimeChannel|null>(null);
  const load=useCallback(async(signal?:AbortSignal)=>{
    if(!matchId)return;
    try{
      const next=await fetchSnapshot(matchId,signal);
      if(next){
        lastGood.current=next;
        setSnapshot(next);
        setError(null);
      }
    }catch(reason:any){
      if(reason?.name==='AbortError')return;
      setError(reason?.message??'Program Renderer could not refresh.');
      if(lastGood.current)setSnapshot(lastGood.current);
    }
  },[matchId]);

  useEffect(()=>{
    const timer=setInterval(()=>setNow(Date.now()),120);
    return()=>clearInterval(timer);
  },[]);

  useEffect(()=>{
    if(!matchId)return;
    const controller=new AbortController();
    void load(controller.signal);
    return()=>controller.abort();
  },[matchId,load]);

  useEffect(()=>{
    if(!matchId)return;
    const supabase=makeClient();
    if(!supabase){setConnection('OFFLINE');return;}
    let fallback:ReturnType<typeof setInterval>|null=null;
    setConnection('CONNECTING');

    const channel=supabase.channel('ips-program-'+matchId)
      .on('postgres_changes',{
        event:'*',schema:'public',table:'broadcast_realtime_signals',filter:'match_id=eq.'+matchId
      },()=>{void load();})
      .subscribe(status=>{
        if(status==='SUBSCRIBED'){
          setConnection('LIVE');
          if(fallback){clearInterval(fallback);fallback=null;}
        }else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){
          setConnection('RECONNECTING');
          if(!fallback)fallback=setInterval(()=>void load(),1800);
        }else if(status==='CLOSED'){
          setConnection('OFFLINE');
          if(!fallback)fallback=setInterval(()=>void load(),1800);
        }
      });
    channelRef.current=channel;
    const safety=setInterval(()=>void load(),10000);
    return()=>{
      clearInterval(safety);
      if(fallback)clearInterval(fallback);
      void supabase.removeChannel(channel);
      channelRef.current=null;
    };
  },[matchId,load]);

  if(!matchId)return <main className='program-stage'><div className='program-status'><b>IPS PRISM PROGRAM</b><span>Provide a valid match ID in the browser-source URL.</span></div></main>;
  if(!snapshot)return <main className='program-stage'><div className={'program-status '+(error?'error':'')}><b>{error?'PROGRAM WAITING':'CONNECTING TO IPS PRISM…'}</b><span>{error??'Loading pinned package release and verified match state.'}</span></div></main>;

  const hasRelease=!!snapshot.release?.manifest?.variants;
  const layers=hasRelease?compose(snapshot,now):[];

  return <main className='program-stage' data-connection={connection}>
    {!hasRelease&&<div className='program-status'><b>DIRECTOR SESSION NOT READY</b><span>Open this match in Director Studio once to pin IPS PRISM to the match.</span></div>}
    {layers.map(item=><ProgramLayer key={item.layer.instanceId} snapshot={snapshot} item={item} now={now}/>)}
    {process.env.NODE_ENV!=='production'&&<div className='program-debug'>{connection} · P{snapshot.program?.revision??0} · S{snapshot.signal?.score_revision??0}</div>}
  </main>;
}
