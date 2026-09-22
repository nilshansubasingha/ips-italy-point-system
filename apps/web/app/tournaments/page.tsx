import Link from 'next/link';
import {Pill} from '@ips/ui';
import {getTournamentDirectory} from '@ips/data';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {formatDate,titleCase} from '@/lib/format';

export const dynamic='force-dynamic';

export default async function TournamentsPage({searchParams}:{searchParams:Promise<{city?:string}>}){
 const {city}=await searchParams; const tournaments=await getTournamentDirectory(); const cities=Array.from(new Map(tournaments.filter(t=>t.city).map(t=>[t.city!.id,t.city!])).values()); const visible=city?tournaments.filter(t=>t.city?.code.toLowerCase()===city.toLowerCase()):tournaments; const featured=visible[0]??null;
 return <main className="shell sports-shell"><SiteHeader/>
  <section className="directory-hero-wide"><div><span className="eyebrow">TOURNAMENTS</span><h1>Competitions across Italy.</h1><p>One national directory for city competitions, fixtures, squads and results. Every tournament operates in its own secure context while feeding the same IPS network.</p></div><Link href="/match-centre" className="button-primary">Open Match Centre →</Link></section>
  <section className="directory-toolbar-wide"><div className="directory-filter"><Link className={!city?'active':''} href="/tournaments">All Italy</Link>{cities.map(c=><Link key={c.id} className={city?.toLowerCase()===c.code.toLowerCase()?'active':''} href={`/tournaments?city=${c.code.toLowerCase()}`}>{c.name}</Link>)}</div><div className="directory-count"><strong>{visible.length}</strong> tournaments</div></section>
  {featured&&<Link href={`/tournaments/${featured.slug}`} className="featured-competition"><div className="featured-copy"><div><Pill tone={featured.status==='LIVE'?'red':featured.status==='READY'?'blue':'slate'}>{titleCase(featured.status)}</Pill><span>{featured.city?.name??'Italy'}</span></div><code>{featured.code}</code><h2>{featured.name}</h2><p>{featured.format_label}</p></div><div className="featured-metrics"><article><strong>{featured.teamCount}</strong><span>Teams</span></article><article><strong>{featured.fixtureCount}</strong><span>Fixtures</span></article><article><strong>{formatDate(featured.starts_at)}</strong><span>Starts</span></article><b>Open competition →</b></div></Link>}
  <section className="public-grid-section"><div className="surface-head"><div><span className="eyebrow">COMPETITION DIRECTORY</span><h2>{city?'City competitions':'All competitions'}</h2></div></div><div className="tournament-grid-wide">{visible.map(t=><Link href={`/tournaments/${t.slug}`} className="tournament-tile" key={t.id}><div><Pill tone={t.status==='LIVE'?'red':t.status==='READY'?'blue':'slate'}>{titleCase(t.status)}</Pill><span>{t.city?.name??'Italy'}</span></div><code>{t.code}</code><h3>{t.name}</h3><p>{t.format_label}</p><footer><span><b>{t.teamCount}</b> teams</span><span><b>{t.fixtureCount}</b> fixtures</span><span><b>{formatDate(t.starts_at)}</b> starts</span><i>→</i></footer></Link>)}</div>{!visible.length&&<div className="sports-empty"><strong>No competitions in this view.</strong><p>Choose another city or return to All Italy.</p></div>}</section><SiteFooter/>
 </main>;
}
