import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCityByCode, getTeamIdentityDisplayName } from '@ips/data';
import { SiteFooter, SiteHeader } from '@/components/site-header';
import { Crest, PlayerAvatar } from '@/components/identity';
import { MatchCentre } from '@/components/match-centre';

export const dynamic = 'force-dynamic';

export default async function CityPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const city = await getCityByCode(code);
  if (!city) notFound();
  return <main className="shell sports-shell"><SiteHeader />
    <section className="city-hero premium-city-hero">
      <div className="city-hero-copy"><span className="eyebrow light">IPS CITY HUB</span><h1>{city.name}</h1><p>{city.region ?? 'Italy'} · Teams, players, tournaments and fixtures connected through one city identity.</p><div className="city-signal"><span>●</span> NATIONAL IPS NETWORK</div></div>
      <div className="city-hero-metrics"><div><strong>{city.clubs.length}</strong><span>Teams</span></div><div><strong>{city.players.length}</strong><span>Players</span></div><div><strong>{city.tournaments.length}</strong><span>Tournaments</span></div><div><strong>{city.fixtures.length}</strong><span>Fixtures</span></div></div>
    </section>

    <section className="sports-section compact-section city-content-grid">
      <div className="city-main-column">
        <div className="sports-section-head"><div><span className="eyebrow">TEAMS</span><h2>{city.name} team network</h2></div><Link href={`/teams?city=${city.code.toLowerCase()}`}>All teams →</Link></div>
        <div className="club-grid premium-club-grid">{city.clubs.map((team, index) => {const name=getTeamIdentityDisplayName(team); const sideCount=team.teams.filter(side=>side.status==='ACTIVE').length; return <Link className="club-card premium-club-card" href={`/teams/${team.slug}`} key={team.id}><span className="card-index">{String(index+1).padStart(2,'0')}</span><Crest name={name} imageUrl={team.logo_url} large/><div className="club-card-copy"><span>IPS Team</span><h3>{name}</h3><div className="club-card-stats"><b>{team.activePlayerCount}</b> players <b>{sideCount}</b> {sideCount===1?'side':'sides'}</div></div><span className="card-arrow">↗</span></Link>})}</div>
      </div>
      <aside className="context-rail city-context-rail"><div className="context-rail-card dark-rail"><span className="micro-label">CITY IDENTITY</span><h3>One local hub. National visibility.</h3><p>Every Team, tournament and fixture in {city.name} remains connected to the Italy-wide IPS dataset.</p></div><div className="context-rail-card"><span className="micro-label">QUICK LINKS</span><div className="rail-link-list"><Link href={`/players?city=${city.code.toLowerCase()}`}>Players<span>→</span></Link><Link href={`/tournaments?city=${city.code.toLowerCase()}`}>Tournaments<span>→</span></Link><Link href="/rankings">Rankings<span>→</span></Link><Link href="/match-centre">Match Centre<span>→</span></Link></div></div></aside>
    </section>

    <section className="sports-section compact-section profile-columns premium-profile-columns"><div><div className="sports-section-head"><div><span className="eyebrow">PLAYERS</span><h2>Current player identities</h2></div><Link href={`/players?city=${city.code.toLowerCase()}`}>All players →</Link></div><div className="player-list premium-player-list">{city.players.slice(0, 8).map((player, index) => <Link href={`/players/${player.slug}`} className="player-row" key={player.id}><span className="list-index">{String(index+1).padStart(2,'0')}</span><PlayerAvatar name={player.display_name} imageUrl={player.profile_image_url}/><div><strong>{player.display_name}</strong><span>{player.currentTeam?.name ?? 'Unattached'}</span></div><code>{player.ips_code}</code><span className="card-arrow">→</span></Link>)}</div></div><div><div className="sports-section-head"><div><span className="eyebrow">TOURNAMENTS</span><h2>Competition hubs</h2></div><Link href={`/tournaments?city=${city.code.toLowerCase()}`}>All tournaments →</Link></div><div className="tournament-stack premium-tournament-stack">{city.tournaments.map((tournament) => <Link href={`/tournaments/${tournament.slug}`} className="tournament-card" key={tournament.id}><div><span className="mini-status">{tournament.status.replaceAll('_',' ')}</span></div><h3>{tournament.name}</h3><p>{tournament.format_label}</p><div className="mini-metric-row"><span><b>{tournament.teamCount}</b> teams</span><span><b>{tournament.fixtureCount}</b> fixtures</span></div></Link>)}</div></div></section>

    <section className="sports-section compact-section"><div className="sports-section-head"><div><span className="eyebrow">MATCH CENTRE</span><h2>{city.name} fixtures</h2></div></div><MatchCentre fixtures={city.fixtures} cities={[city]}/></section>
    <SiteFooter /></main>;
}
