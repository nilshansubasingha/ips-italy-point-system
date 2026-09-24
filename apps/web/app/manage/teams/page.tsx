export const dynamic='force-dynamic'; export const revalidate=0;

import Link from 'next/link';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {ManagementNav} from '@/components/manage/manage-nav';
import {requireAccount,hasManagementRole} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {Crest} from '@/components/identity';
import {ConfirmSubmitButton} from '@/components/manage/confirm-submit-button';
import {deleteTeamIdentity} from '../registry/actions';

export default async function ManageTeamsPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const account=await requireAccount();
 if(!hasManagementRole(account))return null;
 const sp=await searchParams;
 const error=typeof sp.error==='string'?sp.error:null;
 const ok=typeof sp.ok==='string'?sp.ok:null;
 const supabase=await createClient();

 const [{data:identities},{data:sides},{data:members}]=await Promise.all([
   supabase.from('clubs').select('id,name,short_name,slug,logo_url,status,city_id,city:cities(id,name)').eq('status','ACTIVE').order('name'),
   supabase.from('teams').select('id,club_id,name,side_label,side_order,status').eq('status','ACTIVE').order('side_order'),
   supabase.from('team_memberships').select('team_id,player_id').eq('status','ACTIVE').is('end_on',null)
 ]);

 const sideByIdentity=new Map<string,any[]>();
 for(const side of sides??[]){
   if(!sideByIdentity.has(side.club_id))sideByIdentity.set(side.club_id,[]);
   sideByIdentity.get(side.club_id)!.push(side);
 }
 const sideToIdentity=new Map((sides??[]).map((s:any)=>[s.id,s.club_id]));
 const playersByIdentity=new Map<string,Set<string>>();
 for(const member of members??[]){
   const identityId=sideToIdentity.get(member.team_id);
   if(!identityId)continue;
   if(!playersByIdentity.has(identityId))playersByIdentity.set(identityId,new Set());
   playersByIdentity.get(identityId)!.add(member.player_id);
 }

 const global=account.grants.some(g=>(g.role==='OWNER'&&g.scope_type==='GLOBAL')||(g.role==='ADMIN'&&g.scope_type==='GLOBAL'));
 const cityScopes=new Set(account.grants.filter(g=>g.role==='ADMIN'&&g.scope_type==='CITY'&&g.city_id).map(g=>g.city_id as string));
 const identityScopes=new Set(account.grants.filter(g=>['ADMIN','LEADER'].includes(g.role)&&g.scope_type==='CLUB'&&g.club_id).map(g=>g.club_id as string));
 const sideScopes=new Set(account.grants.filter(g=>['ADMIN','LEADER'].includes(g.role)&&g.scope_type==='TEAM'&&g.team_id).map(g=>g.team_id as string));
 const canCreate=global||cityScopes.size>0;
 const canGlobalDelete=global;

 return <main className="shell sports-shell">
   <SiteHeader/>
   <ManagementNav account={account} active="teams"/>
   <section className="manage-titlebar">
     <div>
       <span className="eyebrow">TEAM REGISTRY</span>
       <h1>Teams</h1>
       <p>Each public Team has one identity and can operate one side or multiple A/B/C sides. Tournament squads and fixtures use the competitive side; the public profile stays under one Team.</p>
     </div>
     {canCreate&&<Link className="button-primary" href="/manage/teams/new">+ Add team</Link>}
   </section>
   {(error||ok)&&<div className={`ops-message ${error?'error':'success'}`}>{error||ok}</div>}

   <section className="ops-kpi-strip">
     <article><span>Teams</span><strong>{identities?.length??0}</strong><small>public identities</small></article>
     <article><span>Competitive sides</span><strong>{sides?.length??0}</strong><small>A / B / C / main</small></article>
     <article><span>Roster players</span><strong>{members?.length??0}</strong><small>active memberships</small></article>
     <article><span>Registry</span><strong>LIVE</strong><small>canonical identities</small></article>
   </section>

   <section className="management-surface">
     <div className="surface-head"><div><span className="eyebrow">ALL TEAMS</span><h2>Team operations</h2></div><span>{identities?.length??0} teams</span></div>
     <div className="team-identity-admin-grid">
       {(identities??[]).map((identity:any)=>{
         const identitySides=sideByIdentity.get(identity.id)??[];
         const canManage=global||cityScopes.has(identity.city_id)||identityScopes.has(identity.id)||identitySides.some((s:any)=>sideScopes.has(s.id));
         const displayName=identitySides.length===1&&identitySides[0].side_label==='MAIN'?identitySides[0].name:String(identity.name).replace(/\s+Cricket Club$/i,'');
         return <article className="team-identity-admin-card" key={identity.id}>
           <Link href={`/manage/teams/${identity.id}`} className="team-identity-admin-main">
             <Crest name={displayName} imageUrl={identity.logo_url} large/>
             <div><span>{(identity.city as any)?.name??'Italy'} · {identitySides.length>1?`${identitySides.length} sides`:'1 side'}</span><h3>{displayName}</h3><p>{playersByIdentity.get(identity.id)?.size??0} active players</p></div>
             <i>→</i>
           </Link>
           <div className="team-identity-admin-foot">
             <span>{canManage?'Manage enabled':'View only'}</span>
             {canGlobalDelete&&<form action={deleteTeamIdentity}><input type="hidden" name="team_identity_id" value={identity.id}/><ConfirmSubmitButton className="team-delete-x" title={`Delete ${displayName}`} message={`Delete ${displayName}? This permanently removes the Team and all unused A/B/C sides and roster memberships. Players themselves are not deleted. Scheduled/ready fixture setup and tournament registration will be cleaned automatically. Started, completed or official match history remains protected.`}>×</ConfirmSubmitButton></form>}
           </div>
         </article>;
       })}
     </div>
   </section>
   <SiteFooter/>
 </main>;
}
