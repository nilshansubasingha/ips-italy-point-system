'use client';

import {CSSProperties,useCallback,useEffect,useMemo,useState} from 'react';
import {createBroadcastClient} from '@/lib/supabase';

type J=Record<string,any>;
type Snapshot={match_id:string;session:J;program:J;release:J;data:J;signal:J};

function getPath(root:any,path:string,scope?:J){
  if(path==='item')return scope?.item;
  const source=path.startsWith('item.')?scope?.item:root;
  const clean=path.startsWith('item.')?path.slice(5):path;
  return clean.split('.').filter(Boolean).reduce((v,k)=>v==null?undefined:v[k],source);
}
function formatValue(value:any,format?:string){
  if(value==null)return '';
  if(format==='INTEGER')return String(Math.round(Number(value)||0));
  if(format==='DECIMAL_1')return Number(value||0).toFixed(1);
  if(format==='DECIMAL_2')return Number(value||0).toFixed(2);
  if(format==='UPPER')return String(value).toUpperCase();
  return String(value);
}
function bindElement(element:J,data:J,scope?:J){
  const next=JSON.parse(JSON.stringify(element));
  for(const b of element.bindings||[]){
    const raw=getPath(data,b.path,scope);
    const picked=(raw===undefined||raw===null||raw==='')?b.fallback:raw;
    const final=String(b.prefix||'')+formatValue(picked,b.format)+String(b.suffix||'');
    const parts=String(b.property||'').split('.');
    let cursor=next;
    for(let i=0;i<parts.length-1;i++){cursor[parts[i]]??={};cursor=cursor[parts[i]]}
    if(parts.length)cursor[parts[parts.length-1]]=final;
  }
  return next;
}
function fillCss(fill:any){
  if(!fill)return 'transparent';
  if(fill.type==='SOLID')return fill.color||'transparent';
  const stops=(fill.stops||[]).map((s:any)=>String(s.color)+' '+String(Math.round((s.offset??0)*100))+'%').join(',');
  if(fill.type==='LINEAR_GRADIENT')return 'linear-gradient('+String(fill.angle??90)+'deg,'+stops+')';
  if(fill.type==='RADIAL_GRADIENT')return 'radial-gradient(circle,'+stops+')';
  return fill.color||'transparent';
}
function fromTransform(preset?:string){
  if(preset==='SLIDE_LEFT')return 'translateX(-90px)';
  if(preset==='SLIDE_RIGHT')return 'translateX(90px)';
  if(preset==='SLIDE_UP')return 'translateY(70px)';
  if(preset==='SCALE_POP'||preset==='IMPACT'||preset==='BALL_IMPACT')return 'scale(.75)';
  return 'none';
}
function baseStyle(e:J):CSSProperties{
  const t=e.transform||{},s=e.style||{},typ=e.text?.typography||{};
  const radius=s.corners?String(s.corners.tl??0)+'px '+String(s.corners.tr??0)+'px '+String(s.corners.br??0)+'px '+String(s.corners.bl??0)+'px':undefined;
  const style:any={
    position:'absolute',left:t.x??0,top:t.y??0,width:t.width??0,height:t.height??0,zIndex:e.zIndex??1,
    transform:'rotate('+String(t.rotation??0)+'deg)',background:fillCss(s.fill),borderRadius:radius,
    border:s.stroke?String(s.stroke.width??1)+'px solid '+String(s.stroke.color??'white'):undefined,
    boxShadow:s.glow?'0 0 '+String(s.glow)+'px currentColor':undefined,opacity:s.opacity??1,overflow:'hidden'
  };
  if(e.type==='TEXT'){
    Object.assign(style,{color:s.fill?.type==='SOLID'?s.fill.color:undefined,display:'flex',
      alignItems:typ.verticalAlign==='TOP'?'flex-start':typ.verticalAlign==='BOTTOM'?'flex-end':'center',
      justifyContent:typ.align==='CENTER'?'center':typ.align==='RIGHT'?'flex-end':'flex-start',
      padding:typ.padding??0,fontFamily:typ.fontFamily||undefined,fontWeight:typ.fontWeight||undefined,
      fontSize:typ.fontSize||undefined,lineHeight:typ.lineHeight||undefined,letterSpacing:typ.letterSpacing||undefined,
      textAlign:String(typ.align||'LEFT').toLowerCase(),textTransform:typ.case==='UPPER'?'uppercase':typ.case==='LOWER'?'lowercase':undefined,
      whiteSpace:typ.wrap==='WRAP'?'normal':'nowrap',textOverflow:typ.wrap==='SHRINK'?'ellipsis':undefined});
  }
  return style;
}
function effectStyle(kind?:string):CSSProperties{
  if(kind==='IMPACT_FLASH')return {background:'radial-gradient(circle,rgba(255,255,255,.9),rgba(255,255,255,0) 58%)',mixBlendMode:'screen'};
  if(kind==='ENERGY_RINGS')return {border:'18px solid rgba(255,255,255,.16)',borderRadius:'50%',boxShadow:'0 0 0 70px rgba(255,255,255,.05),0 0 0 150px rgba(255,255,255,.025)'};
  if(kind==='BALL_STREAK'||kind==='SPEED_STREAKS')return {background:'linear-gradient(110deg,transparent 15%,rgba(255,255,255,.4) 48%,transparent 52%)',filter:'blur(2px)'};
  if(kind==='STUMPS')return {background:'repeating-linear-gradient(90deg,transparent 0 32%,rgba(255,255,255,.75) 33% 37%,transparent 38% 65%)'};
  if(kind==='SHARDS')return {background:'conic-gradient(from 20deg,transparent,rgba(255,255,255,.16),transparent,rgba(255,255,255,.08),transparent)'};
  if(kind==='LIGHT_SWEEP')return {background:'linear-gradient(110deg,transparent 35%,rgba(255,255,255,.25) 48%,transparent 60%)',mixBlendMode:'screen'};
  if(kind==='PARTICLE_DEPTH')return {backgroundImage:'radial-gradient(circle,rgba(255,255,255,.55) 0 1px,transparent 2px)',backgroundSize:'44px 44px',opacity:.45};
  return {};
}
function PrismElement({raw,data,scope}:{raw:J;data:J;scope?:J}){
  const e=bindElement(raw,data,scope);
  if(e.type==='REPEATER'){
    const items=(getPath(data,e.repeat?.path,scope)||[]).slice(0,e.repeat?.limit??99);
    const gap=e.repeat?.gap??0,iw=e.repeat?.itemWidth??e.transform?.width??0,ih=e.repeat?.itemHeight??50;
    return <div style={baseStyle(e)}>{items.map((item:any,i:number)=><div key={item.id||i} style={{position:'absolute',left:e.repeat?.direction==='HORIZONTAL'?i*(iw+gap):0,top:e.repeat?.direction==='HORIZONTAL'?0:i*(ih+gap),width:iw,height:ih}}>
      {(e.repeat?.template||[]).map((child:any,j:number)=><PrismElement key={child.id||j} raw={child} data={data} scope={{item,index:i}}/>)}
    </div>)}</div>;
  }
  const a=e.animation||{};
  const css:any={...baseStyle(e),animation:'prism-enter '+String(a.durationMs??350)+'ms cubic-bezier(.16,.84,.25,1) '+String(a.delayMs??0)+'ms both','--prism-from':fromTransform(a.enterPreset)};
  if(e.type==='TEXT')return <div style={css}>{e.text?.value??''}</div>;
  if(e.type==='IMAGE')return e.asset?.url?<img src={e.asset.url} alt="" style={{...css,objectFit:String(e.asset.fit||'CONTAIN').toLowerCase(),objectPosition:e.asset.objectPosition||'50% 50%'}}/>:<div style={css}/>;
  if(e.type==='EFFECT'||e.type==='PARTICLES')return <div style={{...css,...effectStyle(e.effect?.kind)}}/>;
  return <div style={css}/>;
}
function Variant({variantKey,manifest,data,instance}:{variantKey:string;manifest:J;data:J;instance?:J}){
  const meta=manifest?.variants?.[variantKey],doc=meta?.document;
  if(!doc)return null;
  const merged={...data,trigger:instance?.payload||{}};
  const elements=[...(doc.elements||[])].sort((a:any,b:any)=>(a.zIndex??0)-(b.zIndex??0));
  return <div className="prism-canvas">{elements.map((e:any,i:number)=><PrismElement key={e.id||i} raw={e} data={merged}/>)}</div>;
}
export function BroadcastOverlay({matchId}:{matchId?:string}){
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
  const [error,setError]=useState('');
  const supabase=useMemo(()=>matchId?createBroadcastClient():null,[matchId]);
  const refresh=useCallback(async()=>{
    if(!supabase||!matchId)return;
    const result=await supabase.rpc('ips_broadcast_program_snapshot',{p_match_id:matchId});
    if(result.error){setError(result.error.message);return}
    setSnapshot(result.data as Snapshot);setError('');
  },[supabase,matchId]);
  useEffect(()=>{void refresh()},[refresh]);
  useEffect(()=>{
    if(!supabase||!matchId)return;
    const ch=supabase.channel('prism-'+matchId)
      .on('postgres_changes',{event:'*',schema:'public',table:'broadcast_realtime_signals',filter:'match_id=eq.'+matchId},()=>void refresh())
      .on('postgres_changes',{event:'*',schema:'public',table:'match_live_state',filter:'match_id=eq.'+matchId},()=>void refresh())
      .subscribe();
    return()=>{void supabase.removeChannel(ch)};
  },[supabase,matchId,refresh]);

  if(!matchId)return <main className="prism-empty"><b>IPS PRISM</b><span>Add ?match=&lt;match-id&gt; to the overlay URL.</span></main>;
  if(error)return <main className="prism-empty"><b>OVERLAY OFFLINE</b><span>{error}</span></main>;
  if(!snapshot)return <main className="prism-empty"><b>IPS PRISM</b><span>Connecting to broadcast state…</span></main>;
  if(snapshot.session?.clean_feed)return <main className="prism-output"/>;
  const now=Date.now();
  const layers=(snapshot.program?.active_layers||[]).filter((x:J)=>!x.expiresAt||Date.parse(x.expiresAt)>now).sort((a:J,b:J)=>(a.priority??0)-(b.priority??0));
  const hideScorebar=layers.some((x:J)=>snapshot.release?.manifest?.variants?.[x.variantKey]?.conflictBehavior==='HIDE_SCOREBAR');
  const visible=hideScorebar?layers.filter((x:J)=>x.replacementGroup!=='scorebar'):layers;
  return <main className="prism-output">{visible.map((layer:J)=><Variant key={layer.instanceId||layer.variantKey} variantKey={layer.variantKey} manifest={snapshot.release?.manifest||{}} data={snapshot.data||{}} instance={layer}/>)}</main>;
}
