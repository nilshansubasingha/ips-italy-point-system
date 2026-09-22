import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Pill } from '@ips/ui';
import { getClubBySlug } from '@ips/data';
import { SiteFooter, SiteHeader } from '@/components/site-header';
import { Crest, PlayerAvatar } from '@/components/identity';

export const dynamic = 'force-dynamic';

export default async function ClubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const club = await getClubBySlug(slug);
  if (!club) notFound();
  return <main className="shell sports-shell"><SiteHeader />
    <section className="entity-hero premium-entity-hero club-entity-hero">
      <div className="entity-visual"><Crest name={club.name} imageUrl={club.logo_url} large/><span>IPS CLUB</span></div>
      <div className="entity-main"><div className="entity-kicker"><span>{club.city?.name ?? 'Italy'}</span>{club.verified && <Pill tone="green">Verified</Pill>}</div><h1>{club.name}</h1><p>{club.founded_year ? `Established ${club.founded_year}. ` : ''}Canonical IPS club profile with teams, player identities and future official match history.</p><div className="entity-actions"><Link href="/match-centre">Match Centre →</Link><Link href="/rankings">Rankings →</Link></div></div>
      <div className="entity-side premium-entity-side"><div><span>Current players</span><strong>{club.activePlayerCount}</strong></div><div><span>Teams</span><strong>{club.teams.length}</strong></div><div><span>City</span><strong className="text-value">{club.city?.name ?? 'Italy'}</strong></div></div>
    </section>

    <section className="sports-section compact-section"><div className="sports-section-head"><div><span className="eyebrow">TEAMS</span><h2>Club teams</h2></div></div><div className="team-chip-grid premium-team-grid">{club.teams.map((team, index) => <div className="team-chip premium-team-chip" key={team.id}><span className="team-index">{String(index+1).padStart(2,'0')}</span><Crest name={team.name} imageUrl={team.logo_url}/><div><strong>{team.name}</strong><span>{team.short_name ?? club.name}</span></div><b>→</b></div>)}</div></section>

    <section className="sports-section compact-section club-content-grid"><div><div className="sports-section-head"><div><span className="eyebrow">CURRENT PLAYERS</span><h2>Official player identities</h2></div></div>{club.players.length ? <div className="player-list wide-list premium-player-list">{club.players.map((player, index) => <Link href={`/players/${player.slug}`} className="player-row" key={player.id}><span className="list-index">{String(index+1).padStart(2,'0')}</span><PlayerAvatar name={player.display_name} imageUrl={player.profile_image_url}/><div><strong>{player.display_name}</strong><span>{player.currentTeam?.name ?? 'Team'} · {player.primary_role ?? 'Player'}</span></div><code>{player.ips_code}</code><span className="card-arrow">→</span></Link>)}</div> : <div className="sports-empty"><strong>No current players linked yet.</strong><span>Players appear here through active team memberships.</span></div>}</div><aside className="context-rail"><div className="context-rail-card dark-rail"><span className="micro-label">COMING LATER</span><h3>Form, honours, stats and history.</h3><p>These will populate only from certified matches and official tournament records.</p></div><div className="context-rail-card stat-rail"><div><strong>—</strong><span>Italy rank</span></div><div><strong>—</strong><span>City rank</span></div><div><strong>—</strong><span>Honours</span></div></div></aside></section>
    <SiteFooter /></main>;
}
