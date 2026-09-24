import Link from 'next/link';
import type {CSSProperties} from 'react';
import type {PlayerDirectoryItem,RankingDefinitionRow} from '@ips/data';
import {PlayerAvatar} from './identity';

const fallbackDefinitions:RankingDefinitionRow[]=[
  {
    id:'fallback-batting',
    ranking_key:'best-batsmen',
    title:'Best batsmen',
    source_key:'batting_points',
    section:'PRIMARY',
    columns:[{key:'sr',label:'SR'},{key:'awards',label:'Awards'},{key:'points',label:'Points'}],
    sort_direction:'DESC',
    sort_order:10,
    description:'SR = strike rate. Awards and ranking points come only from certified IPS match records.',
    enabled:true,
    created_at:'',
    updated_at:''
  },
  {
    id:'fallback-bowling',
    ranking_key:'best-bowlers',
    title:'Best bowlers',
    source_key:'bowling_points',
    section:'PRIMARY',
    columns:[{key:'best_figures',label:'Best Figures'},{key:'awards',label:'Awards'},{key:'points',label:'Points'}],
    sort_direction:'DESC',
    sort_order:20,
    description:'Best Figures uses certified innings bowling figures. Awards and points remain format-specific.',
    enabled:true,
    created_at:'',
    updated_at:''
  },
  {
    id:'fallback-allrounder',
    ranking_key:'best-all-rounders',
    title:'Best all-rounders',
    source_key:'all_rounder_points',
    section:'PRIMARY',
    columns:[{key:'awards',label:'Awards'},{key:'points',label:'Points'}],
    sort_direction:'DESC',
    sort_order:30,
    description:'All-rounder points combine certified batting and bowling contributions under the active ranking rules.',
    enabled:true,
    created_at:'',
    updated_at:''
  },
  {
    id:'fallback-most-fifties',
    ranking_key:'most-fifties',
    title:'Most fifties',
    source_key:'most_fifties',
    section:'MILESTONE',
    columns:[{key:'score_balls',label:'Score (Balls)'},{key:'fours',label:'4'},{key:'sixes',label:'6'}],
    sort_direction:'DESC',
    sort_order:110,
    description:'Fifty records are derived from certified innings. Score, balls, fours and sixes come from the scorer automatically.',
    enabled:true,
    created_at:'',
    updated_at:''
  },
  {
    id:'fallback-fastest-fifty',
    ranking_key:'fastest-fifty',
    title:'Fastest fifty',
    source_key:'fastest_fifty',
    section:'MILESTONE',
    columns:[{key:'score_balls',label:'Score (Balls)'},{key:'fours',label:'4'},{key:'sixes',label:'6'}],
    sort_direction:'ASC',
    sort_order:120,
    description:'Fastest fifty is ranked by balls required to reach 50 from the certified delivery ledger.',
    enabled:true,
    created_at:'',
    updated_at:''
  },
  {
    id:'fallback-hattricks',
    ranking_key:'most-hat-tricks',
    title:'Most hat-tricks',
    source_key:'most_hat_tricks',
    section:'MILESTONE',
    columns:[{key:'hat_tricks',label:'Hat-tricks'}],
    sort_direction:'DESC',
    sort_order:130,
    description:'Hat-tricks are detected from three consecutive qualifying wicket deliveries in certified match facts.',
    enabled:true,
    created_at:'',
    updated_at:''
  }
];

function RankingPanel({
  definition,
  scopeLabel,
  formatLabel,
  players
}:{
  definition:RankingDefinitionRow;
  scopeLabel:string;
  formatLabel:string;
  players:PlayerDirectoryItem[];
}){
  const columns=definition.columns??[];
  return (
    <article className="ranking-panel ranking-panel-table" data-ranking-source={definition.source_key}>
      <div className="ranking-panel-head">
        <div><span>{scopeLabel.toUpperCase()} · {formatLabel.toUpperCase()}</span><h3>{definition.title}</h3></div>
        <span className="preview-badge">Awaiting certified data</span>
      </div>

      <div className="ranking-table-head" style={{'--ranking-cols':columns.length} as CSSProperties}>
        <span>RANK</span><span>NAME</span>
        {columns.map(column=><span key={column.key}>{column.label}</span>)}
      </div>

      <div className="ranking-list">
        {players.slice(0,5).map(player=>(
          <Link
            className="ranking-row ranking-row-table"
            style={{'--ranking-cols':columns.length} as CSSProperties}
            href={'/players/'+player.slug}
            key={player.id}
          >
            <span className="ranking-position">—</span>
            <div className="ranking-player-inline">
              <PlayerAvatar name={player.display_name} imageUrl={player.profile_image_url}/>
              <div className="ranking-player-copy">
                <strong>{player.display_name}</strong>
                <span>{player.currentTeam?.short_name??player.currentTeam?.name??player.city?.name??'Italy'}</span>
              </div>
            </div>
            {columns.map(column=><div className="ranking-stat-cell" key={column.key}><strong>—</strong><span>{column.label}</span></div>)}
          </Link>
        ))}
        {!players.length&&<div className="ranking-empty">No eligible players in this scope yet.</div>}
      </div>

      <div className="ranking-panel-foot"><span>{definition.description??'Certified IPS match facts only.'}</span></div>
    </article>
  );
}

export function RankingsPreview({
  players,
  definitions,
  scopeLabel='Italy',
  formatLabel='Overall',
  stacked=false
}:{
  players:PlayerDirectoryItem[];
  definitions?:RankingDefinitionRow[];
  scopeLabel?:string;
  formatLabel?:string;
  stacked?:boolean;
}){
  const candidates=[...players].sort((a,b)=>a.display_name.localeCompare(b.display_name)).slice(0,5);
  const catalogue=(definitions?.length?definitions:fallbackDefinitions)
    .filter(definition=>definition.enabled)
    .sort((a,b)=>a.sort_order-b.sort_order||a.title.localeCompare(b.title));

  const primary=catalogue.filter(definition=>definition.section==='PRIMARY');
  const milestones=catalogue.filter(definition=>definition.section==='MILESTONE');

  return (
    <div className={'rankings-stage '+(stacked?'rankings-stage-stacked':'')}>
      <div className="rankings-strip-note">
        <strong>OFFICIAL IPS RANKINGS · {formatLabel.toUpperCase()}</strong>
        <span>Leaderboard layout is Admin-managed. Only certified match facts can fill positions and statistics.</span>
      </div>

      {!!primary.length&&<div className={stacked?'rankings-spaced-grid rankings-primary-grid':'rankings-carousel'}>
        {primary.map(definition=><RankingPanel
          key={definition.id}
          definition={definition}
          scopeLabel={scopeLabel}
          formatLabel={formatLabel}
          players={candidates}
        />)}
      </div>}

      {!!milestones.length&&<>
        <div className="ranking-milestone-head">
          <div><span className="eyebrow">MILESTONE LEADERS</span><h3>Record chasers.</h3></div>
          <p>These tables use the same City and overs-format filters. Their titles, columns and order can be changed from IPS Management.</p>
        </div>

        <div className="rankings-milestone-grid">
          {milestones.map(definition=><RankingPanel
            key={definition.id}
            definition={definition}
            scopeLabel={scopeLabel}
            formatLabel={formatLabel}
            players={candidates}
          />)}
        </div>
      </>}
    </div>
  );
}
