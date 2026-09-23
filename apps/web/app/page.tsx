import Link from 'next/link';
import { Pill } from '@ips/ui';
import { getCities, getDatabaseHealth, getFixtureContexts, getPlayerDirectory, getTeamDirectory, getTeamIdentityDisplayName, getTournamentDirectory } from '@ips/data';
import { SiteFooter, SiteHeader } from '@/components/site-header';
import { MatchCentre } from '@/components/match-centre';
import { Crest, PlayerAvatar } from '@/components/identity';
import { RankingsPreview } from '@/components/rankings-preview';
import { formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [health, cities, teamIdentities, players, tournaments, fixtures] = await Promise.all([
    getDatabaseHealth(), getCities(), getTeamDirectory(), getPlayerDirectory(), getTournamentDirectory(), getFixtureContexts(),
  ]);
  const featuredFixture = fixtures.find((f) => f.match_status === 'LIVE') ?? fixtures[0] ?? null;
  const featuredTournament = tournaments.find((t) => t.status === 'LIVE') ?? tournaments[0] ?? null;

  return (
    <main className="shell sports-shell">
      <SiteHeader />

      <section className="sports-hero premium-home-hero">
        <div className="hero-copy">
          <div className="eyebrow">ITALY POINT SYSTEM · SOFTBALL CRICKET</div>
          <h1>One game.<br/><span>One national system.</span></h1>
          <p>Teams, permanent player identities, tournaments, fixtures, live scoring, rankings, records, media and broadcast — connected through the same IPS data layer.</p>
          <div className="hero-actions">
            <Link className="button-primary" href="/match-centre">Open Match Centre <b>→</b></Link>
            <Link className="button-secondary" href="/rankings">Explore rankings</Link>
          </div>
          <div className={`connection-strip ${health.connected ? 'connected' : 'disconnected'}`}>
            <span className="connection-dot" />
            <strong>{health.connected ? 'Central IPS data connected' : 'Database connection needs attention'}</strong>
            <span>{health.connected ? 'Canonical identities are live.' : health.message}</span>
          </div>
          <div className="hero-stat-ribbon">
            <div><strong>{cities.length}</strong><span>Cities</span></div>
            <div><strong>{teamIdentities.length}</strong><span>Teams</span></div>
            <div><strong>{players.length}</strong><span>Players</span></div>
            <div><strong>{tournaments.length}</strong><span>Tournaments</span></div>
          </div>
        </div>

        <div className="hero-command-stack">
          <article className="featured-match-card">
            <div className="featured-match-top"><span><i className="live-pulse"/>{featuredFixture?.match_status === 'LIVE' ? 'LIVE NOW' : 'NEXT FIXTURE'}</span><b>{featuredFixture?.tournament_name ?? 'IPS Match Centre'}</b></div>
            {featuredFixture ? <>
              <div className="featured-match-city">{featuredFixture.city_name} · {featuredFixture.venue_name ?? 'Venue TBC'}</div>
              <div className="featured-versus">
                <div><Crest name={featuredFixture.home_team_name} large/><strong>{featuredFixture.home_team_name}</strong></div>
                <span>VS</span>
                <div><Crest name={featuredFixture.away_team_name} large/><strong>{featuredFixture.away_team_name}</strong></div>
              </div>
              <div className="featured-match-meta"><div><span>When</span><strong>{formatDate(featuredFixture.scheduled_at, true)}</strong></div><div><span>Format</span><strong>{featuredFixture.overs_per_innings} overs</strong></div><div><span>Code</span><strong>{featuredFixture.match_code}</strong></div></div>
            </> : <div className="featured-empty">Your first fixture will become the hero match automatically.</div>}
          </article>

          <article className="ecosystem-card">
            <div><span className="micro-label">CONNECTED ECOSYSTEM</span><strong>Score once.<br/>Update everywhere.</strong></div>
            <div className="ecosystem-flow"><span>Controller</span><i>→</i><span>Database</span><i>→</i><span>Live</span><i>→</i><span>Media</span></div>
            <small>One confirmed match event powers every output.</small>
          </article>
        </div>
      </section>

      <section className="sports-section">
        <div className="sports-section-head premium-section-head"><div><span className="eyebrow">NATIONAL MATCH CENTRE</span><h2>Live, upcoming and finished. One view.</h2></div><Link href="/match-centre">Full Match Centre →</Link></div>
        <MatchCentre fixtures={fixtures} cities={cities} compact />
      </section>

      <section className="sports-section">
        <div className="sports-section-head premium-section-head"><div><span className="eyebrow">RANKINGS</span><h2>Built to feel national.</h2></div><Link href="/rankings">Full rankings →</Link></div>
        <RankingsPreview players={players} />
      </section>

      <section className="sports-section premium-directory-section">
        <div className="directory-feature-column">
          <div className="sports-section-head premium-section-head"><div><span className="eyebrow">TEAM DIRECTORY</span><h2>One Team identity. Optional A/B/C sides.</h2></div><Link href="/teams">All teams →</Link></div>
          <div className="club-grid">
            {teamIdentities.slice(0, 6).map((team) => {
              const name=getTeamIdentityDisplayName(team);
              const sideCount=team.teams.filter(side=>side.status==='ACTIVE').length;
              return <Link className="club-card premium-club-card" href={`/teams/${team.slug}`} key={team.id}>
                <Crest name={name} imageUrl={team.logo_url} large />
                <div className="club-card-copy"><span>{team.city?.name ?? 'Italy'} · IPS Team</span><h3>{name}</h3><div className="club-card-stats"><b>{sideCount}</b> {sideCount===1?'side':'sides'} <b>{team.activePlayerCount}</b> players</div></div>
                <span className="card-arrow">↗</span>
              </Link>;
            })}
          </div>
        </div>
        <aside className="directory-side-rail">
          <span className="eyebrow light">FEATURED COMPETITION</span>
          <h2>{featuredTournament?.name ?? 'Competition hub'}</h2>
          <p>{featuredTournament ? `${featuredTournament.format_label} · ${featuredTournament.city?.name ?? 'Italy'}` : 'Tournaments will appear here as they are created.'}</p>
          {featuredTournament && <div className="rail-metrics"><div><strong>{featuredTournament.teamCount}</strong><span>Teams</span></div><div><strong>{featuredTournament.fixtureCount}</strong><span>Fixtures</span></div><div><strong>{formatDate(featuredTournament.starts_at)}</strong><span>Starts</span></div></div>}
          {featuredTournament && <Link href={`/tournaments/${featuredTournament.slug}`}>Open tournament →</Link>}
          <div className="city-mini-cloud">{cities.slice(0,6).map(city => <Link href={`/cities/${city.code.toLowerCase()}`} key={city.id}>{city.name}</Link>)}</div>
        </aside>
      </section>

      <section className="sports-section split-section premium-split">
        <div>
          <div className="sports-section-head"><div><span className="eyebrow">PLAYERS</span><h2>Permanent IPS identities.</h2></div><Link href="/players">All players →</Link></div>
          <div className="player-list premium-player-list">
            {players.slice(0, 6).map((player, index) => <Link href={`/players/${player.slug}`} className="player-row" key={player.id}>
              <span className="list-index">{String(index + 1).padStart(2,'0')}</span><PlayerAvatar name={player.display_name} imageUrl={player.profile_image_url}/>
              <div><strong>{player.display_name}</strong><span>{player.currentTeam?.name ?? 'Unattached'} · {player.primary_role ?? 'Player'}</span></div>
              <code>{player.ips_code}</code><span className="card-arrow">→</span>
            </Link>)}
          </div>
        </div>
        <div>
          <div className="sports-section-head"><div><span className="eyebrow">TOURNAMENTS</span><h2>Competition command centres.</h2></div><Link href="/tournaments">All tournaments →</Link></div>
          <div className="tournament-stack premium-tournament-stack">
            {tournaments.slice(0, 4).map((tournament) => <Link href={`/tournaments/${tournament.slug}`} className="tournament-card" key={tournament.id}>
              <div><Pill tone={tournament.status === 'LIVE' ? 'red' : tournament.status === 'READY' ? 'blue' : 'slate'}>{tournament.status.replaceAll('_',' ')}</Pill><span>{tournament.city?.name ?? 'Italy'}</span></div>
              <h3>{tournament.name}</h3><p>{tournament.format_label}</p><div className="mini-metric-row"><span><b>{tournament.teamCount}</b> teams</span><span><b>{tournament.fixtureCount}</b> fixtures</span></div>
            </Link>)}
          </div>
        </div>
      </section>

      <section className="sports-section city-band premium-city-band">
        <div><span className="eyebrow light">CITY HUBS</span><h2>Local communities.<br/>One stronger Italy.</h2><p>City identity connects teams, players, competitions and fixtures without fragmenting the national dataset.</p></div>
        <div className="city-links">{cities.map((city) => <Link href={`/cities/${city.code.toLowerCase()}`} key={city.id}><span className="city-pin">●</span><strong>{city.name}</strong><span>{city.region ?? 'Italy'}</span><i>→</i></Link>)}</div>
      </section>
      <SiteFooter />
    </main>
  );
}
