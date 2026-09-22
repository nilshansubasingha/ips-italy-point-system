import Link from 'next/link';
import type { PlayerDirectoryItem } from '@ips/data';
import { PlayerAvatar } from './identity';

function RankingPanel({ title, eyebrow, players }: { title: string; eyebrow: string; players: PlayerDirectoryItem[] }) {
  return (
    <article className="ranking-panel">
      <div className="ranking-panel-head">
        <div><span>{eyebrow}</span><h3>{title}</h3></div>
        <span className="preview-badge">UI preview</span>
      </div>
      <div className="ranking-list">
        {players.slice(0, 5).map((player, index) => (
          <Link className={`ranking-row ${index === 0 ? 'ranking-row-featured' : ''}`} href={`/players/${player.slug}`} key={player.id}>
            <span className="ranking-position">{String(index + 1).padStart(2, '0')}</span>
            <PlayerAvatar name={player.display_name} imageUrl={player.profile_image_url} />
            <div className="ranking-player-copy">
              <strong>{player.display_name}</strong>
              <span>{player.currentTeam?.short_name ?? player.currentTeam?.name ?? player.city?.name ?? 'Italy'}</span>
            </div>
            <div className="ranking-rating"><strong>—</strong><span>rating</span></div>
          </Link>
        ))}
        {!players.length && <div className="ranking-empty">Players will appear here when available.</div>}
      </div>
      <div className="ranking-panel-foot"><span>Official ranking values activate after certified match statistics.</span><Link href="/rankings">Full rankings →</Link></div>
    </article>
  );
}

export function RankingsPreview({ players }: { players: PlayerDirectoryItem[] }) {
  const fallback = players.slice(0, 5);
  return (
    <div className="rankings-stage">
      <div className="rankings-strip-note"><strong>PREMIUM RANKINGS SHELL</strong><span>No unofficial ratings are being fabricated.</span></div>
      <div className="rankings-carousel">
        <RankingPanel title="Batting rankings" eyebrow="ITALY · MEN" players={fallback} />
        <RankingPanel title="Bowling rankings" eyebrow="ITALY · MEN" players={[...fallback].reverse()} />
        <RankingPanel title="All-rounder rankings" eyebrow="ITALY · MEN" players={fallback.length > 1 ? [...fallback.slice(1), fallback[0]] : fallback} />
      </div>
    </div>
  );
}
