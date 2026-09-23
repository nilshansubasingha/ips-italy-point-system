import { getActiveCities, getFixtureContexts } from '@ips/data';
import { MatchCentre } from '@/components/match-centre';
import { SiteFooter, SiteHeader } from '@/components/site-header';

export const dynamic = 'force-dynamic';

export default async function MatchCentrePage() {
  const [cities, fixtures] = await Promise.all([getActiveCities(50), getFixtureContexts()]);
  const live = fixtures.filter(f => f.match_status === 'LIVE').length;
  const upcoming = fixtures.filter(f => ['READY','SCHEDULED'].includes(f.match_status)).length;
  const finished = fixtures.length - live - upcoming;
  return <main className="shell sports-shell"><SiteHeader />
    <section className="page-hero premium-page-hero match-centre-hero"><div className="page-hero-copy"><span className="eyebrow">NATIONAL MATCH CENTRE</span><h1>All Italy.<br/><span>Every fixture in one view.</span></h1><p>Live, upcoming and finished matches use the same tournament, team and city identities stored in IPS.</p></div><aside className="hero-insight-card match-summary-card"><span className="micro-label">MATCH NETWORK</span><strong>{fixtures.length}</strong><p>visible fixtures</p><div className="insight-metrics"><div><b>{live}</b><span>live</span></div><div><b>{upcoming}</b><span>upcoming</span></div><div><b>{finished}</b><span>finished</span></div></div></aside></section>
    <section className="sports-section no-top"><MatchCentre fixtures={fixtures} cities={cities}/></section>
    <SiteFooter />
  </main>;
}
