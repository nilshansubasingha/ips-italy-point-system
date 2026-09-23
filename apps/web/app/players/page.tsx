import Link from 'next/link';
import {getActiveCities,getPlayerDirectory} from '@ips/data';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {PlayerAvatar} from '@/components/identity';
import {ActiveCityFilter} from '@/components/location/active-city-filter';

export const dynamic='force-dynamic';

export default async function PlayersPage({searchParams}:{searchParams:Promise<{city?:string}>}){
 const {city}=await searchParams; const [players,cities]=await Promise.all([getPlayerDirectory(),getActiveCities(50)]); const visible=city?players.filter(p=>p.city?.code.toLowerCase()===city.toLowerCase()):players; const attached=visible.filter(p=>p.currentTeam).length;
 return <main className="shell sports-shell"><SiteHeader/><section className="directory-hero-wide"><div><span className="eyebrow">PLAYERS</span><h1>One player. One IPS identity.</h1><p>Permanent player IDs survive transfers, tournaments and seasons. Team or side changes never create a second career.</p></div><div className="directory-hero-stat"><strong>{visible.length}</strong><span>players · {attached} currently attached</span></div></section>
 <section className="directory-toolbar-wide"><ActiveCityFilter cities={cities} basePath="/players" selectedCode={city}/><div className="directory-count"><strong>{visible.length}</strong> players</div></section>
 <section className="public-grid-section"><div className="player-grid-wide">{visible.map(p=><Link href={`/players/${p.slug}`} className="player-tile" key={p.id}><div className="player-tile-id"><code>{p.ips_code}</code><span>{p.city?.name??'Italy'}</span></div><PlayerAvatar name={p.display_name} imageUrl={p.profile_image_url} large/><h3>{p.display_name}</h3><p>{p.primary_role??'Player'}</p><span>{p.currentTeam?.name??'Unattached'}</span><footer>View profile <b>→</b></footer></Link>)}</div></section><SiteFooter/></main>;
}
