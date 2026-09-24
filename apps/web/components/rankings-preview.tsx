import Link from 'next/link';
import type { PlayerDirectoryItem } from '@ips/data';
import { PlayerAvatar } from './identity';

type ColumnKey='sr'|'awards'|'points'|'best'|'fifties'|'hatTricks';

type RankingPanelProps={
  title:string;
  scopeLabel:string;
  formatLabel:string;
  players:PlayerDirectoryItem[];
  columns:Array<{key:ColumnKey;label:string;wide?:boolean}>;
  footnote:string;
};

function RankingPanel({title,scopeLabel,formatLabel,players,columns,footnote}:RankingPanelProps){
  return (
    <article className="ranking-panel ranking-panel-table">
      <div className="ranking-panel-head">
        <div><span>{scopeLabel.toUpperCase()} · {formatLabel.toUpperCase()}</span><h3>{title}</h3></div>
        <span className="preview-badge">Awaiting certified data</span>
      </div>

      <div className="ranking-table-head" style={{'--ranking-cols':columns.length} as React.CSSProperties}>
        <span>POS</span><span>PLAYER</span>
        {columns.map(column=><span key={column.key} className={column.wide?'wide':''}>{column.label}</span>)}
      </div>

      <div className="ranking-list">
        {players.slice(0,5).map(player=>(
          <Link
            className="ranking-row ranking-row-table"
            style={{'--ranking-cols':columns.length} as React.CSSProperties}
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

      <div className="ranking-panel-foot"><span>{footnote}</span></div>
    </article>
  );
}

export function RankingsPreview({
  players,
  scopeLabel='Italy',
  formatLabel='Overall',
  stacked=false
}:{
  players:PlayerDirectoryItem[];
  scopeLabel?:string;
  formatLabel?:string;
  stacked?:boolean;
}){
  const candidates=[...players].sort((a,b)=>a.display_name.localeCompare(b.display_name)).slice(0,5);

  return (
    <div className={'rankings-stage '+(stacked?'rankings-stage-stacked':'')}>
      <div className="rankings-strip-note">
        <strong>OFFICIAL IPS RANKINGS · {formatLabel.toUpperCase()}</strong>
        <span>Only certified match facts will create positions, points or milestone counts.</span>
      </div>

      <div className={stacked?'rankings-spaced-grid rankings-primary-grid':'rankings-carousel'}>
        <RankingPanel
          title="Best batsmen"
          scopeLabel={scopeLabel}
          formatLabel={formatLabel}
          players={candidates}
          columns={[
            {key:'sr',label:'SR'},
            {key:'awards',label:'Awards'},
            {key:'points',label:'Points'}
          ]}
          footnote="SR = strike rate. Awards and ranking points activate from certified IPS match records."
        />

        <RankingPanel
          title="Best bowlers"
          scopeLabel={scopeLabel}
          formatLabel={formatLabel}
          players={candidates}
          columns={[
            {key:'best',label:'Best',wide:true},
            {key:'awards',label:'Awards'},
            {key:'points',label:'Points'}
          ]}
          footnote="Best = best certified innings bowling figures. Awards and points remain format-specific."
        />

        <RankingPanel
          title="Best all-rounders"
          scopeLabel={scopeLabel}
          formatLabel={formatLabel}
          players={candidates}
          columns={[
            {key:'awards',label:'Awards'},
            {key:'points',label:'Points'}
          ]}
          footnote="All-rounder points combine certified batting and bowling contributions under the versioned IPS ranking rules."
        />
      </div>

      <div className="ranking-milestone-head">
        <div><span className="eyebrow">MILESTONE LEADERS</span><h3>Record chasers.</h3></div>
        <p>Milestones use the same City and overs-format filters as the main rankings.</p>
      </div>

      <div className="rankings-milestone-grid">
        <RankingPanel
          title="Most fifties"
          scopeLabel={scopeLabel}
          formatLabel={formatLabel}
          players={candidates}
          columns={[{key:'fifties',label:'50s'}]}
          footnote="A fifty is recorded from certified innings data; milestone logic will avoid double-counting a century as a fifty."
        />
        <RankingPanel
          title="Most hat-tricks"
          scopeLabel={scopeLabel}
          formatLabel={formatLabel}
          players={candidates}
          columns={[{key:'hatTricks',label:'Hat-tricks'}]}
          footnote="A hat-trick is three wickets from three consecutive qualifying deliveries in certified match facts."
        />
      </div>
    </div>
  );
}
