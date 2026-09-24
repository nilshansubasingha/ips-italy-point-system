'use client';

import {useLayoutEffect,useRef,useState} from 'react';
import type {SceneDocument} from '@ips/broadcast';
import {createRenderModel} from '@ips/graphics-engine';

function paintToCss(paint:any):string|undefined{
  if(!paint)return undefined;
  if(paint.type==='SOLID')return paint.color;
  if(paint.type==='LINEAR_GRADIENT'){
    const stops=(paint.stops??[]).map((s:any)=>`${s.color} ${Math.round(Number(s.offset||0)*100)}%`).join(',');
    return `linear-gradient(${Number(paint.angle||0)}deg,${stops})`;
  }
  if(paint.type==='RADIAL_GRADIENT'){
    const stops=(paint.stops??[]).map((s:any)=>`${s.color} ${Math.round(Number(s.offset||0)*100)}%`).join(',');
    return `radial-gradient(circle,${stops})`;
  }
  return undefined;
}

function shadowToCss(shadows:any[]|undefined){
  if(!shadows?.length)return undefined;
  return shadows.map(s=>`${s.x}px ${s.y}px ${s.blur}px ${s.spread??0}px ${s.color}`).join(',');
}

function cornerCss(c:any){
  if(!c)return undefined;
  return `${c.tl}px ${c.tr}px ${c.br}px ${c.bl}px`;
}

function FitText({text,element}:{text:string;element:any}){
  const box=useRef<HTMLDivElement|null>(null);
  const target=Number(element.text?.typography?.fontSize||24);
  const [size,setSize]=useState(target);
  const t=element.text?.typography??{};

  useLayoutEffect(()=>{
    const node=box.current;if(!node)return;
    let next=target;
    node.style.fontSize=next+'px';
    const mode=t.wrap??'SHRINK';
    if(mode==='SHRINK'||mode==='AUTO_SIZE'){
      for(let i=0;i<80;i++){
        const overflow=node.scrollWidth>node.clientWidth+1||node.scrollHeight>node.clientHeight+1;
        if(!overflow||next<=7)break;
        next-=1;
        node.style.fontSize=next+'px';
      }
    }
    setSize(next);
  },[text,target,element.transform.width,element.transform.height,t.wrap,t.maxLines]);

  const style:React.CSSProperties={
    width:'100%',height:'100%',display:'flex',
    alignItems:t.verticalAlign==='TOP'?'flex-start':t.verticalAlign==='BOTTOM'?'flex-end':'center',
    justifyContent:t.align==='CENTER'?'center':t.align==='RIGHT'?'flex-end':'flex-start',
    textAlign:(t.align??'LEFT').toLowerCase() as any,
    fontFamily:t.fontFamily||'Inter, sans-serif',
    fontWeight:t.fontWeight??700,fontSize:size,lineHeight:t.lineHeight??1,
    letterSpacing:t.letterSpacing??0,padding:t.padding??0,
    whiteSpace:t.wrap==='WRAP'?'normal':'nowrap',
    overflow:'hidden',textOverflow:t.wrap==='TRUNCATE'?'ellipsis':'clip',
    textTransform:t.case==='UPPER'?'uppercase':t.case==='LOWER'?'lowercase':undefined
  };
  return <div ref={box} className="prism-fit-text" style={style}>{text}</div>;
}

function proceduralItems(count:number){
  return Array.from({length:Math.max(1,Math.min(count,96))},(_,i)=>({
    i,x:(i*37+13)%100,y:(i*61+17)%100,
    size:2+((i*17)%9),delay:(i%11)*-0.13,duration:1.6+((i%7)*0.22),rotate:(i*43)%360
  }));
}

function EffectElement({element}:{element:any}){
  const kind=String(element.effect?.kind||'').toUpperCase();
  const p=element.effect?.params??{};
  if(kind==='LIGHT_SWEEP')return <div className="fx-light-sweep" style={{'--fx-intensity':String(p.intensity??.5),'--fx-angle':`${p.angle??-18}deg`,'--fx-width':`${p.width??220}px`} as React.CSSProperties}/>;
  if(kind==='SPEED_STREAKS')return <div className="fx-streak-field">{proceduralItems(Number(p.count??28)).map(o=><i key={o.i} style={{left:o.x+'%',top:o.y+'%',width:(60+o.size*9)+'px',opacity:Number(p.opacity??.42),transform:`rotate(${p.angle??-12}deg)`,animationDelay:o.delay+'s',animationDuration:o.duration+'s',background:String(p.color??'#19d18f')}}/>)}</div>;
  if(kind==='ENERGY_RINGS')return <div className="fx-rings">{proceduralItems(Number(p.count??5)).map((o,index)=><i key={o.i} style={{inset:(8+index*8)+'%',borderColor:index%2?String(p.secondary??'#7768ff'):String(p.color??'#19d18f'),opacity:Number(p.opacity??.5),animationDelay:(index*.08)+'s'}}/>)}</div>;
  if(kind==='SHARDS'||kind==='PARTICLE_DEPTH')return <div className="fx-particles">{proceduralItems(Number(p.count??42)).map(o=><i key={o.i} style={{left:o.x+'%',top:o.y+'%',width:o.size+'px',height:(o.size*2.8)+'px',transform:`rotate(${o.rotate}deg)`,background:o.i%3===0?String(p.secondary??p.color??'#fff'):String(p.color??'#fff'),animationDelay:o.delay+'s',animationDuration:o.duration+'s'}}/>)}</div>;
  if(kind==='IMPACT_FLASH')return <div className="fx-impact-flash" style={{background:String(p.color??'#fff'),'--fx-intensity':String(p.intensity??.8)} as React.CSSProperties}/>;
  if(kind==='BALL_STREAK')return <div className="fx-ball-streak"><i style={{background:String(p.color??'#ef5662')}}/><span style={{background:`linear-gradient(90deg,transparent,${String(p.color??'#ef5662')})`}}/></div>;
  if(kind==='STUMPS')return <div className="fx-stumps" style={{'--stump':String(p.stumpColor??'#fff'),'--bail':String(p.bailColor??'#19d18f')} as React.CSSProperties}><span/><span/><span/><i/><i/></div>;
  return <div className="fx-generic"/>;
}

function ElementView({element,exiting}:{element:any;exiting:boolean}){
  const tr=element.transform;
  const filterParts:string[]=[];
  if(element.style?.blur)filterParts.push(`blur(${element.style.blur}px)`);
  if(element.style?.glow)filterParts.push(`drop-shadow(0 0 ${element.style.glow}px rgba(255,255,255,.28))`);
  const style:React.CSSProperties={
    position:'absolute',left:tr.x,top:tr.y,width:tr.width,height:tr.height,
    opacity:tr.opacity??1,
    transform:`rotate(${tr.rotation??0}deg) scale(${(tr.flipX?-1:1)*(tr.scaleX??1)},${(tr.flipY?-1:1)*(tr.scaleY??1)})`,
    transformOrigin:`${(tr.anchorX??.5)*100}% ${(tr.anchorY??.5)*100}%`,
    background:paintToCss(element.style?.fill),
    border:element.style?.strokeWidth? `${element.style.strokeWidth}px solid ${paintToCss(element.style.stroke)}`:undefined,
    borderRadius:cornerCss(element.style?.corners),
    boxShadow:shadowToCss(element.style?.shadows),
    filter:filterParts.join(' ')||undefined,
    overflow:element.style?.overflow==='HIDDEN'?'hidden':'visible',
    mixBlendMode:(element.style?.blendMode||'normal') as any,
    zIndex:element.zIndex,
    '--anim-duration':`${element.animation?.durationMs??500}ms`,
    '--anim-delay':`${element.animation?.delayMs??0}ms`,
    '--exit-duration':`${element.animation?.exitDurationMs??300}ms`
  } as React.CSSProperties;
  const enter=String(element.animation?.enterPreset||'').toLowerCase().replaceAll('_','-');
  const exit=String(element.animation?.exitPreset||'').toLowerCase().replaceAll('_','-');
  const cls=`prism-element type-${String(element.type).toLowerCase()} ${enter?'enter-'+enter:''} ${exiting&&exit?'exit-'+exit:''}`;

  if(element.type==='TEXT'||element.type==='DATA')return <div className={cls} style={{...style,color:paintToCss(element.style?.fill)||'#fff',background:undefined}}><FitText text={element.resolvedText??''} element={element}/></div>;
  if(element.type==='IMAGE'||element.type==='SVG'||element.type==='VIDEO'){
    const src=element.resolvedAssetUrl;
    if(!src)return null;
    if(element.type==='VIDEO')return <div className={cls} style={style}><video src={src} autoPlay muted loop playsInline className="prism-media"/></div>;
    return <div className={cls} style={style}><img src={src} alt="" className={'prism-media fit-'+String(element.asset?.fit||'CONTAIN').toLowerCase()} style={{objectPosition:element.asset?.objectPosition||'50% 50%'}}/></div>;
  }
  if(element.type==='EFFECT'||element.type==='PARTICLES')return <div className={cls} style={{...style,background:undefined,border:undefined,boxShadow:undefined,overflow:'visible'}}><EffectElement element={element}/></div>;
  if(element.type==='ELLIPSE')return <div className={cls} style={{...style,borderRadius:'50%'}}/>;
  return <div className={cls} style={style}/>;
}

export function SceneRenderer({document,data,exiting=false,className=''}:{document:SceneDocument|unknown;data:unknown;exiting?:boolean;className?:string}){
  const model=createRenderModel(document,data);
  return <div className={'prism-scene '+className} data-scene={model.document.name}>
    {model.elements.map((element:any)=><ElementView key={element.id} element={element} exiting={exiting}/>)}
  </div>;
}
