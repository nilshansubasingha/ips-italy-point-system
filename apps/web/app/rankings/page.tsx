import Link from 'next/link';
import { getActiveCities, getPlayerDirectory } from '@ips/data';
import { SiteFooter, SiteHeader } from '@/components/site-header';
import { RankingsPreview } from '@/components/rankings-preview';
import { ActiveCityFilter } from '@/components/location/active-city-filter';

export const dynamic = 'force-dynamic';

export default async function RankingsPage({searchParams}:{searchParams:Promise<{city?:string}>}) {
  const {city}=await searchParams;
  const [players,cities]=await Promise.all([getPlayerDirectory(),getActiveCities(50)]);
  const selectedCity=city?cities.find(c=>c.code.toLowerCase()===city.toLowerCase())??null:null;
  const visible=selectedCity?players.filter(p=>p.city?.id===selectedCity.id):players;
  const scopeLabel=selectedCity?.name??'Italy';

  return (
    <main className="shell sports-shell">
      <SiteHeader />
      <section className="page-hero premium-page-hero rankings-hero">
        <div className="page-hero-copy">
          <span className="eyebrow">IPS RANKINGS</span>
          <h1>{scopeLabel} rankings.<br/><span>Certified results only.</span></h1>
          <p>Batting, bowling and all-rounder rankings will be generated from certified IPS match facts and a versioned rating algorithm. Until those facts exist, positions and ratings remain blank.</p>
        </div>
        <aside className="hero-insight-card dark-insight">
          <span className="micro-label">RANKING SCOPE</span>
          <strong>Italy → City</strong>
          <p>Use the geographic filter below to switch the same official ranking categories between national and city views.</p>
        </aside>
      </section>

      <section className="directory-toolbar-wide rankings-scope-toolbar">
        <ActiveCityFilter cities={cities} basePath="/rankings" selectedCode={city} allLabel="Italy"/>
        <div className="directory-count"><strong>{visible.length}</strong> players in scope</div>
      </section>

      <section className="sports-section no-top">
        <div className="sports-section-head premium-section-head"><div><span className="eyebrow">{scopeLabel.toUpperCase()}</span><h2>Batting, bowling and all-rounder.</h2></div><span className="section-note">Each category is intentionally separated for easier reading.</span></div>
        <RankingsPreview players={visible} scopeLabel={scopeLabel} stacked />
      </section>
      <SiteFooter />
    </main>
  );
}
