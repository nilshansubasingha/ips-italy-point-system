export const dynamic='force-dynamic';
export const revalidate=0;

import {redirect} from 'next/navigation';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {ManagementNav} from '@/components/manage/manage-nav';
import {requireAccount,isOwner,grantScopeId,type RoleGrant} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {CitySearchSelect} from '@/components/location/city-search-select';
import {createRoleGrant,revokeRoleGrant} from './actions';

function scopeLabel(scope:string){
  return scope==='CLUB'?'TEAM · ALL SIDES':scope==='TEAM'?'COMPETITIVE SIDE':scope;
}

export default async function RoleManagementPage(){
  const account=await requireAccount();
  if(!isOwner(account))redirect('/manage');
  const supabase=await createClient();

  const [{data:profiles},{data:grants},{data:clubs},{data:teams},{data:tournaments},{data:matches},{data:players}]=await Promise.all([
    supabase.from('profiles').select('id,display_name,status,linked_player_id,created_at').order('created_at'),
    supabase.from('role_grants').select('*').is('revoked_at',null).order('created_at',{ascending:false}),
    supabase.from('clubs').select('id,name').order('name'),
    supabase.from('teams').select('id,name').order('name'),
    supabase.from('tournaments').select('id,name').order('starts_at',{ascending:false}),
    supabase.from('matches').select('id,match_code').order('scheduled_at',{ascending:false}),
    supabase.from('players').select('id,display_name,ips_code').order('display_name')
  ]);

  const nameMap=new Map((profiles??[]).map((p:any)=>[p.id,p.display_name]));
  const activeOwners=(grants??[]).filter((g:any)=>g.role==='OWNER'&&g.scope_type==='GLOBAL'&&!g.revoked_at).length;

  return <main className="shell sports-shell">
    <SiteHeader/>
    <ManagementNav account={account} active="roles"/>

    <section className="manage-roles-hero">
      <div>
        <span className="eyebrow">OWNER CONTROL</span>
        <h1>Accounts & scoped roles.</h1>
        <p>One account can hold multiple roles. City scope now uses the nationwide Italian municipality registry rather than a fixed city list.</p>
      </div>
      <div className="role-count-card"><span>ACCOUNTS</span><strong>{profiles?.length??0}</strong><small>{grants?.length??0} active grants</small></div>
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

      <aside className="grant-create-card">
        <span className="eyebrow light">NEW ROLE GRANT</span>
        <h2>Assign access</h2>
        <form action={createRoleGrant}>
          <label><span>Account</span><select name="user_id" required>{(profiles??[]).map((p:any)=><option key={p.id} value={p.id}>{p.display_name}</option>)}</select></label>
          <div className="form-split">
            <label><span>Role</span><select name="role"><option>ADMIN</option><option>LEADER</option><option>SCORER</option><option>PLAYER</option><option>OWNER</option></select></label>
            <label><span>Scope type</span><select name="scope_type"><option value="GLOBAL">GLOBAL</option><option value="CITY">CITY</option><option value="CLUB">TEAM · ALL SIDES</option><option value="TEAM">COMPETITIVE SIDE ONLY</option><option value="TOURNAMENT">TOURNAMENT</option><option value="MATCH">MATCH</option><option value="PLAYER">PLAYER</option></select></label>
          </div>
          <details className="scope-selectors">
            <summary>Select the matching scope record</summary>
            <CitySearchSelect name="city_id" label="City"/>
            <label><span>Team identity (all sides)</span><select name="club_id"><option value="">—</option>{(clubs??[]).map((x:any)=><option key={x.id} value={x.id}>{String(x.name).replace(/\s+Cricket Club$/i,'')}</option>)}</select></label>
            <label><span>Competitive side</span><select name="team_id"><option value="">—</option>{(teams??[]).map((x:any)=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
            <label><span>Tournament</span><select name="tournament_id"><option value="">—</option>{(tournaments??[]).map((x:any)=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
            <label><span>Match</span><select name="match_id"><option value="">—</option>{(matches??[]).map((x:any)=><option key={x.id} value={x.id}>{x.match_code}</option>)}</select></label>
            <label><span>Player</span><select name="player_id"><option value="">—</option>{(players??[]).map((x:any)=><option key={x.id} value={x.id}>{x.display_name} · {x.ips_code}</option>)}</select></label>
          </details>
          <label><span>Note</span><input name="note" placeholder="Why this access was granted"/></label>
          <button className="button-primary">Grant role</button>
        </form>
        <p className="grant-help"><b>City administrator:</b> choose <b>ADMIN + CITY</b> and search any Italian municipality. <b>Team administrator:</b> choose <b>ADMIN + TEAM · ALL SIDES</b> and select the Team identity. Use <b>COMPETITIVE SIDE ONLY</b> only when access must be restricted to one A/B/C side. Team and player deletion remain restricted to GLOBAL OWNER / GLOBAL ADMIN.</p>
      </aside>
    </section>

    <SiteFooter/>
  </main>;
}
