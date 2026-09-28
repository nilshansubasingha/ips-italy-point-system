'use client';

import {CSSProperties,useCallback,useEffect,useMemo,useState} from 'react';
import {createBroadcastClient} from '@/lib/supabase';

type J=Record<string,any>;
type Snapshot={match_id:string;session:J;program:J;release:J;data:J;signal:J};

function initials(name?:string|null){
  return String(name||'IPS').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()).join('');
}
function shortName(team:any){
  return team?.short_name||team?.name||'TEAM';
}
function Logo({team,className=''}:{team:any;className?:string}){
  return <span className={'tv-logo '+className}>{team?.logo_url?<img src={team.logo_url} alt=""/>:<b>{initials(team?.name)}</b>}</span>;
}
function ballClass(label:string){
  if(label==='W')return 'w';
  if(label==='4')return 'four';
  if(label==='6')return 'six';
  if(/^WD|^NB/.test(label))return 'extra';
  return '';
}
function playerName(data:J,kind:'batter'|'bowler',payload:J){
  if(payload?.playerName||payload?.player_name)return String(payload.playerName||payload.player_name);
  if(kind==='bowler')return data.current?.bowler?.name||'BOWLER';
  return data.current?.striker?.name||'BATTER';
}
function scoreText(data:J){
  return data.innings?.score_display||String(data.innings?.runs??0)+'/'+String(data.innings?.wickets??0);
}
function cssVars(data:J):CSSProperties{
  const home=data.match?.home_team||{};
  const away=data.match?.away_team||{};
  const batting=data.innings?.batting_team||{};
  return {
    '--home':home.primary_color||'#ffffff',
    '--away':away.primary_color||'#dfe5e8',
    '--accent':data.match?.tournament?.primary_color||batting.primary_color||'#ffffff',
    '--accent2':batting.secondary_color||'#14191d'
  } as CSSProperties;
}

function Scorebar({data}:{data:J}){
  const inn=data.innings||{};
  const cur=data.current||{};
  const batting=inn.batting_team||{};
  const chase=inn.number===2;
  return <section className="tv-scorebar">
    <div className="tv-scorebar-accent"/>
    <div className="tv-score-main">
      <Logo team={batting}/>
      <div className="tv-team-score">
        <span>{shortName(batting)}</span>
        <strong>{scoreText(data)}</strong>
      </div>
      <div className="tv-overs"><strong>{inn.overs||'0.0'}</strong><span>OV</span></div>
    </div>
    <div className="tv-batters">
      <div className="tv-batter active">
        <span>STRIKER</span><b>{cur.striker?.name||'—'}</b>
        <strong>{cur.striker?.runs??0}<i>{cur.striker?.balls??0}</i></strong>
      </div>
      <div className="tv-batter">
        <span>NON-STRIKER</span><b>{cur.non_striker?.name||'—'}</b>
        <strong>{cur.non_striker?.runs??0}<i>{cur.non_striker?.balls??0}</i></strong>
      </div>
      <div className="tv-bowler">
        <span>BOWLER</span><b>{cur.bowler?.name||'—'}</b>
        <strong>{cur.bowler?.wickets??0}/{cur.bowler?.runs??0}<i>{cur.bowler?.overs||'0.0'}</i></strong>
      </div>
    </div>
    <div className="tv-over-strip">
      <span>THIS OVER</span>
      <div>{(cur.current_over||[]).slice(-8).map((ball:string,i:number)=><i className={ballClass(ball)} key={i}>{ball==='0'?'•':ball}</i>)}</div>
      {inn.free_hit&&<b>FREE HIT</b>}
    </div>
    <div className="tv-context">
      <span>CRR <b>{Number(inn.crr||0).toFixed(2)}</b></span>
      {chase&&<span>TARGET <b>{inn.target??'—'}</b></span>}
      {chase&&inn.runs_required!==null&&<span className="major">NEED <b>{inn.runs_required??0} FROM {inn.balls_remaining??0}</b></span>}
      {chase&&<span>RRR <b>{Number(inn.rrr||0).toFixed(2)}</b></span>}
      <em>{data.match?.tournament?.name||'IPS CRICKET'}</em>
    </div>
  </section>;
}

function EventImpact({variantKey,data,payload}:{variantKey:string;data:J;payload:J}){
  const full=variantKey.includes('fullscreen');
  const kind=variantKey.split('.')[0];
  const label=kind==='four'?'FOUR':kind==='six'?'SIX':kind==='wicket'?'WICKET':kind==='50'?'FIFTY':'CENTURY';
  const mark=kind==='four'?'4':kind==='six'?'6':kind==='wicket'?'W':kind==='50'?'50':'100';
  const dismissed=data.last_delivery?.dismissed_player?.name;
  const person=kind==='wicket'?(payload?.playerName||payload?.player_name||dismissed||'WICKET'):playerName(data,'batter',payload);
  return <section className={'tv-impact '+(full?'full':'lower')+' kind-'+kind}>
    <div className="tv-impact-beam"/>
    <div className="tv-impact-mark">{mark}</div>
    <div className="tv-impact-copy">
      <span>{data.match?.tournament?.name||'IPS CRICKET'}</span>
      <strong>{label}</strong>
      <b>{person}</b>
      <small>{scoreText(data)} · {data.innings?.overs||'0.0'} OV</small>
    </div>
    <div className="tv-impact-rule"/>
  </section>;
}

function PlayerFeature({kind,data,payload}:{kind:'batter'|'bowler';data:J;payload:J}){
  const p=kind==='batter'?(data.current?.striker||{}):(data.current?.bowler||{});
  const name=playerName(data,kind,payload);
  const primary=kind==='batter'?String(p.runs??0):String(p.wickets??0)+'/'+String(p.runs??0);
  const secondary=kind==='batter'?String(p.balls??0)+' BALLS':String(p.overs||'0.0')+' OV';
  const tertiary=kind==='batter'?'SR '+Number(p.strike_rate||0).toFixed(1):'ECON '+Number(p.economy||0).toFixed(2);
  return <section className="tv-player-feature">
    <div className="tv-player-photo">{p.photo_url?<img src={p.photo_url} alt=""/>:<span>{initials(name)}</span>}</div>
    <div className="tv-player-data">
      <span>{kind==='batter'?'ON STRIKE':'CURRENT BOWLER'}</span>
      <strong>{name}</strong>
      <div><b>{primary}</b><i>{secondary}</i><em>{tertiary}</em></div>
    </div>
    <div className="tv-player-edge">IPS</div>
  </section>;
}

function Versus({data}:{data:J}){
  const home=data.match?.home_team||{},away=data.match?.away_team||{};
  return <section className="tv-fullboard tv-versus">
    <div className="tv-board-top"><span>IPS BROADCAST</span><b>{data.match?.tournament?.name||'MATCH'}</b></div>
    <div className="tv-versus-grid">
      <div><Logo team={home}/><strong>{home.name||'HOME'}</strong><span>{home.short_name||''}</span></div>
      <i><small>MATCH</small>VS</i>
      <div><Logo team={away}/><strong>{away.name||'AWAY'}</strong><span>{away.short_name||''}</span></div>
    </div>
    <footer><span>{data.match?.venue||''}</span><b>{data.match?.code||''}</b></footer>
  </section>;
}

function PlayingXI({side,data}:{side:'home'|'away';data:J}){
  const team=data.match?.[side+'_team']||{};
  const players=data.playing_xi?.[side]||[];
  return <section className="tv-fullboard tv-xi">
    <div className="tv-board-top"><span>PLAYING XI</span><b>{data.match?.tournament?.name||'IPS CRICKET'}</b></div>
    <header><Logo team={team}/><div><span>{side.toUpperCase()} TEAM</span><strong>{team.name||'TEAM'}</strong></div></header>
    <div className="tv-xi-list">{players.slice(0,11).map((p:any,i:number)=><div key={p.id||i}>
      <i>{String(i+1).padStart(2,'0')}</i><b>{p.name}</b><span>{p.role||''}</span>
    </div>)}</div>
    <footer><span>{data.match?.venue||''}</span><b>{data.match?.code||''}</b></footer>
  </section>;
}

function Scorecard({type,data}:{type:'batting'|'bowling';data:J}){
  const batting=type==='batting';
  const rows=batting?(data.batting_scorecard||[]):(data.bowling_scorecard||[]);
  const team=batting?data.innings?.batting_team:data.innings?.bowling_team;
  return <section className="tv-fullboard tv-scorecard">
    <div className="tv-board-top"><span>{batting?'BATTING':'BOWLING'} SCORECARD</span><b>{data.match?.tournament?.name||'IPS CRICKET'}</b></div>
    <div className="tv-scorecard-head">
      <div><Logo team={team}/><span>{team?.name||'TEAM'}</span></div>
      <strong>{batting?scoreText(data):(data.innings?.overs||'')}</strong>
    </div>
    <div className={'tv-score-table '+(batting?'batting':'bowling')}>
      <div className="tv-score-columns">{batting?<><b>BATTER</b><span>R</span><span>B</span><span>4</span><span>6</span><span>SR</span></>:<><b>BOWLER</b><span>O</span><span>M</span><span>R</span><span>W</span><span>ECON</span></>}</div>
      {rows.slice(0,11).map((r:any,i:number)=><div className="tv-score-row" key={r.player_id||i}>
        <b>{r.name}<small>{batting?r.dismissal:''}</small></b>
        {batting?<><span>{r.runs}</span><span>{r.balls}</span><span>{r.fours}</span><span>{r.sixes}</span><span>{Number(r.strike_rate||0).toFixed(1)}</span></>:
          <><span>{r.overs}</span><span>{r.maidens}</span><span>{r.runs}</span><span>{r.wickets}</span><span>{Number(r.economy||0).toFixed(2)}</span></>}
      </div>)}
    </div>
    <footer><span>{data.match?.venue||''}</span><b>{data.match?.code||''}</b></footer>
  </section>;
}

function LowerThird({type,data}:{type:'partnership'|'need';data:J}){
  const p=data.current?.partnership||{};
  if(type==='partnership')return <section className="tv-lower-info">
    <span>PARTNERSHIP</span><strong>{p.runs??0}<i>{p.balls??0} BALLS</i></strong>
    <b>{data.current?.striker?.name||'—'} + {data.current?.non_striker?.name||'—'}</b>
  </section>;
  return <section className="tv-lower-info chase">
    <span>CHASE</span><strong>{data.innings?.runs_required??0}<i>FROM {data.innings?.balls_remaining??0}</i></strong>
    <b>TARGET {data.innings?.target??'—'} · RRR {Number(data.innings?.rrr||0).toFixed(2)}</b>
  </section>;
}

function BroadcastSkin({variantKey,data,payload}:{variantKey:string;data:J;payload:J}){
  if(variantKey==='scorebar.default')return <Scorebar data={data}/>;
  if(variantKey==='vs.fullscreen')return <Versus data={data}/>;
  if(variantKey==='playing-xi.home')return <PlayingXI side="home" data={data}/>;
  if(variantKey==='playing-xi.away')return <PlayingXI side="away" data={data}/>;
  if(variantKey==='batter-info.large')return <PlayerFeature kind="batter" data={data} payload={payload}/>;
  if(variantKey==='bowler-info.large')return <PlayerFeature kind="bowler" data={data} payload={payload}/>;
  if(/^four\.|^six\.|^wicket\.|^50\.|^100\./.test(variantKey))return <EventImpact variantKey={variantKey} data={data} payload={payload}/>;
  if(variantKey==='batting-scorecard.fullscreen')return <Scorecard type="batting" data={data}/>;
  if(variantKey==='bowling-scorecard.fullscreen')return <Scorecard type="bowling" data={data}/>;
  if(variantKey==='partnership.lower-third')return <LowerThird type="partnership" data={data}/>;
  if(variantKey==='need-from.lower-third')return <LowerThird type="need" data={data}/>;
  return <section className="tv-unknown"><span>IPS BROADCAST</span><strong>{variantKey}</strong></section>;
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
    const ch=supabase.channel('prism-tv-'+matchId)
      .on('postgres_changes',{event:'*',schema:'public',table:'broadcast_realtime_signals',filter:'match_id=eq.'+matchId},()=>void refresh())
      .on('postgres_changes',{event:'*',schema:'public',table:'match_live_state',filter:'match_id=eq.'+matchId},()=>void refresh())
      .subscribe();
    return()=>{void supabase.removeChannel(ch)};
  },[supabase,matchId,refresh]);

  if(!matchId)return <main className="tv-empty"><b>IPS BROADCAST</b><span>Add ?match=&lt;match-id&gt; to the overlay URL.</span></main>;
  if(error)return <main className="tv-empty"><b>OVERLAY OFFLINE</b><span>{error}</span></main>;
  if(!snapshot)return <main className="tv-empty"><b>IPS BROADCAST</b><span>Connecting to live match…</span></main>;
  if(snapshot.session?.clean_feed)return <main className="tv-output"/>;

  const now=Date.now();
  const layers=(snapshot.program?.active_layers||[])
    .filter((x:J)=>!x.expiresAt||Date.parse(x.expiresAt)>now)
    .sort((a:J,b:J)=>(a.priority??0)-(b.priority??0));
  const manifest=snapshot.release?.manifest?.variants||{};
  const hideScorebar=layers.some((x:J)=>manifest?.[x.variantKey]?.conflictBehavior==='HIDE_SCOREBAR');
  const visible=hideScorebar?layers.filter((x:J)=>x.replacementGroup!=='scorebar'):layers;

  return <main className="tv-output" style={cssVars(snapshot.data||{})}>
    {visible.map((layer:J)=><div className="tv-layer" key={layer.instanceId||layer.variantKey}>
      <BroadcastSkin variantKey={layer.variantKey} data={snapshot.data||{}} payload={layer.payload||{}}/>
    </div>)}
  </main>;
}
