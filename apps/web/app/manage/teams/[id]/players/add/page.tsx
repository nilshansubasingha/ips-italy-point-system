export const dynamic='force-dynamic'; export const revalidate=0;

import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {ManagementNav} from '@/components/manage/manage-nav';
import {requireAccount} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {PlayerAvatar} from '@/components/identity';
import {addExistingPlayer,updateRosterPlayer} from '../../../../registry/actions';

const ROLE_OPTIONS=['Player','Batter','Bowler','All-rounder','Wicketkeeper','Wicketkeeper-batter'];

export default async function AddPlayerPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const account=await requireAccount();
 const {id}=await params;
 const sp=await searchParams;
 const q=typeof sp.q==='string'?sp.q.trim():'';
 const error=typeof sp.error==='string'?sp.error:null;
 const ok=typeof sp.ok==='string'?sp.ok:null;
 const supabase=await createClient();

 const [{data:team},{data:canManage},{data:members},{data:pendingRequests}]=await Promise.all([
   supabase.from('teams').select('id,name,side_label,club:clubs(id,name)').eq('id',id).maybeSingle(),
   supabase.rpc('ips_can_manage_team',{p_team_id:id}),
   supabase.from('team_memberships')
     .select('id,player_id,shirt_number,team_role,is_primary,player:players(id,ips_code,display_name,primary_role,profile_image_url)')
     .eq('team_id',id).eq('status','ACTIVE').is('end_on',null).order('start_on'),
   supabase.rpc('ips_team_player_requests',{p_team_id:id})
 ]);
 if(!team)notFound();
 if(!canManage)redirect('/manage/teams?error='+encodeURIComponent('You can only add or edit players for teams assigned to your account.'));

 const pendingByPlayer=new Map<string,any>();
 for(const request of ((pendingRequests??[]) as any[])){if(request.to_side_id===id)pendingByPlayer.set(request.player_id,request);}
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
       <Link className="back-link" href={`/manage/teams/${(team.club as any)?.id}`}>← {String((team.club as any)?.name??'Team').replace(/\s+Cricket Club$/i,'')}</Link>
       <span className="eyebrow">ROSTER BUILDER</span>
       <h1>{team.side_label==='MAIN'?'Team roster':`${team.side_label} Team roster`}</h1>
       <p>Search the IPS registry and send a roster request. A Team manager cannot place an existing player on the roster directly: an unattached player must accept, while a player already on another Team can be approved by that player or their current Team.</p>
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
               <p>{p.ips_code} · {p.primary_role||'Player'}{p.current_team_identity_name?` · ${String(p.current_team_identity_name).replace(/\s+Cricket Club$/i,'')}`:' · Unattached'}{p.birth_year?` · born ${p.birth_year}`:''}</p>
             </div>
             {p.is_on_target_team
               ?<b className="already-chip">Already on team</b>
               :pendingByPlayer.has(p.id)
                 ?<b className="already-chip request-pending-chip">Request pending</b>
                 :<form action={addExistingPlayer}>
                   <input type="hidden" name="team_id" value={id}/>
                   <input type="hidden" name="player_id" value={p.id}/>
                   <input name="shirt_number" type="number" min="0" max="999" placeholder="Shirt #"/>
                   <button>{p.current_team_identity_name?'Request transfer →':'Send join request →'}</button>
                 </form>}
           </article>)}
           {!results.length&&<div className="search-empty"><strong>No matching IPS player.</strong><p>If you have checked the name and contact details, continue to Step 2 below.</p></div>}
         </div>}
       </section>

       <section className="management-surface new-player-panel request-only-panel">
         <div className="surface-head">
           <div><span className="eyebrow">NEW PLAYER</span><h2>Registration, not direct creation</h2></div>
           <span>Consent protected</span>
         </div>
         <div className="request-policy-card">
           <strong>Team managers cannot create a permanent player identity or add someone without approval.</strong>
           <p>If the person is already in IPS, search above and send a request. If they are new to IPS, ask them to register/claim their player profile first. City, Global or Owner administrators retain an audited exception workflow for verified identity administration.</p>
           <div><Link href="/players">Open player directory →</Link><Link href="/registration">Player registration →</Link></div>
         </div>
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
               <input type="hidden" name="return_to" value={`/manage/teams/${id}/players/add`}/>
               <label><span>Team role</span><select name="team_role" defaultValue={teamRole}>{ROLE_OPTIONS.map(role=><option key={role} value={role}>{role}</option>)}</select></label>
               <label className="shirt-field"><span>Shirt</span><input name="shirt_number" type="number" min="0" max="999" defaultValue={m.shirt_number??''} placeholder="—"/></label>
               <button>Save</button>
             </form>
             <Link className="roster-profile-link" href={`/manage/players/${p.id}`}>View player profile →</Link>
           </article>;
         })}
       </div>

       {!members?.length&&<div className="sports-empty compact-empty"><strong>No players added yet.</strong><p>Search IPS above and send a roster request. Membership changes only after the required approval.</p></div>}
     </aside>
   </section>

   <SiteFooter/>
 </main>;
}
