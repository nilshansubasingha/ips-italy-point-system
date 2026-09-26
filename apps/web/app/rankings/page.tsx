import Link from 'next/link';
import {getActiveCities,getPlayerRankings,getRankingDefinitions,getRankingFormats} from '@ips/data';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {RankingsPreview} from '@/components/rankings-preview';
import {ActiveCityFilter} from '@/components/location/active-city-filter';

export const dynamic='force-dynamic';

function formatHref(city:string|undefined,overs:number|null){
  const params=new URLSearchParams();
  if(city)params.set('city',city);
  if(overs!==null)params.set('overs',String(overs));
  const search=params.toString();
  return search?'/rankings?'+search:'/rankings';
}

export default async function RankingsPage({searchParams}:{searchParams:Promise<{city?:string;overs?:string}>}){
  const {city,overs}=await searchParams;
  const [cities,rankingDefinitions,formats]=await Promise.all([
    getActiveCities(50),
    getRankingDefinitions(),
    getRankingFormats()
  ]);

  const requestedOvers=overs?Number(overs):null;
  const selectedOvers=requestedOvers!==null&&formats.includes(requestedOvers)?requestedOvers:null;
  const rankings=await getPlayerRankings(selectedOvers);
  const selectedCity=city?cities.find(c=>c.code.toLowerCase()===city.toLowerCase())??null:null;
  const visible=selectedCity?rankings.filter(row=>row.city_id===selectedCity.id):rankings;
  const scopeLabel=selectedCity?.name??'Italy';
  const formatLabel=selectedOvers===null?'Overall':'T'+selectedOvers;

  return <main className="shell sports-shell">
    <SiteHeader/>

    <section className="page-hero premium-page-hero rankings-hero">
      <div className="page-hero-copy">
        <span className="eyebrow">IPS RANKINGS</span>
        <h1>{scopeLabel} rankings.<br/><span>{formatLabel} · certified Ranking Matches only.</span></h1>
        <p>Rankings are calculated from the same delivery ledger used by the Controller. Claiming a player account is not required: statistics and ranking points attach directly to the permanent IPS player identity.</p>
      </div>
      <aside className="hero-insight-card dark-insight">
        <span className="micro-label">RANKING ENGINE</span>
        <strong>Certified → calculated → ranked</strong>
        <p>Friendly and Practice matches remain in IPS history but cannot change national rankings.</p>
      </aside>
    </section>

    <section className="directory-toolbar-wide rankings-scope-toolbar rankings-filter-stack">
      <div className="rankings-filter-block">
        <div className="rankings-filter-label"><span>LOCATION</span><strong>{scopeLabel}</strong></div>
        <ActiveCityFilter cities={cities} basePath="/rankings" selectedCode={city} allLabel="Italy" extraQuery={selectedOvers!==null?{overs:String(selectedOvers)}:{}}/>
      </div>

      <div className="rankings-filter-block rankings-format-filter">
        <div className="rankings-filter-label"><span>FORMAT</span><strong>{formatLabel}</strong></div>
        <div className="ranking-format-pills">
          <Link className={selectedOvers===null?'active':''} href={formatHref(city,null)}>Overall</Link>
          {formats.map(value=><Link key={value} className={selectedOvers===value?'active':''} href={formatHref(city,value)}>T{value}</Link>)}
        </div>
      </div>

      <div className="directory-count"><strong>{visible.length}</strong> ranked players</div>
    </section>

    <section className="sports-section no-top">
      <div className="sports-section-head premium-section-head">
        <div><span className="eyebrow">{scopeLabel.toUpperCase()} · {formatLabel.toUpperCase()}</span><h2>Batting, bowling and all-rounder.</h2></div>
        <span className="section-note">IPS Formula v1 · certified ranking-eligible match facts only.</span>
      </div>
      <RankingsPreview rankings={visible} definitions={rankingDefinitions} scopeLabel={scopeLabel} formatLabel={formatLabel} stacked/>
    </section>

    <SiteFooter/>
  </main>;
}
