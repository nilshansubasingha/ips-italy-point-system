'use client';

import {DragEvent as ReactDragEvent,PointerEvent,useMemo,useRef,useState,useTransition} from 'react';
import Link from 'next/link';
import {SceneCanvas} from '@ips/graphics-react';
import {estimateSceneCost} from '@ips/graphics-engine';
import {createClient} from '@/lib/supabase/client';

type Doc={schemaVersion:number;canvas:{width:1920;height:1080;transparent:boolean};name:string;designTokens:Record<string,unknown>;elements:any[];guides:any[];safeArea:{top:number;right:number;bottom:number;left:number};metadata:Record<string,unknown>};
type Initial={variant:any;scene:any;package:any;version:{id:string;version_no:number;status:string;document:Doc}};

const DESIGN_PLAYERS=[
  ['A. Fernando',42,26,5,2,'not out'],['D. Perera',18,13,2,1,'not out'],['N. Silva',11,8,1,1,'caught'],['S. Jayasinghe',7,6,1,0,'bowled'],
  ['R. Mendis',4,5,0,0,'run out'],['K. Fernando',2,3,0,0,'lbw'],['P. Kumara',0,1,0,0,'caught'],['T. Dias',0,0,0,0,''],
  ['M. Rodrigo',0,0,0,0,''],['L. Perera',0,0,0,0,''],['C. Silva',0,0,0,0,'']
].map((p,i)=>({player_id:'design-'+i,name:p[0],runs:p[1],balls:p[2],fours:p[3],sixes:p[4],strike_rate:Number(p[2])?Number(((Number(p[1])*100)/Number(p[2])).toFixed(1)):0,dismissal:p[5],is_striker:i===0,is_non_striker:i===1,order:i+1,role:i===0?'BATTER':i===10?'WICKETKEEPER':'ALL ROUNDER'}));
const TEST_PLAYERS=[
  'Warnakulasuriya Arachchilage Dilan Fernando','Mohamed Shafraz Abdul Rahman','Kasun Madushanka Jayawardena','Tharindu Lakshan Wijesinghe',
  'Niroshan Fernando Samarasinghe','Ashen Dinesh Perera','Malith Chandima Gunasekara','Ravindu Kavishka De Silva','Sachin Lakmal Rodrigo','Imran Ahamed Mohamed','Dilshan Prabath Kumara'
].map((name,i)=>({player_id:'test-'+i,name,runs:i===0?149:i===1?1:Math.max(0,27-i*3),balls:i===0?63:i===1?1:Math.max(1,18-i),fours:i===0?14:Math.max(0,4-Math.floor(i/3)),sixes:i===0?8:Math.max(0,3-Math.floor(i/4)),strike_rate:i===0?236.5:i===1?100:Number((Math.max(0,27-i*3)*100/Math.max(1,18-i)).toFixed(1)),dismissal:i<8?'caught':'',is_striker:i===0,is_non_striker:i===1,order:i+1,role:i===0?'BATTER':i===10?'WICKETKEEPER':'ALL ROUNDER'}));

const DESIGN_DATA={
  match:{code:'IPS-PRISM',tournament:{name:'ITALY SOFTBALL CHAMPIONSHIP',primary_color:'#19d18f',secondary_color:'#0b2534'},home_team:{name:'TORINO LIONS',short_name:'TOR',primary_color:'#19d18f',secondary_color:'#071d2d'},away_team:{name:'MILANO STARS',short_name:'MIL',primary_color:'#4f7cff',secondary_color:'#071d2d'}},
  innings:{number:1,batting_team:{name:'TORINO LIONS',short_name:'TOR',primary_color:'#19d18f',secondary_color:'#071d2d'},bowling_team:{name:'MILANO STARS',short_name:'MIL',primary_color:'#4f7cff',secondary_color:'#071d2d'},runs:86,wickets:3,score_display:'86/3',overs:'8.4',crr:9.92,rrr:null,target:null,runs_required:null,balls_remaining:null,chase_display:''},
  current:{striker:{name:'A. Fernando',runs:42,balls:26,fours:5,sixes:2,strike_rate:161.5,score_display:'42 (26)'},non_striker:{name:'D. Perera',runs:18,balls:13,fours:2,sixes:1,strike_rate:138.5,score_display:'18 (13)'},bowler:{name:'M. Silva',wickets:2,runs:21,overs:'1.4',economy:12.6,figures_display:'2/21 (1.4)'},partnership:{runs:35,balls:22}},
  batting_scorecard:DESIGN_PLAYERS,
  bowling_scorecard:[
    {name:'M. Silva',overs:'1.4',maidens:0,runs:21,wickets:2,economy:12.6,is_current:true},
    {name:'R. Khan',overs:'2.0',maidens:0,runs:14,wickets:1,economy:7.0},{name:'L. Rossi',overs:'2.0',maidens:0,runs:19,wickets:0,economy:9.5},
    {name:'A. Perera',overs:'2.0',maidens:0,runs:17,wickets:0,economy:8.5},{name:'D. Singh',overs:'1.0',maidens:0,runs:11,wickets:0,economy:11.0}
  ],
  playing_xi:{home:DESIGN_PLAYERS,away:DESIGN_PLAYERS.map((p,i)=>({...p,player_id:'away-'+i,name:['M. Silva','R. Khan','L. Rossi','A. Perera','D. Singh','F. Romano','P. Costa','N. Ahmed','S. Malik','G. Bianchi','V. Fernando'][i]}))}
};
const TEST_DATA={
  match:{code:'FINAL-2027-EXTREMELY-LONG',tournament:{name:'INTERNATIONAL SOFTBALL CRICKET CHAMPIONSHIP ITALIA',primary_color:'#19d18f',secondary_color:'#101d35'},home_team:{name:'TORINO UNITED CRICKET AND CULTURAL ASSOCIATION',short_name:'TORINO UNITED',primary_color:'#19d18f',secondary_color:'#071d2d'},away_team:{name:'MILANO INTERNATIONAL SUPER STARS',short_name:'MILANO INTERNATIONAL',primary_color:'#765bff',secondary_color:'#08162b'}},
  innings:{number:2,batting_team:{name:'TORINO UNITED CRICKET AND CULTURAL ASSOCIATION',short_name:'TORINO UNITED',primary_color:'#19d18f',secondary_color:'#071d2d'},bowling_team:{name:'MILANO INTERNATIONAL SUPER STARS',short_name:'MILANO INTL',primary_color:'#765bff',secondary_color:'#08162b'},runs:299,wickets:9,score_display:'299/9',overs:'9.5',crr:30.4,rrr:6,target:300,runs_required:1,balls_remaining:1,chase_display:'NEED 1 FROM 1'},
  current:{striker:{name:'Warnakulasuriya Arachchilage Dilan Fernando',runs:149,balls:63,fours:14,sixes:8,strike_rate:236.5,score_display:'149 (63)'},non_striker:{name:'Mohamed Shafraz Abdul Rahman',runs:1,balls:1,fours:0,sixes:0,strike_rate:100,score_display:'1 (1)'},bowler:{name:'Subasingha Arachchige Don Nilshan Malisha',wickets:5,runs:48,overs:'1.5',economy:28.8,figures_display:'5/48 (1.5)'},partnership:{runs:57,balls:19}},
  batting_scorecard:TEST_PLAYERS,
  bowling_scorecard:TEST_PLAYERS.slice(0,7).map((p,i)=>({name:p.name,overs:i===0?'1.5':'2.0',maidens:i===3?1:0,runs:i===0?48:12+i*4,wickets:i===0?5:i%3,economy:i===0?28.8:Number(((12+i*4)/2).toFixed(1)),is_current:i===0})),
  playing_xi:{home:TEST_PLAYERS,away:TEST_PLAYERS.map((p,i)=>({...p,player_id:'test-away-'+i,name:'MILANO '+p.name}))}
};

type VariableDef={label:string;path:string;kind:'TEXT'|'IMAGE'|'COLOR'|'LIST';scope?:'ROW'};
const DATA_GROUPS:{name:string;items:VariableDef[]}[]=[
  {name:'SCORE & MATCH',items:[
    {label:'Score',path:'innings.score_display',kind:'TEXT'},{label:'Overs',path:'innings.overs',kind:'TEXT'},{label:'CRR',path:'innings.crr',kind:'TEXT'},
    {label:'RRR',path:'innings.rrr',kind:'TEXT'},{label:'Target',path:'innings.target',kind:'TEXT'},{label:'Need X From X',path:'innings.chase_display',kind:'TEXT'},
    {label:'Tournament',path:'match.tournament.name',kind:'TEXT'},{label:'Venue',path:'match.venue',kind:'TEXT'}
  ]},
  {name:'CURRENT BATTERS',items:[
    {label:'Striker Name',path:'current.striker.name',kind:'TEXT'},{label:'Striker Runs',path:'current.striker.runs',kind:'TEXT'},{label:'Striker Balls',path:'current.striker.balls',kind:'TEXT'},
    {label:'Striker 4s',path:'current.striker.fours',kind:'TEXT'},{label:'Striker 6s',path:'current.striker.sixes',kind:'TEXT'},{label:'Striker SR',path:'current.striker.strike_rate',kind:'TEXT'},
    {label:'Striker Photo',path:'current.striker.photo_url',kind:'IMAGE'},{label:'Non-striker Name',path:'current.non_striker.name',kind:'TEXT'}
  ]},
  {name:'BOWLER & SITUATION',items:[
    {label:'Bowler Name',path:'current.bowler.name',kind:'TEXT'},{label:'Bowler Figures',path:'current.bowler.figures_display',kind:'TEXT'},{label:'Bowler Photo',path:'current.bowler.photo_url',kind:'IMAGE'},
    {label:'Partnership Runs',path:'current.partnership.runs',kind:'TEXT'},{label:'Partnership Balls',path:'current.partnership.balls',kind:'TEXT'}
  ]},
  {name:'TEAMS & COLOURS',items:[
    {label:'Batting Team',path:'innings.batting_team.name',kind:'TEXT'},{label:'Batting Logo',path:'innings.batting_team.logo_url',kind:'IMAGE'},
    {label:'Batting Primary',path:'innings.batting_team.primary_color',kind:'COLOR'},{label:'Batting Secondary',path:'innings.batting_team.secondary_color',kind:'COLOR'},
    {label:'Bowling Team',path:'innings.bowling_team.name',kind:'TEXT'},{label:'Bowling Logo',path:'innings.bowling_team.logo_url',kind:'IMAGE'},
    {label:'Bowling Primary',path:'innings.bowling_team.primary_color',kind:'COLOR'},{label:'Tournament Primary',path:'match.tournament.primary_color',kind:'COLOR'}
  ]},
  {name:'TABLE / REPEATER DATA',items:[
    {label:'Batting Scorecard · full XI',path:'batting_scorecard',kind:'LIST'},{label:'Bowling Scorecard',path:'bowling_scorecard',kind:'LIST'},
    {label:'Home Playing XI',path:'playing_xi.home',kind:'LIST'},{label:'Away Playing XI',path:'playing_xi.away',kind:'LIST'}
  ]},
  {name:'SCORECARD ROW · DROP INTO A ROW',items:[
    {label:'Player Photo',path:'item.photo_url',kind:'IMAGE',scope:'ROW'},{label:'Player Name',path:'item.name',kind:'TEXT',scope:'ROW'},
    {label:'Dismissal',path:'item.dismissal',kind:'TEXT',scope:'ROW'},{label:'Runs',path:'item.runs',kind:'TEXT',scope:'ROW'},
    {label:'Balls',path:'item.balls',kind:'TEXT',scope:'ROW'},{label:'4s',path:'item.fours',kind:'TEXT',scope:'ROW'},
    {label:'6s',path:'item.sixes',kind:'TEXT',scope:'ROW'},{label:'Strike Rate',path:'item.strike_rate',kind:'TEXT',scope:'ROW'},
    {label:'Overs',path:'item.overs',kind:'TEXT',scope:'ROW'},{label:'Wickets',path:'item.wickets',kind:'TEXT',scope:'ROW'},
    {label:'Economy',path:'item.economy',kind:'TEXT',scope:'ROW'}
  ]}
];

const PRESETS=['FADE','SLIDE','BROADCAST_WIPE','IMPACT','SCALE_POP','MASK_REVEAL','LIGHT_SWEEP','FLASH'];
function clone<T>(v:T):T{return JSON.parse(JSON.stringify(v));}
function uid(prefix='el'){return prefix+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,6);}
function fillColor(el:any){const f=el.style?.fill;return f?.type==='SOLID'?f.color:'#ffffff';}
function strokeColor(el:any){const f=el.style?.stroke;return f?.type==='SOLID'?f.color:'#ffffff';}
const PLAYER_PLACEHOLDER='data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 420"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#102b39"/><stop offset="1" stop-color="#07151f"/></linearGradient></defs><rect width="320" height="420" rx="24" fill="url(#g)"/><circle cx="160" cy="135" r="70" fill="#45616d"/><path d="M45 405c8-98 51-151 115-151s107 53 115 151" fill="#45616d"/><text x="160" y="385" fill="#8fb0ba" font-family="Arial,sans-serif" font-size="18" font-weight="700" text-anchor="middle">PLAYER PHOTO</text></svg>');
function locateSelection(doc:Doc,id:string|null){
  if(!id)return null;
  if(id.includes('::')){
    const [parentId,childId]=id.split('::');
    const parent=doc.elements.find((e:any)=>e.id===parentId&&e.type==='REPEATER');
    const child=parent?.repeat?.template?.find((e:any)=>e.id===childId);
    return child?{element:child,parent,parentId,childId,nested:true}:null;
  }
  const element=doc.elements.find((e:any)=>e.id===id);
  return element?{element,parent:null,parentId:null,childId:null,nested:false}:null;
}
function compat(kind:VariableDef['kind'],type:string){
  return (kind==='TEXT'&&type==='TEXT')||(kind==='IMAGE'&&['IMAGE','SVG','ICON'].includes(type))||(kind==='COLOR'&&type!=='REPEATER')||(kind==='LIST'&&type==='REPEATER');
}

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
  const selection=locateSelection(doc,selectedId);
  const selected=selection?.element??null;
  const selectedRepeater=selection?.nested?selection.parent:(selected?.type==='REPEATER'?selected:null);
  const data=mode==='LIVE'?(liveData??DESIGN_DATA):mode==='TEST'?TEST_DATA:DESIGN_DATA;
  const cost=useMemo(()=>estimateSceneCost(doc),[doc]);
  function bindingPropertyFor(kind:VariableDef['kind']){
    if(kind==='LIST')return 'repeat.path';
    if(kind==='IMAGE')return 'asset.url';
    if(kind==='COLOR')return 'style.fill.color';
    return 'text.value';
  }
  function canBindVariable(v:VariableDef){
    if(!selected)return false;
    if(v.scope==='ROW'){
      if(selection?.nested)return compat(v.kind,selected.type);
      return selected.type==='REPEATER';
    }
    return compat(v.kind,selected.type);
  }
  function applyBinding(el:any,v:VariableDef){
    if(v.kind==='LIST'){
      el.repeat={...(el.repeat??{direction:'VERTICAL',gap:4,itemWidth:el.transform.width,itemHeight:54,limit:11,template:[]}),path:v.path};
      return;
    }
    const property=bindingPropertyFor(v.kind);
    const fallback=v.kind==='TEXT'?'—':v.kind==='COLOR'?'#ffffff':PLAYER_PLACEHOLDER;
    el.bindings=[{property,path:v.path,fallback,format:v.kind==='IMAGE'?'IMAGE_URL':'RAW',prefix:'',suffix:''},...(el.bindings??[]).filter((b:any)=>b.property!==property)];
    if(v.kind==='IMAGE'){
      el.asset={...(el.asset??{}),url:el.asset?.url||PLAYER_PLACEHOLDER,fit:el.asset?.fit||'COVER',objectPosition:el.asset?.objectPosition||'50% 50%'};
      el.style=el.style??{};
      el.style.fill=undefined;
    }
  }
  function rowFieldElement(v:VariableDef,x:number,y:number){
    const id=uid(v.kind==='IMAGE'?'row-photo':'row-field');
    if(v.kind==='IMAGE')return {
      id,name:v.label,type:'IMAGE',parentId:null,zIndex:20,visible:true,locked:false,
      transform:{x,y,width:52,height:52,rotation:0,scaleX:1,scaleY:1,opacity:1,anchorX:.5,anchorY:.5,flipX:false,flipY:false},
      style:{strokeWidth:0,strokeDash:[],shadows:[],blur:0,backgroundBlur:0,blendMode:'normal',overflow:'HIDDEN',noise:0,glow:0,corners:{tl:8,tr:8,br:8,bl:8,linked:true}},
      asset:{url:PLAYER_PLACEHOLDER,fit:'COVER',objectPosition:'50% 50%'},
      bindings:[{property:'asset.url',path:v.path,fallback:PLAYER_PLACEHOLDER,format:'IMAGE_URL',prefix:'',suffix:''}],
      animation:{enterPreset:'FADE',exitPreset:'FADE',durationMs:220,exitDurationMs:180,delayMs:0,holdMs:null,loop:false,tracks:[]}
    };
    return {
      id,name:v.label,type:'TEXT',parentId:null,zIndex:20,visible:true,locked:false,
      transform:{x,y,width:v.label==='Player Name'?360:150,height:52,rotation:0,scaleX:1,scaleY:1,opacity:1,anchorX:.5,anchorY:.5,flipX:false,flipY:false},
      style:{fill:{type:'SOLID',color:v.label==='Runs'?'#ffffff':'#d8e3e7'},strokeWidth:0,strokeDash:[],shadows:[],blur:0,backgroundBlur:0,blendMode:'normal',overflow:'VISIBLE',noise:0,glow:0},
      text:{value:v.label,typography:{fontFamily:'Inter',fontWeight:v.label==='Runs'?950:800,fontSize:v.label==='Player Name'?22:18,lineHeight:1,letterSpacing:0,align:v.label==='Player Name'?'LEFT':'RIGHT',verticalAlign:'MIDDLE',case:'NONE',wrap:'SHRINK',maxLines:1,padding:0}},
      bindings:[{property:'text.value',path:v.path,fallback:'—',format:v.path.includes('strike_rate')||v.path.includes('economy')?'DECIMAL_1':'RAW',prefix:'',suffix:''}],
      animation:{enterPreset:'FADE',exitPreset:'FADE',durationMs:220,exitDurationMs:180,delayMs:0,holdMs:null,loop:false,tracks:[]}
    };
  }
  function addRowVariable(repeaterId:string,v:VariableDef,x=80,y=1){
    if(!editable)return;
    const next=clone(doc);
    const rep=next.elements.find((e:any)=>e.id===repeaterId&&e.type==='REPEATER');
    if(!rep?.repeat)return;
    const child=rowFieldElement(v,Math.max(0,x),Math.max(0,Math.min(y,rep.repeat.itemHeight-12)));
    rep.repeat.template=[...(rep.repeat.template??[]),child];
    commit(next);
    setSelectedId(rep.id+'::'+child.id);
  }
  function bindVariable(v:VariableDef){
    if(!editable)return;
    if(v.scope==='ROW'&&selected?.type==='REPEATER'&&!selection?.nested){
      addRowVariable(selected.id,v,v.kind==='IMAGE'?10:80,1);
      return;
    }
    if(!selected||!canBindVariable(v)){
      addVariableAt(v,720,420);
      return;
    }
    patchSelected(el=>applyBinding(el,v));
  }

  function commit(next:Doc){
    const trimmed=history.slice(0,historyIndex+1);setHistory([...trimmed,clone(next)]);setHistoryIndex(trimmed.length);setNotice(null);
  }
  function patchSelected(patch:(el:any)=>void){
    if(!selectedId||!editable)return;
    const next=clone(doc);
    const target=locateSelection(next,selectedId);
    if(!target)return;
    patch(target.element);
    commit(next);
  }
  function undo(){if(historyIndex>0)setHistoryIndex(i=>i-1);}
  function redo(){if(historyIndex<history.length-1)setHistoryIndex(i=>i+1);}
  function baseElement(type:string,x:number,y:number){
    const id=uid(type.toLowerCase());
    const isText=type==='TEXT',isImage=type==='IMAGE';
    const width=isText?480:isImage?260:320;
    const height=isText?90:isImage?340:180;
    const base:any={id,name:isText?'Text':isImage?'Image':'New '+type,type,parentId:null,zIndex:Math.max(0,...doc.elements.map(e=>e.zIndex??0))+1,visible:true,locked:false,transform:{x,y,width,height,rotation:0,scaleX:1,scaleY:1,opacity:1,anchorX:.5,anchorY:.5,flipX:false,flipY:false},style:{fill:{type:'SOLID',color:type==='RECT'||type==='ROUNDED_RECT'?'#0b2534':'#ffffff'},strokeWidth:0,strokeDash:[],shadows:[],blur:0,backgroundBlur:0,blendMode:'normal',overflow:isImage?'HIDDEN':'VISIBLE',noise:0,glow:0},bindings:[],animation:{enterPreset:'BROADCAST_WIPE',exitPreset:'FADE',durationMs:450,exitDurationMs:300,delayMs:0,holdMs:null,loop:false,tracks:[]}};
    if(isText)base.text={value:'NEW TEXT',typography:{fontFamily:'Inter',fontWeight:900,fontSize:54,lineHeight:1,letterSpacing:0,align:'LEFT',verticalAlign:'MIDDLE',case:'NONE',wrap:'SHRINK',maxLines:1,padding:0}};
    if(type==='ROUNDED_RECT')base.style.corners={tl:18,tr:18,br:18,bl:18,linked:true};
    if(type==='ELLIPSE')base.style.fill={type:'SOLID',color:'#19d18f'};
    if(isImage){base.asset={url:assetUrl||PLAYER_PLACEHOLDER,fit:'COVER',objectPosition:'50% 50%'};base.style.fill=undefined;base.style.corners={tl:18,tr:18,br:18,bl:18,linked:true};}
    return base;
  }
  function repeaterElement(v:VariableDef,x:number,y:number){
    const id=uid('repeater');
    const width=1380,itemHeight=58,gap=4,limit=v.path==='bowling_scorecard'?10:11;
    const template:any[]=[
      {id:uid('row-bg'),name:'Row Background',type:'ROUNDED_RECT',parentId:null,zIndex:1,visible:true,locked:false,transform:{x:0,y:0,width,height:itemHeight,rotation:0,scaleX:1,scaleY:1,opacity:1,anchorX:.5,anchorY:.5,flipX:false,flipY:false},style:{fill:{type:'SOLID',color:'rgba(255,255,255,.055)'},strokeWidth:0,strokeDash:[],shadows:[],blur:0,backgroundBlur:0,blendMode:'normal',overflow:'VISIBLE',noise:0,glow:0,corners:{tl:8,tr:8,br:8,bl:8,linked:true}},bindings:[],animation:{enterPreset:'FADE',exitPreset:'FADE',durationMs:220,exitDurationMs:160,delayMs:0,holdMs:null,loop:false,tracks:[]}},
      rowFieldElement({label:'Player Name',path:'item.name',kind:'TEXT',scope:'ROW'},24,3)
    ];
    return {id,name:v.label,type:'REPEATER',parentId:null,zIndex:Math.max(0,...doc.elements.map(e=>e.zIndex??0))+1,visible:true,locked:false,transform:{x,y,width,height:Math.min(700,limit*(itemHeight+gap)),rotation:0,scaleX:1,scaleY:1,opacity:1,anchorX:.5,anchorY:.5,flipX:false,flipY:false},style:{strokeWidth:0,strokeDash:[],shadows:[],blur:0,backgroundBlur:0,blendMode:'normal',overflow:'VISIBLE',noise:0,glow:0},repeat:{path:v.path,limit,direction:'VERTICAL',gap,itemWidth:width,itemHeight,template},bindings:[],animation:{enterPreset:'BROADCAST_WIPE',exitPreset:'FADE',durationMs:420,exitDurationMs:260,delayMs:0,holdMs:null,loop:false,tracks:[]}};
  }
  function add(type:string,x=720,y=420){
    if(!editable)return;const next=clone(doc);const base=baseElement(type,x,y);next.elements.push(base);commit(next);setSelectedId(base.id);
  }
  function addVariableAt(v:VariableDef,x:number,y:number){
    if(!editable)return;
    const next=clone(doc);
    let el:any;
    if(v.kind==='LIST')el=repeaterElement(v,x,y);
    else if(v.kind==='IMAGE'){el=baseElement('IMAGE',x,y);el.name=v.label;applyBinding(el,v);}
    else if(v.kind==='COLOR'){el=baseElement('ROUNDED_RECT',x,y);el.name=v.label;applyBinding(el,v);}
    else {el=baseElement('TEXT',x,y);el.name=v.label;el.text.value=v.label;applyBinding(el,v);}
    next.elements.push(el);commit(next);setSelectedId(el.id);
  }
  function startPaletteDrag(e:ReactDragEvent<HTMLElement>,payload:any){
    if(!editable){e.preventDefault();return;}
    e.dataTransfer.effectAllowed='copy';
    e.dataTransfer.setData('application/x-ips-prism',JSON.stringify(payload));
  }
  function canvasDrop(e:ReactDragEvent<HTMLDivElement>){
    e.preventDefault();
    if(!editable)return;
    const raw=e.dataTransfer.getData('application/x-ips-prism');
    if(!raw)return;
    let payload:any;try{payload=JSON.parse(raw);}catch{return;}
    const rect=e.currentTarget.getBoundingClientRect();
    let x=(e.clientX-rect.left)/zoom,y=(e.clientY-rect.top)/zoom;
    if(snap){x=Math.round(x/10)*10;y=Math.round(y/10)*10;}
    if(payload.kind==='element'){add(payload.type,x,y);return;}
    if(payload.kind!=='variable')return;
    const v=payload.variable as VariableDef;
    if(v.scope==='ROW'){
      const reps=[...doc.elements].filter((el:any)=>el.type==='REPEATER'&&el.repeat).sort((a:any,b:any)=>(b.zIndex??0)-(a.zIndex??0));
      const rep=reps.find((el:any)=>x>=el.transform.x&&x<=el.transform.x+el.transform.width&&y>=el.transform.y&&y<=el.transform.y+el.transform.height);
      if(rep){
        const step=rep.repeat.itemHeight+rep.repeat.gap;
        const localX=x-rep.transform.x;
        const localY=Math.max(0,Math.min(rep.repeat.itemHeight-8,(y-rep.transform.y)%step));
        addRowVariable(rep.id,v,localX,localY);
        return;
      }
      setNotice('Drop scorecard-row variables inside the scorecard/repeater area.');
      return;
    }
    addVariableAt(v,x,y);
  }

  function addEffect(kind:string){
    if(!editable)return;const next=clone(doc),id=uid('fx');next.elements.push({id,name:kind.replaceAll('_',' '),type:kind==='SHARDS'||kind==='PARTICLE_DEPTH'?'PARTICLES':'EFFECT',parentId:null,zIndex:Math.max(0,...next.elements.map(e=>e.zIndex??0))+1,visible:true,locked:false,transform:{x:0,y:0,width:1920,height:1080,rotation:0,scaleX:1,scaleY:1,opacity:1,anchorX:.5,anchorY:.5,flipX:false,flipY:false},style:{strokeWidth:0,strokeDash:[],shadows:[],blur:0,backgroundBlur:0,blendMode:'normal',overflow:'VISIBLE',noise:0,glow:0},effect:{kind,params:kind==='LIGHT_SWEEP'?{width:240,intensity:.55,angle:-18}:kind==='SPEED_STREAKS'?{count:30,color:'#19d18f',opacity:.45,angle:-12}:kind==='ENERGY_RINGS'?{count:5,color:'#19d18f',secondary:'#7768ff',opacity:.5}:kind==='SHARDS'?{count:38,color:'#2f6fff',spread:.72}:{count:60,color:'#9dfff0',depth:.8}},bindings:[],animation:{enterPreset:kind==='LIGHT_SWEEP'?'LIGHT_SWEEP':'IMPACT',exitPreset:'FADE',durationMs:900,exitDurationMs:250,delayMs:0,holdMs:null,loop:false,tracks:[]}});commit(next);setSelectedId(id);
  }
  function remove(){
    if(!selected||!editable||!selectedId)return;const next=clone(doc);const target=locateSelection(next,selectedId);if(!target)return;
    if(target.nested){target.parent.repeat.template=target.parent.repeat.template.filter((e:any)=>e.id!==target.childId);commit(next);setSelectedId(target.parent.id);}
    else{next.elements=next.elements.filter((e:any)=>e.id!==target.element.id);commit(next);setSelectedId(next.elements[0]?.id??null);}
  }
  function duplicate(){
    if(!selected||!editable||!selectedId)return;const next=clone(doc);const target=locateSelection(next,selectedId);if(!target)return;const copy=clone(target.element);copy.id=uid('copy');copy.name=target.element.name+' Copy';copy.transform.x+=24;copy.transform.y+=8;
    if(target.nested){copy.zIndex=Math.max(0,...target.parent.repeat.template.map((e:any)=>e.zIndex??0))+1;target.parent.repeat.template.push(copy);commit(next);setSelectedId(target.parent.id+'::'+copy.id);}
    else{copy.zIndex=Math.max(...next.elements.map((e:any)=>e.zIndex??0))+1;next.elements.push(copy);commit(next);setSelectedId(copy.id);}
  }
  function reorder(id:string,delta:number){if(!editable)return;const next=clone(doc);const ordered=[...next.elements].sort((a,b)=>(a.zIndex??0)-(b.zIndex??0));const i=ordered.findIndex(e=>e.id===id);if(i<0)return;const j=Math.max(0,Math.min(ordered.length-1,i+delta));[ordered[i],ordered[j]]=[ordered[j],ordered[i]];ordered.forEach((e,k)=>e.zIndex=k);next.elements=ordered;commit(next);}
  function startDrag(e:PointerEvent<HTMLElement>,el:any,kind:'move'|'resize',selectionKey=selectedId??el.id){if(!editable||el.locked)return;e.preventDefault();e.stopPropagation();dragRef.current={kind,id:selectionKey,x:e.clientX,y:e.clientY,t:clone(el.transform)};e.currentTarget.setPointerCapture(e.pointerId);}
  function moveDrag(e:PointerEvent<HTMLElement>){const d=dragRef.current;if(!d)return;const dx=(e.clientX-d.x)/zoom,dy=(e.clientY-d.y)/zoom;const next=clone(doc);const target=locateSelection(next,d.id);const el=target?.element;if(!el)return;if(d.kind==='move'){let x=d.t.x+dx,y=d.t.y+dy;if(snap){x=Math.round(x/10)*10;y=Math.round(y/10)*10;}el.transform.x=x;el.transform.y=y;}else{let w=Math.max(10,d.t.width+dx),h=Math.max(10,d.t.height+dy);if(snap){w=Math.round(w/10)*10;h=Math.round(h/10)*10;}el.transform.width=w;el.transform.height=h;}setHistory(h=>{const copy=[...h];copy[historyIndex]=next;return copy;});}
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
          {leftTab==='ELEMENTS'&&<><h3>ADD ELEMENT</h3><div className="tool-grid"><button draggable={editable} onDragStart={e=>startPaletteDrag(e,{kind:'element',type:'TEXT'})} onClick={()=>add('TEXT')}>T<span>Text</span><em>DRAG</em></button><button draggable={editable} onDragStart={e=>startPaletteDrag(e,{kind:'element',type:'IMAGE'})} onClick={()=>add('IMAGE')}>▧<span>Image</span><em>DRAG</em></button><button draggable={editable} onDragStart={e=>startPaletteDrag(e,{kind:'element',type:'RECT'})} onClick={()=>add('RECT')}>▭<span>Rectangle</span><em>DRAG</em></button><button draggable={editable} onDragStart={e=>startPaletteDrag(e,{kind:'element',type:'ROUNDED_RECT'})} onClick={()=>add('ROUNDED_RECT')}>▢<span>Rounded</span><em>DRAG</em></button><button draggable={editable} onDragStart={e=>startPaletteDrag(e,{kind:'element',type:'ELLIPSE'})} onClick={()=>add('ELLIPSE')}>○<span>Ellipse</span><em>DRAG</em></button></div><h3>SELECTED</h3><div className="selected-tools"><button disabled={!selected||!editable} onClick={duplicate}>Duplicate</button><button disabled={!selected||!editable} onClick={remove}>Delete</button></div></>}
          {leftTab==='ASSETS'&&<><h3>IMAGE / LOGO URL</h3><input value={assetUrl} onChange={e=>setAssetUrl(e.target.value)} placeholder="https://…"/><button className="wide-tool" disabled={!assetUrl||!editable} onClick={()=>add('IMAGE')}>ADD IMAGE TO CANVAS</button><p className="tool-help">Published assets will later use IPS Storage; URL insertion already renders through the same Program engine.</p></>}
          {leftTab==='GRAPHICS'&&<><h3>DOCUMENT</h3><div className="info-list"><span>Scene <b>{initial.scene.name}</b></span><span>Variant <b>{initial.variant.presentation}</b></span><span>Canvas <b>1920 × 1080</b></span><span>Elements <b>{doc.elements.length}</b></span><span>Complexity <b className={'cost '+cost.level.toLowerCase()}>{cost.level} · {cost.score}</b></span></div></>}
          {leftTab==='DATA'&&<><h3>VARIABLE ELEMENTS</h3><p className="tool-help">Drag any variable directly onto the canvas. If a compatible layer is selected, click to bind it. Scorecard-row variables can be dropped inside the scorecard to become repeating row layers.</p><div className="variable-groups">{DATA_GROUPS.map(group=><section key={group.name}><b>{group.name}</b><div>{group.items.map(v=><button key={v.path} draggable={editable} disabled={!editable} className={canBindVariable(v)?'bind-ready':''} onDragStart={e=>startPaletteDrag(e,{kind:'variable',variable:v})} onClick={()=>bindVariable(v)}><span>⠿ {v.label}</span><em>{canBindVariable(v)?'BIND':v.scope==='ROW'?'ROW DROP':'DRAG / ADD'}</em></button>)}</div></section>)}</div><h3>LIVE MATCH TEST</h3><input value={liveMatch} onChange={e=>setLiveMatch(e.target.value)} placeholder="Match UUID"/><button className="wide-tool" onClick={loadLive}>LOAD VERIFIED MATCH DATA</button><h3>DATA MODE</h3><p className="tool-help">{mode==='DESIGN'?'Design data now includes a complete XI so scorecards and squad repeaters are visible on the canvas.':mode==='TEST'?'Stress data includes a complete XI, very long names, 299/9 and Need 1 From 1.':'Rendering the selected authoritative IPS match. Scorecard rows reflect the actual registered Playing XI.'}</p></>}
          {leftTab==='EFFECTS'&&<><h3>PROCEDURAL EFFECTS</h3><div className="effect-list">{['LIGHT_SWEEP','SPEED_STREAKS','ENERGY_RINGS','PARTICLE_DEPTH','SHARDS'].map(k=><button disabled={!editable} key={k} onClick={()=>addEffect(k)}>{k.replaceAll('_',' ')}</button>)}</div><p className="tool-help">Effects remain document layers, so timing, position and parameters are editable rather than flattened media.</p></>}
        </div>
      </aside>

      <section className="canvas-area">
        <div className="canvas-toolbar"><button onClick={()=>setZoom(z=>Math.max(.2,z-.05))}>−</button><span>{Math.round(zoom*100)}%</span><button onClick={()=>setZoom(z=>Math.min(1.25,z+.05))}>+</button><i/><label><input type="checkbox" checked={showGrid} onChange={e=>setShowGrid(e.target.checked)}/> GRID</label><label><input type="checkbox" checked={snap} onChange={e=>setSnap(e.target.checked)}/> SNAP 10PX</label><label><input type="checkbox" checked={showSafe} onChange={e=>setShowSafe(e.target.checked)}/> SAFE AREA</label></div>
        <div className={'canvas-scroll '+(showGrid?'grid-on':'')}>
          <div className="canvas-scale" style={{width:1920*zoom,height:1080*zoom}}>
            <div className="logical-canvas" style={{transform:'scale('+zoom+')'}} onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';}} onDrop={canvasDrop}>
              <SceneCanvas document={doc} data={data}/>
              {showSafe&&<div className="editor-safe" style={{left:doc.safeArea.left,top:doc.safeArea.top,right:doc.safeArea.right,bottom:doc.safeArea.bottom}}/>}
              {doc.elements.filter(e=>e.visible!==false).map(el=><div key={el.id} className={'element-hit '+(selectedId===el.id?'selected':'')+(el.locked?' locked':'')} style={{left:el.transform.x,top:el.transform.y,width:el.transform.width,height:el.transform.height,zIndex:10000+(el.zIndex??0),transform:'rotate('+el.transform.rotation+'deg)'}} onPointerDown={e=>{setSelectedId(el.id);startDrag(e,el,'move',el.id)}} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>{selectedId===el.id&&editable&&!el.locked&&<i className="resize-handle" onPointerDown={e=>startDrag(e,el,'resize',el.id)} onPointerMove={moveDrag} onPointerUp={endDrag}/>}</div>)}
              {doc.elements.filter((rep:any)=>rep.type==='REPEATER'&&rep.repeat&&(selectedId===rep.id||selectedId?.startsWith(rep.id+'::'))).flatMap((rep:any)=>(rep.repeat.template??[]).filter((child:any)=>child.visible!==false).map((child:any)=>{const key=rep.id+'::'+child.id;return <div key={key} className={'element-hit row-template-hit '+(selectedId===key?'selected':'')+(child.locked?' locked':'')} style={{left:rep.transform.x+child.transform.x,top:rep.transform.y+child.transform.y,width:child.transform.width,height:child.transform.height,zIndex:13000+(child.zIndex??0),transform:'rotate('+child.transform.rotation+'deg)'}} onPointerDown={e=>{setSelectedId(key);startDrag(e,child,'move',key)}} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>{selectedId===key&&editable&&!child.locked&&<i className="resize-handle" onPointerDown={e=>startDrag(e,child,'resize',key)} onPointerMove={moveDrag} onPointerUp={endDrag}/>}<span className="row-template-tag">ROW TEMPLATE</span></div>}))}
            </div>
          </div>
        </div>
      </section>

      <aside className="inspector">
        {!selected?<div className="no-selection">Select a layer.</div>:<>
          <header><input value={selected.name} disabled={!editable} onChange={e=>patchSelected(el=>el.name=e.target.value)}/><span>{selection?.nested?'ROW TEMPLATE · ':''}{selected.type}</span></header>
          <details open><summary>LAYOUT</summary><div className="field-grid">{[['X','x'],['Y','y'],['W','width'],['H','height'],['ROT','rotation'],['OPACITY','opacity']].map(([label,key])=><label key={key}><span>{label}</span><input type="number" step={key==='opacity'?0.05:1} value={selected.transform[key]} disabled={!editable} onChange={e=>patchSelected(el=>el.transform[key]=Number(e.target.value))}/></label>)}</div><div className="inline-actions"><button disabled={!editable} onClick={()=>patchSelected(el=>el.transform.flipX=!el.transform.flipX)}>FLIP H</button><button disabled={!editable} onClick={()=>patchSelected(el=>el.transform.flipY=!el.transform.flipY)}>FLIP V</button><button disabled={!editable} onClick={()=>patchSelected(el=>el.locked=!el.locked)}>{selected.locked?'UNLOCK':'LOCK'}</button><button disabled={!editable} onClick={()=>patchSelected(el=>el.visible=!el.visible)}>{selected.visible?'HIDE':'SHOW'}</button></div></details>
          <details open><summary>DESIGN / STYLE</summary><div className="full-field"><span>FILL TYPE</span><select disabled={!editable} value={selected.style?.fill?.type??'SOLID'} onChange={e=>patchSelected(el=>{const type=e.target.value;if(type==='SOLID')el.style.fill={type:'SOLID',color:fillColor(el)};else el.style.fill={type,angle:0,stops:[{offset:0,color:'#0b2534'},{offset:1,color:'#19d18f'}]};})}><option value="SOLID">SOLID</option><option value="LINEAR_GRADIENT">LINEAR GRADIENT</option><option value="RADIAL_GRADIENT">RADIAL GRADIENT</option></select></div>{selected.style?.fill?.type==='SOLID'?<div className="field-grid"><label><span>FILL</span><input type="color" disabled={!editable} value={fillColor(selected)} onChange={e=>patchSelected(el=>el.style.fill={type:'SOLID',color:e.target.value})}/></label><label><span>STROKE</span><input type="color" disabled={!editable} value={strokeColor(selected)} onChange={e=>patchSelected(el=>el.style.stroke={type:'SOLID',color:e.target.value})}/></label></div>:<div className="gradient-editor"><label><span>START</span><input type="color" disabled={!editable} value={selected.style.fill.stops?.[0]?.color??'#0b2534'} onChange={e=>patchSelected(el=>el.style.fill.stops[0].color=e.target.value)}/></label><label><span>END</span><input type="color" disabled={!editable} value={selected.style.fill.stops?.[selected.style.fill.stops.length-1]?.color??'#19d18f'} onChange={e=>patchSelected(el=>el.style.fill.stops[el.style.fill.stops.length-1].color=e.target.value)}/></label>{selected.style.fill.type==='LINEAR_GRADIENT'&&<label><span>ANGLE</span><input type="number" disabled={!editable} value={selected.style.fill.angle??0} onChange={e=>patchSelected(el=>el.style.fill.angle=Number(e.target.value))}/></label>}</div>}<div className="field-grid"><label><span>STROKE PX</span><input type="number" disabled={!editable} value={selected.style?.strokeWidth??0} onChange={e=>patchSelected(el=>el.style.strokeWidth=Number(e.target.value))}/></label><label><span>BLUR</span><input type="number" disabled={!editable} value={selected.style?.blur??0} onChange={e=>patchSelected(el=>el.style.blur=Number(e.target.value))}/></label><label><span>GLOW</span><input type="number" disabled={!editable} value={selected.style?.glow??0} onChange={e=>patchSelected(el=>el.style.glow=Number(e.target.value))}/></label><label><span>NOISE</span><input type="number" step=".05" min="0" max="1" disabled={!editable} value={selected.style?.noise??0} onChange={e=>patchSelected(el=>el.style.noise=Number(e.target.value))}/></label></div><div className="fill-bindings"><span>TEAM-AWARE COLOUR</span><button disabled={!editable} onClick={()=>bindVariable({label:'Batting Primary',path:'innings.batting_team.primary_color',kind:'COLOR'})}>BATTING PRIMARY</button><button disabled={!editable} onClick={()=>bindVariable({label:'Bowling Primary',path:'innings.bowling_team.primary_color',kind:'COLOR'})}>BOWLING PRIMARY</button><button disabled={!editable} onClick={()=>bindVariable({label:'Tournament Primary',path:'match.tournament.primary_color',kind:'COLOR'})}>TOURNAMENT</button><button disabled={!editable} onClick={()=>patchSelected(el=>el.bindings=(el.bindings??[]).filter((b:any)=>b.property!=='style.fill.color'))}>FIXED</button></div>{selected.style?.corners&&<div className="corner-grid">{['tl','tr','br','bl'].map(k=><label key={k}><span>{k.toUpperCase()}</span><input type="number" disabled={!editable} value={selected.style.corners[k]} onChange={e=>patchSelected(el=>el.style.corners[k]=Number(e.target.value))}/></label>)}</div>}</details>
          {selected.type==='TEXT'&&<details open><summary>TYPOGRAPHY</summary><label className="full-field"><span>TEXT</span><textarea disabled={!editable} value={selected.text?.value??''} onChange={e=>patchSelected(el=>el.text.value=e.target.value)}/></label><div className="field-grid"><label><span>FONT</span><input disabled={!editable} value={selected.text.typography.fontFamily} onChange={e=>patchSelected(el=>el.text.typography.fontFamily=e.target.value)}/></label><label><span>WEIGHT</span><input type="number" min="100" max="1000" step="50" disabled={!editable} value={selected.text.typography.fontWeight} onChange={e=>patchSelected(el=>el.text.typography.fontWeight=Number(e.target.value))}/></label><label><span>SIZE</span><input type="number" disabled={!editable} value={selected.text.typography.fontSize} onChange={e=>patchSelected(el=>el.text.typography.fontSize=Number(e.target.value))}/></label><label><span>LINE</span><input type="number" step=".05" disabled={!editable} value={selected.text.typography.lineHeight} onChange={e=>patchSelected(el=>el.text.typography.lineHeight=Number(e.target.value))}/></label><label><span>TRACK</span><input type="number" step=".1" disabled={!editable} value={selected.text.typography.letterSpacing} onChange={e=>patchSelected(el=>el.text.typography.letterSpacing=Number(e.target.value))}/></label><label><span>MAX LINES</span><input type="number" min="1" disabled={!editable} value={selected.text.typography.maxLines} onChange={e=>patchSelected(el=>el.text.typography.maxLines=Number(e.target.value))}/></label></div><div className="select-grid"><select disabled={!editable} value={selected.text.typography.align} onChange={e=>patchSelected(el=>el.text.typography.align=e.target.value)}><option>LEFT</option><option>CENTER</option><option>RIGHT</option></select><select disabled={!editable} value={selected.text.typography.case} onChange={e=>patchSelected(el=>el.text.typography.case=e.target.value)}><option>NONE</option><option>UPPER</option><option>LOWER</option><option>TITLE</option></select><select disabled={!editable} value={selected.text.typography.wrap} onChange={e=>patchSelected(el=>el.text.typography.wrap=e.target.value)}><option>SHRINK</option><option>WRAP</option><option>TRUNCATE</option><option>AUTO_SIZE</option></select></div></details>}
          <details><summary>DATA</summary><label className="full-field"><span>BIND TEXT/ASSET/VISIBILITY PATH</span><input disabled={!editable} placeholder="e.g. current.striker.name" value={selected.bindings?.[0]?.path??''} onChange={e=>patchSelected(el=>{const prop=el.type==='TEXT'?'text.value':el.type==='IMAGE'?'asset.url':'visible';el.bindings=[{property:prop,path:e.target.value,fallback:el.type==='TEXT'?'—':'',format:el.type==='IMAGE'?'IMAGE_URL':'RAW',prefix:'',suffix:''},...(el.bindings??[]).slice(1)];})}/></label><p className="inspector-help">Bindings are resolved by the same renderer used on air. Missing values resolve to fallbacks instead of raw null/undefined.</p></details>{selected.type==='REPEATER'&&selected.repeat&&<details open><summary>REPEATER / SCORECARD ROWS</summary><label className="full-field"><span>DATA LIST</span><select disabled={!editable} value={selected.repeat.path} onChange={e=>patchSelected(el=>el.repeat.path=e.target.value)}><option value="batting_scorecard">Batting Scorecard · full XI</option><option value="bowling_scorecard">Bowling Scorecard</option><option value="playing_xi.home">Home Playing XI</option><option value="playing_xi.away">Away Playing XI</option></select></label><div className="field-grid"><label><span>MAX ROWS</span><input type="number" min="1" max="30" disabled={!editable} value={selected.repeat.limit} onChange={e=>patchSelected(el=>el.repeat.limit=Number(e.target.value))}/></label><label><span>ROW HEIGHT</span><input type="number" min="20" disabled={!editable} value={selected.repeat.itemHeight} onChange={e=>patchSelected(el=>el.repeat.itemHeight=Number(e.target.value))}/></label><label><span>ROW WIDTH</span><input type="number" min="100" disabled={!editable} value={selected.repeat.itemWidth} onChange={e=>patchSelected(el=>el.repeat.itemWidth=Number(e.target.value))}/></label><label><span>ROW GAP</span><input type="number" min="0" disabled={!editable} value={selected.repeat.gap} onChange={e=>patchSelected(el=>el.repeat.gap=Number(e.target.value))}/></label></div><p className="inspector-help">For a batting scorecard set MAX ROWS to 11 to show the full Playing XI. The factory scorecard already uses 11; Live Data shows however many players are actually registered in the match Playing XI.</p><div className="row-template-list"><b>ROW TEMPLATE LAYERS</b>{selected.repeat.template?.map((child:any)=><button key={child.id} onClick={()=>setSelectedId(selected.id+'::'+child.id)}><span>{child.name}</span><em>{child.type}</em></button>)}</div></details>}
          <details open><summary>ANIMATION</summary><div className="select-grid"><select disabled={!editable} value={selected.animation?.enterPreset??''} onChange={e=>patchSelected(el=>el.animation.enterPreset=e.target.value||null)}><option value="">NONE</option>{PRESETS.map(p=><option key={p}>{p}</option>)}</select><select disabled={!editable} value={selected.animation?.exitPreset??''} onChange={e=>patchSelected(el=>el.animation.exitPreset=e.target.value||null)}><option value="">NONE</option>{PRESETS.map(p=><option key={p}>{p}</option>)}</select></div><div className="field-grid"><label><span>DURATION MS</span><input type="number" disabled={!editable} value={selected.animation?.durationMs??500} onChange={e=>patchSelected(el=>el.animation.durationMs=Number(e.target.value))}/></label><label><span>DELAY MS</span><input type="number" disabled={!editable} value={selected.animation?.delayMs??0} onChange={e=>patchSelected(el=>el.animation.delayMs=Number(e.target.value))}/></label><label><span>EXIT MS</span><input type="number" disabled={!editable} value={selected.animation?.exitDurationMs??300} onChange={e=>patchSelected(el=>el.animation.exitDurationMs=Number(e.target.value))}/></label></div></details>
        </>}
      </aside>
    </div>

    <section className="bottom-dock"><header><button className={bottomTab==='LAYERS'?'active':''} onClick={()=>setBottomTab('LAYERS')}>LAYERS</button><button className={bottomTab==='TIMELINE'?'active':''} onClick={()=>setBottomTab('TIMELINE')}>ANIMATION TIMELINE</button></header>{bottomTab==='LAYERS'?<div className="layers-list">{[...doc.elements].sort((a,b)=>(b.zIndex??0)-(a.zIndex??0)).map(el=><div className={selectedId===el.id?'selected':''} key={el.id} onClick={()=>setSelectedId(el.id)}><button disabled={!editable} onClick={e=>{e.stopPropagation();const next=clone(doc);const x=next.elements.find(q=>q.id===el.id);if(x){x.visible=!x.visible;commit(next)}}}>{el.visible?'◉':'○'}</button><button disabled={!editable} onClick={e=>{e.stopPropagation();const next=clone(doc);const x=next.elements.find(q=>q.id===el.id);if(x){x.locked=!x.locked;commit(next)}}}>{el.locked?'🔒':'◇'}</button><span>{el.name}</span><small>{el.type}</small><button disabled={!editable} onClick={e=>{e.stopPropagation();reorder(el.id,1)}}>↑</button><button disabled={!editable} onClick={e=>{e.stopPropagation();reorder(el.id,-1)}}>↓</button></div>)}</div>:<div className="timeline">{[...doc.elements].sort((a,b)=>(a.animation?.delayMs??0)-(b.animation?.delayMs??0)).map(el=><div key={el.id}><span>{el.name}</span><i style={{marginLeft:Math.min(55,(el.animation?.delayMs??0)/30)+'%',width:Math.max(3,Math.min(42,(el.animation?.durationMs??500)/35))+'%'}}/><small>{el.animation?.delayMs??0}ms → {(el.animation?.delayMs??0)+(el.animation?.durationMs??500)}ms</small></div>)}</div>}</section>
  </main>;
}
