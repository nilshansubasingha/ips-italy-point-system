export const dynamic='force-dynamic'; export const revalidate=0;

import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {ManagementNav} from '@/components/manage/manage-nav';
import {requireAccount} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {PlayerAvatar} from '@/components/identity';
import {addExistingPlayer,createPlayerForTeam,updateRosterPlayer} from '../../../../registry/actions';

const ROLE_OPTIONS=['Player','Batter','Bowler','All-rounder','Wicketkeeper','Wicketkeeper-batter'];

export default async function AddPlayerPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
 await requireAccount();
 const {id}=await params;
 const sp=await searchParams;
 const q=typeof sp.q==='string'?sp.q.trim():'';
 const error=typeof sp.error==='string'?sp.error:null;
 const ok=typeof sp.ok==='string'?sp.ok:null;
 const supabase=await createClient();

 const [{data:team},{data:canManage},{data:members}]=await Promise.all([
   supabase.from('teams').select('id,name,club:clubs(name)').eq('id',id).maybeSingle(),
   supabase.rpc('ips_can_manage_team',{p_team_id:id}),
   supabase.from('team_memberships')
     .select('id,player_id,shirt_number,team_role,is_primary,player:players(id,ips_code,display_name,primary_role,profile_image_url)')
     .eq('team_id',id).eq('status','ACTIVE').is('end_on',null).order('start_on')
 ]);
 if(!team)notFound();
 if(!canManage)redirect('/manage/teams?error='+encodeURIComponent('You can only add or edit players for teams assigned to your account.'));

 let results:any[]=[];
 if(q.length>=2){
   const r=await supabase.rpc('ips_registry_player_search',{p_team_id:id,p_query:q});
   if(!r.error)results=r.data??[];
 }

 return <main className="shell sports-shell">
   <SiteHeader/>
   <ManagementNav account={await requireAccount()} active="teams"/>

   <section className="manage-titlebar compact">
     <div>
       <Link className="back-link" href={`/manage/teams/${id}`}>← {team.name}</Link>
       <span className="eyebrow">ROSTER BUILDER</span>
       <h1>Add & manage players</h1>
       <p>Search IPS first. Create a new permanent player only when no existing identity matches. Your current team roster stays visible on the right while you work.</p>
     </div>
   </section>

   {(error||ok)&&<div className={`ops-message ${error?'error':'success'}`}>{error||ok}</div>}

   <section className="player-add-workspace roster-builder-layout">
     <div className="player-add-flow">
       <section className="management-surface player-search-panel">
         <div className="surface-head">
           <div><span className="eyebrow">STEP 1</span><h2>Find an existing player</h2></div>
           <span>Search before creating</span>
         </div>
         <form method="get" className="registry-search">
           <input name="q" defaultValue={q} placeholder="Name, ITA-0001847, email or +39 phone"/>
           <button>Search IPS</button>
         </form>
         {q&&<div className="search-result-stack">
           {results.map(p=><article className="player-search-result" key={p.id}>
             <PlayerAvatar name={p.display_name} imageUrl={p.profile_image_url}/>
             <div>
               <span>{p.matched_by}</span>
               <h3>{p.display_name}</h3>
               <p>{p.ips_code} · {p.primary_role||'Player'}{p.current_team_name?` · ${p.current_team_name}`:' · Unattached'}</p>
             </div>
             {p.is_on_target_team
               ?<b className="already-chip">Already on team</b>
               :<form action={addExistingPlayer}>
                 <input type="hidden" name="team_id" value={id}/>
                 <input type="hidden" name="player_id" value={p.id}/>
                 <input name="shirt_number" type="number" min="0" max="999" placeholder="Shirt #"/>
                 <button>Add existing →</button>
               </form>}
           </article>)}
           {!results.length&&<div className="search-empty"><strong>No matching IPS player.</strong><p>If you have checked the name and contact details, continue to Step 2 below.</p></div>}
         </div>}
       </section>

       <section className="management-surface new-player-panel">
         <div className="surface-head">
           <div><span className="eyebrow">STEP 2 · ONLY IF NEW</span><h2>Create player</h2></div>
           <span>Added directly to {team.name}</span>
         </div>
         <form action={createPlayerForTeam} className="professional-form embedded">
           <input type="hidden" name="team_id" value={id}/>
           <input type="hidden" name="return_to" value={`/manage/teams/${id}/players/add`}/>
           <div className="form-block flat">
             <div className="form-split">
               <label><span>Full / display name *</span><input name="display_name" required placeholder="D. Fernando"/></label>
               <label><span>Shirt number</span><input name="shirt_number" type="number" min="0" max="999" placeholder="18"/></label>
             </div>
             <div className="form-split">
               <label><span>Given name</span><input name="given_name"/></label>
               <label><span>Family name</span><input name="family_name"/></label>
             </div>
             <div className="form-split">
               <label><span>Primary role</span><select name="primary_role" defaultValue=""><option value="">Player</option><option>Batter</option><option>Bowler</option><option>All-rounder</option><option>Wicketkeeper</option><option>Wicketkeeper-batter</option></select></label>
               <label><span>Batting style</span><select name="batting_style" defaultValue=""><option value="">Not set</option><option>Right-hand bat</option><option>Left-hand bat</option></select></label>
             </div>
             <label><span>Bowling style</span><input name="bowling_style" placeholder="Right-arm medium / Left-arm spin / etc."/></label>
           </div>

           <div className="form-block contact-block">
             <div className="form-block-head"><span>↳</span><div><strong>Optional account/contact identifiers</strong><small>Private. These do not replace the permanent IPS player ID.</small></div></div>
             <div className="form-split">
               <label><span>Email</span><input name="email" type="email" placeholder="player@example.com"/></label>
               <label><span>Phone / WhatsApp</span><input name="phone" type="tel" placeholder="+393451234567"/><small className="field-note">Use international format. Stored as a secondary login/search identifier.</small></label>
             </div>
             <label className="consent-check"><input type="checkbox" name="whatsapp_consent"/><span><b>WhatsApp updates allowed</b><small>Record consent now; actual WhatsApp messaging is not enabled yet.</small></span></label>
           </div>

           <div className="registry-identity-note"><b>IPS creates the permanent identity automatically.</b><span>The permanent player identity stays separate from the team-specific roster role shown on the right.</span></div>
           <button className="button-primary">Create player & add to team →</button>
         </form>
       </section>
     </div>

     <aside className="management-surface team-roster-rail">
       <div className="surface-head roster-rail-head">
         <div><span className="eyebrow">TEAM ROSTER</span><h2>Players added</h2></div>
         <strong>{members?.length??0}</strong>
       </div>

       <div className="roster-rail-list">
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
               <input type="hidden" name="return_to" value={`/manage/teams/${id}/players/add`}/>
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
