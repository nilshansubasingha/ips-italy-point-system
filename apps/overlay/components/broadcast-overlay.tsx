'use client';

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {createBroadcastClient} from '@/lib/supabase';

type Team={id:string;name:string;short_name?:string|null;logo_url?:string|null};
type Batter={player_id:string;name:string;runs:number;balls:number;fours:number;sixes:number;dismissed:boolean;dismissal?:string};
type Bowler={player_id:string;name:string;overs:string;runs:number;wickets:number;legal_balls:number};
type Innings={innings_no:number;status:string;batting_team:Team;bowling_team:Team;runs:number;wickets:number;legal_balls:number;overs:string;target_runs:number|null;batting:Batter[];bowling:Bowler[]};
type Scorecard={match:{id:string;code:string;number:number;status:string;stage:string;round_label?:string|null;tournament_name:string;overs_per_innings:number;balls_per_over:number;home_team:Team;away_team:Team};result_text?:string|null;innings:Innings[]};
type BroadcastState={active_graphic:string;mode:'FULLSCREEN'|'LOWER_THIRD'|'SIDE_PANEL'|'COMPACT';payload:Record<string,any>;visible:boolean;duration_ms:number;transition:string;sequence_no:number};

const demo:Scorecard={match:{id:'demo',code:'IPS-DEMO',number:1,status:'LIVE',stage:'GROUP',tournament_name:'IPS PREMIER CRICKET',overs_per_innings:15,balls_per_over:6,home_team:{id:'a',name:'Torino Lions',short_name:'TOR'},away_team:{id:'b',name:'Milano Warriors',short_name:'MIL'}},innings:[{innings_no:2,status:'OPEN',batting_team:{id:'a',name:'Torino Lions',short_name:'TOR'},bowling_team:{id:'b',name:'Milano Warriors',short_name:'MIL'},runs:126,wickets:4,legal_balls:75,overs:'12.3',target_runs:161,batting:[{player_id:'1',name:'A. Silva',runs:44,balls:28,fours:5,sixes:2,dismissed:false},{player_id:'2',name:'R. Perera',runs:18,balls:11,fours:2,sixes:1,dismissed:false}],bowling:[{player_id:'3',name:'M. Rossi',overs:'2.3',runs:21,wickets:2,legal_balls:15}]}]};
const initialBroadcast:BroadcastState={active_graphic:'NONE',mode:'COMPACT',payload:{},visible:false,duration_ms:5000,transition:'AUTO',sequence_no:0};

function initials(name:string){return name.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()).join('')||'IPS'}
function TeamMark({team}:{team:Team}){return team.logo_url?<img className="team-logo" src={team.logo_url} alt=""/>:<span className="team-fallback">{initials(team.short_name||team.name)}</span>}
function rate(runs:number,balls:number,bpo=6){return balls?((runs*bpo)/balls).toFixed(2):'0.00'}

function Scorebar({data}:{data:Scorecard}){
  const innings=data.innings.at(-1);
  if(!innings)return null;
  const striker=innings.batting.filter(x=>!x.dismissed).sort((a,b)=>b.balls-a.balls)[0];
  const partner=innings.batting.filter(x=>!x.dismissed&&x.player_id!==striker?.player_id).sort((a,b)=>b.balls-a.balls)[0];
  const bowler=innings.bowling.at(-1);
  const target=innings.target_runs;
  const maxBalls=data.match.overs_per_innings*data.match.balls_per_over;
  const need=target?Math.max(target-innings.runs,0):null;
  const ballsLeft=Math.max(maxBalls-innings.legal_balls,0);
  const crr=rate(innings.runs,innings.legal_balls,data.match.balls_per_over);
  const rrr=need!==null&&ballsLeft?((need*data.match.balls_per_over)/ballsLeft).toFixed(2):null;
  return <div className="scorebar-shell">
    <div className="scorebrand"><span className="ips-glyph">IPS</span><small>{data.match.tournament_name}</small></div>
    <div className="team-score"><TeamMark team={innings.batting_team}/><div><small>{innings.batting_team.short_name||innings.batting_team.name}</small><strong>{innings.runs}<i>/</i>{innings.wickets}</strong></div></div>
    <div className="overs"><strong>{innings.overs}</strong><span>OVERS</span></div>
    <div className="players">
      <div className="player-line active"><span>●</span><b>{striker?.name||'BATTER'}</b><strong>{striker?.runs??0}<small>{striker?.balls??0}</small></strong></div>
      <div className="player-line"><span>○</span><b>{partner?.name||'NON-STRIKER'}</b><strong>{partner?.runs??0}<small>{partner?.balls??0}</small></strong></div>
    </div>
    <div className="bowler"><small>BOWLER</small><b>{bowler?.name||'—'}</b><strong>{bowler?bowler.wickets+'/'+bowler.runs:'0/0'} <i>{bowler?.overs||'0.0'}</i></strong></div>
    <div className="equation">{need!==null?<><small>NEED</small><strong>{need} <i>FROM {ballsLeft}</i></strong><span>RRR {rrr}</span></>:<><small>CURRENT RR</small><strong>{crr}</strong><span>{data.match.stage}</span></>}</div>
    <div className="scorebar-ticker"><span>CRR <b>{crr}</b></span>{target&&<span>TARGET <b>{target}</b></span>}<em>{data.match.code}</em></div>
  </div>;
}

function HeroEvent({state,data}:{state:BroadcastState;data:Scorecard}){
  if(!state.visible||state.active_graphic==='NONE')return null;
  const p=state.payload||{};
  const innings=data.innings.at(-1);
  const g=state.active_graphic;
  const title=p.title||g.replaceAll('_',' ');
  const value=p.value||((g==='TARGET'&&innings?.target_runs)||'');
  const subtitle=p.subtitle||p.player||p.team||'';
  const eventClass=['FOUR','SIX','WICKET','HAT_TRICK','CHAMPIONS','RESULT'].includes(g)?'major':'';
  if(g==='BATTING_SCORECARD'||g==='BOWLING_SCORECARD'||g==='SCORECARD'){
    return <div className={'graphic-layer fullscreen '+eventClass}>
      <div className="fs-frame scorecard-frame">
        <header><div><span>{data.match.tournament_name}</span><h2>{g.replaceAll('_',' ')}</h2></div><b>{innings?.batting_team.name}</b></header>
        <div className="tv-table">
          {(g==='BOWLING_SCORECARD'?innings?.bowling:innings?.batting)?.slice(0,11).map((x:any)=><div key={x.player_id}><strong>{x.name}</strong><span>{g==='BOWLING_SCORECARD'?x.overs+'  '+x.runs+'-'+x.wickets:x.runs+'  '+x.balls+'  '+x.fours+'x4  '+x.sixes+'x6'}</span></div>)}
        </div>
        <footer>{innings?.runs}/{innings?.wickets} · {innings?.overs} OVERS</footer>
      </div>
    </div>
  }
  if(g==='MATCH_INTRO'||g==='VS'){
    return <div className="graphic-layer fullscreen major"><div className="versus">
      <div><TeamMark team={data.match.home_team}/><strong>{data.match.home_team.name}</strong></div>
      <section><span>{data.match.tournament_name}</span><b>VS</b><small>{data.match.stage} · MATCH {data.match.number}</small></section>
      <div><TeamMark team={data.match.away_team}/><strong>{data.match.away_team.name}</strong></div>
    </div></div>
  }
  if(g==='PLAYER_INTRO'||g==='BATTER_INTRO'||g==='BOWLER_INTRO'||g==='PLAYER_STATS'||g==='PLAYER_OF_MATCH'){
    return <div className={'graphic-layer '+(state.mode==='FULLSCREEN'?'fullscreen':'lowerthird')}>
      <div className="player-card"><div className="portrait">{p.portrait?<img src={p.portrait} alt=""/>:<span>{initials(p.player||subtitle||'IPS')}</span>}</div><div className="player-copy"><small>{p.kicker||g.replaceAll('_',' ')}</small><h2>{p.player||subtitle||'PLAYER NAME'}</h2><p>{p.detail||p.team||''}</p><div className="stat-row">{p.stat1&&<b>{p.stat1}</b>}{p.stat2&&<b>{p.stat2}</b>}{p.stat3&&<b>{p.stat3}</b>}</div></div></div>
    </div>
  }
  return <div className={'graphic-layer '+(state.mode==='FULLSCREEN'?'fullscreen':'compact')+' '+eventClass}>
    <div className="event-card"><span className="event-kicker">{p.kicker||data.match.tournament_name}</span><strong className="event-value">{value}</strong><h1>{title}</h1><p>{subtitle}</p><i>IPS</i></div>
  </div>;
}

export function BroadcastOverlay({matchId,preview=false}:{matchId?:string;preview?:boolean}){
  const [data,setData]=useState<Scorecard>(demo);
  const [state,setState]=useState<BroadcastState>(preview?{...initialBroadcast,visible:true,active_graphic:'SIX',mode:'FULLSCREEN',payload:{title:'SIX',value:'6',subtitle:'A. SILVA'}}:initialBroadcast);
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const supabase=useMemo(()=>matchId?createBroadcastClient():null,[matchId]);

  const refresh=useCallback(async()=>{
    if(!supabase||!matchId)return;
    const [{data:score,error:scoreError},{data:control,error:controlError}]=await Promise.all([
      supabase.rpc('ips_public_match_scorecard',{p_match_id:matchId}),
      supabase.from('match_broadcast_state').select('*').eq('match_id',matchId).maybeSingle()
    ]);
    if(!scoreError&&score)setData(score as Scorecard);
    if(!controlError&&control)setState(control as BroadcastState);
  },[supabase,matchId]);

  useEffect(()=>{refresh()},[refresh]);
  useEffect(()=>{
    if(!supabase||!matchId)return;
    const channel=supabase.channel('ips-broadcast-'+matchId)
      .on('postgres_changes',{event:'*',schema:'public',table:'match_live_state',filter:'match_id=eq.'+matchId},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'match_broadcast_state',filter:'match_id=eq.'+matchId},refresh)
      .subscribe();
    return()=>{void supabase.removeChannel(channel)};
  },[supabase,matchId,refresh]);

  useEffect(()=>{
    if(timer.current)clearTimeout(timer.current);
    if(state.visible&&state.duration_ms>0&&state.active_graphic!=='NONE'&&!['SCORECARD','BATTING_SCORECARD','BOWLING_SCORECARD','MATCH_INTRO','VS'].includes(state.active_graphic)){
      timer.current=setTimeout(()=>setState(s=>({...s,visible:false})),state.duration_ms);
    }
    return()=>{if(timer.current)clearTimeout(timer.current)};
  },[state.sequence_no,state.visible,state.duration_ms,state.active_graphic]);

  return <main className="broadcast-stage">
    <div className="broadcast-bug"><b>IPS</b><span>LIVE</span></div>
    <HeroEvent state={state} data={data}/>
    <Scorebar data={data}/>
    {preview&&<div className="preview-label">DIRECTOR PREVIEW · DEMO DATA</div>}
  </main>;
}
