'use client';

import {useMemo,useState} from 'react';
import type {PublicMatchScorecard,PublicMatchScorecardInnings} from '@ips/data';

function BattingTable({innings}:{innings:PublicMatchScorecardInnings}){
  const rows=innings.batting.filter(player=>(player.balls??0)>0||(player.runs??0)>0||player.dismissed);
  const visible=rows.length?rows:innings.batting.slice(0,2);
  return <div className="public-score-table">
    <header><span>BATTER</span><b>R</b><b>B</b><b>4</b><b>6</b><b>SR</b></header>
    {visible.map(player=>{
      const balls=Number(player.balls??0);
      const runs=Number(player.runs??0);
      const sr=balls?((runs/balls)*100).toFixed(1):'0.0';
      return <div key={player.player_id}>
        <span><strong>{player.name}</strong><small>{player.dismissed?(player.dismissal||'OUT').replaceAll('_',' '):'NOT OUT'}</small></span>
        <b>{runs}</b><b>{balls}</b><b>{player.fours??0}</b><b>{player.sixes??0}</b><b>{sr}</b>
      </div>;
    })}
  </div>;
}

function BowlingTable({innings}:{innings:PublicMatchScorecardInnings}){
  return <div className="public-score-table bowling">
    <header><span>BOWLER</span><b>OV</b><b>R</b><b>W</b><b>ECON</b></header>
    {innings.bowling.length?innings.bowling.map(player=>{
      const overs=String(player.overs??'0.0');
      const legal=Number(player.legal_balls??0);
      const runs=Number(player.runs??0);
      const economy=legal?((runs/(legal/6))).toFixed(2):'0.00';
      return <div key={player.player_id}>
        <span><strong>{player.name}</strong><small>{player.ips_code}</small></span>
        <b>{overs}</b><b>{runs}</b><b>{player.wickets??0}</b><b>{economy}</b>
      </div>;
    }):<p>No bowling figures recorded.</p>}
  </div>;
}

export function PublicMatchScorecardView({scorecard}:{scorecard:PublicMatchScorecard}){
  const inningsList=scorecard.innings??[];
  const [inningsNo,setInningsNo]=useState<number>(inningsList[0]?.innings_no??1);
  const [mode,setMode]=useState<'BATTING'|'BOWLING'>('BATTING');
  const innings=useMemo(()=>inningsList.find(item=>item.innings_no===inningsNo)??inningsList[0],[inningsList,inningsNo]);

  if(!innings)return <div className="public-score-empty">No innings scorecard is available yet.</div>;

  return <div className="public-scorecard">
    <div className="public-score-tabs">
      {inningsList.map(item=><button key={item.innings_no} className={inningsNo===item.innings_no?'active':''} onClick={()=>{setInningsNo(item.innings_no);setMode('BATTING');}}>
        <span>{item.innings_no===1?'1ST INNINGS':'2ND INNINGS'}</span>
        <strong>{item.batting_team.name}</strong>
        <b>{item.runs}/{item.wickets} · {item.overs} ov</b>
      </button>)}
    </div>

    <section className="public-score-innings">
      <header>
        <div><span>{innings.innings_no===1?'1ST INNINGS':'2ND INNINGS'}</span><h2>{innings.batting_team.name}</h2></div>
        <div className="public-score-total"><strong>{innings.runs}/{innings.wickets}</strong><span>{innings.overs} OVERS</span></div>
      </header>

      <div className="public-score-mode">
        <button className={mode==='BATTING'?'active':''} onClick={()=>setMode('BATTING')}>Batting</button>
        <button className={mode==='BOWLING'?'active':''} onClick={()=>setMode('BOWLING')}>Bowling</button>
      </div>

      {mode==='BATTING'?<BattingTable innings={innings}/>:<BowlingTable innings={innings}/>}
    </section>
  </div>;
}
