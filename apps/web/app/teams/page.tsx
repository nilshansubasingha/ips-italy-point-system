import Link from 'next/link';
import {getActiveCities,getTeamDirectory,getTeamIdentityDisplayName} from '@ips/data';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {Crest} from '@/components/identity';
import {ActiveCityFilter} from '@/components/location/active-city-filter';

export const dynamic='force-dynamic';

export default async function TeamsPage({searchParams}:{searchParams:Promise<{city?:string}>}){
 const {city}=await searchParams;
 const [teams,cities]=await Promise.all([getTeamDirectory(),getActiveCities(50)]);
 const visible=city?teams.filter(t=>t.city?.code.toLowerCase()===city.toLowerCase()):teams;

 return <main className="shell sports-shell">
   <SiteHeader/>
   <section className="directory-hero-wide">
     <div><span className="eyebrow">TEAMS</span><h1>Italy's softball teams.</h1><p>One public Team identity can operate a single roster or multiple A/B/C competitive sides. Rankings activate only from certified IPS match results.</p></div>
     <div className="directory-hero-stat"><strong>{visible.length}</strong><span>{city?'teams in selected city':'teams across Italy'}</span></div>
   </section>

   <section className="directory-toolbar-wide">
     <ActiveCityFilter cities={cities} basePath="/teams" selectedCode={city}/>
     <div className="directory-count"><strong>{visible.length}</strong> teams</div>
   </section>

   <section className="public-grid-section">
     <div className="team-directory-grid">
       {visible.map(team=>{
         const name=getTeamIdentityDisplayName(team);
         const sideCount=team.teams.filter(s=>s.status==='ACTIVE').length;
         return <Link href={`/teams/${team.slug}`} className="team-directory-card" key={team.id}>
           <div className="team-card-logo-stage">
             <Crest name={name} imageUrl={team.logo_url}/>
             <span className="team-city-chip">{team.city?.name??'Italy'}</span>
           </div>
           <div className="team-card-copy">
             <h3>{name}</h3>
             <p>{sideCount>1?`${sideCount} competitive sides`:'Single competitive side'} · {team.activePlayerCount} players</p>
             <div className="team-rank-pair">
               <span><b>—</b><small>Italy rank</small></span>
               <span><b>—</b><small>{team.city?.name??'City'} rank</small></span>
             </div>
           </div>
         </Link>;
       })}
     </div>
   </section>
   <SiteFooter/>
 </main>;
}
