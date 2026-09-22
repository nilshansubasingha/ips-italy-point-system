import { getPlayerDirectory } from '@ips/data';
import { SiteFooter, SiteHeader } from '@/components/site-header';
import { RankingsPreview } from '@/components/rankings-preview';

export const dynamic = 'force-dynamic';

export default async function RankingsPage() {
  const players = await getPlayerDirectory();
  return (
    <main className="shell sports-shell">
      <SiteHeader />
      <section className="page-hero premium-page-hero rankings-hero">
        <div className="page-hero-copy">
          <span className="eyebrow">IPS RANKINGS</span>
          <h1>National rankings.<br/><span>Built for movement.</span></h1>
          <p>Batting, bowling, all-rounder and team rankings will use certified match facts, versioned rating algorithms and historical releases. This screen establishes the premium presentation now without inventing unofficial scores.</p>
        </div>
        <aside className="hero-insight-card dark-insight">
          <span className="micro-label">RANKING ARCHITECTURE</span>
          <strong>Italy → City → Tournament → Season</strong>
          <p>Every ranking release will preserve rating, movement, previous position and career-best position.</p>
          <div className="insight-metrics"><div><b>4</b><span>categories</span></div><div><b>4</b><span>scopes</span></div><div><b>∞</b><span>history</span></div></div>
        </aside>
      </section>
      <section className="sports-section no-top">
        <div className="sports-section-head premium-section-head"><div><span className="eyebrow">DESIGN PREVIEW</span><h2>ICC-level density. IPS identity.</h2></div><span className="section-note">Ratings intentionally blank until official stats exist.</span></div>
        <RankingsPreview players={players} />
      </section>
      <SiteFooter />
    </main>
  );
}
