'use client';

import {PointerEvent,useMemo,useRef,useState,useTransition} from 'react';
import Link from 'next/link';
import {SceneCanvas} from '@ips/graphics-react';
import {estimateSceneCost} from '@ips/graphics-engine';
import {createClient} from '@/lib/supabase/client';

type Doc={schemaVersion:number;canvas:{width:1920;height:1080;transparent:boolean};name:string;designTokens:Record<string,unknown>;elements:any[];guides:any[];safeArea:{top:number;right:number;bottom:number;left:number};metadata:Record<string,unknown>};
type Initial={variant:any;scene:any;package:any;version:{id:string;version_no:number;status:string;document:Doc}};

const DESIGN_DATA={match:{code:'IPS-PRISM',tournament:{name:'ITALY SOFTBALL CHAMPIONSHIP'},home_team:{name:'TORINO LIONS',short_name:'TOR'},away_team:{name:'MILANO STARS',short_name:'MIL'}},innings:{number:1,batting_team:{name:'TORINO LIONS',short_name:'TOR'},bowling_team:{name:'MILANO STARS',short_name:'MIL'},runs:86,wickets:3,score_display:'86/3',overs:'8.4',runs_required:null,balls_remaining:null,chase_display:''},current:{striker:{name:'A. Fernando',runs:42,balls:26,score_display:'42 (26)'},non_striker:{name:'D. Perera',runs:18,balls:13,score_display:'18 (13)'},bowler:{name:'M. Silva',wickets:2,runs:21,figures_display:'2/21 (1.4)'}}};
const TEST_DATA={match:{code:'FINAL-2027-EXTREMELY-LONG',tournament:{name:'INTERNATIONAL SOFTBALL CRICKET CHAMPIONSHIP ITALIA'},home_team:{name:'TORINO UNITED CRICKET AND CULTURAL ASSOCIATION',short_name:'TORINO UNITED'},away_team:{name:'MILANO INTERNATIONAL SUPER STARS',short_name:'MILANO INTERNATIONAL'}},innings:{number:2,batting_team:{name:'TORINO UNITED CRICKET AND CULTURAL ASSOCIATION',short_name:'TORINO UNITED'},bowling_team:{name:'MILANO INTERNATIONAL SUPER STARS',short_name:'MILANO INTL'},runs:299,wickets:9,score_display:'299/9',overs:'9.5',runs_required:1,balls_remaining:1,chase_display:'NEED 1 FROM 1'},current:{striker:{name:'Warnakulasuriya Arachchilage Dilan Fernando',runs:149,balls:63,score_display:'149 (63)'},non_striker:{name:'Mohamed Shafraz Abdul Rahman',runs:1,balls:1,score_display:'1 (1)'},bowler:{name:'Subasingha Arachchige Don Nilshan Malisha',wickets:5,runs:48,figures_display:'5/48 (1.5)'}}};

const PRESETS=['FADE','SLIDE','BROADCAST_WIPE','IMPACT','SCALE_POP','MASK_REVEAL','LIGHT_SWEEP','FLASH'];
function clone<T>(v:T):T{return JSON.parse(JSON.stringify(v));}
function uid(prefix='el'){return prefix+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,6);}
function fillColor(el:any){const f=el.style?.fill;return f?.type==='SOLID'?f.color:'#ffffff';}
function strokeColor(el:any){const f=el.style?.stroke;return f?.type==='SOLID'?f.color:'#ffffff';}

export function EditorWorkspace({initial}:{initial:Initial}){
  const first=clone(initial.version.document);
  const [history,setHistory]=useState<Doc[]>([first]);
  const [historyIndex,setHistoryIndex]=useState(0);
  const doc=history[historyIndex];
  const [selectedId,setSelectedId]=useState<string|null>(doc.elements[0]?.id??null);
  const [leftTab,setLeftTab]=useState<'ELEMENTS'|'ASSETS'|'GRAPHICS'|'DATA'|'EFFECTS'>('ELEMENTS');
  const [bottomTab,setBottomTab]=useState<'LAYERS'|'TIMELINE'>('LAYERS');
  const [mode,setMode]=useState<'DESIGN'|'TEST'|'LIVE'>('DESIGN');
  const [liveMatch,setLiveMatch]=useState('');
  const [liveData,setLiveData]=useState<any>(null);
  const [zoom,setZoom]=useState(.48);
  const [showGrid,setShowGrid]=useState(true);
  const [showSafe,setShowSafe]=useState(true);
  const [snap,setSnap]=useState(true);
  const [assetUrl,setAssetUrl]=useState('');
  const [notice,setNotice]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [pending,startTransition]=useTransition();
  const dragRef=useRef<any>(null);
  const supabase=useMemo(()=>createClient(),[]);
  const editable=!!initial.package.can_edit&&!initial.package.is_factory;
  const selected=doc.elements.find(e=>e.id===selectedId)??null;
  const data=mode==='LIVE'?(liveData??DESIGN_DATA):mode==='TEST'?TEST_DATA:DESIGN_DATA;
  const cost=useMemo(()=>estimateSceneCost(doc),[doc]);

  function commit(next:Doc){
    const trimmed=history.slice(0,historyIndex+1);setHistory([...trimmed,clone(next)]);setHistoryIndex(trimmed.length);setNotice(null);
  }
  function patchSelected(patch:(el:any)=>void){
    if(!selectedId||!editable)return;const next=clone(doc);const el=next.elements.find(e=>e.id===selectedId);if(!el)return;patch(el);commit(next);
  }
  function undo(){if(historyIndex>0)setHistoryIndex(i=>i-1);}
  function redo(){if(historyIndex<history.length-1)setHistoryIndex(i=>i+1);}
  function add(type:string){
    if(!editable)return;const next=clone(doc);const id=uid(type.toLowerCase());
    const base:any={id,name:type==='TEXT'?'Text':'New '+type,type,parentId:null,zIndex:Math.max(0,...next.elements.map(e=>e.zIndex??0))+1,visible:true,locked:false,transform:{x:720,y:420,width:type==='TEXT'?480:320,height:type==='TEXT'?90:180,rotation:0,scaleX:1,scaleY:1,opacity:1,anchorX:.5,anchorY:.5,flipX:false,flipY:false},style:{fill:{type:'SOLID',color:type==='RECT'||type==='ROUNDED_RECT'?'#0b2534':'#ffffff'},strokeWidth:0,strokeDash:[],shadows:[],blur:0,backgroundBlur:0,blendMode:'normal',overflow:'VISIBLE',noise:0,glow:0},bindings:[],animation:{enterPreset:'BROADCAST_WIPE',exitPreset:'FADE',durationMs:450,exitDurationMs:300,delayMs:0,holdMs:null,loop:false,tracks:[]}};
    if(type==='TEXT')base.text={value:'NEW TEXT',typography:{fontFamily:'Inter',fontWeight:900,fontSize:54,lineHeight:1,letterSpacing:0,align:'LEFT',verticalAlign:'MIDDLE',case:'NONE',wrap:'SHRINK',maxLines:1,padding:0}};
    if(type==='ROUNDED_RECT')base.style.corners={tl:18,tr:18,br:18,bl:18,linked:true};
    if(type==='ELLIPSE')base.style.fill={type:'SOLID',color:'#19d18f'};
    if(type==='IMAGE'){base.asset={url:assetUrl,fit:'CONTAIN',objectPosition:'50% 50%'};base.style.fill=undefined;}
    next.elements.push(base);commit(next);setSelectedId(id);
  }
  function addEffect(kind:string){
    if(!editable)return;const next=clone(doc),id=uid('fx');next.elements.push({id,name:kind.replaceAll('_',' '),type:kind==='SHARDS'||kind==='PARTICLE_DEPTH'?'PARTICLES':'EFFECT',parentId:null,zIndex:Math.max(0,...next.elements.map(e=>e.zIndex??0))+1,visible:true,locked:false,transform:{x:0,y:0,width:1920,height:1080,rotation:0,scaleX:1,scaleY:1,opacity:1,anchorX:.5,anchorY:.5,flipX:false,flipY:false},style:{strokeWidth:0,strokeDash:[],shadows:[],blur:0,backgroundBlur:0,blendMode:'normal',overflow:'VISIBLE',noise:0,glow:0},effect:{kind,params:kind==='LIGHT_SWEEP'?{width:240,intensity:.55,angle:-18}:kind==='SPEED_STREAKS'?{count:30,color:'#19d18f',opacity:.45,angle:-12}:kind==='ENERGY_RINGS'?{count:5,color:'#19d18f',secondary:'#7768ff',opacity:.5}:kind==='SHARDS'?{count:38,color:'#2f6fff',spread:.72}:{count:60,color:'#9dfff0',depth:.8}},bindings:[],animation:{enterPreset:kind==='LIGHT_SWEEP'?'LIGHT_SWEEP':'IMPACT',exitPreset:'FADE',durationMs:900,exitDurationMs:250,delayMs:0,holdMs:null,loop:false,tracks:[]}});commit(next);setSelectedId(id);
  }
  function remove(){if(!selected||!editable)return;const next=clone(doc);next.elements=next.elements.filter(e=>e.id!==selected.id);commit(next);setSelectedId(next.elements[0]?.id??null);}
  function duplicate(){if(!selected||!editable)return;const next=clone(doc);const copy=clone(selected);copy.id=uid('copy');copy.name=selected.name+' Copy';copy.transform.x+=24;copy.transform.y+=24;copy.zIndex=Math.max(...next.elements.map(e=>e.zIndex??0))+1;next.elements.push(copy);commit(next);setSelectedId(copy.id);}
  function reorder(id:string,delta:number){if(!editable)return;const next=clone(doc);const ordered=[...next.elements].sort((a,b)=>(a.zIndex??0)-(b.zIndex??0));const i=ordered.findIndex(e=>e.id===id);const j=Math.max(0,Math.min(ordered.length-1,i+delta));[ordered[i],ordered[j]]=[ordered[j],ordered[i]];ordered.forEach((e,k)=>e.zIndex=k);next.elements=ordered;commit(next);}
  function startDrag(e:PointerEvent<HTMLDivElement>,el:any,kind:'move'|'resize'){if(!editable||el.locked)return;e.preventDefault();e.stopPropagation();dragRef.current={kind,id:el.id,x:e.clientX,y:e.clientY,t:clone(el.transform)};e.currentTarget.setPointerCapture(e.pointerId);}
  function moveDrag(e:PointerEvent<HTMLDivElement>){const d=dragRef.current;if(!d)return;const dx=(e.clientX-d.x)/zoom,dy=(e.clientY-d.y)/zoom;const next=clone(doc);const el=next.elements.find(x=>x.id===d.id);if(!el)return;if(d.kind==='move'){let x=d.t.x+dx,y=d.t.y+dy;if(snap){x=Math.round(x/10)*10;y=Math.round(y/10)*10;}el.transform.x=x;el.transform.y=y;}else{let w=Math.max(10,d.t.width+dx),h=Math.max(10,d.t.height+dy);if(snap){w=Math.round(w/10)*10;h=Math.round(h/10)*10;}el.transform.width=w;el.transform.height=h;}setHistory(h=>{const copy=[...h];copy[historyIndex]=next;return copy;});}
  function endDrag(){if(!dragRef.current)return;dragRef.current=null;const current=clone(history[historyIndex]);const trimmed=history.slice(0,historyIndex);setHistory([...trimmed,current]);setHistoryIndex(trimmed.length);}
  async function loadLive(){if(!/^[0-9a-f-]{36}$/i.test(liveMatch)){setError('Enter a valid IPS match UUID.');return;}const {data,error}=await supabase.rpc('ips_broadcast_match_data',{p_match_id:liveMatch});if(error){setError(error.message);return;}setLiveData(data);setMode('LIVE');setError(null);}
  function save(){if(!editable)return;startTransition(async()=>{setError(null);const {data,error}=await supabase.rpc('ips_broadcast_save_variant_draft',{p_variant_id:initial.variant.id,p_document:doc});if(error){setError(error.message);return;}setNotice('Draft '+data.version_no+' saved.');});}
  function publish(){if(!editable)return;startTransition(async()=>{setError(null);const saved=await supabase.rpc('ips_broadcast_save_variant_draft',{p_variant_id:initial.variant.id,p_document:doc});if(saved.error){setError(saved.error.message);return;}const pub=await supabase.rpc('ips_broadcast_publish_variant',{p_variant_id:initial.variant.id});if(pub.error){setError(pub.error.message);return;}setNotice('Published in package release '+pub.data.release_version+'. Active matches remain pinned to their existing release.');});}

  return <main className={'editor-shell '+(!editable?'read-only':'')}>
    <header className="editor-top">
      <Link href="/" className="wordmark"><b>IPS</b><span>PRISM EDITOR</span></Link>
      <div className="doc-ident"><span>{initial.package.name} · {initial.scene.name}</span><strong>{initial.variant.name}</strong><small>{initial.version.status} {initial.version.version_no} · {initial.variant.presentation}</small></div>
      <div className="history-actions"><button disabled={!editable||historyIndex===0} onClick={undo}>↶ UNDO</button><button disabled={!editable||historyIndex===history.length-1} onClick={redo}>↷ REDO</button></div>
      <div className="data-modes"><button className={mode==='DESIGN'?'active':''} onClick={()=>setMode('DESIGN')}>DESIGN DATA</button><button className={mode==='TEST'?'active':''} onClick={()=>setMode('TEST')}>TEST DATA</button><button className={mode==='LIVE'?'active':''} onClick={()=>setMode('LIVE')}>LIVE DATA</button></div>
      <div className="publish-actions"><button disabled={!editable||pending} onClick={save}>SAVE DRAFT</button><button className="publish" disabled={!editable||pending} onClick={publish}>PUBLISH</button></div>
    </header>

    {!editable&&<div className="factory-banner"><b>FACTORY PRISM — READ ONLY</b><span>Inspect every layer here. Duplicate IPS PRISM from Graphics Library to edit and publish your own version.</span></div>}
    {(notice||error)&&<div className={'editor-toast '+(error?'error':'')}>{error??notice}</div>}

    <div className="editor-body">
      <aside className="left-panel">
        <nav>{(['ELEMENTS','ASSETS','GRAPHICS','DATA','EFFECTS'] as const).map(t=><button className={leftTab===t?'active':''} key={t} onClick={()=>setLeftTab(t)}>{t}</button>)}</nav>
        <div className="left-content">
          {leftTab==='ELEMENTS'&&<><h3>ADD ELEMENT</h3><div className="tool-grid"><button onClick={()=>add('TEXT')}>T<span>Text</span></button><button onClick={()=>add('RECT')}>▭<span>Rectangle</span></button><button onClick={()=>add('ROUNDED_RECT')}>▢<span>Rounded</span></button><button onClick={()=>add('ELLIPSE')}>○<span>Ellipse</span></button></div><h3>SELECTED</h3><div className="selected-tools"><button disabled={!selected||!editable} onClick={duplicate}>Duplicate</button><button disabled={!selected||!editable} onClick={remove}>Delete</button></div></>}
          {leftTab==='ASSETS'&&<><h3>IMAGE / LOGO URL</h3><input value={assetUrl} onChange={e=>setAssetUrl(e.target.value)} placeholder="https://…"/><button className="wide-tool" disabled={!assetUrl||!editable} onClick={()=>add('IMAGE')}>ADD IMAGE TO CANVAS</button><p className="tool-help">Published assets will later use IPS Storage; URL insertion already renders through the same Program engine.</p></>}
          {leftTab==='GRAPHICS'&&<><h3>DOCUMENT</h3><div className="info-list"><span>Scene <b>{initial.scene.name}</b></span><span>Variant <b>{initial.variant.presentation}</b></span><span>Canvas <b>1920 × 1080</b></span><span>Elements <b>{doc.elements.length}</b></span><span>Complexity <b className={'cost '+cost.level.toLowerCase()}>{cost.level} · {cost.score}</b></span></div></>}
          {leftTab==='DATA'&&<><h3>LIVE MATCH TEST</h3><input value={liveMatch} onChange={e=>setLiveMatch(e.target.value)} placeholder="Match UUID"/><button className="wide-tool" onClick={loadLive}>LOAD VERIFIED MATCH DATA</button><h3>DATA MODE</h3><p className="tool-help">{mode==='DESIGN'?'Controlled design placeholders.':mode==='TEST'?'Stress data: very long names, 299/9 and Need 1 From 1.':'Rendering selected authoritative IPS match data.'}</p></>}
          {leftTab==='EFFECTS'&&<><h3>PROCEDURAL EFFECTS</h3><div className="effect-list">{['LIGHT_SWEEP','SPEED_STREAKS','ENERGY_RINGS','PARTICLE_DEPTH','SHARDS'].map(k=><button disabled={!editable} key={k} onClick={()=>addEffect(k)}>{k.replaceAll('_',' ')}</button>)}</div><p className="tool-help">Effects remain document layers, so timing, position and parameters are editable rather than flattened media.</p></>}
        </div>
      </aside>

      <section className="canvas-area">
        <div className="canvas-toolbar"><button onClick={()=>setZoom(z=>Math.max(.2,z-.05))}>−</button><span>{Math.round(zoom*100)}%</span><button onClick={()=>setZoom(z=>Math.min(1.25,z+.05))}>+</button><i/><label><input type="checkbox" checked={showGrid} onChange={e=>setShowGrid(e.target.checked)}/> GRID</label><label><input type="checkbox" checked={snap} onChange={e=>setSnap(e.target.checked)}/> SNAP 10PX</label><label><input type="checkbox" checked={showSafe} onChange={e=>setShowSafe(e.target.checked)}/> SAFE AREA</label></div>
        <div className={'canvas-scroll '+(showGrid?'grid-on':'')}>
          <div className="canvas-scale" style={{width:1920*zoom,height:1080*zoom}}>
            <div className="logical-canvas" style={{transform:'scale('+zoom+')'}}>
              <SceneCanvas document={doc} data={data}/>
              {showSafe&&<div className="editor-safe" style={{left:doc.safeArea.left,top:doc.safeArea.top,right:doc.safeArea.right,bottom:doc.safeArea.bottom}}/>}
              {doc.elements.filter(e=>e.visible!==false).map(el=><div key={el.id} className={'element-hit '+(selectedId===el.id?'selected':'')+(el.locked?' locked':'')} style={{left:el.transform.x,top:el.transform.y,width:el.transform.width,height:el.transform.height,zIndex:10000+(el.zIndex??0),transform:'rotate('+el.transform.rotation+'deg)'}} onPointerDown={e=>{setSelectedId(el.id);startDrag(e,el,'move')}} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>{selectedId===el.id&&editable&&!el.locked&&<i className="resize-handle" onPointerDown={e=>startDrag(e,el,'resize')} onPointerMove={moveDrag} onPointerUp={endDrag}/>}</div>)}
            </div>
          </div>
        </div>
      </section>

      <aside className="inspector">
        {!selected?<div className="no-selection">Select a layer.</div>:<>
          <header><input value={selected.name} disabled={!editable} onChange={e=>patchSelected(el=>el.name=e.target.value)}/><span>{selected.type}</span></header>
          <details open><summary>LAYOUT</summary><div className="field-grid">{[['X','x'],['Y','y'],['W','width'],['H','height'],['ROT','rotation'],['OPACITY','opacity']].map(([label,key])=><label key={key}><span>{label}</span><input type="number" step={key==='opacity'?.05:1} value={selected.transform[key]} disabled={!editable} onChange={e=>patchSelected(el=>el.transform[key]=Number(e.target.value))}/></label>)}</div><div className="inline-actions"><button disabled={!editable} onClick={()=>patchSelected(el=>el.transform.flipX=!el.transform.flipX)}>FLIP H</button><button disabled={!editable} onClick={()=>patchSelected(el=>el.transform.flipY=!el.transform.flipY)}>FLIP V</button><button disabled={!editable} onClick={()=>patchSelected(el=>el.locked=!el.locked)}>{selected.locked?'UNLOCK':'LOCK'}</button><button disabled={!editable} onClick={()=>patchSelected(el=>el.visible=!el.visible)}>{selected.visible?'HIDE':'SHOW'}</button></div></details>
          <details open><summary>DESIGN / STYLE</summary><div className="field-grid"><label><span>FILL</span><input type="color" disabled={!editable} value={fillColor(selected)} onChange={e=>patchSelected(el=>el.style.fill={type:'SOLID',color:e.target.value})}/></label><label><span>STROKE</span><input type="color" disabled={!editable} value={strokeColor(selected)} onChange={e=>patchSelected(el=>el.style.stroke={type:'SOLID',color:e.target.value})}/></label><label><span>STROKE PX</span><input type="number" disabled={!editable} value={selected.style?.strokeWidth??0} onChange={e=>patchSelected(el=>el.style.strokeWidth=Number(e.target.value))}/></label><label><span>BLUR</span><input type="number" disabled={!editable} value={selected.style?.blur??0} onChange={e=>patchSelected(el=>el.style.blur=Number(e.target.value))}/></label><label><span>GLOW</span><input type="number" disabled={!editable} value={selected.style?.glow??0} onChange={e=>patchSelected(el=>el.style.glow=Number(e.target.value))}/></label><label><span>NOISE</span><input type="number" step=".05" min="0" max="1" disabled={!editable} value={selected.style?.noise??0} onChange={e=>patchSelected(el=>el.style.noise=Number(e.target.value))}/></label></div>{selected.style?.corners&&<div className="corner-grid">{['tl','tr','br','bl'].map(k=><label key={k}><span>{k.toUpperCase()}</span><input type="number" disabled={!editable} value={selected.style.corners[k]} onChange={e=>patchSelected(el=>el.style.corners[k]=Number(e.target.value))}/></label>)}</div>}</details>
          {selected.type==='TEXT'&&<details open><summary>TYPOGRAPHY</summary><label className="full-field"><span>TEXT</span><textarea disabled={!editable} value={selected.text?.value??''} onChange={e=>patchSelected(el=>el.text.value=e.target.value)}/></label><div className="field-grid"><label><span>FONT</span><input disabled={!editable} value={selected.text.typography.fontFamily} onChange={e=>patchSelected(el=>el.text.typography.fontFamily=e.target.value)}/></label><label><span>WEIGHT</span><input type="number" min="100" max="1000" step="50" disabled={!editable} value={selected.text.typography.fontWeight} onChange={e=>patchSelected(el=>el.text.typography.fontWeight=Number(e.target.value))}/></label><label><span>SIZE</span><input type="number" disabled={!editable} value={selected.text.typography.fontSize} onChange={e=>patchSelected(el=>el.text.typography.fontSize=Number(e.target.value))}/></label><label><span>LINE</span><input type="number" step=".05" disabled={!editable} value={selected.text.typography.lineHeight} onChange={e=>patchSelected(el=>el.text.typography.lineHeight=Number(e.target.value))}/></label><label><span>TRACK</span><input type="number" step=".1" disabled={!editable} value={selected.text.typography.letterSpacing} onChange={e=>patchSelected(el=>el.text.typography.letterSpacing=Number(e.target.value))}/></label><label><span>MAX LINES</span><input type="number" min="1" disabled={!editable} value={selected.text.typography.maxLines} onChange={e=>patchSelected(el=>el.text.typography.maxLines=Number(e.target.value))}/></label></div><div className="select-grid"><select disabled={!editable} value={selected.text.typography.align} onChange={e=>patchSelected(el=>el.text.typography.align=e.target.value)}><option>LEFT</option><option>CENTER</option><option>RIGHT</option></select><select disabled={!editable} value={selected.text.typography.case} onChange={e=>patchSelected(el=>el.text.typography.case=e.target.value)}><option>NONE</option><option>UPPER</option><option>LOWER</option><option>TITLE</option></select><select disabled={!editable} value={selected.text.typography.wrap} onChange={e=>patchSelected(el=>el.text.typography.wrap=e.target.value)}><option>SHRINK</option><option>WRAP</option><option>TRUNCATE</option><option>AUTO_SIZE</option></select></div></details>}
          <details><summary>DATA</summary><label className="full-field"><span>BIND TEXT/ASSET/VISIBILITY PATH</span><input disabled={!editable} placeholder="e.g. current.striker.name" value={selected.bindings?.[0]?.path??''} onChange={e=>patchSelected(el=>{const prop=el.type==='TEXT'?'text.value':el.type==='IMAGE'?'asset.url':'visible';el.bindings=[{property:prop,path:e.target.value,fallback:el.type==='TEXT'?'—':'',format:el.type==='IMAGE'?'IMAGE_URL':'RAW',prefix:'',suffix:''},...(el.bindings??[]).slice(1)];})}/></label><p className="inspector-help">Bindings are resolved by the same renderer used on air. Missing values resolve to fallbacks instead of raw null/undefined.</p></details>
          <details open><summary>ANIMATION</summary><div className="select-grid"><select disabled={!editable} value={selected.animation?.enterPreset??''} onChange={e=>patchSelected(el=>el.animation.enterPreset=e.target.value||null)}><option value="">NONE</option>{PRESETS.map(p=><option key={p}>{p}</option>)}</select><select disabled={!editable} value={selected.animation?.exitPreset??''} onChange={e=>patchSelected(el=>el.animation.exitPreset=e.target.value||null)}><option value="">NONE</option>{PRESETS.map(p=><option key={p}>{p}</option>)}</select></div><div className="field-grid"><label><span>DURATION MS</span><input type="number" disabled={!editable} value={selected.animation?.durationMs??500} onChange={e=>patchSelected(el=>el.animation.durationMs=Number(e.target.value))}/></label><label><span>DELAY MS</span><input type="number" disabled={!editable} value={selected.animation?.delayMs??0} onChange={e=>patchSelected(el=>el.animation.delayMs=Number(e.target.value))}/></label><label><span>EXIT MS</span><input type="number" disabled={!editable} value={selected.animation?.exitDurationMs??300} onChange={e=>patchSelected(el=>el.animation.exitDurationMs=Number(e.target.value))}/></label></div></details>
        </>}
      </aside>
    </div>

    <section className="bottom-dock"><header><button className={bottomTab==='LAYERS'?'active':''} onClick={()=>setBottomTab('LAYERS')}>LAYERS</button><button className={bottomTab==='TIMELINE'?'active':''} onClick={()=>setBottomTab('TIMELINE')}>ANIMATION TIMELINE</button></header>{bottomTab==='LAYERS'?<div className="layers-list">{[...doc.elements].sort((a,b)=>(b.zIndex??0)-(a.zIndex??0)).map(el=><div className={selectedId===el.id?'selected':''} key={el.id} onClick={()=>setSelectedId(el.id)}><button disabled={!editable} onClick={e=>{e.stopPropagation();patchSelected(()=>{});const next=clone(doc);const x=next.elements.find(q=>q.id===el.id);if(x){x.visible=!x.visible;commit(next)}}}>{el.visible?'◉':'○'}</button><button disabled={!editable} onClick={e=>{e.stopPropagation();const next=clone(doc);const x=next.elements.find(q=>q.id===el.id);if(x){x.locked=!x.locked;commit(next)}}}>{el.locked?'🔒':'◇'}</button><span>{el.name}</span><small>{el.type}</small><button disabled={!editable} onClick={e=>{e.stopPropagation();reorder(el.id,1)}}>↑</button><button disabled={!editable} onClick={e=>{e.stopPropagation();reorder(el.id,-1)}}>↓</button></div>)}</div>:<div className="timeline">{[...doc.elements].sort((a,b)=>(a.animation?.delayMs??0)-(b.animation?.delayMs??0)).map(el=><div key={el.id}><span>{el.name}</span><i style={{marginLeft:Math.min(55,(el.animation?.delayMs??0)/30)+'%',width:Math.max(3,Math.min(42,(el.animation?.durationMs??500)/35))+'%'}}/><small>{el.animation?.delayMs??0}ms → {(el.animation?.delayMs??0)+(el.animation?.durationMs??500)}ms</small></div>)}</div>}</section>
  </main>;
}
