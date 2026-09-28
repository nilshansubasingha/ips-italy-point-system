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
  </main>;
}
