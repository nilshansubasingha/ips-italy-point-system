'use client';

import Link from 'next/link';
import {useEffect,useMemo,useState,useTransition} from 'react';
import {BrandMark} from '@ips/ui';
import {
  overrideMatchFormat,
  scoreDeliveryAction,
  selectNextBowlerAction,
  startInningsAction
} from '@/app/matches/[id]/actions';

type Player={player_id:string;ips_code:string;name:string;primary_role?:string|null;order?:number};
type Side={
  team:{id:string;name:string;short_name?:string|null;logo_url?:string|null};
  squad_locked:boolean;
  squad:Player[];
  playing_side:Player[];
  roles:Record<string,{player_id:string;ips_code:string;name:string}>
};
type MatchFormat={
  players_per_side:number;
  overs_per_innings:number;
  balls_per_over:number;
  wicket_limit:number|null;
  max_overs_per_bowler:number|null;
  source:'TOURNAMENT'|'MATCH_OVERRIDE';
  override_reason?:string|null;
  overridden_at?:string|null
};
type Context={match:any;tournament:any;venue:any;rules:any;match_format:MatchFormat;home:Side;away:Side;officials:any[]};

type BatterStat={
  player_id:string;name:string;ips_code:string;profile_image_url?:string|null;lineup_order:number;
  runs:number;balls:number;fours:number;sixes:number;strike_rate:number;dismissed:boolean
};
type BowlerStat={
  player_id:string;name:string;ips_code:string;profile_image_url?:string|null;lineup_order:number;
  legal_balls:number;overs:string;runs:number;wickets:number;economy:number
};
type Candidate={player_id:string;name:string;ips_code:string;available:boolean;reason:string|null};
type OverBall={id:string;label:string;legal:boolean;is_wicket:boolean};
type OverHistoryItem={
  over_no:number;
  runs:number;
  wickets:number;
  legal_balls:number;
  complete:boolean;
  current:boolean;
  bowler_id:string|null;
  bowler_name:string|null;
  score_after:number;
  wickets_after:number;
  balls:OverBall[];
};
type InningsSummary={
  innings_no:number;batting_team_id:string;bowling_team_id:string;
  runs:number;wickets:number;legal_balls:number;status:string;target_runs:number|null
};
type ScoringContext={
  started:boolean;innings_count:number;innings_no:number|null;innings_complete:boolean;match_complete:boolean;
  batting_team_id:string|null;bowling_team_id:string|null;striker_id:string|null;non_striker_id:string|null;
  bowler_id:string|null;previous_bowler_id:string|null;runs:number;wickets:number;legal_balls:number;
  balls_per_over:number;max_balls:number;overs_per_innings:number;effective_wicket_limit:number;
  target_runs:number|null;runs_required:number|null;balls_remaining:number|null;awaiting_bowler:boolean;free_hit:boolean;
  next_batting_team_id:string|null;innings:InningsSummary[];batter_stats:BatterStat[];bowler_stats:BowlerStat[];
  current_over:OverBall[];over_history:OverHistoryItem[];next_batters:Candidate[];bowlers:Candidate[];
};

type WicketKind='BOWLED'|'CAUGHT'|'RUN_OUT'|'HIT_WICKET';
type ExtraKind='WIDE'|'NO_BALL'|'BYE'|'LEG_BYE';
type Sheet=
  |{kind:'extra';extra:ExtraKind}
  |{kind:'wicket'}
  |{kind:'runout'}
  |{kind:'next-batter';wicketKind:WicketKind;dismissedPlayerId:string|null}
  |{kind:'bowler'}
  |null;

function sideReady(side:Side,n:number){
  return !!side.squad_locked&&side.playing_side.length===n&&!!side.roles?.CAPTAIN&&!!side.roles?.WICKETKEEPER;
}

function oversLabel(legalBalls:number,ballsPerOver:number){
  if(!ballsPerOver)return '0.0';
  return Math.floor(legalBalls/ballsPerOver)+'.'+(legalBalls%ballsPerOver);
}

function SidePanel({side,required}:{side:Side;required:number}){
  const ready=sideReady(side,required);
  return <article className="p6-side-card">
    <header><div><span>PLAYING SIDE</span><h3>{side.team.name}</h3></div><b className={ready?'ready':'waiting'}>{ready?'READY':'SETUP'}</b></header>
    <div className="p6-side-meta">
      <span>{side.playing_side.length}/{required} players</span>
      <span>C {side.roles?.CAPTAIN?.name??'—'}</span>
      <span>WK {side.roles?.WICKETKEEPER?.name??'—'}</span>
    </div>
    <div className="p6-roster">
      {side.playing_side.map(player=><div key={player.player_id}>
        <i>{player.order}</i><strong>{player.name}</strong><small>{player.ips_code}</small>
      </div>)}
    </div>
  </article>;
}


function PlayerScoreCard({
  role,
  stat,
  active
}:{
  role:'STRIKER'|'NON-STRIKER';
  stat:BatterStat|undefined;
  active?:boolean
}){
  const name=stat?.name??'—';
  return <article className={'p6-player-live '+(active?'active':'')}>
    <div className="p6-player-live-content">
      <div className="p6-player-title"><span>{role}</span>{active&&<b>● ON STRIKE</b>}</div>
      <div className="p6-player-main"><strong>{name}</strong><div><b>{stat?.runs??0}</b><span>({stat?.balls??0})</span></div></div>
      <div className="p6-player-numbers">
        <span><em>4s</em><b>{stat?.fours??0}</b></span>
        <span><em>6s</em><b>{stat?.sixes??0}</b></span>
        <span><em>SR</em><b>{Number(stat?.strike_rate??0).toFixed(1)}</b></span>
      </div>
    </div>
  </article>;
}

function BowlerScoreCard({stat}:{stat:BowlerStat|undefined}){
  const name=stat?.name??'Select bowler';
  return <article className="p6-player-live bowler">
    <div className="p6-player-live-content">
      <div className="p6-player-title"><span>BOWLER</span><b>● CURRENT</b></div>
      <div className="p6-player-main"><strong>{name}</strong><div><b>{stat?.wickets??0}/{stat?.runs??0}</b></div></div>
      <div className="p6-player-numbers">
        <span><em>OV</em><b>{stat?.overs??'0.0'}</b></span>
        <span><em>R</em><b>{stat?.runs??0}</b></span>
        <span><em>ECON</em><b>{Number(stat?.economy??0).toFixed(2)}</b></span>
      </div>
    </div>
  </article>;
}

function TopOverRows({scoring}:{scoring:ScoringContext}){
  const completed=(scoring.over_history??[])
    .filter(over=>!over.current)
    .sort((a,b)=>b.over_no-a.over_no);
  const previous=completed[0]??null;
  const liveOver=(scoring.over_history??[]).find(over=>over.current);
  const currentBalls=scoring.awaiting_bowler?[]:scoring.current_over;
  const currentNo=liveOver?.over_no??(Math.floor(scoring.legal_balls/Math.max(scoring.balls_per_over,1))+1);

  const renderBalls=(balls:OverBall[],empty:string)=><div className="p6-top-over-balls">
    {balls.length?balls.map(ball=><i key={ball.id} className={ball.is_wicket?'wicket':ball.label.includes('4')?'four':ball.label.includes('6')?'six':''}>{ball.label}</i>):<span>{empty}</span>}
  </div>;

  return <div className="p6-top-over-stack">
    <div className="p6-top-over-row previous">
      <div className="p6-top-over-label"><span>PREVIOUS OVER</span><b>{previous?'OVER '+previous.over_no:'—'}</b></div>
      {renderBalls(previous?.balls??[],'No completed over yet')}
      <strong className="p6-top-over-total">{previous?previous.runs+(previous.wickets?' · '+previous.wickets+'W':''):'—'}</strong>
    </div>
    <div className="p6-top-over-row current">
      <div className="p6-top-over-label"><span>CURRENT OVER</span><b>OVER {currentNo}</b></div>
      {renderBalls(currentBalls,scoring.awaiting_bowler?'Select next bowler':'No balls yet')}
      <strong className="p6-top-over-total">{liveOver?liveOver.runs+(liveOver.wickets?' · '+liveOver.wickets+'W':''):'0'}</strong>
    </div>
  </div>;
}

function OverHistoryPanel({history}:{history:OverHistoryItem[]}){
  const [expanded,setExpanded]=useState(false);
  const ordered=[...history].sort((a,b)=>b.over_no-a.over_no);
  const visible=expanded?ordered:ordered.slice(0,3);

  return <section className="p6-over-history">
    <header>
      <div><span>OVER HISTORY</span><strong>{ordered.length?Math.min(ordered.length,3)+' recent overs':'Recent overs appear here'}</strong></div>
      {ordered.length>3&&<button type="button" onClick={()=>setExpanded(value=>!value)}>{expanded?'Show latest 3':'Show all '+ordered.length+' overs'}</button>}
    </header>
    <div className="p6-over-history-grid">
      {visible.length?visible.map(over=><article key={over.over_no} className={over.current?'current':''}>
        <div className="p6-over-history-top">
          <div><span>OVER {over.over_no}</span><strong>{over.bowler_name??'Bowler'}</strong></div>
          <div><b>{over.runs}</b><small>{over.runs===1?'RUN':'RUNS'}{over.wickets?' · '+over.wickets+'W':''}</small></div>
        </div>
        <div className="p6-history-balls">
          {over.balls.map(ball=><i key={ball.id} className={ball.is_wicket?'wicket':ball.label.includes('4')?'four':ball.label.includes('6')?'six':''}>{ball.label}</i>)}
        </div>
        <footer><span>{over.current?'CURRENT':over.complete?'COMPLETE':'PARTIAL'}</span><b>{over.current?'LIVE ':'END '}{over.score_after}/{over.wickets_after}</b></footer>
      </article>):<article className="empty">
        <div><span>HISTORY</span><strong>Score the first ball to start the history.</strong></div>
      </article>}
    </div>
  </section>;
}

function OtherPlayersScorecard({
  scoring,
  strikerId,
  nonStrikerId,
  bowlerId
}:{
  scoring:ScoringContext;
  strikerId:string|null;
  nonStrikerId:string|null;
  bowlerId:string|null;
}){
  const otherBatters=scoring.batter_stats.filter(player=>player.player_id!==strikerId&&player.player_id!==nonStrikerId);
  const otherBowlers=scoring.bowler_stats.filter(player=>player.player_id!==bowlerId);
  if(!scoring.started)return null;

  return <section className="p6-scorecard">
    <div className="p6-scorecard-head">
      <div><span>LIVE SCORECARD</span><strong>Other players</strong></div>
      <small>Current batters and bowler stay pinned in the Scoring Engine above.</small>
    </div>
    <div className="p6-scorecard-grid">
      <div className="p6-score-table">
        <header><span>BATTING</span><b>R&nbsp;&nbsp;B&nbsp;&nbsp;4&nbsp;&nbsp;6&nbsp;&nbsp;SR</b></header>
        {otherBatters.length?otherBatters.map(player=><div key={player.player_id} className={player.dismissed?'dismissed':''}>
          <span><strong>{player.name}</strong><small>{player.dismissed?'OUT':'YET TO BAT'}</small></span>
          <b>{player.runs}&nbsp;&nbsp;{player.balls}&nbsp;&nbsp;{player.fours}&nbsp;&nbsp;{player.sixes}&nbsp;&nbsp;{Number(player.strike_rate||0).toFixed(1)}</b>
        </div>):<p>No other batters.</p>}
      </div>
      <div className="p6-score-table">
        <header><span>BOWLING</span><b>OV&nbsp;&nbsp;R&nbsp;&nbsp;W&nbsp;&nbsp;ECON</b></header>
        {otherBowlers.length?otherBowlers.map(player=><div key={player.player_id}>
          <span><strong>{player.name}</strong><small>{player.ips_code}</small></span>
          <b>{player.overs}&nbsp;&nbsp;{player.runs}&nbsp;&nbsp;{player.wickets}&nbsp;&nbsp;{Number(player.economy||0).toFixed(2)}</b>
        </div>):<p>No other bowlers.</p>}
      </div>
    </div>
  </section>;
}

function ChoiceSheet({
  title,
  kicker,
  children,
  onClose,
  locked
}:{
  title:string;kicker:string;children:React.ReactNode;onClose:()=>void;locked?:boolean
}){
  return <div className="scrim p6-scrim" role="presentation">
    <section className="sheet p6-sheet" role="dialog" aria-modal="true">
      <div className="grab"/>
      <div className="sheet-heading">
        <div><span className="micro">{kicker}</span><h2>{title}</h2></div>
        {!locked&&<button type="button" onClick={onClose} aria-label="Close">×</button>}
      </div>
      {children}
    </section>
  </div>;
}

export function ControllerMatch({
  context,
  initialScoring,
  webUrl,
  message,
  errorMessage
}:{
  context:Context;
  initialScoring:ScoringContext;
  webUrl:string;
  message?:string|null;
  errorMessage?:string|null
}){
  const format=context.match_format;
  const required=Number(format.players_per_side||0);
  const homeReady=sideReady(context.home,required);
  const awayReady=sideReady(context.away,required);
  const ready=homeReady&&awayReady;

  const [scoring,setScoring]=useState<ScoringContext>(initialScoring);
  const [sheet,setSheet]=useState<Sheet>(initialScoring.awaiting_bowler&&!initialScoring.innings_complete?{kind:'bowler'}:null);
  const [notice,setNotice]=useState<{type:'ok'|'error';text:string}|null>(
    errorMessage?{type:'error',text:errorMessage}:message?{type:'ok',text:message}:null
  );
  const [pending,startTransition]=useTransition();

  const [battingTeamId,setBattingTeamId]=useState<string>(
    initialScoring.next_batting_team_id??''
  );
  const [openingStriker,setOpeningStriker]=useState('');
  const [openingNonStriker,setOpeningNonStriker]=useState('');
  const [openingBowler,setOpeningBowler]=useState('');

  const sideByTeam=(teamId:string|null|undefined)=>{
    if(!teamId)return null;
    if(context.home.team.id===teamId)return context.home;
    if(context.away.team.id===teamId)return context.away;
    return null;
  };

  const battingSide=sideByTeam(scoring.batting_team_id);
  const bowlingSide=sideByTeam(scoring.bowling_team_id);
  const striker=scoring.batter_stats.find(player=>player.player_id===scoring.striker_id);
  const nonStriker=scoring.batter_stats.find(player=>player.player_id===scoring.non_striker_id);
  const currentBowler=scoring.bowler_stats.find(player=>player.player_id===scoring.bowler_id);

  const firstInnings=scoring.innings.find(innings=>innings.innings_no===1);
  const secondInnings=scoring.innings.find(innings=>innings.innings_no===2);

  const blockers=useMemo(()=>{
    const items:string[]=[];
    if(!context.home.squad_locked)items.push(context.home.team.name+': lock squad');
    if(!context.away.squad_locked)items.push(context.away.team.name+': lock squad');
    if(context.home.playing_side.length!==required)items.push(context.home.team.name+': '+context.home.playing_side.length+'/'+required+' players');
    if(context.away.playing_side.length!==required)items.push(context.away.team.name+': '+context.away.playing_side.length+'/'+required+' players');
    if(!context.home.roles?.CAPTAIN||!context.home.roles?.WICKETKEEPER)items.push(context.home.team.name+': captain / keeper');
    if(!context.away.roles?.CAPTAIN||!context.away.roles?.WICKETKEEPER)items.push(context.away.team.name+': captain / keeper');
    return items;
  },[context,required]);

  const startBattingSide=sideByTeam(
    scoring.innings_count===1&&scoring.innings_complete
      ?scoring.next_batting_team_id
      :battingTeamId
  );
  const startBowlingSide=startBattingSide
    ?sideByTeam(startBattingSide.team.id===context.home.team.id?context.away.team.id:context.home.team.id)
    :null;

  useEffect(()=>{
    if(scoring.innings_count===1&&scoring.innings_complete&&scoring.next_batting_team_id){
      setBattingTeamId(scoring.next_batting_team_id);
    }
  },[scoring.innings_count,scoring.innings_complete,scoring.next_batting_team_id]);

  useEffect(()=>{
    if(!startBattingSide||!startBowlingSide)return;
    const batting=startBattingSide.playing_side;
    const bowling=startBowlingSide.playing_side;
    setOpeningStriker(current=>batting.some(player=>player.player_id===current)?current:(batting[0]?.player_id??''));
    setOpeningNonStriker(current=>{
      if(batting.some(player=>player.player_id===current)&&current!==openingStriker)return current;
      return batting.find(player=>player.player_id!==openingStriker)?.player_id??'';
    });
    setOpeningBowler(current=>bowling.some(player=>player.player_id===current)?current:(bowling[0]?.player_id??''));
  },[startBattingSide?.team.id,startBowlingSide?.team.id,openingStriker]);

  function applyResult(result:any,successText?:string){
    if(!result?.ok){
      setNotice({type:'error',text:result?.error??'The scoring action failed.'});
      return false;
    }
    setScoring(result.context as ScoringContext);
    setNotice(successText?{type:'ok',text:successText}:null);
    if(result.context?.awaiting_bowler&&!result.context?.innings_complete){
      setSheet({kind:'bowler'});
    }else{
      setSheet(null);
    }
    return true;
  }

  function startInnings(){
    if(!startBattingSide||!openingStriker||!openingNonStriker||!openingBowler||openingStriker===openingNonStriker)return;
    setNotice(null);
    startTransition(async()=>{
      const result=await startInningsAction({
        matchId:context.match.id,
        battingTeamId:startBattingSide.team.id,
        strikerId:openingStriker,
        nonStrikerId:openingNonStriker,
        bowlerId:openingBowler
      });
      applyResult(result,'Innings started.');
    });
  }

  function recordDelivery(input:{
    runsOffBat?:number;
    extraType?:ExtraKind|null;
    extraAdditionalRuns?:number;
    wicketKind?:WicketKind|null;
    dismissedPlayerId?:string|null;
    incomingBatterId?:string|null;
  }){
    setNotice(null);
    startTransition(async()=>{
      const result=await scoreDeliveryAction({matchId:context.match.id,...input});
      applyResult(result);
    });
  }

  function chooseBowler(playerId:string){
    setNotice(null);
    startTransition(async()=>{
      const result=await selectNextBowlerAction({matchId:context.match.id,bowlerId:playerId});
      if(applyResult(result,'Next bowler selected.'))setSheet(null);
    });
  }

  function wicketWillEndInnings(){
    return scoring.wickets+1>=scoring.effective_wicket_limit||scoring.legal_balls+1>=scoring.max_balls;
  }

  function chooseWicketKind(kind:WicketKind){
    if(kind==='RUN_OUT'){
      setSheet({kind:'runout'});
      return;
    }
    if(wicketWillEndInnings()){
      recordDelivery({wicketKind:kind});
      return;
    }
    setSheet({kind:'next-batter',wicketKind:kind,dismissedPlayerId:scoring.striker_id});
  }

  function chooseRunOut(playerId:string){
    if(wicketWillEndInnings()){
      recordDelivery({wicketKind:'RUN_OUT',dismissedPlayerId:playerId});
      return;
    }
    setSheet({kind:'next-batter',wicketKind:'RUN_OUT',dismissedPlayerId:playerId});
  }

  function chooseNextBatter(playerId:string,wicketKind:WicketKind,dismissedPlayerId:string|null){
    recordDelivery({wicketKind,dismissedPlayerId,incomingBatterId:playerId});
  }

  const scoringLocked=!ready||pending||!scoring.started||scoring.innings_complete||scoring.match_complete||scoring.awaiting_bowler;
  const live=!!scoring.started&&!scoring.match_complete;

  return <main className="controller-shell project6-shell">
    <header className="controller-header p6-header">
      <div className="controller-brand"><BrandMark compact/><div className="match-id"><span>IPS MATCH CONTROLLER</span><b>{context.match.code}</b></div></div>
      <Link className="header-menu back-control" href="/">←</Link>
    </header>

    <section className="p6-engine">
      <div className="p6-engine-head">
        <div className="p6-engine-title">
          <span>SCORING ENGINE</span>
          <h1>{scoring.started?'Live scoring':'Start scoring'}</h1>
          <small>{context.match.code} · {context.tournament.name}</small>
        </div>
        <div className="p6-engine-state">
          <b className={ready?'ready':'blocked'}><i/> {ready?'READY':'SETUP REQUIRED'}</b>
          <span>{format.overs_per_innings} OV · {format.players_per_side} PLAYERS</span>
        </div>
      </div>

      {(notice||errorMessage)&&<div className={'p6-inline-message '+(notice?.type??'error')}>{notice?.text??errorMessage}</div>}

      {!ready&&<div className="p6-blocked">
        <div><strong>Complete Controller Readiness first.</strong><span>{blockers.join(' · ')}</span></div>
        <a href={webUrl+'/manage/tournaments/'+context.tournament.id+'#lineups'}>Fix match setup →</a>
      </div>}

      {ready&&!scoring.started&&<div className="p6-start">
        <div className="p6-start-title"><span>INNINGS 1</span><strong>Who is batting first?</strong></div>
        <div className="p6-team-choice">
          {[context.home,context.away].map(side=><button
            type="button"
            key={side.team.id}
            className={battingTeamId===side.team.id?'selected':''}
            onClick={()=>setBattingTeamId(side.team.id)}
          ><span>BAT FIRST</span><strong>{side.team.name}</strong></button>)}
        </div>
        {startBattingSide&&startBowlingSide&&<div className="p6-opening-grid">
          <label><span>STRIKER</span><select value={openingStriker} onChange={event=>setOpeningStriker(event.target.value)}>
            {startBattingSide.playing_side.map(player=><option key={player.player_id} value={player.player_id}>{player.name}</option>)}
          </select></label>
          <label><span>NON-STRIKER</span><select value={openingNonStriker} onChange={event=>setOpeningNonStriker(event.target.value)}>
            {startBattingSide.playing_side.filter(player=>player.player_id!==openingStriker).map(player=><option key={player.player_id} value={player.player_id}>{player.name}</option>)}
          </select></label>
          <label><span>OPENING BOWLER · {startBowlingSide.team.name}</span><select value={openingBowler} onChange={event=>setOpeningBowler(event.target.value)}>
            {startBowlingSide.playing_side.map(player=><option key={player.player_id} value={player.player_id}>{player.name}</option>)}
          </select></label>
          <button type="button" className="p6-start-button" disabled={pending||!openingStriker||!openingNonStriker||!openingBowler||openingStriker===openingNonStriker} onClick={startInnings}>
            {pending?'Starting…':'Start innings →'}
          </button>
        </div>}
      </div>}

      {ready&&scoring.started&&scoring.innings_complete&&!scoring.match_complete&&<div className="p6-start p6-between-innings">
        <div className="p6-start-title"><span>INNINGS 1 COMPLETE</span><strong>{firstInnings?.runs??0}/{firstInnings?.wickets??0} · Target {(firstInnings?.runs??0)+1}</strong></div>
        {startBattingSide&&startBowlingSide&&<>
          <div className="p6-team-fixed"><span>BATTING</span><strong>{startBattingSide.team.name}</strong><i>Target {(firstInnings?.runs??0)+1}</i></div>
          <div className="p6-opening-grid">
            <label><span>STRIKER</span><select value={openingStriker} onChange={event=>setOpeningStriker(event.target.value)}>
              {startBattingSide.playing_side.map(player=><option key={player.player_id} value={player.player_id}>{player.name}</option>)}
            </select></label>
            <label><span>NON-STRIKER</span><select value={openingNonStriker} onChange={event=>setOpeningNonStriker(event.target.value)}>
              {startBattingSide.playing_side.filter(player=>player.player_id!==openingStriker).map(player=><option key={player.player_id} value={player.player_id}>{player.name}</option>)}
            </select></label>
            <label><span>OPENING BOWLER · {startBowlingSide.team.name}</span><select value={openingBowler} onChange={event=>setOpeningBowler(event.target.value)}>
              {startBowlingSide.playing_side.map(player=><option key={player.player_id} value={player.player_id}>{player.name}</option>)}
            </select></label>
            <button type="button" className="p6-start-button" disabled={pending} onClick={startInnings}>{pending?'Starting…':'Start chase →'}</button>
          </div>
        </>}
      </div>}

      {scoring.started&&<div className="p6-live">
        <section className="p6-scoreboard">
          <div className="p6-score-top">
            <div><span>BATTING</span><strong>{battingSide?.team.short_name||battingSide?.team.name||'—'}</strong></div>
            <div className="p6-score"><b>{scoring.runs}</b><span>/{scoring.wickets}</span></div>
          </div>
          <TopOverRows scoring={scoring}/>
          <div className="p6-score-bottom">
            <span>BOWLING <b>{bowlingSide?.team.short_name||bowlingSide?.team.name||'—'}</b></span>
            <span className="p6-score-overs"><b>{oversLabel(scoring.legal_balls,scoring.balls_per_over)}</b> OVERS</span>
            {scoring.innings_no===2&&<span>TARGET <b>{scoring.target_runs}</b></span>}
            {scoring.innings_no===2&&!scoring.innings_complete&&<span>NEED <b>{scoring.runs_required} from {scoring.balls_remaining}</b></span>}
            {scoring.free_hit&&<span className="p6-free-hit">FREE HIT</span>}
          </div>
        </section>

        <section className="p6-active-players">
          <PlayerScoreCard role="STRIKER" stat={striker} active/>
          <PlayerScoreCard role="NON-STRIKER" stat={nonStriker}/>
          <BowlerScoreCard stat={currentBowler}/>
        </section>

        {!scoring.innings_complete&&!scoring.match_complete&&<section className="controller-action-zone p6-actions">
          <div className="p6-action-caption"><span>RUNS</span>{scoring.awaiting_bowler&&<b>SELECT NEXT BOWLER</b>}</div>
          <div className="run-grid p6-run-grid">
            {[0,1,2,3,4,6].map(value=><button
              type="button"
              disabled={scoringLocked}
              key={value}
              className={value===4?'four-run':value===6?'six-run':''}
              onClick={()=>recordDelivery({runsOffBat:value})}
            ><span>{value}</span><small>{value===0?'DOT':'RUNS'}</small></button>)}
          </div>

          <button type="button" disabled={scoringLocked} className="p6-grid-action p6-wicket-grid" onClick={()=>setSheet({kind:'wicket'})}>
            <strong>W</strong><span>WICKET</span>
          </button>
          <button type="button" disabled={scoringLocked} className="p6-grid-action p6-wide-grid" onClick={()=>setSheet({kind:'extra',extra:'WIDE'})}>
            <strong>WD</strong><span>+0 · +1 · +2 · +3 · +4</span>
          </button>
          <button type="button" disabled={scoringLocked} className="p6-grid-action p6-noball-grid" onClick={()=>setSheet({kind:'extra',extra:'NO_BALL'})}>
            <strong>NB</strong><span>+0 · +1 · +2 · +3 · +4</span>
          </button>
          <div className="p6-secondary-extras">
            <span>OTHER EXTRAS</span>
            <button type="button" disabled={scoringLocked} onClick={()=>setSheet({kind:'extra',extra:'BYE'})}>B · BYE</button>
            <button type="button" disabled={scoringLocked} onClick={()=>setSheet({kind:'extra',extra:'LEG_BYE'})}>LB · LEG BYE</button>
          </div>
        </section>}

        <OverHistoryPanel history={scoring.over_history??[]}/>

        {scoring.match_complete&&<section className="p6-match-complete">
          <span>MATCH COMPLETE</span>
          <strong>{firstInnings?.runs}/{firstInnings?.wickets} · {secondInnings?.runs}/{secondInnings?.wickets}</strong>
          <small>Scoring is locked. Certification can follow from IPS tournament operations.</small>
        </section>}
      </div>}
    </section>

    <OtherPlayersScorecard scoring={scoring} strikerId={scoring.striker_id} nonStrikerId={scoring.non_striker_id} bowlerId={scoring.bowler_id}/>

    <section className="p6-support">
      <details>
        <summary><span>PLAYING SIDES</span><b>Players & roles</b></summary>
        <div className="p6-side-grid"><SidePanel side={context.home} required={required}/><SidePanel side={context.away} required={required}/></div>
      </details>

      <details>
        <summary><span>MATCH SETTINGS</span><b>{format.overs_per_innings} overs · {format.players_per_side} players</b></summary>
        <div className="p6-settings-body">
          <div className="p6-rule-row"><span>Balls / over</span><b>{format.balls_per_over}</b></div>
          <div className="p6-rule-row"><span>Wicket limit</span><b>{scoring.effective_wicket_limit}</b></div>
          <div className="p6-rule-row"><span>Bowler max</span><b>{format.max_overs_per_bowler??'—'}</b></div>
          <div className="p6-rule-row"><span>Consecutive overs</span><b>{context.rules.consecutive_overs_by_same_bowler_allowed?'Allowed':'Blocked'}</b></div>
          <div className="p6-rule-row"><span>Free hit on no-ball</span><b>{context.rules.free_hit_on_no_ball?'Yes':'No'}</b></div>
          <details className="match-settings-editor p6-override">
            <summary>Override match settings</summary>
            <form action={overrideMatchFormat}>
              <input type="hidden" name="match_id" value={context.match.id}/>
              <div className="match-settings-grid">
                <label><span>Players / side</span><input name="players_per_side" type="number" min="2" max="20" defaultValue={format.players_per_side}/></label>
                <label><span>Overs / innings</span><input name="overs_per_innings" type="number" min="1" max="100" defaultValue={format.overs_per_innings}/></label>
                <label><span>Balls / over</span><input name="balls_per_over" type="number" min="1" max="12" defaultValue={format.balls_per_over}/></label>
                <label><span>Wicket limit</span><input name="wicket_limit" type="number" min="1" max="19" defaultValue={format.wicket_limit??''}/></label>
                <label><span>Bowler max</span><input name="max_overs_per_bowler" type="number" min="1" max="100" defaultValue={format.max_overs_per_bowler??''}/></label>
              </div>
              <label className="override-reason"><span>{live?'Reason · required after scoring starts':'Reason / note'}</span><input name="reason" required={live} placeholder={live?'Why is this match format changing?':'Optional pre-match note'}/></label>
              <button>Save audited override</button>
            </form>
          </details>
        </div>
      </details>

      <details>
        <summary><span>OFFICIALS</span><b>{context.officials.length} assigned</b></summary>
        <div className="p6-officials">
          {context.officials.length?context.officials.map((official:any,index:number)=><div key={official.user_id+'-'+index}><strong>{official.display_name??'IPS account'}</strong><span>{official.role} · {official.designation}</span></div>):<p>No officials recorded.</p>}
        </div>
      </details>
    </section>

    {sheet?.kind==='extra'&&<ChoiceSheet title={sheet.extra==='WIDE'?'Wide':sheet.extra==='NO_BALL'?'No-ball':sheet.extra==='BYE'?'Byes':'Leg byes'} kicker="EXTRAS" onClose={()=>setSheet(null)}>
      <p className="p6-sheet-copy">{sheet.extra==='WIDE'||sheet.extra==='NO_BALL'?'Choose the additional runs. The mandatory one-run extra is handled automatically.':'Choose the completed extra runs.'}</p>
      <div className="choices p6-choice-grid">
        {(sheet.extra==='WIDE'||sheet.extra==='NO_BALL'?[0,1,2,3,4]:[1,2,3,4]).map(value=><button
          type="button"
          disabled={pending}
          key={value}
          onClick={()=>{
            if(sheet.extra==='NO_BALL')recordDelivery({extraType:'NO_BALL',runsOffBat:value});
            else recordDelivery({extraType:sheet.extra,extraAdditionalRuns:value});
          }}
        ><strong>{sheet.extra==='WIDE'?'WD':sheet.extra==='NO_BALL'?'NB':sheet.extra==='BYE'?'B':'LB'}+{value}</strong><span>{sheet.extra==='WIDE'||sheet.extra==='NO_BALL'?value+1:value} team run{(sheet.extra==='WIDE'||sheet.extra==='NO_BALL'?value+1:value)===1?'':'s'}</span></button>)}
      </div>
    </ChoiceSheet>}

    {sheet?.kind==='wicket'&&<ChoiceSheet title="How did the wicket happen?" kicker="WICKET" onClose={()=>setSheet(null)}>
      {scoring.free_hit&&<div className="p6-free-hit-note">FREE HIT · only Run out is available from these dismissal types.</div>}
      <div className="choices two p6-wicket-choices">
        {([
          ['BOWLED','Bowled'],
          ['CAUGHT','Caught'],
          ['RUN_OUT','Run out'],
          ['HIT_WICKET','Hit wicket']
        ] as [WicketKind,string][]).map(([kind,label])=>{
          const disabled=scoring.free_hit&&kind!=='RUN_OUT';
          return <button type="button" key={kind} disabled={disabled||pending} onClick={()=>chooseWicketKind(kind)}>
            <strong>{label}</strong><span>{disabled?'Not on free hit':'→'}</span>
          </button>;
        })}
      </div>
    </ChoiceSheet>}

    {sheet?.kind==='runout'&&<ChoiceSheet title="Who was run out?" kicker="RUN OUT" onClose={()=>setSheet({kind:'wicket'})}>
      <div className="p6-current-batter-choice">
        {[striker,nonStriker].filter(Boolean).map((player,index)=><button type="button" disabled={pending} key={player!.player_id} onClick={()=>chooseRunOut(player!.player_id)}>
          <span>{index===0?'STRIKER':'NON-STRIKER'}</span><strong>{player!.name}</strong><small>{player!.runs} ({player!.balls})</small>
        </button>)}
      </div>
    </ChoiceSheet>}

    {sheet?.kind==='next-batter'&&<ChoiceSheet title="Choose the next batter" kicker="NEXT BATTER" onClose={()=>setSheet(null)} locked>
      <p className="p6-sheet-copy">Playing side order is shown below. Players already batting or already out cannot be selected.</p>
      <div className="p6-player-choice-list">
        {scoring.next_batters.map(player=><button
          type="button"
          key={player.player_id}
          disabled={!player.available||pending}
          onClick={()=>chooseNextBatter(player.player_id,sheet.wicketKind,sheet.dismissedPlayerId)}
        ><div><span>{player.ips_code}</span><strong>{player.name}</strong></div><b>{player.available?'BAT →':player.reason}</b></button>)}
      </div>
    </ChoiceSheet>}

    {sheet?.kind==='bowler'&&<ChoiceSheet title="Choose the next bowler" kicker="OVER COMPLETE" onClose={()=>{}} locked>
      <p className="p6-sheet-copy">The previous bowler and anyone who has reached the over limit are disabled automatically.</p>
      <div className="p6-player-choice-list">
        {scoring.bowlers.map(player=>{
          const stats=scoring.bowler_stats.find(item=>item.player_id===player.player_id);
          return <button type="button" key={player.player_id} disabled={!player.available||pending} onClick={()=>chooseBowler(player.player_id)}>
            <div><span>{stats?.overs??'0.0'} OV · {stats?.wickets??0}/{stats?.runs??0}</span><strong>{player.name}</strong></div><b>{player.available?'BOWL →':player.reason}</b>
          </button>;
        })}
      </div>
    </ChoiceSheet>}
  </main>;
}
