'use client';

import {useEffect,useMemo,useRef,useState} from 'react';
import {broadcastGraphic,type BroadcastGraphicId,type BroadcastMode,type BroadcastOutput} from '@ips/broadcast';
import {createOverlayClient} from '@/lib/supabase';

type LiveSummary={
  match_id:string;
  started:boolean;
  innings_no:number|null;
  innings_complete:boolean;
  match_complete:boolean;
  batting_team_id:string|null;
  batting_team_name:string|null;
  bowling_team_id:string|null;
  bowling_team_name:string|null;
  runs:number;
  wickets:number;
  legal_balls:number;
  balls_per_over:number;
  overs_text:string;
  target_runs:number|null;
  striker_name:string|null;
  striker_runs:number;
  striker_balls:number;
  non_striker_name:string|null;
  non_striker_runs:number;
  non_striker_balls:number;
  bowler_name:string|null;
  bowler_wickets:number;
  bowler_runs:number;
  bowler_overs:string|null;
};

type CurrentOver={
  balls:Array<{id:string;label:string;legal:boolean;is_wicket:boolean}>;
  free_hit:boolean;
  awaiting_bowler?:boolean;
};

type Cue={
  id:string;
  sequence_no:number;
  match_id:string;
  output:BroadcastOutput;
  graphic:BroadcastGraphicId;
  mode:BroadcastMode;
  layer:number;
  payload:Record<string,unknown>;
  duration_ms:number|null;
  created_at:string;
};

function initials(name?:string|null){
  return (name??'IPS').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()).join('');
}

function formatRate(runs:number,balls:number,bpo:number){
  if(!balls||!bpo)return '0.00';
  return (runs/(balls/bpo)).toFixed(2);
}

function teamShort(name?:string|null){
  const words=(name??'TEAM').trim().split(/\s+/).filter(Boolean);
  if(words.length===1)return words[0].slice(0,4).toUpperCase();
  return words.map(w=>w[0]).join('').slice(0,4).toUpperCase();
}

function Logo({url,name}:{url?:string|null;name?:string|null}){
  return <span className="ips-team-logo">{url?<img src={url} alt=""/>:<b>{initials(name)}</b>}</span>;
}

function Scorebar({live,card,over}:{live:LiveSummary;card:any;over:CurrentOver}){
  const battingId=live.batting_team_id;
  const home=card?.match?.home_team;
  const away=card?.match?.away_team;
  const batting=home?.id===battingId?home:away?.id===battingId?away:null;
  const crr=formatRate(live.runs,live.legal_balls,live.balls_per_over);
  const maxBalls=Number(card?.match?.overs_per_innings??0)*Number(live.balls_per_over||0);
  const ballsRemaining=Math.max(maxBalls-live.legal_balls,0);
  const need=live.target_runs?Math.max(live.target_runs-live.runs,0):null;
  const rrr=need!==null&&ballsRemaining>0?(need/(ballsRemaining/live.balls_per_over)).toFixed(2):null;

  return <section className="ips-scorebar" aria-label="Live score">
    <div className="ips-score-core">
      <div className="ips-team-mark"><Logo url={batting?.logo_url} name={live.batting_team_name}/></div>
      <div className="ips-team-score">
        <span>{teamShort(live.batting_team_name)}</span>
        <strong>{live.runs}<i>/</i>{live.wickets}</strong>
      </div>
      <div className="ips-over">
        <strong>{live.overs_text}</strong>
        <span>OVERS</span>
      </div>
    </div>

    <div className="ips-player-band">
      <div className="ips-batter striker">
        <span>STRIKER</span>
        <b>{live.striker_name??'—'}</b>
        <strong>{live.striker_runs}<i>{live.striker_balls}</i></strong>
      </div>
      <div className="ips-batter">
        <span>NON-STRIKER</span>
        <b>{live.non_striker_name??'—'}</b>
        <strong>{live.non_striker_runs}<i>{live.non_striker_balls}</i></strong>
      </div>
      <div className="ips-bowler">
        <span>BOWLER</span>
        <b>{live.bowler_name??'—'}</b>
        <strong>{live.bowler_wickets}/{live.bowler_runs}<i>{live.bowler_overs??'0.0'}</i></strong>
      </div>
    </div>

    <div className="ips-over-band">
      <span className="ips-over-label">THIS OVER</span>
      <div className="ips-balls">
        {(over.balls??[]).slice(-8).map(ball=><i key={ball.id} className={ball.is_wicket?'wicket':ball.label==='4'?'four':ball.label==='6'?'six':/^(WD|NB)/.test(ball.label)?'extra':''}>{ball.label==='0'?'•':ball.label}</i>)}
      </div>
      {over.free_hit&&<b className="ips-state-chip">FREE HIT</b>}
    </div>

    <div className="ips-context-band">
      <span>CRR <b>{crr}</b></span>
      {live.innings_no===2&&live.target_runs&&<span>TARGET <b>{live.target_runs}</b></span>}
      {need!==null&&!live.innings_complete&&<span className="major">NEED <b>{need} FROM {ballsRemaining}</b></span>}
      {rrr&&<span>RRR <b>{rrr}</b></span>}
      <em>{card?.match?.tournament_name??'IPS CRICKET'}</em>
    </div>
  </section>;
}

function EventImpact({cue,live}:{cue:Cue;live:LiveSummary|null}){
  const payload=cue.payload??{};
  const player=String(payload.playerName??payload.player_name??live?.striker_name??'');
  const eventLabel:Record<string,string>={
    FOUR:'FOUR',SIX:'SIX',WICKET:'WICKET',FIFTY:'50',CENTURY:'100',FIVE_WICKETS:'5 WICKETS',
    HAT_TRICK:'HAT-TRICK',MAIDEN_OVER:'MAIDEN',RECORD:'NEW IPS RECORD',MILESTONE:'MILESTONE'
  };
  const label=eventLabel[cue.graphic]??cue.graphic.replaceAll('_',' ');
  return <section className={'ips-event-impact '+cue.mode.toLowerCase().replace('_','-')+' event-'+cue.graphic.toLowerCase()}>
    <div className="ips-event-blade"/>
    <div className="ips-event-copy">
      <span>IPS · {live?.batting_team_name??'CRICKET'}</span>
      <strong>{label}</strong>
      {player&&<b>{player}</b>}
      {live&&<small>{live.runs}/{live.wickets} · {live.overs_text} OV</small>}
    </div>
    <div className="ips-event-number">{cue.graphic==='FOUR'?'4':cue.graphic==='SIX'?'6':cue.graphic==='WICKET'?'W':cue.graphic==='CENTURY'?'100':cue.graphic==='FIFTY'?'50':'IPS'}</div>
  </section>;
}

function PlayerFeature({cue,live}:{cue:Cue;live:LiveSummary|null}){
  const isBowler=cue.graphic==='BOWLER_INTRO';
  const payload=cue.payload??{};
  const name=String(payload.playerName??payload.player_name??(isBowler?live?.bowler_name:live?.striker_name)??'PLAYER');
  const role=String(payload.role??(isBowler?'BOWLER':cue.graphic==='DISMISSAL'?'DISMISSED BATTER':'BATTER'));
  const primary=isBowler?String(live?.bowler_wickets??0)+'/'+String(live?.bowler_runs??0):String(live?.striker_runs??0);
  const secondary=isBowler?String(live?.bowler_overs??'0.0')+' OV':String(live?.striker_balls??0)+' BALLS';
  return <section className={'ips-player-feature '+cue.mode.toLowerCase().replace('_','-')}>
    <div className="ips-player-portrait"><span>{initials(name)}</span></div>
    <div className="ips-player-copy">
      <span>{role}</span>
      <strong>{name}</strong>
      <div><b>{primary}</b><i>{secondary}</i></div>
    </div>
    <div className="ips-player-brand">IPS</div>
  </section>;
}

function MatchBoard({cue,live,card}:{cue:Cue;live:LiveSummary|null;card:any}){
  const payload=cue.payload??{};
  const home=card?.match?.home_team;
  const away=card?.match?.away_team;
  const titles:Record<string,string>={
    MATCH_INTRO:card?.match?.tournament_name??'MATCH',
    VERSUS:'MATCH UP',
    TOSS:'TOSS',
    PLAYING_XI:'PLAYING XI',
    SIDE_BY_SIDE_TEAMS:'TEAMS',
    MATCH_CONDITIONS:'MATCH CONDITIONS',
    TARGET:'TARGET',
    INNINGS_BREAK:'INNINGS BREAK',
    MATCH_RESULT:'MATCH RESULT',
    PLAYER_OF_MATCH:'PLAYER OF THE MATCH',
    TOURNAMENT_AWARD:'TOURNAMENT AWARD',
    CHAMPIONS:'CHAMPIONS',
    HOLDING:'IPS CRICKET',
    UPCOMING_MATCH:'UP NEXT',
    MATCH_SCHEDULE:'MATCH SCHEDULE'
  };
  const title=String(payload.title??titles[cue.graphic]??cue.graphic.replaceAll('_',' '));
  const result=String(payload.result??card?.result_text??'');
  const target=Number(payload.target??live?.target_runs??0);
  return <section className={'ips-match-board '+cue.graphic.toLowerCase()}>
    <div className="ips-board-noise"/>
    <header><span>IPS BROADCAST</span><b>{card?.match?.tournament_name??'ITALY POINT SYSTEM'}</b></header>
    <div className="ips-board-title"><span>{title}</span></div>
    {cue.graphic==='TARGET'?<div className="ips-target-number"><strong>{target||'—'}</strong><span>TO WIN</span></div>:
      cue.graphic==='MATCH_RESULT'?<div className="ips-result-copy"><strong>{result||'RESULT'}</strong><span>{live?String(live.runs)+'/'+String(live.wickets)+' · '+live.overs_text+' OV':''}</span></div>:
      cue.graphic==='CHAMPIONS'?<div className="ips-champion-copy"><strong>{String(payload.teamName??payload.team_name??'CHAMPIONS')}</strong><span>{String(payload.subtitle??card?.match?.tournament_name??'')}</span></div>:
      <div className="ips-versus">
        <div><Logo url={home?.logo_url} name={home?.name}/><strong>{home?.name??'TEAM A'}</strong></div>
        <i>VS</i>
        <div><Logo url={away?.logo_url} name={away?.name}/><strong>{away?.name??'TEAM B'}</strong></div>
      </div>}
    {(cue.graphic==='TOSS'||cue.graphic==='MATCH_CONDITIONS'||cue.graphic==='HOLDING')&&<p>{String(payload.subtitle??payload.decision??payload.message??'')}</p>}
    <footer><span>{card?.match?.code??''}</span><b>{card?.match?.stage??''}{card?.match?.round_label?' · '+card.match.round_label:''}</b></footer>
  </section>;
}

function ScorecardGraphic({cue,card,live}:{cue:Cue;card:any;live:LiveSummary|null}){
  const innings=(card?.innings??[]).find((x:any)=>x.innings_no===live?.innings_no)??card?.innings?.[0];
  const batting=Array.isArray(innings?.batting)?innings.batting:[];
  const bowling=Array.isArray(innings?.bowling)?innings.bowling:[];
  const battingMode=cue.graphic!=='BOWLING_SCORECARD';
  const rows=battingMode?batting:bowling;
  return <section className="ips-scorecard-full">
    <header>
      <div><span>{battingMode?'BATTING':'BOWLING'} SCORECARD</span><strong>{innings?.batting_team?.name??live?.batting_team_name??'TEAM'}</strong></div>
      <div><b>{innings?.runs??live?.runs??0}/{innings?.wickets??live?.wickets??0}</b><span>{innings?.overs??live?.overs_text??'0.0'} OV</span></div>
    </header>
    <div className="ips-table-head">
      <span>PLAYER</span>
      {battingMode?<><b>R</b><b>B</b><b>4</b><b>6</b><b>SR</b></>:<><b>O</b><b>R</b><b>W</b><b>ECON</b><b/></>}
    </div>
    <div className="ips-table-body">
      {rows.slice(0,12).map((row:any)=>{
        const balls=Number(row.balls??0);
        const sr=balls?((Number(row.runs??0)*100)/balls).toFixed(1):'0.0';
        const legal=Number(row.legal_balls??0);
        const bpo=Number(card?.match?.balls_per_over??6);
        const econ=legal?((Number(row.runs??0)*bpo)/legal).toFixed(2):'0.00';
        return <div key={row.player_id??row.name}>
          <span><strong>{row.name}</strong><small>{battingMode?(row.dismissed?(row.dismissal||'OUT'):'NOT OUT'):''}</small></span>
          {battingMode?<><b>{row.runs??0}</b><b>{row.balls??0}</b><b>{row.fours??0}</b><b>{row.sixes??0}</b><b>{sr}</b></>:
            <><b>{row.overs??'0.0'}</b><b>{row.runs??0}</b><b>{row.wickets??0}</b><b>{econ}</b><b/></>}
        </div>;
      })}
    </div>
    <footer><span>{card?.match?.tournament_name??'IPS CRICKET'}</span><b>IPS</b></footer>
  </section>;
}

function GenericPanel({cue,live}:{cue:Cue;live:LiveSummary|null}){
  const rows=Array.isArray((cue.payload as any)?.rows)?(cue.payload as any).rows:[];
  return <section className={'ips-generic-panel '+cue.mode.toLowerCase().replace('_','-')}>
    <header><span>IPS BROADCAST</span><strong>{cue.graphic.replaceAll('_',' ')}</strong></header>
    <div className="ips-generic-main">
      {rows.length?rows.slice(0,10).map((row:any,index:number)=><div key={row.id??index}><b>{row.label??row.name??('#'+String(index+1))}</b><span>{row.value??row.stat??''}</span></div>):
      <div className="ips-generic-live"><strong>{live?String(live.runs)+'/'+String(live.wickets):'IPS'}</strong><span>{live?live.overs_text+' OV':'READY'}</span></div>}
    </div>
  </section>;
}

function CueRenderer({cue,live,card}:{cue:Cue;live:LiveSummary|null;card:any}){
  const def=broadcastGraphic(cue.graphic);
  if(!def)return null;
  if(def.family==='EVENT_IMPACT')return <EventImpact cue={cue} live={live}/>;
  if(def.family==='PLAYER_FEATURE'||def.family==='LOWER_THIRD')return <PlayerFeature cue={cue} live={live}/>;
  if(def.family==='MATCH_BOARD'||def.family==='RESULT_AWARD'||def.family==='HOLDING')return <MatchBoard cue={cue} live={live} card={card}/>;
  if(def.family==='SCORECARD')return <ScorecardGraphic cue={cue} live={live} card={card}/>;
  return <GenericPanel cue={cue} live={live}/>;
}

export function BroadcastOverlay({matchId,output,debug=false}:{matchId:string;output:BroadcastOutput;debug?:boolean}){
  const [live,setLive]=useState<LiveSummary|null>(null);
  const [card,setCard]=useState<any>(null);
  const [over,setOver]=useState<CurrentOver>({balls:[],free_hit:false});
  const [layers,setLayers]=useState<Record<number,Cue>>({});
  const [error,setError]=useState('');
  const timers=useRef<Record<number,ReturnType<typeof setTimeout>>>({});
  const supabase=useMemo(()=>createOverlayClient(),[]);

  useEffect(()=>{
    if(!matchId){setError('Add ?match=<match-id> to the overlay URL.');return;}
    let mounted=true;
    async function refresh(){
      const [liveRes,cardRes,overRes]=await Promise.all([
        supabase.rpc('ips_public_match_live_summaries'),
        supabase.rpc('ips_public_match_scorecard',{p_match_id:matchId}),
        supabase.rpc('ips_public_current_over',{p_match_id:matchId})
      ]);
      if(!mounted)return;
      const summary=(Array.isArray(liveRes.data)?liveRes.data:[]).find((row:any)=>row.match_id===matchId)??null;
      if(liveRes.error||cardRes.error||overRes.error){
        setError(liveRes.error?.message||cardRes.error?.message||overRes.error?.message||'Overlay data unavailable.');
      }else{
        setError('');
      }
      setLive(summary as LiveSummary|null);
      setCard(cardRes.data??null);
      setOver((overRes.data as CurrentOver)??{balls:[],free_hit:false});
    }
    void refresh();

    const stateChannel=supabase.channel('ips-overlay-state-'+matchId)
      .on('postgres_changes',{event:'*',schema:'public',table:'match_live_state',filter:'match_id=eq.'+matchId},()=>{void refresh();})
      .subscribe();

    const cueChannel=supabase.channel('ips-overlay-cues-'+matchId+'-'+output)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'broadcast_graphic_cues',filter:'match_id=eq.'+matchId},payload=>{
        const next=payload.new as Cue;
        if(next.output!==output)return;
        const layer=Number(next.layer);
        if(timers.current[layer])clearTimeout(timers.current[layer]);
        if(next.graphic==='CLEAR_LAYER'){
          setLayers(current=>{
            const copy={...current};
            delete copy[layer];
            return copy;
          });
          return;
        }
        setLayers(current=>({...current,[layer]:next}));
        if(typeof next.duration_ms==='number'&&next.duration_ms>0){
          timers.current[layer]=setTimeout(()=>{
            setLayers(current=>{
              if(current[layer]?.id!==next.id)return current;
              const copy={...current};
              delete copy[layer];
              return copy;
            });
          },next.duration_ms);
        }
      })
      .subscribe();

    return ()=>{
      mounted=false;
      Object.values(timers.current).forEach(clearTimeout);
      void supabase.removeChannel(stateChannel);
      void supabase.removeChannel(cueChannel);
    };
  },[matchId,output,supabase]);

  const active=Object.values(layers).sort((a,b)=>a.layer-b.layer);
  const fullscreen=active.find(item=>item.mode==='FULL_SCREEN'&&broadcastGraphic(item.graphic)?.hidesScorebar);
  const scorebarVisible=!!live?.started&&!live?.match_complete&&!fullscreen;

  return <main className="ips-stage">
    {scorebarVisible&&live&&<Scorebar live={live} card={card} over={over}/>}
    {active.map(cue=><div className={'ips-layer layer-'+cue.layer} key={cue.id}><CueRenderer cue={cue} live={live} card={card}/></div>)}
    {debug&&<div className="ips-debug"><b>{output}</b><span>{matchId||'NO MATCH'}</span><span>{active.map(x=>x.graphic).join(' · ')||'NO CUE'}</span></div>}
    {debug&&error&&<div className="ips-error">{error}</div>}
  </main>;
}
