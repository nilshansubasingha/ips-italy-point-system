export const dynamic='force-dynamic'; export const revalidate=0;

import Link from 'next/link';
import {notFound} from 'next/navigation';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {ManagementNav} from '@/components/manage/manage-nav';
import {requireAccount} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {Crest,PlayerAvatar} from '@/components/identity';
import {ConfirmSubmitButton} from '@/components/manage/confirm-submit-button';
import {ImageCropField} from '@/components/media/image-crop-field';
import {addTeamSide,deleteTeam,deleteTeamIdentity,removeEntityImage,updateTeamIdentity,uploadEntityImage} from '../../registry/actions';

export default async function TeamIdentityOperationsPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const account=await requireAccount();
 const {id}=await params;
 const sp=await searchParams;
 const error=typeof sp.error==='string'?sp.error:null;
 const ok=typeof sp.ok==='string'?sp.ok:null;
 const supabase=await createClient();

 const [{data:identity},{data:sides},{data:members},{data:canManage}]=await Promise.all([
   supabase.from('clubs').select('*,city:cities(id,name)').eq('id',id).maybeSingle(),
   supabase.from('teams').select('id,name,short_name,category,logo_url,status,side_label,side_order').eq('club_id',id).eq('status','ACTIVE').order('side_order'),
   supabase.from('team_memberships').select('id,team_id,player_id,shirt_number,team_role,player:players(id,ips_code,display_name,primary_role,profile_image_url)').eq('status','ACTIVE').is('end_on',null),
   supabase.rpc('ips_can_manage_club',{p_club_id:id})
 ]);
 if(!identity)notFound();

 const sideIds=new Set((sides??[]).map((s:any)=>s.id));
 const roster=(members??[]).filter((m:any)=>sideIds.has(m.team_id));
 const memberCount=new Map<string,number>();
 for(const m of roster)memberCount.set(m.team_id,(memberCount.get(m.team_id)||0)+1);

 const displayName=(sides?.length===1&&sides[0].side_label==='MAIN')?sides[0].name:String(identity.name).replace(/\s+Cricket Club$/i,'');
 const canGlobalDelete=account.grants.some(g=>(g.role==='OWNER'&&g.scope_type==='GLOBAL')||(g.role==='ADMIN'&&g.scope_type==='GLOBAL'));

 return <main className="shell sports-shell">
   <SiteHeader/>
   <ManagementNav account={account} active="teams"/>

   <section className="entity-command-header">
     <div className="entity-brand">
       <Crest name={displayName} imageUrl={identity.logo_url} large/>
       <div>
         <Link className="back-link" href="/manage/teams">← Teams</Link>
         <span className="eyebrow">TEAM OPERATIONS · {(identity.city as any)?.name??'ITALY'}</span>
         <h1>{displayName}</h1>
         <p>{identity.description||'One public Team identity with one or more competitive sides.'}</p>
       </div>
     </div>
     <div className="header-actions">
       {canManage&&<a href="#team-identity" className="button-secondary">Edit team</a>}
       {canGlobalDelete&&<form action={deleteTeamIdentity}><input type="hidden" name="team_identity_id" value={id}/><ConfirmSubmitButton className="danger-link" message={`Delete ${displayName}? This permanently removes the Team and all unused sides and roster memberships. Players themselves are not deleted. Scheduled/ready fixture setup is cleaned automatically. Started, completed or official match history still blocks deletion.`}>Delete team</ConfirmSubmitButton></form>}
     </div>
   </section>

   {(error||ok)&&<div className={`ops-message ${error?'error':'success'}`}>{error||ok}</div>}

   <section className="ops-kpi-strip">
     <article><span>Competitive sides</span><strong>{sides?.length??0}</strong><small>A / B / C / main</small></article>
     <article><span>Players</span><strong>{new Set(roster.map((m:any)=>m.player_id)).size}</strong><small>active identities</small></article>
     <article><span>City</span><strong className="small-strong">{(identity.city as any)?.name??'Italy'}</strong><small>team location</small></article>
     <article><span>Status</span><strong>{identity.status}</strong><small>team identity</small></article>
   </section>

   <section className="sports-section compact-section">
     <div className="sports-section-head premium-section-head">
       <div><span className="eyebrow">COMPETITIVE SIDES</span><h2>Choose a side to manage its roster.</h2></div>
       <span className="section-note">A/B/C sides remain under this Team identity.</span>
     </div>
     <div className="team-side-admin-grid">
       {(sides??[]).map((side:any)=>{
         const label=side.side_label==='MAIN'?'Main side':`${side.side_label} Team`;
         const sidePlayers=roster.filter((m:any)=>m.team_id===side.id);
         return <article className="team-side-admin-card" key={side.id}>
           <div className="team-side-admin-top">
             <Crest name={side.name} imageUrl={side.logo_url}/>
             <div><span>{label}</span><h3>{side.name}</h3><p>{memberCount.get(side.id)||0} players · {side.category}</p></div>
           </div>
           <div className="team-side-mini-roster">{sidePlayers.slice(0,5).map((m:any)=><Link href={`/manage/players/${m.player.id}`} key={m.id}><PlayerAvatar name={m.player.display_name} imageUrl={m.player.profile_image_url}/><span>{m.player.display_name}</span></Link>)}</div>
           <div className="team-side-admin-actions">
             <Link className="button-primary" href={`/manage/teams/${side.id}/players/add`}>Manage {label} →</Link>
             {canGlobalDelete&&(sides?.length??0)>1&&<form action={deleteTeam}><input type="hidden" name="team_id" value={side.id}/><input type="hidden" name="return_to" value={`/manage/teams/${id}`}/><ConfirmSubmitButton className="danger-link" message={`Delete ${side.name}? This removes only this competitive side and its roster memberships. Scheduled/ready fixture setup is cleaned automatically. Started, completed or official match history still blocks deletion.`}>Delete side</ConfirmSubmitButton></form>}
           </div>
         </article>;
       })}
     </div>
   </section>

   {canManage&&<section className="entity-layout team-identity-edit-layout">
     <div className="management-stack">
       <section id="team-identity" className="management-surface">
         <div className="surface-head"><div><span className="eyebrow">TEAM IDENTITY</span><h2>Public details</h2></div><span>Shown across IPS</span></div>
         <form action={updateTeamIdentity} className="compact-form">
           <input type="hidden" name="team_identity_id" value={id}/>
           <input type="hidden" name="return_to" value={`/manage/teams/${id}`}/>
           <label><span>Team name</span><input name="name" defaultValue={displayName}/></label>
           <label><span>Short name</span><input name="short_name" defaultValue={identity.short_name??''}/></label>
           <div className="form-split"><label><span>Founded</span><input name="founded_year" type="number" defaultValue={identity.founded_year??''}/></label><label><span>Website</span><input name="website_url" type="url" defaultValue={identity.website_url??''}/></label></div>
           <label><span>Description</span><textarea name="description" rows={4} defaultValue={identity.description??''}/></label>
           <button>Save team details</button>
         </form>
       </section>

       <section className="management-surface">
         <div className="surface-head"><div><span className="eyebrow">TEAM CREST</span><h2>Logo</h2></div><span>Shared identity</span></div>
         <form action={uploadEntityImage} className="media-form" encType="multipart/form-data">
           <input type="hidden" name="kind" value="clubs"/>
           <input type="hidden" name="entity_id" value={id}/>
           <input type="hidden" name="return_to" value={`/manage/teams/${id}`}/>
           <ImageCropField name="image" label="Choose team logo" aspect="square" required initialUrl={identity.logo_url}/>
           <button>Upload / replace</button>
         </form>
         {identity.logo_url&&<form action={removeEntityImage}><input type="hidden" name="kind" value="clubs"/><input type="hidden" name="entity_id" value={id}/><input type="hidden" name="return_to" value={`/manage/teams/${id}`}/><button className="danger-link">Remove logo</button></form>}
       </section>
     </div>

     <aside className="management-surface">
       <div className="surface-head"><div><span className="eyebrow">ADD SIDE</span><h2>A / B / C team</h2></div><span>Optional</span></div>
       <p className="management-help">Use this only when the Team operates another independent competitive roster.</p>
       <form action={addTeamSide} className="compact-form">
         <input type="hidden" name="team_identity_id" value={id}/>
         <input type="hidden" name="return_to" value={`/manage/teams/${id}`}/>
         <label><span>Side label</span><input name="side_label" maxLength={8} placeholder="B" required/></label>
         <label><span>Category</span><select name="category" defaultValue="OPEN"><option value="OPEN">Open</option><option value="MEN">Men</option><option value="WOMEN">Women</option><option value="YOUTH">Youth</option><option value="VETERANS">Veterans</option></select></label>
         <button>Add competitive side</button>
       </form>
     </aside>
   </section>}

   <SiteFooter/>
 </main>;
}
