import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getTeamBySlug,getTeamIdentityDisplayName} from '@ips/data';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {Crest,PlayerAvatar} from '@/components/identity';

export const dynamic='force-dynamic';

export default async function TeamPage({params,searchParams}:{params:Promise<{slug:string}>;searchParams:Promise<{side?:string}>}){
 const {slug}=await params;
 const {side}=await searchParams;
 const team=await getTeamBySlug(slug);
 if(!team)notFound();

 const activeSides=team.teams.filter(s=>s.status==='ACTIVE').sort((a,b)=>(a.side_order??0)-(b.side_order??0));
 const displayName=getTeamIdentityDisplayName(team);
 const selected=activeSides.length===1?activeSides[0]:activeSides.find(s=>s.id===side)??null;
 const roster=selected?team.players.filter(p=>p.currentTeam?.id===selected.id):[];

 return <main className="shell sports-shell">
   <SiteHeader/>
   <section className="entity-hero premium-entity-hero club-entity-hero">
     <div className="entity-visual"><Crest name={displayName} imageUrl={team.logo_url} large/><span>IPS TEAM</span></div>
     <div className="entity-main">
       <div className="entity-kicker"><span>{team.city?.name??'Italy'}</span><span>{activeSides.length>1?`${activeSides.length} sides`:'Single side'}</span></div>
       <h1>{displayName}</h1>
       <p>{team.description||'Official IPS Team identity with connected players, competitive sides and future certified match history.'}</p>
       <div className="entity-actions"><Link href="/match-centre">Match Centre →</Link><Link href="/rankings">Rankings →</Link></div>
     </div>
     <div className="entity-side premium-entity-side">
       <div><span>Players</span><strong>{team.activePlayerCount}</strong></div>
       <div><span>Sides</span><strong>{activeSides.length}</strong></div>
       <div><span>Italy rank</span><strong>—</strong></div>
     </div>
   </section>

   {activeSides.length>1&&<section className="sports-section compact-section">
     <div className="sports-section-head premium-section-head"><div><span className="eyebrow">TEAM SIDES</span><h2>Choose A, B or C.</h2></div><span className="section-note">Each side keeps its own roster, fixtures and results.</span></div>
     <div className="public-side-card-grid">
       {activeSides.map(s=>{
         const players=team.players.filter(p=>p.currentTeam?.id===s.id);
         return <Link className={`public-side-card ${selected?.id===s.id?'active':''}`} href={`/teams/${team.slug}?side=${s.id}`} key={s.id}>
           <span>{s.side_label==='MAIN'?'MAIN':`${s.side_label} TEAM`}</span>
           <h3>{s.name}</h3>
           <p>{players.length} players · {s.short_name??'IPS side'}</p>
           <b>Open roster →</b>
         </Link>;
       })}
     </div>
   </section>}

   {selected?<section className="sports-section compact-section">
     <div className="sports-section-head premium-section-head">
       <div><span className="eyebrow">{selected.side_label==='MAIN'?'ROSTER':`${selected.side_label} TEAM ROSTER`}</span><h2>{selected.name}</h2></div>
       {activeSides.length>1&&<Link href={`/teams/${team.slug}`}>All sides →</Link>}
     </div>
     <div className="team-public-roster-grid">
       {roster.map(player=><Link href={`/players/${player.slug}`} className="team-public-player-card" key={player.id}>
         <PlayerAvatar name={player.display_name} imageUrl={player.profile_image_url}/>
         <div><strong>{player.display_name}</strong><span>{player.ips_code} · {player.primary_role??'Player'}</span></div><i>→</i>
       </Link>)}
     </div>
     {!roster.length&&<div className="sports-empty"><strong>No active players on this side yet.</strong></div>}
   </section>:<section className="sports-section compact-section"><div className="sports-empty"><strong>Select a Team side above.</strong><p>The selected A/B/C roster will appear here.</p></div></section>}

   <SiteFooter/>
 </main>;
}
