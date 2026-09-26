import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPlayerBySlug, getPlayerCareerStats } from '@ips/data';
import { SiteFooter, SiteHeader } from '@/components/site-header';
import { PlayerAvatar, Crest } from '@/components/identity';
import { formatDate, titleCase } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function PlayerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const player = await getPlayerBySlug(slug);
  if (!player) notFound();
  const stats = await getPlayerCareerStats(player.id);

  return <main className="shell sports-shell"><SiteHeader />
    <section className="entity-hero premium-entity-hero player-entity-hero premium-player-hero">
      <div className="entity-visual player-visual"><PlayerAvatar name={player.display_name} imageUrl={player.profile_image_url} large/><span>{player.ips_code}</span></div>
      <div className="entity-main"><div className="entity-kicker"><code>{player.ips_code}</code><span>{player.city?.name ?? 'Italy'}</span></div><h1>{player.display_name}</h1><p>{player.primary_role ?? 'Player'}{player.currentTeam ? ` · Current team: ${player.currentTeam.name}` : ' · Currently unattached'}</p><div className="entity-actions"><Link href="/rankings">Ranking profile →</Link>{player.currentClub && <Link href={`/teams/${player.currentClub.slug}`}>Team profile →</Link>}</div></div>
      <div className="entity-side premium-entity-side player-identity-side"><div><span>Batting</span><strong className="text-value">{player.batting_style ?? 'Not set'}</strong></div><div><span>Bowling</span><strong className="text-value">{player.bowling_style ?? 'Not set'}</strong></div><div><span>Current rank</span><strong>—</strong></div></div>
    </section>

    <section className="sports-section compact-section profile-columns premium-profile-columns">
      <div><div className="sports-section-head"><div><span className="eyebrow">CURRENT TEAM</span><h2>Official membership</h2></div></div>{player.currentClub ? <Link href={`/teams/${player.currentClub.slug}`} className="current-club-card premium-current-club"><Crest name={player.currentClub.name} imageUrl={player.currentClub.logo_url} large/><div><span>{player.city?.name ?? 'Italy'}</span><h3>{player.currentClub.name.replace(/\s+Cricket Club$/i,'')}</h3><p>{player.currentTeam?.name ?? 'Team'}{player.shirtNumber ? ` · #${player.shirtNumber}` : ''}</p></div><span className="card-arrow">→</span></Link> : <div className="sports-empty"><strong>No active team membership.</strong><span>Historical memberships remain preserved below.</span></div>}</div>
      <div><div className="sports-section-head"><div><span className="eyebrow">CAREER STATS</span><h2>Certified IPS matches</h2></div></div><div className="stat-placeholder-grid premium-stat-grid"><div><strong>{stats.matches}</strong><span>Matches</span></div><div><strong>{stats.runs}</strong><span>Runs</span></div><div><strong>{stats.wickets}</strong><span>Wickets</span></div><div><strong>{stats.strike_rate.toFixed(1)}</strong><span>Strike rate</span></div></div><p className="data-note">These totals are derived from certified IPS scoring records only. Provisional completed matches remain in the archive until an admin certifies them.</p></div>
    </section>

    <section className="sports-section compact-section history-section"><div className="sports-section-head"><div><span className="eyebrow">TEAM HISTORY</span><h2>Membership timeline</h2></div></div>{player.memberships.length ? <div className="history-table premium-history-table"><div className="history-head"><span>Team / side</span><span>City</span><span>Period</span><span>Status</span></div>{player.memberships.map((membership) => <div className="history-row" key={membership.id}><span><strong>{membership.team?.name ?? 'Unknown team'}</strong><small>{membership.club?.name.replace(/\s+Cricket Club$/i,'') ?? 'Team'}</small></span><span>{membership.city?.name ?? '—'}</span><span>{formatDate(membership.start_on)} → {membership.end_on ? formatDate(membership.end_on) : 'Present'}</span><span className="history-status">{titleCase(membership.status)}</span></div>)}</div> : <div className="sports-empty"><strong>No membership history yet.</strong></div>}</section>
    <SiteFooter />
  </main>;
}
