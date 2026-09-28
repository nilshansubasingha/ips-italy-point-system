'use client';

import {useMemo,useState,useTransition} from 'react';
import {
  BROADCAST_GRAPHICS,
  broadcastCategories,
  broadcastGraphic,
  type BroadcastGraphicId,
  type BroadcastMode
} from '@ips/broadcast';
import {emitBroadcastCueAction} from '@/app/matches/[id]/director/actions';

type Context={
  match:{id:string;code:string;number:number;status:string};
  tournament:{name:string};
  home:{team:{name:string}};
  away:{team:{name:string}};
};

type Scoring={
  started:boolean;
  innings_no:number|null;
  runs:number;
  wickets:number;
  target_runs:number|null;
  striker_id:string|null;
  bowler_id:string|null;
  batter_stats:Array<{player_id:string;name:string}>;
  bowler_stats:Array<{player_id:string;name:string}>;
};

function cuePayload(fields:{
  title:string;
  subtitle:string;
  playerName:string;
  teamName:string;
  message:string;
  sponsor:string;
}){
  const payload:Record<string,unknown>={};
  if(fields.title.trim())payload.title=fields.title.trim();
  if(fields.subtitle.trim())payload.subtitle=fields.subtitle.trim();
  if(fields.playerName.trim())payload.playerName=fields.playerName.trim();
  if(fields.teamName.trim())payload.teamName=fields.teamName.trim();
  if(fields.message.trim())payload.message=fields.message.trim();
  if(fields.sponsor.trim())payload.sponsor=fields.sponsor.trim();
  return payload;
}

export function DirectorStudio({
  context,
  scoring,
  overlayUrl
}:{
  context:Context;
  scoring:Scoring;
  overlayUrl:string;
}){
  const [selected,setSelected]=useState<BroadcastGraphicId>('MATCH_INTRO');
  const definition=broadcastGraphic(selected)!;
  const [mode,setMode]=useState<BroadcastMode>(definition.defaultMode);
  const [title,setTitle]=useState('');
  const [subtitle,setSubtitle]=useState('');
  const [playerName,setPlayerName]=useState('');
  const [teamName,setTeamName]=useState('');
  const [message,setMessage]=useState('');
  const [sponsor,setSponsor]=useState('');
  const [notice,setNotice]=useState<{type:'ok'|'error';text:string}|null>(null);
  const [pending,startTransition]=useTransition();

  const striker=scoring.batter_stats?.find(player=>player.player_id===scoring.striker_id);
  const bowler=scoring.bowler_stats?.find(player=>player.player_id===scoring.bowler_id);
  const previewSrc=overlayUrl+'?match='+encodeURIComponent(context.match.id)+'&output=preview';
  const programSrc=overlayUrl+'?match='+encodeURIComponent(context.match.id)+'&output=program';

  const fields={title,subtitle,playerName,teamName,message,sponsor};

  function chooseGraphic(id:BroadcastGraphicId){
    const next=broadcastGraphic(id);
    if(!next)return;
    setSelected(id);
    setMode(next.defaultMode);
    setNotice(null);
    if(id==='BATTER_INTRO'||id==='LOWER_THIRD'||id==='FIFTY'||id==='CENTURY'||id==='DISMISSAL'){
      setPlayerName(striker?.name??'');
    }else if(id==='BOWLER_INTRO'||id==='FIVE_WICKETS'||id==='HAT_TRICK'){
      setPlayerName(bowler?.name??'');
    }
  }

  function send(output:'PREVIEW'|'PROGRAM',behavior:'PREVIEW'|'TAKE'|'AUTO'|'CUT'){
    setNotice(null);
    const current=broadcastGraphic(selected);
    if(!current)return;
    const duration=behavior==='AUTO'?current.defaultDurationMs:null;
    startTransition(async()=>{
      const result=await emitBroadcastCueAction({
        matchId:context.match.id,
        output,
        graphic:selected,
        mode,
        layer:current.layer,
        durationMs:duration,
        payload:{...cuePayload(fields),transition:behavior}
      });
      setNotice(result.ok
        ?{type:'ok',text:(output==='PREVIEW'?'Preview':'Program')+' cue sent: '+current.label}
        :{type:'error',text:result.error});
    });
  }

  function hide(output:'PREVIEW'|'PROGRAM'){
    setNotice(null);
    const current=broadcastGraphic(selected);
    if(!current)return;
    startTransition(async()=>{
      const result=await emitBroadcastCueAction({
        matchId:context.match.id,
        output,
        graphic:'CLEAR_LAYER',
        mode:'COMPACT',
        layer:current.layer,
        durationMs:0,
        payload:{}
      });
      setNotice(result.ok
        ?{type:'ok',text:(output==='PREVIEW'?'Preview':'Program')+' layer '+String(current.layer)+' cleared.'}
        :{type:'error',text:result.error});
    });
  }

  const groups=useMemo(()=>broadcastCategories.map(category=>({
    ...category,
    items:category.graphics.map(id=>BROADCAST_GRAPHICS.find(item=>item.id===id)).filter(Boolean)
  })),[]);

  return <main className="director-shell">
    <header className="director-topbar">
      <div>
        <span>IPS BROADCAST CONTROL</span>
        <strong>{context.match.code}</strong>
      </div>
      <div className="director-match">
        <b>{context.home.team.name}</b><i>vs</i><b>{context.away.team.name}</b>
        <span>{context.tournament.name}</span>
      </div>
      <a href={'/matches/'+context.match.id}>SCORER ↗</a>
    </header>

    <section className="director-monitors">
      <article>
        <header><span>PREVIEW</span><b>PVW</b></header>
        <div className="director-monitor-screen preview">
          <div className="director-video-bed"><span>PREVIEW BUS</span></div>
          <iframe title="Broadcast preview output" src={previewSrc}/>
        </div>
      </article>
      <article>
        <header><span>PROGRAM</span><b>PGM</b></header>
        <div className="director-monitor-screen program">
          <div className="director-video-bed"><span>PROGRAM BUS</span></div>
          <iframe title="Broadcast program output" src={programSrc}/>
        </div>
      </article>
    </section>

    <section className="director-workspace">
      <nav className="director-library">
        <div className="director-library-title"><span>GRAPHICS</span><b>{BROADCAST_GRAPHICS.length} templates</b></div>
        {groups.map(group=><section key={group.id}>
          <h2>{group.label}</h2>
          <div>
            {group.items.map(item=>item&&<button
              type="button"
              key={item.id}
              className={selected===item.id?'active':''}
              onClick={()=>chooseGraphic(item.id)}
            >
              <span>L{item.layer}</span>
              <b>{item.label}</b>
            </button>)}
          </div>
        </section>)}
      </nav>

      <section className="director-editor">
        <header>
          <div><span>SELECTED GRAPHIC</span><h1>{definition.label}</h1></div>
          <b className="director-layer-chip">LAYER {definition.layer}</b>
        </header>

        <div className="director-mode-row">
          {definition.modes.map(item=><button
            type="button"
            key={item}
            className={mode===item?'active':''}
            onClick={()=>setMode(item)}
          >{item.replaceAll('_',' ')}</button>)}
        </div>

        <div className="director-fields">
          <label><span>TITLE / LABEL</span><input value={title} onChange={event=>setTitle(event.target.value)} placeholder="Optional override"/></label>
          <label><span>SUBTITLE / DECISION</span><input value={subtitle} onChange={event=>setSubtitle(event.target.value)} placeholder="Optional supporting line"/></label>
          <label><span>PLAYER</span><input value={playerName} onChange={event=>setPlayerName(event.target.value)} placeholder={striker?.name??'Player name'}/></label>
          <label><span>TEAM</span><input value={teamName} onChange={event=>setTeamName(event.target.value)} placeholder={context.home.team.name}/></label>
          <label className="wide"><span>MESSAGE</span><input value={message} onChange={event=>setMessage(event.target.value)} placeholder="Holding message, result context, replay angle, etc."/></label>
          <label className="wide"><span>SPONSOR</span><input value={sponsor} onChange={event=>setSponsor(event.target.value)} placeholder="Optional sponsor label"/></label>
        </div>

        <div className="director-live-context">
          <span>LIVE DATA</span>
          <b>{scoring.started?String(scoring.runs)+'/'+String(scoring.wickets):'NOT STARTED'}</b>
          <i>Innings {scoring.innings_no??'—'}</i>
          <i>Striker {striker?.name??'—'}</i>
          <i>Bowler {bowler?.name??'—'}</i>
          {scoring.target_runs&&<i>Target {scoring.target_runs}</i>}
        </div>

        {notice&&<div className={'director-notice '+notice.type}>{notice.text}</div>}

        <div className="director-actions">
          <div>
            <button type="button" className="preview" disabled={pending} onClick={()=>send('PREVIEW','PREVIEW')}>PREVIEW</button>
            <button type="button" disabled={pending} onClick={()=>hide('PREVIEW')}>CLEAR PVW</button>
          </div>
          <div>
            <button type="button" className="take" disabled={pending} onClick={()=>send('PROGRAM','TAKE')}>TAKE LIVE</button>
            <button type="button" className="auto" disabled={pending} onClick={()=>send('PROGRAM','AUTO')}>AUTO</button>
            <button type="button" disabled={pending} onClick={()=>send('PROGRAM','CUT')}>CUT</button>
            <button type="button" className="hide" disabled={pending} onClick={()=>hide('PROGRAM')}>HIDE</button>
          </div>
        </div>

        <footer className="director-template-meta">
          <span>DEFAULT {definition.defaultMode.replaceAll('_',' ')}</span>
          <span>{definition.defaultDurationMs===null?'MANUAL HOLD':String((definition.defaultDurationMs/1000).toFixed(1))+'s AUTO'}</span>
          <span>PRIORITY {definition.priority}</span>
          <span>{definition.hidesScorebar?'FULLSCREEN HIDES SCOREBAR':'SCOREBAR COMPATIBLE'}</span>
        </footer>
      </section>
    </section>
  </main>;
}
