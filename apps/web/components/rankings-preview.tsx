import Link from 'next/link';
import type { PlayerDirectoryItem } from '@ips/data';
import { PlayerAvatar } from './identity';

function RankingPanel({ title, scopeLabel, players }: { title: string; scopeLabel: string; players: PlayerDirectoryItem[] }) {
  return (
    <article className="ranking-panel">
      <div className="ranking-panel-head">
        <div><span>{scopeLabel.toUpperCase()} · MEN</span><h3>{title}</h3></div>
        <span className="preview-badge">Awaiting official data</span>
      </div>
      <div className="ranking-list">
        {players.slice(0, 5).map((player) => (
          <Link className="ranking-row" href={`/players/${player.slug}`} key={player.id}>
            <span className="ranking-position">—</span>
            <PlayerAvatar name={player.display_name} imageUrl={player.profile_image_url} />
            <div className="ranking-player-copy">
              <strong>{player.display_name}</strong>
              <span>{player.currentTeam?.short_name ?? player.currentTeam?.name ?? player.city?.name ?? 'Italy'}</span>
            </div>
            <div className="ranking-rating"><strong>—</strong><span>rating</span></div>
          </Link>
        ))}
        {!players.length && <div className="ranking-empty">No eligible players in this scope yet.</div>}
      </div>
      <div className="ranking-panel-foot"><span>Positions and ratings activate only after certified match statistics.</span></div>
    </article>
  );
}

export function RankingsPreview({ players, scopeLabel='Italy', stacked=false }: { players: PlayerDirectoryItem[]; scopeLabel?: string; stacked?: boolean }) {
  const candidates=[...players].sort((a,b)=>a.display_name.localeCompare(b.display_name)).slice(0,5);
  return (
    <div className={`rankings-stage ${stacked?'rankings-stage-stacked':''}`}>
      <div className="rankings-strip-note"><strong>OFFICIAL IPS RANKINGS</strong><span>No unofficial positions or ratings are being fabricated.</span></div>
      <div className={stacked?'rankings-spaced-grid':'rankings-carousel'}>
        <RankingPanel title="Batting rankings" scopeLabel={scopeLabel} players={candidates} />
        <RankingPanel title="Bowling rankings" scopeLabel={scopeLabel} players={candidates} />
        <RankingPanel title="All-rounder rankings" scopeLabel={scopeLabel} players={candidates} />
      </div>
    </div>
  );
}
