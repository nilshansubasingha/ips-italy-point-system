import Link from 'next/link';
import {getActiveCities,getPlayerDirectory,getRankingDefinitions,getTournamentDirectory} from '@ips/data';
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
  const [players,cities,tournaments,rankingDefinitions]=await Promise.all([
    getPlayerDirectory(),
    getActiveCities(50),
    getTournamentDirectory(),
    getRankingDefinitions()
  ]);

  const selectedCity=city?cities.find(c=>c.code.toLowerCase()===city.toLowerCase())??null:null;
  const visible=selectedCity?players.filter(p=>p.city?.id===selectedCity.id):players;
  const scopeLabel=selectedCity?.name??'Italy';

  const formats=Array.from(new Set(
    tournaments
      .map(t=>Number(t.overs_per_innings))
      .filter(value=>Number.isFinite(value)&&value>0)
  )).sort((a,b)=>a-b);

  const requestedOvers=overs?Number(overs):null;
  const selectedOvers=requestedOvers!==null&&formats.includes(requestedOvers)?requestedOvers:null;
  const formatLabel=selectedOvers===null?'Overall':'T'+selectedOvers;

  return (
    <main className="shell sports-shell">
      <SiteHeader/>

      <section className="page-hero premium-page-hero rankings-hero">
        <div className="page-hero-copy">
          <span className="eyebrow">IPS RANKINGS</span>
          <h1>{scopeLabel} rankings.<br/><span>{formatLabel} · certified results only.</span></h1>
          <p>Batting, bowling, all-rounder and milestone rankings are separated by tournament match length. Overall combines every certified IPS format; T3, T5, T10 and future formats are created automatically from each tournament&apos;s overs setting.</p>
        </div>
        <aside className="hero-insight-card dark-insight">
          <span className="micro-label">RANKING SCOPE</span>
          <strong>Italy → City → Format</strong>
          <p>Choose a City and an overs format independently. No provisional score or uncertified match can change an official ranking.</p>
        </aside>
      </section>

      <section className="directory-toolbar-wide rankings-scope-toolbar rankings-filter-stack">
        <div className="rankings-filter-block">
          <div className="rankings-filter-label"><span>LOCATION</span><strong>{scopeLabel}</strong></div>
          <ActiveCityFilter
            cities={cities}
            basePath="/rankings"
            selectedCode={city}
            allLabel="Italy"
            extraQuery={selectedOvers!==null?{overs:String(selectedOvers)}:{}}
          />
        </div>

        <div className="rankings-filter-block rankings-format-filter">
          <div className="rankings-filter-label"><span>FORMAT</span><strong>{formatLabel}</strong></div>
          <div className="ranking-format-pills">
            <Link className={selectedOvers===null?'active':''} href={formatHref(city,null)}>Overall</Link>
            {formats.map(value=><Link key={value} className={selectedOvers===value?'active':''} href={formatHref(city,value)}>T{value}</Link>)}
          </div>
        </div>

        <div className="directory-count"><strong>{visible.length}</strong> players in scope</div>
      </section>

      <section className="sports-section no-top">
        <div className="sports-section-head premium-section-head">
          <div><span className="eyebrow">{scopeLabel.toUpperCase()} · {formatLabel.toUpperCase()}</span><h2>Batting, bowling and all-rounder.</h2></div>
          <span className="section-note">Points, awards, SR and figures activate from certified match statistics.</span>
        </div>
        <RankingsPreview players={visible} definitions={rankingDefinitions} scopeLabel={scopeLabel} formatLabel={formatLabel} stacked/>
      </section>

      <SiteFooter/>
    </main>
  );
}
