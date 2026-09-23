import Link from 'next/link';
import {getTeamDirectory,getTeamIdentityDisplayName} from '@ips/data';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {Crest} from '@/components/identity';

export const dynamic='force-dynamic';

export default async function TeamsPage({searchParams}:{searchParams:Promise<{city?:string}>}){
 const {city}=await searchParams;
 const teams=await getTeamDirectory();
 const cities=Array.from(new Map(teams.filter(t=>t.city).map(t=>[t.city!.id,t.city!])).values());
 const visible=city?teams.filter(t=>t.city?.code.toLowerCase()===city.toLowerCase()):teams;

 return <main className="shell sports-shell">
   <SiteHeader/>
   <section className="directory-hero-wide">
     <div><span className="eyebrow">TEAMS</span><h1>Italy's softball teams.</h1><p>One public Team identity can operate a single roster or multiple A/B/C competitive sides. Rankings activate only from certified IPS match results.</p></div>
     <div className="directory-hero-stat"><strong>{visible.length}</strong><span>{city?'teams in selected city':'teams across Italy'}</span></div>
   </section>

   <section className="directory-toolbar-wide">
     <div className="directory-filter">
       <Link className={!city?'active':''} href="/teams">All Italy</Link>
       {cities.map(c=><Link key={c.id} className={city?.toLowerCase()===c.code.toLowerCase()?'active':''} href={`/teams?city=${c.code.toLowerCase()}`}>{c.name}</Link>)}
     </div>
     <div className="directory-count"><strong>{visible.length}</strong> teams</div>
   </section>

   <section className="public-grid-section">
     <div className="team-directory-grid">
       {visible.map(team=>{
         const name=getTeamIdentityDisplayName(team);
         const sideCount=team.teams.filter(s=>s.status==='ACTIVE').length;
         return <Link href={`/teams/${team.slug}`} className="team-directory-card" key={team.id}>
           <div className="team-card-top"><Crest name={name} imageUrl={team.logo_url}/><span>{team.city?.name??'Italy'}</span></div>
           <h3>{name}</h3>
           <p>{sideCount>1?`${sideCount} competitive sides`:'Single competitive side'} · {team.activePlayerCount} players</p>
           <div className="team-rank-pair">
             <span><b>—</b><small>Italy rank</small></span>
             <span><b>—</b><small>{team.city?.name??'City'} rank</small></span>
           </div>
           <footer><span>Official ranking pending certified results</span><b>→</b></footer>
         </Link>;
       })}
     </div>
   </section>
   <SiteFooter/>
 </main>;
}
