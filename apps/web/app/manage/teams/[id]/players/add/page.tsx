export const dynamic='force-dynamic'; export const revalidate=0;

import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {ManagementNav} from '@/components/manage/manage-nav';
import {requireAccount} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {PlayerAvatar} from '@/components/identity';
import {updateRosterPlayer} from '../../../../registry/actions';
import {BulkAdminPlayerCreate,BulkExistingPlayerRequests} from '@/components/manage/bulk-player-entry';

const ROLE_OPTIONS=['Player','Batter','Bowler','All-rounder','Wicketkeeper','Wicketkeeper-batter'];

export default async function AddPlayerPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const account=await requireAccount();
 const {id:identifier}=await params;
 const sp=await searchParams;
 const q=typeof sp.q==='string'?sp.q.trim():'';
 const error=typeof sp.error==='string'?sp.error:null;
 const ok=typeof sp.ok==='string'?sp.ok:null;
 const supabase=await createClient();

 const isUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identifier);
 const teamLookup=isUuid
   ?supabase.from('teams').select('id,name,slug,side_label,club:clubs(id,name,slug)').eq('id',identifier).maybeSingle()
   :supabase.from('teams').select('id,name,slug,side_label,club:clubs(id,name,slug)').eq('slug',decodeURIComponent(identifier).toLowerCase()).maybeSingle();
 const {data:team}=await teamLookup;
 if(!team)notFound();
 const id=team.id;
 const routeKey=team.slug||id;

 const [{data:canManage},{data:members}]=await Promise.all([
   supabase.rpc('ips_can_manage_team',{p_team_id:id}),
   supabase.from('team_memberships')
     .select('id,player_id,shirt_number,team_role,is_primary,player:players(id,ips_code,display_name,primary_role,profile_image_url)')
     .eq('team_id',id).eq('status','ACTIVE').is('end_on',null).order('start_on')
 ]);
 if(!canManage)redirect('/manage/teams?error='+encodeURIComponent('You can only add or edit players for teams assigned to your account.'));

 let results:any[]=[];
 if(q.length>=2){
   const r=await supabase.rpc('ips_registry_player_search_v2',{p_team_id:id,p_query:q});
   if(!r.error)results=r.data??[];
 }

 return <main className="shell sports-shell">
   <SiteHeader/>
   <ManagementNav account={account} active="teams"/>

   <section className="manage-titlebar compact">
     <div>
       <Link className="back-link" href={`/manage/teams/${(team.club as any)?.slug??(team.club as any)?.id}`}>← {String((team.club as any)?.name??'Team').replace(/\s+Cricket Club$/i,'')}</Link>
       <span className="eyebrow">ROSTER BUILDER</span>
       <h1>{team.side_label==='MAIN'?'Team roster':`${team.side_label} Team roster`}</h1>
       <p>Search and select several existing IPS players at once, or bulk-create genuinely new identities below. Existing players still require the normal join/transfer approval; duplicate protection remains active for every new player.</p>
     </div>
   </section>

   {(error||ok)&&<div className={`ops-message ${error?'error':'success'}`}>{error||ok}</div>}

   <section className="player-add-workspace roster-builder-layout">
     <div className="player-add-flow">
       <section className="management-surface player-search-panel">
         <div className="surface-head">
           <div><span className="eyebrow">STEP 1</span><h2>Find an existing player</h2></div>
           <span>Requests require approval</span>
         </div>
         <form method="get" className="registry-search">
           <input name="q" defaultValue={q} placeholder="Name, ITA-0001847, email or +39 phone"/>
           <button>Search IPS</button>
         </form>
         {q&&<div>
           {!!results.length&&<BulkExistingPlayerRequests teamId={id} results={results as any}/>}
           {!results.length&&<div className="search-empty"><strong>No matching IPS player.</strong><p>If you have checked the name and contact details, continue to Step 2 below.</p></div>}
         </div>}
       </section>

       <section className="management-surface new-player-panel">
         <div className="surface-head">
           <div><span className="eyebrow">STEP 2 · ONLY IF NEW</span><h2>Bulk-create new players</h2></div>
           <span>One submission · added to {team.name}</span>
         </div>
         <BulkAdminPlayerCreate teamId={id}/>
       </section>
     </div>

     <aside className="management-surface team-roster-rail">
       <div className="surface-head roster-rail-head">
         <div><span className="eyebrow">TEAM ROSTER</span><h2>Players added</h2></div>
         <strong>{members?.length??0}</strong>
       </div>

       <div className="roster-rail-list roster-card-grid">
         {(members??[]).map((m:any)=>{
           const p=m.player;
           const teamRole=m.team_role||p?.primary_role||'Player';
           return <article className="roster-rail-player" key={m.id}>
             <Link href={`/manage/players/${p.id}`} className="roster-player-link">
               <PlayerAvatar name={p?.display_name??'Player'} imageUrl={p?.profile_image_url}/>
               <div><strong>{p?.display_name}</strong><span>{p?.ips_code}</span></div>
               <i>→</i>
             </Link>
             <form action={updateRosterPlayer} className="roster-role-form">
               <input type="hidden" name="membership_id" value={m.id}/>
               <input type="hidden" name="team_id" value={id}/>
               <input type="hidden" name="return_to" value={`/manage/teams/${routeKey}/players/add`}/>
               <label><span>Team role</span><select name="team_role" defaultValue={teamRole}>{ROLE_OPTIONS.map(role=><option key={role} value={role}>{role}</option>)}</select></label>
               <label className="shirt-field"><span>Shirt</span><input name="shirt_number" type="number" min="0" max="999" defaultValue={m.shirt_number??''} placeholder="—"/></label>
               <button>Save</button>
             </form>
             <Link className="roster-profile-link" href={`/manage/players/${p.id}`}>View player profile →</Link>
           </article>;
         })}
       </div>

       {!members?.length&&<div className="sports-empty compact-empty"><strong>No players added yet.</strong><p>Use Step 1 to find an existing IPS player or Step 2 to create a new identity.</p></div>}
     </aside>
   </section>

   <SiteFooter/>
 </main>;
}
