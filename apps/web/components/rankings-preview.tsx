import Link from 'next/link';
import type {CSSProperties} from 'react';
import type {PlayerRankingRow,RankingDefinitionRow} from '@ips/data';
import {PlayerAvatar} from './identity';

const fallbackDefinitions:RankingDefinitionRow[]=[
  {id:'fallback-batting',ranking_key:'best-batsmen',title:'Best batsmen',source_key:'runs',section:'PRIMARY',columns:[{key:'sr',label:'SR'},{key:'awards',label:'Awards'},{key:'runs',label:'Runs'}],sort_direction:'DESC',sort_order:10,description:'Ranked by total runs from certified Ranking Matches. Awards are assigned manually by tournament admins.',enabled:true,created_at:'',updated_at:''},
  {id:'fallback-bowling',ranking_key:'best-bowlers',title:'Best bowlers',source_key:'wickets',section:'PRIMARY',columns:[{key:'best_figures',label:'Best Figures'},{key:'awards',label:'Awards'},{key:'wickets',label:'Wickets'}],sort_direction:'DESC',sort_order:20,description:'Ranked by wickets from certified Ranking Matches. Awards are assigned manually by tournament admins.',enabled:true,created_at:'',updated_at:''},
  {id:'fallback-allrounder',ranking_key:'best-all-rounders',title:'Best all-rounders',source_key:'all_rounder_points',section:'PRIMARY',columns:[{key:'awards',label:'Awards'},{key:'runs',label:'Runs'},{key:'wickets',label:'Wickets'}],sort_direction:'DESC',sort_order:30,description:'Public output shows manual Awards, Runs and Wickets from certified Ranking Matches.',enabled:true,created_at:'',updated_at:''},
  {id:'fallback-most-fifties',ranking_key:'most-fifties',title:'Most fifties',source_key:'most_fifties',section:'MILESTONE',columns:[{key:'fifties',label:'50s'},{key:'fours',label:'4s'},{key:'sixes',label:'6s'}],sort_direction:'DESC',sort_order:110,description:'Ranked by number of certified innings scores from 50 to 99.',enabled:true,created_at:'',updated_at:''},
  {id:'fallback-fastest-fifty',ranking_key:'fastest-fifty',title:'Fastest fifty',source_key:'fastest_fifty',section:'MILESTONE',columns:[{key:'score_balls',label:'Score (Balls)'},{key:'fours',label:'4'},{key:'sixes',label:'6'}],sort_direction:'ASC',sort_order:120,description:'Activates when ball-by-ball fifty-reach records are available.',enabled:true,created_at:'',updated_at:''},
  {id:'fallback-hattricks',ranking_key:'most-hat-tricks',title:'Most hat-tricks',source_key:'most_hat_tricks',section:'MILESTONE',columns:[{key:'hat_tricks',label:'Hat-tricks'}],sort_direction:'DESC',sort_order:130,description:'Activates from certified consecutive-wicket delivery records.',enabled:true,created_at:'',updated_at:''}
];

function pointsFor(row:PlayerRankingRow,source:string){
  if(source==='runs')return Number(row.runs);
  if(source==='wickets')return Number(row.wickets);
  if(source==='batting_points')return Number(row.batting_points);
  if(source==='bowling_points')return Number(row.bowling_points);
  if(source==='all_rounder_points')return Number(row.all_rounder_points);
  if(source==='most_fifties')return Number(row.fifties);
  if(source==='fastest_fifty')return row.fastest_fifty_balls==null?Number.POSITIVE_INFINITY:Number(row.fastest_fifty_balls);
  if(source==='most_hat_tricks')return Number(row.hat_tricks);
  return 0;
}

function candidatesFor(rows:PlayerRankingRow[],definition:RankingDefinitionRow){
  const filtered=definition.source_key==='most_fifties'?rows.filter(row=>row.fifties>0)
    :definition.source_key==='fastest_fifty'?rows.filter(row=>row.fastest_fifty_balls!=null)
    :definition.source_key==='most_hat_tricks'?rows.filter(row=>row.hat_tricks>0)
    :rows;
  return [...filtered].sort((a,b)=>{
    const delta=pointsFor(b,definition.source_key)-pointsFor(a,definition.source_key);
    if(delta!==0)return definition.sort_direction==='ASC'?-delta:delta;
    return b.runs-a.runs||b.wickets-a.wickets||a.display_name.localeCompare(b.display_name);
  }).slice(0,10);
}

function statValue(row:PlayerRankingRow,definition:RankingDefinitionRow,key:string){
  if(key==='sr')return Number(row.strike_rate).toFixed(1);
  if(key==='best_figures')return row.best_bowling_wickets>0?`${row.best_bowling_wickets}/${row.best_bowling_runs}`:'—';
  if(key==='points')return Math.round(pointsFor(row,definition.source_key)).toString();
  if(key==='awards')return String(row.awards??0);
  if(key==='runs')return String(row.runs);
  if(key==='wickets')return String(row.wickets);
  if(key==='fifties')return String(row.fifties);
  if(key==='score_balls'&&definition.source_key==='fastest_fifty')return row.fastest_fifty_balls==null?'—':`${row.fastest_fifty_score??50} (${row.fastest_fifty_balls})`;
  if(key==='fours')return String(definition.source_key==='fastest_fifty'?(row.fastest_fifty_fours??0):row.fours);
  if(key==='sixes')return String(definition.source_key==='fastest_fifty'?(row.fastest_fifty_sixes??0):row.sixes);
  if(key==='hat_tricks')return String(row.hat_tricks);
  return '—';
}

function RankingPanel({definition,scopeLabel,formatLabel,rows}:{definition:RankingDefinitionRow;scopeLabel:string;formatLabel:string;rows:PlayerRankingRow[]}){
  const columns=definition.columns??[];
  const candidates=candidatesFor(rows,definition);
  const activeSource=true;

  return <article className="ranking-panel ranking-panel-table" data-ranking-source={definition.source_key}>
    <div className="ranking-panel-head">
      <div><span>{scopeLabel.toUpperCase()} · {formatLabel.toUpperCase()}</span><h3>{definition.title}</h3></div>
      <span className={'preview-badge '+(activeSource?'live':'')}>{activeSource?'LIVE DATA':'NEXT ENGINE STEP'}</span>
    </div>

    <div className="ranking-table-head" style={{'--ranking-cols':columns.length} as CSSProperties}>
      <span>RANK</span><span>NAME</span>
      {columns.map(column=><span key={column.key}>{column.label}</span>)}
    </div>

    <div className="ranking-list">
      {candidates.map((row,index)=>(
        <Link className="ranking-row ranking-row-table" style={{'--ranking-cols':columns.length} as CSSProperties} href={'/players/'+row.slug} key={row.player_id}>
          <span className="ranking-position">{index+1}</span>
          <div className="ranking-player-inline">
            <PlayerAvatar name={row.display_name} imageUrl={row.profile_image_url}/>
            <div className="ranking-player-copy">
              <strong>{row.display_name}</strong>
              <span>{row.team_short_name??row.team_name??row.city_name??'Italy'} · {row.matches} match{row.matches===1?'':'es'}</span>
            </div>
          </div>
          {columns.map(column=><div className="ranking-stat-cell" key={column.key}><strong>{statValue(row,definition,column.key)}</strong><span>{column.label}</span></div>)}
        </Link>
      ))}
      {!candidates.length&&<div className="ranking-empty">{activeSource?'No certified ranking-eligible records in this scope yet.':'No qualifying certified record yet.'}</div>}
    </div>

    <div className="ranking-panel-foot"><span>{definition.description??'Certified IPS ranking-eligible match facts only.'}</span></div>
  </article>;
}

export function RankingsPreview({rankings,definitions,scopeLabel='Italy',formatLabel='Overall',stacked=false}:{rankings:PlayerRankingRow[];definitions?:RankingDefinitionRow[];scopeLabel?:string;formatLabel?:string;stacked?:boolean}){
  const catalogue=(definitions?.length?definitions:fallbackDefinitions).filter(definition=>definition.enabled).sort((a,b)=>a.sort_order-b.sort_order||a.title.localeCompare(b.title));
  const primary=catalogue.filter(definition=>definition.section==='PRIMARY');
  const milestones=catalogue.filter(definition=>definition.section==='MILESTONE');

  return <div className={'rankings-stage '+(stacked?'rankings-stage-stacked':'')}>
    <div className="rankings-strip-note">
      <strong>OFFICIAL IPS RANKINGS · {formatLabel.toUpperCase()}</strong>
      <span>Public tables use certified Ranking Match totals. Awards are entered manually by authorised tournament admins.</span>
    </div>

    {!!primary.length&&<div className={stacked?'rankings-spaced-grid rankings-primary-grid':'rankings-carousel'}>
      {primary.map(definition=><RankingPanel key={definition.id} definition={definition} scopeLabel={scopeLabel} formatLabel={formatLabel} rows={rankings}/>)}
    </div>}

    {!!milestones.length&&<>
      <div className="ranking-milestone-head">
        <div><span className="eyebrow">MILESTONE LEADERS</span><h3>Record chasers.</h3></div>
        <p>Milestones use the same City and format filters and only certified Ranking Match facts.</p>
      </div>
      <div className="rankings-milestone-grid">
        {milestones.map(definition=><RankingPanel key={definition.id} definition={definition} scopeLabel={scopeLabel} formatLabel={formatLabel} rows={rankings}/>)}
      </div>
    </>}
  </div>;
}
