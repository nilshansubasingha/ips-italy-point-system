'use client';

import {CSSProperties,ReactNode,useCallback,useEffect,useMemo,useState} from 'react';
import {createBroadcastClient} from '@/lib/supabase';

type J=Record<string,any>;
type Snapshot={match_id:string;session:J;program:J;release:J;data:J;signal:J};

function initials(name?:string|null){
  return String(name||'IPS').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()).join('');
}
function teamName(team:any){
  return team?.name||team?.short_name||'TEAM';
}
function Logo({team,className=''}:{team:any;className?:string}){
  return <span className={'tv-logo '+className}>{team?.logo_url?<img src={team.logo_url} alt=""/>:<b>{initials(team?.name)}</b>}</span>;
}
function PlayerThumb({player}:{player:any}){
  return <span className="tv-player-thumb">{player?.photo_url?<img src={player.photo_url} alt=""/>:<b>{initials(player?.name)}</b>}</span>;
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
    '--accent':data.match?.tournament?.primary_color||batting.primary_color||'#22d89a',
    '--accent2':batting.secondary_color||'#14191d'
  } as CSSProperties;
}
function sponsorFrom(payload:J){
  const sponsor=payload?.sponsor;
  if(!sponsor||(!sponsor.name&&!sponsor.logo_url&&!sponsor.logoUrl))return null;
  return {
    name:String(sponsor.name||'Sponsor'),
    logoUrl:String(sponsor.logo_url||sponsor.logoUrl||''),
    message:String(sponsor.message||'SPONSORED BY'),
    placement:String(sponsor.placement||'auto').toLowerCase()
  };
}
function SponsorTag({payload,kind}:{payload:J;kind:string}){
  const sponsor=sponsorFrom(payload);
  if(!sponsor)return null;
  const auto=kind==='scorebar'?'scorebar':kind==='fullscreen'?'top-right':'lower-third';
  const placement=sponsor.placement==='auto'?auto:sponsor.placement;
  return <aside className={'tv-sponsor-tag place-'+placement}>
    <span>{sponsor.message||'SPONSORED BY'}</span>
    {sponsor.logoUrl?<img src={sponsor.logoUrl} alt=""/>:<b>{sponsor.name}</b>}
  </aside>;
}

function Scorebar({data,payload}:{data:J;payload:J}){
  const inn=data.innings||{};
  const cur=data.current||{};
  const batting=inn.batting_team||{};
  const chase=inn.number===2;
  const showPhotos=Boolean(payload?.scorebar?.showBatterPhotos??payload?.showBatterPhotos);
  const overBalls=(cur.current_over||[]).slice(-8);
  return <section className="tv-scorebar">
    <div className="tv-scorebar-accent"/>
    <div className="tv-score-main">
      <Logo team={batting}/>
      <div className="tv-team-score">
        <span>{teamName(batting)}</span>
        <strong>{scoreText(data)}</strong>
      </div>
    </div>

    <div className={'tv-batters '+(showPhotos?'with-photos':'')}>
      <div className="tv-batter active">
        {showPhotos&&<PlayerThumb player={cur.striker}/>}
        <div className="tv-person-copy"><span>STRIKER</span><b>{cur.striker?.name||'—'}</b></div>
        <strong>{cur.striker?.runs??0}<i>{cur.striker?.balls??0}</i></strong>
      </div>
      <div className="tv-batter">
        {showPhotos&&<PlayerThumb player={cur.non_striker}/>}
        <div className="tv-person-copy"><span>NON-STRIKER</span><b>{cur.non_striker?.name||'—'}</b></div>
        <strong>{cur.non_striker?.runs??0}<i>{cur.non_striker?.balls??0}</i></strong>
      </div>
      <div className="tv-bowler">
        <div className="tv-person-copy">
          <span>BOWLER</span>
          <b>{cur.bowler?.name||'—'}</b>
          <small>{cur.bowler?.overs||'0.0'} OV</small>
        </div>
        <strong>{cur.bowler?.wickets??0}/{cur.bowler?.runs??0}<i>{Number(cur.bowler?.economy||0).toFixed(2)}</i></strong>
        <div className="tv-bowler-over">
          <em>THIS OVER</em>
          <div>{overBalls.length?overBalls.map((ball:string,i:number)=><i className={ballClass(ball)} key={i}>{ball==='0'?'•':ball}</i>):<small>—</small>}</div>
          {inn.free_hit&&<b>FREE HIT</b>}
        </div>
      </div>
    </div>

    <div className="tv-context">
      <span>CRR <b>{Number(inn.crr||0).toFixed(2)}</b></span>
      {chase&&<span>TARGET <b>{inn.target??'—'}</b></span>}
      {chase&&inn.runs_required!==null&&<span className="major"><b>{inn.runs_required??0}</b> RUNS NEEDED FROM <b>{inn.balls_remaining??0}</b> BALLS</span>}
      {chase&&<span>RRR <b>{Number(inn.rrr||0).toFixed(2)}</b></span>}
      <em>{data.match?.tournament?.name||'IPS CRICKET'}</em>
    </div>
    <SponsorTag payload={payload} kind="scorebar"/>
  </section>;
}

function ScorebarEvent({variantKey,data,payload}:{variantKey:string;data:J;payload:J}){
  const kind=variantKey.split('.')[0];
  const label=kind==='four'?'FOUR':kind==='six'?'SIX':'WICKET';
  const mark=kind==='four'?'4':kind==='six'?'6':'W';
  const person=kind==='wicket'
    ?(payload?.playerName||payload?.player_name||data.last_delivery?.dismissed_player?.name||'WICKET')
    :playerName(data,'batter',payload);
  return <section className={'tv-scorebar-event kind-'+kind}>
    <div className="tv-scorebar-event-sweep"/>
    <div className="tv-scorebar-event-mark">{mark}</div>
    <div className="tv-scorebar-event-copy">
      <span>{kind==='wicket'?'DISMISSAL':'BOUNDARY'}</span>
      <strong>{label}</strong>
      <b>{person}</b>
    </div>
    <div className="tv-scorebar-event-score">{scoreText(data)}<small>{data.innings?.overs||'0.0'} OV</small></div>
    <SponsorTag payload={payload} kind="lower-third"/>
  </section>;
}

function EventImpact({variantKey,data,payload}:{variantKey:string;data:J;payload:J}){
  const kind=variantKey.split('.')[0];
  const label=kind==='four'?'FOUR':kind==='six'?'SIX':kind==='wicket'?'WICKET':kind==='50'?'FIFTY':'CENTURY';
  const mark=kind==='four'?'4':kind==='six'?'6':kind==='wicket'?'W':kind==='50'?'50':'100';
  const dismissed=data.last_delivery?.dismissed_player?.name;
  const person=kind==='wicket'?(payload?.playerName||payload?.player_name||dismissed||'WICKET'):playerName(data,'batter',payload);
  return <section className={'tv-impact full kind-'+kind}>
    <div className="tv-impact-beam"/>
    <div className="tv-impact-mark">{mark}</div>
    <div className="tv-impact-copy">
      <span>{data.match?.tournament?.name||'IPS CRICKET'}</span>
      <strong>{label}</strong>
      <b>{person}</b>
      <small>{scoreText(data)} · {data.innings?.overs||'0.0'} OV</small>
    </div>
    <div className="tv-impact-rule"/>
    <SponsorTag payload={payload} kind="fullscreen"/>
  </section>;
}

function PlayerFeature({kind,data,payload}:{kind:'batter'|'bowler';data:J;payload:J}){
  const p=kind==='batter'?(data.current?.striker||{}):(data.current?.bowler||{});
  const name=playerName(data,kind,payload);
  const primary=kind==='batter'?String(p.runs??0):String(p.wickets??0)+'/'+String(p.runs??0);
  const secondary=kind==='batter'?String(p.balls??0)+' BALLS':String(p.overs||'0.0')+' OV';
  const tertiary=kind==='batter'?'SR '+Number(p.strike_rate||0).toFixed(1):'ECON '+Number(p.economy||0).toFixed(2);
  return <section className={'tv-player-feature '+kind}>
    <div className="tv-player-photo">{p.photo_url?<img src={p.photo_url} alt=""/>:<span>{initials(name)}</span>}</div>
    <div className="tv-player-data">
      <span>{kind==='batter'?'NEW BATTER':'NEW OVER · BOWLER'}</span>
      <strong>{name}</strong>
      <div><b>{primary}</b><i>{secondary}</i><em>{tertiary}</em></div>
    </div>
    <div className="tv-player-edge">{kind==='batter'?'BAT':'BOWL'}</div>
    <SponsorTag payload={payload} kind="lower-third"/>
  </section>;
}

function Versus({data,payload}:{data:J;payload:J}){
  const home=data.match?.home_team||{},away=data.match?.away_team||{};
  return <section className="tv-fullboard tv-versus">
    <div className="tv-board-top"><span>IPS BROADCAST</span><b>{data.match?.tournament?.name||'MATCH'}</b></div>
    <div className="tv-versus-grid">
      <div><Logo team={home}/><strong>{home.name||'HOME'}</strong><span>{home.short_name||''}</span></div>
      <i><small>MATCH</small>VS</i>
      <div><Logo team={away}/><strong>{away.name||'AWAY'}</strong><span>{away.short_name||''}</span></div>
    </div>
    <footer><span>{data.match?.venue||''}</span><b>{data.match?.code||''}</b></footer>
    <SponsorTag payload={payload} kind="fullscreen"/>
  </section>;
}

function PlayingXI({side,data,payload}:{side:'home'|'away';data:J;payload:J}){
  const team=data.match?.[side+'_team']||{};
  const players=data.playing_xi?.[side]||[];
  return <section className="tv-fullboard tv-xi">
    <div className="tv-board-top"><span>PLAYING XI</span><b>{data.match?.tournament?.name||'IPS CRICKET'}</b></div>
    <header><Logo team={team}/><div><span>{side.toUpperCase()} TEAM</span><strong>{team.name||'TEAM'}</strong></div></header>
    <div className="tv-xi-list">{players.slice(0,11).map((p:any,i:number)=><div key={p.id||i}>
      <i>{String(i+1).padStart(2,'0')}</i><b>{p.name}</b><span>{p.role||''}</span>
    </div>)}</div>
    <footer><span>{data.match?.venue||''}</span><b>{data.match?.code||''}</b></footer>
    <SponsorTag payload={payload} kind="fullscreen"/>
  </section>;
}

function Scorecard({type,data,payload}:{type:'batting'|'bowling';data:J;payload:J}){
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
    <SponsorTag payload={payload} kind="fullscreen"/>
  </section>;
}

function LowerThird({type,data,payload}:{type:'partnership'|'need';data:J;payload:J}){
  const p=data.current?.partnership||{};
  if(type==='partnership')return <section className="tv-lower-info">
    <span>PARTNERSHIP</span><strong>{p.runs??0}<i>{p.balls??0} BALLS</i></strong>
    <b>{data.current?.striker?.name||'—'} + {data.current?.non_striker?.name||'—'}</b>
    <SponsorTag payload={payload} kind="lower-third"/>
  </section>;
  return <section className="tv-lower-info chase">
    <span>CHASE</span>
    <strong>{data.innings?.runs_required??0}<i>RUNS</i></strong>
    <b>NEEDED FROM {data.innings?.balls_remaining??0} BALLS · TARGET {data.innings?.target??'—'} · RRR {Number(data.innings?.rrr||0).toFixed(2)}</b>
    <SponsorTag payload={payload} kind="lower-third"/>
  </section>;
}

function withSponsor(content:ReactNode,payload:J,kind:string){
  return <>{content}<SponsorTag payload={payload} kind={kind}/></>;
}
function BroadcastSkin({variantKey,data,payload}:{variantKey:string;data:J;payload:J}){
  if(variantKey==='scorebar.default')return <Scorebar data={data} payload={payload}/>;
  if(variantKey==='vs.fullscreen')return <Versus data={data} payload={payload}/>;
  if(variantKey==='playing-xi.home')return <PlayingXI side="home" data={data} payload={payload}/>;
  if(variantKey==='playing-xi.away')return <PlayingXI side="away" data={data} payload={payload}/>;
  if(variantKey==='batter-info.large')return <PlayerFeature kind="batter" data={data} payload={payload}/>;
  if(variantKey==='bowler-info.large')return <PlayerFeature kind="bowler" data={data} payload={payload}/>;
  if(/^four\.|^six\.|^wicket\./.test(variantKey)){
    return variantKey.includes('lower-third')
      ?<ScorebarEvent variantKey={variantKey} data={data} payload={payload}/>
      :<EventImpact variantKey={variantKey} data={data} payload={payload}/>;
  }
  if(/^50\.|^100\./.test(variantKey))return <EventImpact variantKey={variantKey} data={data} payload={payload}/>;
  if(variantKey==='batting-scorecard.fullscreen')return <Scorecard type="batting" data={data} payload={payload}/>;
  if(variantKey==='bowling-scorecard.fullscreen')return <Scorecard type="bowling" data={data} payload={payload}/>;
  if(variantKey==='partnership.lower-third')return <LowerThird type="partnership" data={data} payload={payload}/>;
  if(variantKey==='need-from.lower-third')return <LowerThird type="need" data={data} payload={payload}/>;
  return withSponsor(<section className="tv-unknown"><span>IPS BROADCAST</span><strong>{variantKey}</strong></section>,payload,'lower-third');
}

export function BroadcastOverlay({matchId}:{matchId?:string}){
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
  const [error,setError]=useState('');
  const [now,setNow]=useState(()=>Date.now());
  const supabase=useMemo(()=>matchId?createBroadcastClient():null,[matchId]);
  const refresh=useCallback(async()=>{
    if(!supabase||!matchId)return;
    const result=await supabase.rpc('ips_broadcast_program_snapshot',{p_match_id:matchId});
    if(result.error){setError(result.error.message);return}
    setSnapshot(result.data as Snapshot);setError('');
  },[supabase,matchId]);

  useEffect(()=>{void refresh()},[refresh]);
  useEffect(()=>{
    const timer=setInterval(()=>setNow(Date.now()),100);
    return()=>clearInterval(timer);
  },[]);
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
