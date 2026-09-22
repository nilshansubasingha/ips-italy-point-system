import Link from 'next/link';
import {getClubDirectory} from '@ips/data';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {Crest} from '@/components/identity';

export const dynamic='force-dynamic';

export default async function ClubsPage({searchParams}:{searchParams:Promise<{city?:string}>}){
 const {city}=await searchParams; const clubs=await getClubDirectory(); const cities=Array.from(new Map(clubs.filter(c=>c.city).map(c=>[c.city!.id,c.city!])).values()); const visible=city?clubs.filter(c=>c.city?.code.toLowerCase()===city.toLowerCase()):clubs; const playerCount=visible.reduce((s,c)=>s+c.activePlayerCount,0);
 return <main className="shell sports-shell"><SiteHeader/><section className="directory-hero-wide"><div><span className="eyebrow">CLUBS</span><h1>Canonical club identities.</h1><p>Clubs are registered once and can own multiple teams. Rosters, tournament participation and history stay connected to the same organisation.</p></div><div className="directory-hero-stat"><strong>{visible.length}</strong><span>clubs · {playerCount} active players</span></div></section>
 <section className="directory-toolbar-wide"><div className="directory-filter"><Link className={!city?'active':''} href="/clubs">All Italy</Link>{cities.map(c=><Link key={c.id} className={city?.toLowerCase()===c.code.toLowerCase()?'active':''} href={`/clubs?city=${c.code.toLowerCase()}`}>{c.name}</Link>)}</div><div className="directory-count"><strong>{visible.length}</strong> clubs</div></section>
 <section className="public-grid-section"><div className="club-grid-wide">{visible.map((club,index)=><Link href={`/clubs/${club.slug}`} className="club-tile" key={club.id}><span className="card-index">{String(index+1).padStart(2,'0')}</span><Crest name={club.name} imageUrl={club.logo_url} large/><div><span>{club.city?.name??'Italy'} · {club.verified?'Verified club':'Club'}</span><h3>{club.name}</h3><p>{club.teams.length} teams · {club.activePlayerCount} current players</p></div><i>→</i></Link>)}</div></section><SiteFooter/></main>;
}
