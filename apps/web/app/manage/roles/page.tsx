export const dynamic='force-dynamic';
export const revalidate=0;

import {redirect} from 'next/navigation';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {ManagementNav} from '@/components/manage/manage-nav';
import {RoleGrantForm} from '@/components/manage/role-grant-form';
import {getRoleManagementTier,requireAccount,type RoleManagementTier} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {revokeRoleGrant} from './actions';

type GrantRow={
  id:string;
  user_id:string;
  display_name:string;
  email:string|null;
  role:string;
  scope_type:string;
  note:string|null;
  scope_label:string;
  can_revoke:boolean;
};

function groupFor(grant:GrantRow){
  if(grant.role==='OWNER'&&grant.scope_type==='GLOBAL')return 'owner';
  if(grant.role==='ADMIN'&&grant.scope_type==='GLOBAL')return 'admins';
  if(grant.role==='ADMIN'&&grant.scope_type==='CITY')return 'city';
  if(grant.role==='ADMIN'&&(grant.scope_type==='CLUB'||grant.scope_type==='TEAM'))return 'team';
  if(grant.role==='PLAYER')return 'players';
  return 'operations';
}

function tierLabel(tier:RoleManagementTier){
  if(tier==='OWNER')return 'Owner';
  if(tier==='GLOBAL_ADMIN')return 'Global Admin';
  if(tier==='CITY_ADMIN')return 'City Admin';
  return 'Team Admin';
}

function roleLabel(grant:GrantRow){
  if(grant.role==='OWNER')return 'OWNER';
  if(grant.role==='ADMIN'&&grant.scope_type==='GLOBAL')return 'GLOBAL ADMIN';
  if(grant.role==='ADMIN'&&grant.scope_type==='CITY')return 'CITY ADMIN';
  if(grant.role==='ADMIN'&&grant.scope_type==='CLUB')return 'TEAM ADMIN';
  if(grant.role==='ADMIN'&&grant.scope_type==='TEAM')return 'SIDE ADMIN';
  return grant.role;
}

function AccessGroup({
  title,
  note,
  grants,
  protectLastOwner=false
}:{
  title:string;
  note:string;
  grants:GrantRow[];
  protectLastOwner?:boolean;
}){
  return <section className="access-directory-group">
    <header>
      <div><span>{title.toUpperCase()}</span><strong>{title}</strong><small>{note}</small></div>
      <b>{grants.length}</b>
    </header>
    <div className="access-directory-list">
      {grants.map(grant=>{
        const protectedOwner=protectLastOwner&&grants.length<=1;
        return <article key={grant.id}>
          <div className="access-directory-person">
            <span className="access-directory-avatar">{grant.display_name.slice(0,2).toUpperCase()}</span>
            <div><strong>{grant.display_name}</strong><small>{grant.email??'No email on profile'}</small></div>
          </div>
          <div className="access-directory-scope">
            <span>{roleLabel(grant)}</span>
            <b>{grant.scope_label}</b>
            {grant.note&&<small>{grant.note}</small>}
          </div>
          {grant.can_revoke&&!protectedOwner
            ?<form action={revokeRoleGrant}><input type="hidden" name="id" value={grant.id}/><button>Revoke</button></form>
            :<em>{protectedOwner?'Protected':'View only'}</em>}
        </article>;
      })}
      {!grants.length&&<div className="access-directory-empty">No active access grants in this level.</div>}
    </div>
  </section>;
}

export default async function RoleManagementPage(){
  const account=await requireAccount();
  const actorTier=getRoleManagementTier(account);
  if(!actorTier)redirect('/manage');

  const supabase=await createClient();
  const [
    {data:grantRows,error:grantError},
    {data:registeredCities,error:cityError},
    {data:clubs,error:clubError},
    {data:teams,error:teamError}
  ]=await Promise.all([
    supabase.rpc('ips_role_management_grants'),
    supabase.rpc('ips_role_management_cities',{p_query:null,p_limit:20}),
    supabase.from('clubs').select('id,name,city_id').eq('status','ACTIVE').order('name'),
    supabase.from('teams').select('id,club_id').eq('status','ACTIVE')
  ]);

  if(grantError)console.error('[IPS ACCESS] Could not load grants:',grantError.message);
  if(cityError)console.error('[IPS ACCESS] Could not load registered cities:',cityError.message);
  if(clubError)console.error('[IPS ACCESS] Could not load Teams:',clubError.message);
  if(teamError)console.error('[IPS ACCESS] Could not load competitive sides:',teamError.message);

  const grants=(grantRows??[]) as GrantRow[];
  const allClubs=(clubs??[]) as Array<{id:string;name:string;city_id:string}>;
  const allTeams=(teams??[]) as Array<{id:string;club_id:string}>;

  const cityAdminIds=new Set(account.grants.filter(g=>g.role==='ADMIN'&&g.scope_type==='CITY'&&g.city_id).map(g=>g.city_id as string));
  const clubAdminIds=new Set(account.grants.filter(g=>g.role==='ADMIN'&&g.scope_type==='CLUB'&&g.club_id).map(g=>g.club_id as string));
  const teamAdminIds=new Set(account.grants.filter(g=>g.role==='ADMIN'&&g.scope_type==='TEAM'&&g.team_id).map(g=>g.team_id as string));
  const teamClubIds=new Set(allTeams.filter(t=>teamAdminIds.has(t.id)).map(t=>t.club_id));

  const manageableClubs=
    actorTier==='OWNER'||actorTier==='GLOBAL_ADMIN'
      ?allClubs
      :actorTier==='CITY_ADMIN'
        ?allClubs.filter(club=>cityAdminIds.has(club.city_id))
        :allClubs.filter(club=>clubAdminIds.has(club.id)||teamClubIds.has(club.id));

  const grouped={
    owner:grants.filter(g=>groupFor(g)==='owner'),
    admins:grants.filter(g=>groupFor(g)==='admins'),
    city:grants.filter(g=>groupFor(g)==='city'),
    team:grants.filter(g=>groupFor(g)==='team'),
    players:grants.filter(g=>groupFor(g)==='players'),
    operations:grants.filter(g=>groupFor(g)==='operations')
  };

  return <main className="shell sports-shell">
    <SiteHeader/>
    <ManagementNav account={account} active="roles"/>

    <section className="manage-roles-hero">
      <div>
        <span className="eyebrow">ACCESS CONTROL</span>
        <h1>Accounts & hierarchy.</h1>
        <p>Access now follows the IPS management chain. Each administrator can delegate only below their own level and only inside the City or Team they control.</p>
      </div>
      <div className="role-count-card"><span>YOUR ACCESS LEVEL</span><strong>{tierLabel(actorTier)}</strong><small>{grants.length} visible active grants</small></div>
    </section>

    <section className="role-admin-layout hierarchical-access-layout">
      <div className="role-admin-main">
        <div className="sports-section-head">
          <div><span className="eyebrow">ACCESS DIRECTORY</span><h2>Organised by authority.</h2></div>
          <p className="section-note">Owner → Global Admin → City Admin → Team Admin → Player</p>
        </div>

        <div className="access-directory-stack">
          <AccessGroup title="Owner" note="National ownership and final authority." grants={grouped.owner} protectLastOwner/>
          <AccessGroup title="Global Admins" note="National administration below Owner level." grants={grouped.admins}/>
          <AccessGroup title="City Admins" note="Administration restricted to one City." grants={grouped.city}/>
          <AccessGroup title="Team Admins" note="Administration restricted to one Team or competitive side." grants={grouped.team}/>
          <AccessGroup title="Players" note="Account access tied to a permanent IPS player identity." grants={grouped.players}/>
          {!!grouped.operations.length&&<AccessGroup title="Operations" note="Existing scorer, leader and tournament-level operational access." grants={grouped.operations}/>}
        </div>
      </div>

      <aside className="grant-create-card grant-create-card-wide">
        <span className="eyebrow light">NEW ROLE GRANT</span>
        <h2>Assign access</h2>
        <p className="grant-intro">Search once. Results drop directly from the search field, including registered City matches.</p>
        <RoleGrantForm
          actorTier={actorTier}
          registeredCities={(registeredCities??[]).map((city:any)=>({
            id:city.id,
            name:city.name,
            province_abbr:city.province_abbr??null,
            region:city.region??null
          }))}
          clubs={manageableClubs}
        />
        <p className="grant-help"><b>Delegation:</b> City Admins can appoint Team Admins and Players inside their City. Team Admins can grant Player access inside their Team. Global Admins can appoint City Admins and lower levels. Owner remains the only level that can appoint another Owner or Global Admin.</p>
      </aside>
    </section>

    <SiteFooter/>
  </main>;
}
