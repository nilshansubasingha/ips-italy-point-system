export const dynamic='force-dynamic';
export const revalidate=0;

import {redirect} from 'next/navigation';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {ManagementNav} from '@/components/manage/manage-nav';
import {RoleGrantForm} from '@/components/manage/role-grant-form';
import {AccessDirectory,type AccessDirectoryGrant} from '@/components/manage/access-directory';
import {getRoleManagementTier,requireAccount,type RoleManagementTier} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';

type GrantRow={
  id:string;
  user_id:string;
  display_name:string;
  email:string|null;
  role:string;
  scope_type:string;
  city_id:string|null;
  club_id:string|null;
  team_id:string|null;
  tournament_id:string|null;
  match_id:string|null;
  player_id:string|null;
  note:string|null;
  scope_label:string;
  can_revoke:boolean;
};

function tierLabel(tier:RoleManagementTier){
  if(tier==='OWNER')return 'Owner';
  if(tier==='GLOBAL_ADMIN')return 'Global Admin';
  if(tier==='CITY_ADMIN')return 'City Admin';
  return 'Team Admin';
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

  const clubMap=new Map(allClubs.map(club=>[club.id,club]));
  const teamMap=new Map(allTeams.map(team=>[team.id,team]));
  const playerIds=Array.from(new Set(grants.filter(g=>g.role==='PLAYER'&&g.player_id).map(g=>g.player_id as string)));

  const membershipRows=playerIds.length
    ?(await supabase
      .from('team_memberships')
      .select('player_id,team_id,is_primary,start_on')
      .in('player_id',playerIds)
      .eq('status','ACTIVE')
      .is('end_on',null)).data??[]
    :[];

  const membershipByPlayer=new Map<string,{player_id:string;team_id:string;is_primary:boolean;start_on:string}>();
  (membershipRows as Array<{player_id:string;team_id:string;is_primary:boolean;start_on:string}>)
    .sort((a,b)=>Number(b.is_primary)-Number(a.is_primary)||String(b.start_on).localeCompare(String(a.start_on)))
    .forEach(row=>{if(!membershipByPlayer.has(row.player_id))membershipByPlayer.set(row.player_id,row);});

  function grantCityId(grant:GrantRow){
    if(grant.scope_type==='CITY')return grant.city_id;
    if(grant.scope_type==='CLUB'&&grant.club_id)return clubMap.get(grant.club_id)?.city_id??null;
    if(grant.scope_type==='TEAM'&&grant.team_id){
      const team=teamMap.get(grant.team_id);
      return team?clubMap.get(team.club_id)?.city_id??null:null;
    }
    if(grant.scope_type==='PLAYER'&&grant.player_id){
      const membership=membershipByPlayer.get(grant.player_id);
      if(!membership)return null;
      const team=teamMap.get(membership.team_id);
      return team?clubMap.get(team.club_id)?.city_id??null:null;
    }
    return null;
  }

  const scopeCityIds=Array.from(new Set(grants.map(grantCityId).filter((id):id is string=>!!id)));
  const cityRows=scopeCityIds.length
    ?(await supabase.from('cities').select('id,name,province_abbr').in('id',scopeCityIds).order('name')).data??[]
    :[];
  const cityMap=new Map((cityRows as Array<{id:string;name:string;province_abbr:string|null}>).map(city=>[city.id,city]));

  const directoryGrants:AccessDirectoryGrant[]=grants.map(grant=>{
    const scopeCityId=grantCityId(grant);
    return {
      id:grant.id,
      user_id:grant.user_id,
      display_name:grant.display_name,
      email:grant.email,
      role:grant.role,
      scope_type:grant.scope_type,
      note:grant.note,
      scope_label:grant.scope_label,
      can_revoke:grant.can_revoke,
      scope_city_id:scopeCityId,
      scope_city_name:scopeCityId?cityMap.get(scopeCityId)?.name??null:null
    };
  });

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

        <AccessDirectory
          grants={directoryGrants}
          cities={(cityRows??[]).map((city:any)=>({
            id:city.id,
            name:city.name,
            province_abbr:city.province_abbr??null
          }))}
        />
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
