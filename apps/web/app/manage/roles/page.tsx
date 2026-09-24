export const dynamic='force-dynamic';
export const revalidate=0;

import {redirect} from 'next/navigation';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {ManagementNav} from '@/components/manage/manage-nav';
import {RoleGrantForm} from '@/components/manage/role-grant-form';
import {requireAccount,isOwner,grantScopeId,type RoleGrant} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {revokeRoleGrant} from './actions';

function scopeLabel(scope:string){
  return scope==='CLUB'?'TEAM · ALL SIDES':scope==='TEAM'?'COMPETITIVE SIDE':scope;
}

export default async function RoleManagementPage(){
  const account=await requireAccount();
  if(!isOwner(account))redirect('/manage');
  const supabase=await createClient();

  const [
    {data:grants},
    {data:clubs},
    {data:teams},
    {data:tournaments},
    {data:matches},
    {data:players},
    {count:profileCount}
  ]=await Promise.all([
    supabase.from('role_grants').select('*').is('revoked_at',null).order('created_at',{ascending:false}),
    supabase.from('clubs').select('id,name,city_id').order('name'),
    supabase.from('teams').select('id,name,club_id,side_label').order('name'),
    supabase.from('tournaments').select('id,name').order('starts_at',{ascending:false}),
    supabase.from('matches').select('id,match_code').order('scheduled_at',{ascending:false}),
    supabase.from('players').select('id,display_name,ips_code').order('display_name'),
    supabase.from('profiles').select('id',{count:'exact',head:true})
  ]);

  const grantUserIds=Array.from(new Set((grants??[]).map((grant:any)=>grant.user_id).filter(Boolean)));
  const grantProfiles=grantUserIds.length
    ? (await supabase.from('profiles').select('id,display_name').in('id',grantUserIds)).data??[]
    : [];
  const nameMap=new Map((grantProfiles??[]).map((p:any)=>[p.id,p.display_name]));
  const activeOwners=(grants??[]).filter((g:any)=>g.role==='OWNER'&&g.scope_type==='GLOBAL'&&!g.revoked_at).length;

  return <main className="shell sports-shell">
    <SiteHeader/>
    <ManagementNav account={account} active="roles"/>

    <section className="manage-roles-hero">
      <div>
        <span className="eyebrow">OWNER CONTROL</span>
        <h1>Accounts & scoped roles.</h1>
        <p>One account can hold multiple roles. Find the correct registered person with search and cricket-context filters, then assign only the scope they need.</p>
      </div>
      <div className="role-count-card"><span>ACCOUNTS</span><strong>{profileCount??0}</strong><small>{grants?.length??0} active grants</small></div>
    </section>

    <section className="role-admin-layout">
      <div className="role-admin-main">
        <div className="sports-section-head"><div><span className="eyebrow">ACTIVE GRANTS</span><h2>Who can do what.</h2></div></div>
        <div className="grant-list">
          {(grants??[]).map((g:any)=>{
            const protectedLast=g.role==='OWNER'&&g.scope_type==='GLOBAL'&&activeOwners<=1;
            return <article key={g.id}>
              <div><span>{g.role} · {scopeLabel(g.scope_type)}</span><strong>{nameMap.get(g.user_id)??'IPS account'}</strong><small>{grantScopeId(g as RoleGrant)??'Global scope'}{g.note?` · ${g.note}`:''}</small></div>
              {protectedLast?<button disabled title="Grant another GLOBAL OWNER before revoking this one.">Protected owner</button>:<form action={revokeRoleGrant}><input type="hidden" name="id" value={g.id}/><button>Revoke</button></form>}
            </article>;
          })}
        </div>
      </div>

      <aside className="grant-create-card grant-create-card-wide">
        <span className="eyebrow light">NEW ROLE GRANT</span>
        <h2>Assign access</h2>
        <RoleGrantForm
          clubs={(clubs??[]).map((x:any)=>({id:x.id,name:x.name,city_id:x.city_id}))}
          teams={(teams??[]).map((x:any)=>({id:x.id,name:x.name,club_id:x.club_id,side_label:x.side_label??null}))}
          tournaments={(tournaments??[]).map((x:any)=>({id:x.id,label:x.name}))}
          matches={(matches??[]).map((x:any)=>({id:x.id,label:x.match_code}))}
          players={(players??[]).map((x:any)=>({id:x.id,label:`${x.display_name} · ${x.ips_code}`}))}
        />
        <p className="grant-help"><b>City administrator:</b> choose <b>ADMIN + CITY</b> and search any Italian municipality. <b>Team administrator:</b> choose <b>ADMIN + TEAM · ALL SIDES</b> and select the Team identity. Use <b>COMPETITIVE SIDE ONLY</b> only when access must be restricted to one A/B/C side. Team and player deletion remain restricted to GLOBAL OWNER / GLOBAL ADMIN.</p>
      </aside>
    </section>

    <SiteFooter/>
  </main>;
}
