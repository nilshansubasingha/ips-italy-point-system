'use client';

import {useMemo,useState,useTransition} from 'react';
import {setBroadcastGraphicAction} from '@/app/matches/[id]/director/actions';

const groups=[
  {name:'MATCH',items:['MATCH_INTRO','VS','TOSS','PLAYING_XI','TARGET','INNINGS_BREAK','RESULT','CHAMPIONS']},
  {name:'PLAYERS',items:['LOWER_THIRD','BATTER_INTRO','BOWLER_INTRO','PLAYER_STATS','PLAYER_OF_MATCH']},
  {name:'EVENTS',items:['FOUR','SIX','WICKET','FIFTY','CENTURY','FIVE_WICKETS','HAT_TRICK','PARTNERSHIP','FREE_HIT','POWERPLAY']},
  {name:'CARDS',items:['SCORECARD','BATTING_SCORECARD','BOWLING_SCORECARD','STANDINGS','TEAM_STATS']},
  {name:'PRODUCTION',items:['REPLAY','SPONSOR','NEXT_MATCH','BREAK_GRAPHIC']}
] as const;

export function BroadcastDirector({matchId,overlayUrl,matchName}:{matchId:string;overlayUrl:string;matchName:string}){
  const [mode,setMode]=useState<'FULLSCREEN'|'LOWER_THIRD'|'SIDE_PANEL'|'COMPACT'>('COMPACT');
  const [title,setTitle]=useState('');
  const [subtitle,setSubtitle]=useState('');
  const [value,setValue]=useState('');
  const [duration,setDuration]=useState(5000);
  const [selected,setSelected]=useState('SIX');
  const [notice,setNotice]=useState('');
  const [pending,startTransition]=useTransition();
  const previewSrc=useMemo(()=>overlayUrl+'/?match='+encodeURIComponent(matchId),[overlayUrl,matchId]);

  const send=(graphic=selected,visible=true,instant=false)=>startTransition(async()=>{
    const result=await setBroadcastGraphicAction({matchId,graphic,mode,payload:{title:title||graphic.replaceAll('_',' '),subtitle,value},visible,durationMs:instant?600:duration,transition:instant?'CUT':'AUTO'});
    setNotice(result.ok?(visible?graphic.replaceAll('_',' ')+' is live.':'Graphics hidden.'):result.error);
  });

  return <main className="director-studio">
    <header className="director-head"><div><span>IPS BROADCAST CONTROL</span><h1>Director Studio</h1><p>{matchName}</p></div><a href={previewSrc} target="_blank" rel="noreferrer">OPEN CLEAN OUTPUT ↗</a></header>
    <section className="director-workspace">
      <div className="director-preview"><div className="monitor-label"><b>PROGRAM / OVERLAY</b><span>{pending?'SENDING…':'CONNECTED'}</span></div><iframe src={previewSrc} title="IPS overlay output"/></div>
      <aside className="director-inspector">
        <label>MODE<select value={mode} onChange={e=>setMode(e.target.value as any)}><option>COMPACT</option><option>LOWER_THIRD</option><option>SIDE_PANEL</option><option>FULLSCREEN</option></select></label>
        <label>HEADLINE<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Auto from trigger"/></label>
        <label>SECONDARY<input value={subtitle} onChange={e=>setSubtitle(e.target.value)} placeholder="Player / team / context"/></label>
        <label>VALUE<input value={value} onChange={e=>setValue(e.target.value)} placeholder="6 / 100 / target etc."/></label>
        <label>DURATION <b>{(duration/1000).toFixed(1)}s</b><input type="range" min="1000" max="15000" step="500" value={duration} onChange={e=>setDuration(Number(e.target.value))}/></label>
        <div className="take-row"><button className="preview">PREVIEW</button><button className="take" onClick={()=>send()}>TAKE LIVE</button><button onClick={()=>send('NONE',false)}>HIDE</button><button onClick={()=>send(selected,true,true)}>CUT</button></div>
        {notice&&<p className="director-notice">{notice}</p>}
      </aside>
    </section>
    <section className="trigger-bank">
      {groups.map(group=><div className="trigger-group" key={group.name}><h2>{group.name}</h2><div>{group.items.map(item=><button key={item} className={selected===item?'selected':''} onClick={()=>{setSelected(item);setTitle('');setValue(item==='FOUR'?'4':item==='SIX'?'6':'')}}><span>{item.replaceAll('_',' ')}</span><small>{['FOUR','SIX','WICKET'].includes(item)?'FULL / COMPACT':'GRAPHIC'}</small></button>)}</div></div>)}
    </section>
  <style jsx global>{`
.director-studio{min-height:100vh;padding:24px;background:#080d12;color:#eef3f6;font-family:Inter,Arial,sans-serif}
.director-head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;max-width:1500px;margin:0 auto 18px}.director-head span{font-size:8px;font-weight:900;letter-spacing:.18em;color:#ffcf32}.director-head h1{margin:4px 0 2px;font-size:32px;letter-spacing:-.04em}.director-head p{margin:0;color:#80909b;font-size:10px}.director-head a{padding:10px 13px;border:1px solid #2b3841;color:#fff;text-decoration:none;font-size:8px;font-weight:900;letter-spacing:.1em}
.director-workspace{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(270px,.55fr);gap:12px;max-width:1500px;margin:auto}.director-preview,.director-inspector,.trigger-group{border:1px solid #202c34;background:#0d141a}.director-preview{padding:10px}.monitor-label{display:flex;justify-content:space-between;padding:0 2px 8px;font-size:7px;font-weight:900;letter-spacing:.13em;color:#84939d}.monitor-label span{color:#68dfb5}.director-preview iframe{display:block;width:100%;aspect-ratio:16/9;border:0;background:#111}
.director-inspector{padding:15px;display:flex;flex-direction:column;gap:12px}.director-inspector label{display:flex;flex-direction:column;gap:6px;font-size:7px;font-weight:900;letter-spacing:.13em;color:#8d9ba5}.director-inspector input,.director-inspector select{width:100%;border:1px solid #2b3943;background:#080d12;color:#fff;padding:10px 11px;font:inherit;font-size:10px;letter-spacing:0;outline:none}.director-inspector input:focus,.director-inspector select:focus{border-color:#ffcf32}.director-inspector label>b{color:#fff}.take-row{display:grid;grid-template-columns:1fr 1.2fr 1fr 1fr;gap:5px;margin-top:5px}.take-row button{min-height:42px;border:1px solid #34424b;background:#111a21;color:#dce5ea;font-size:7px;font-weight:950;letter-spacing:.09em;cursor:pointer}.take-row .take{background:#ffcf32;color:#090d10;border-color:#ffcf32}.take-row .preview{border-color:#60d8b2;color:#6fe3c1}.director-notice{margin:0;padding:9px;background:#111b22;color:#afbdc5;font-size:8px}
.trigger-bank{max-width:1500px;margin:12px auto 0;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.trigger-group{padding:10px}.trigger-group h2{margin:0 0 8px;font-size:7px;letter-spacing:.17em;color:#8998a2}.trigger-group>div{display:grid;grid-template-columns:1fr 1fr;gap:5px}.trigger-group button{min-height:52px;padding:8px;border:1px solid #26343d;background:#111a21;color:#e7eef2;text-align:left;cursor:pointer}.trigger-group button.selected{border-color:#ffcf32;box-shadow:inset 0 -3px #ffcf32}.trigger-group button span{display:block;font-size:8px;font-weight:900}.trigger-group button small{display:block;margin-top:4px;font-size:6px;color:#70818c}
@media(max-width:1100px){.director-workspace{grid-template-columns:1fr}.trigger-bank{grid-template-columns:repeat(2,1fr)}}@media(max-width:650px){.director-studio{padding:12px}.director-head{align-items:flex-start;flex-direction:column}.trigger-bank{grid-template-columns:1fr}}
`}</style>
  </main>;
}
