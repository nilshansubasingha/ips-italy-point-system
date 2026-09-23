import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Pill } from '@ips/ui';
import { getTournamentBySlug } from '@ips/data';
import { SiteFooter, SiteHeader } from '@/components/site-header';
import { Crest } from '@/components/identity';
import { MatchCentre } from '@/components/match-centre';
import { formatDate, titleCase } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function TournamentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tournament = await getTournamentBySlug(slug);
  if (!tournament) notFound();

  const cityArray = tournament.city ? [tournament.city] : [];
  return <main className="shell sports-shell"><SiteHeader />
    <section className="tournament-hero premium-tournament-hero">
      <div className="tournament-hero-main"><div className="entity-kicker"><Pill tone={tournament.status === 'LIVE' ? 'red' : tournament.status === 'READY' ? 'blue' : 'slate'}>{titleCase(tournament.status)}</Pill><span>{tournament.city?.name ?? 'Italy'}</span></div><h1>{tournament.name}</h1><p>{tournament.format_label} · {formatDate(tournament.starts_at)}{tournament.ends_at ? ` — ${formatDate(tournament.ends_at)}` : ''}</p><div className="entity-actions"><Link href="/match-centre">National Match Centre →</Link><Link href="/rankings">Rankings →</Link></div></div>
      <div className="tournament-code premium-tournament-code"><span className="micro-label">TOURNAMENT CODE</span><strong>{tournament.code}</strong><div className="tournament-code-metrics"><div><b>{tournament.teamCount}</b><span>teams</span></div><div><b>{tournament.fixtureCount}</b><span>fixtures</span></div><div><b>{tournament.overs_per_innings ?? '—'}</b><span>overs</span></div></div></div>
    </section>

    <section className="sports-section compact-section tournament-overview-grid premium-tournament-overview"><div><div className="sports-section-head"><div><span className="eyebrow">REGISTERED TEAMS</span><h2>Competition teams</h2></div></div><div className="team-chip-grid premium-team-grid">{tournament.teams.map((team, index) => <Link className="team-chip premium-team-chip" href={team.club ? `/teams/${team.club.slug}` : '#'} key={team.id}><span className="team-index">{String(index+1).padStart(2,'0')}</span><Crest name={team.name} imageUrl={team.logo_url}/><div><strong>{team.name}</strong><span>{team.club?.name.replace(/\s+Cricket Club$/i,'') ?? 'Team'}</span></div><b>→</b></Link>)}</div></div>
      <div><div className="sports-section-head"><div><span className="eyebrow">RULESET</span><h2>Frozen competition context</h2></div></div>{tournament.ruleset ? <div className="rules-card premium-rules-card"><div><span>Ruleset template</span><strong>{tournament.ruleset.name} · v{tournament.ruleset.version}</strong></div><div><span>Tournament match format</span><strong>{tournament.overs_per_innings} overs · {tournament.balls_per_over} balls/over</strong></div><div><span>Playing side</span><strong>{tournament.players_per_side} players · {tournament.wicket_limit ?? 'Rule'} wickets</strong></div><div><span>Bowler limit</span><strong>{tournament.tournament_max_overs_per_bowler ?? tournament.ruleset.max_overs_per_bowler ?? 'Ruleset'} overs</strong></div><div><span>No-ball free hit</span><strong>{tournament.ruleset.free_hit_on_no_ball ? 'Enabled' : 'Disabled'}</strong></div></div> : <div className="sports-empty"><strong>No ruleset linked.</strong></div>}</div></section>

    <section className="sports-section compact-section"><div className="sports-section-head premium-section-head"><div><span className="eyebrow">MATCHES</span><h2>Tournament Match Centre</h2></div><span className="section-note">Every fixture is isolated under this tournament ID.</span></div><MatchCentre fixtures={tournament.fixtures} cities={cityArray}/></section>
    <section className="future-data-band premium-future-band"><div><span className="eyebrow light">AFTER MATCH CERTIFICATION</span><h2>Table · statistics · rankings · records · media</h2></div><p>These competition outputs will derive from certified match facts instead of manual tournament spreadsheets.</p><div className="future-flow"><span>Certified result</span><i>→</i><span>Stats</span><i>→</i><span>Table</span><i>→</i><span>Rankings</span><i>→</i><span>Media</span></div></section>
    <SiteFooter /></main>;
}
