import Link from 'next/link';
import {getActiveCities,getTeamDirectory,getTeamIdentityDisplayName} from '@ips/data';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {Crest} from '@/components/identity';
import {ActiveCityFilter} from '@/components/location/active-city-filter';
import napoliHero0 from '@/lib/hero-data/napoli-0';
import napoliHero1 from '@/lib/hero-data/napoli-1';
import napoliHero2 from '@/lib/hero-data/napoli-2';
import napoliHero3 from '@/lib/hero-data/napoli-3';

export const dynamic='force-dynamic';

export default async function TeamsPage({searchParams}:{searchParams:Promise<{city?:string}>}){
 const {city}=await searchParams;
 const [teams,cities]=await Promise.all([getTeamDirectory(),getActiveCities(50)]);
 const visible=city?teams.filter(t=>t.city?.code.toLowerCase()===city.toLowerCase()):teams;
 const selectedCity=city?cities.find(c=>c.code.toLowerCase()===city.toLowerCase()):null;
 const isNapoli=selectedCity?.name.toLowerCase()==='napoli';
 const heroCityClass=isNapoli?' city-hero-napoli':'';
 const napoliHeroData=isNapoli?`data:image/webp;base64,${napoliHero0}${napoliHero1}${napoliHero2}${napoliHero3}`:null;

 return <main className="shell sports-shell">
   <SiteHeader/>
   <section className={`directory-hero-wide teams-directory-hero${heroCityClass}`}>
     {napoliHeroData?<span className="teams-hero-photo" aria-hidden="true" style={{backgroundImage:`url("${napoliHeroData}")`}}/>:null}
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
         return <Link href={`/teams/${team.slug}`} className={`team-directory-card logo-led${team.logo_url?' has-team-bg':''}`} key={team.id}>
           {team.logo_url?<span className="team-card-logo-bg" aria-hidden="true" style={{backgroundImage:`url("${team.logo_url}")`}}/>:null}
           <span className="team-city-chip">{team.city?.name??'Italy'}</span>
           <div className="team-logo-stage"><Crest name={name} imageUrl={team.logo_url} large/></div>
           <h3>{name}</h3>
           <p>{sideCount>1?`${sideCount} competitive sides`:'Single competitive side'} · {team.activePlayerCount} players</p>
           <div className="team-rank-pair">
             <span><b>—</b><small>Italy rank</small></span>
             <span><b>—</b><small>{team.city?.name??'City'} rank</small></span>
           </div>
         </Link>;
       })}
     </div>
   </section>
   <SiteFooter/>
 </main>;
}
