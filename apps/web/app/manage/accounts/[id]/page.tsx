export const dynamic='force-dynamic';
export const revalidate=0;

import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {ManagementNav} from '@/components/manage/manage-nav';
import {CitySearchSelect} from '@/components/location/city-search-select';
import {PlayerAvatar} from '@/components/identity';
import {canManageRoles,requireAccount} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {updateManagedProfile} from './actions';

type ManagedProfile={
  id:string;
  display_name:string|null;
  full_name:string|null;
  email:string|null;
  phone:string|null;
  date_of_birth:string|null;
  status:string;
  city_id:string|null;
  city_name:string|null;
  province_abbr:string|null;
  linked_player_id:string|null;
  player_display_name:string|null;
  ips_code:string|null;
  player_image_url:string|null;
  club_id:string|null;
  club_name:string|null;
  team_id:string|null;
  team_name:string|null;
  can_edit_city:boolean;
};

function accessLabel(role:string,scope:string){
  if(role==='OWNER'&&scope==='GLOBAL')return 'Owner';
  if(role==='ADMIN'&&scope==='GLOBAL')return 'Global Admin';
  if(role==='ADMIN'&&scope==='CITY')return 'City Admin';
  if(role==='ADMIN'&&scope==='CLUB')return 'Team Admin';
  if(role==='ADMIN'&&scope==='TEAM')return 'Side Admin';
  return role.charAt(0)+role.slice(1).toLowerCase();
}

export default async function ManagedAccountProfile({
  params,
  searchParams
}:{
  params:Promise<{id:string}>;
  searchParams:Promise<Record<string,string|string[]|undefined>>;
}){
  const account=await requireAccount();
  if(!canManageRoles(account))redirect('/manage');

  const {id}=await params;
  const sp=await searchParams;
  const ok=typeof sp.ok==='string'?sp.ok:null;
  const error=typeof sp.error==='string'?sp.error:null;
  const supabase=await createClient();

  const [{data:profileRows,error:profileError},{data:grantRows}]=await Promise.all([
    supabase.rpc('ips_managed_profile_detail',{p_user_id:id}),
    supabase.rpc('ips_role_management_grants')
  ]);

  if(profileError){
    redirect('/manage/roles');
  }

  const profile=((profileRows??[])[0]??null) as ManagedProfile|null;
  if(!profile)notFound();

  const grants=(grantRows??[]).filter((grant:any)=>grant.user_id===id);

  const initialCity=profile.city_id?{
    id:profile.city_id,
    code:'',
    name:profile.city_name??'Current city',
    province_abbr:profile.province_abbr,
    region:null,
    province_name:null,
    istat_code:null
  }:null;

  return <main className="shell sports-shell">
    <SiteHeader/>
    <ManagementNav account={account} active="roles"/>

    <section className="managed-profile-hero">
      <div className="managed-profile-identity">
        <PlayerAvatar
          name={profile.player_display_name??profile.display_name??profile.full_name??'IPS account'}
          imageUrl={profile.player_image_url}
          large
        />
        <div>
          <Link href="/manage/roles" className="back-link">← Accounts & Roles</Link>
          <span className="eyebrow">ACCOUNT PROFILE</span>
          <h1>{profile.display_name??profile.full_name??'IPS account'}</h1>
          <p>{profile.email??'No login email'} · {profile.status}</p>
        </div>
      </div>

      <div className="managed-profile-actions">
        {profile.linked_player_id&&<Link href={'/manage/players/'+profile.linked_player_id} className="button-secondary">Edit official player profile →</Link>}
      </div>
    </section>

    {(ok||error)&&<div className={'ops-message '+(error?'error':'success')}>{error||ok}</div>}

    <section className="managed-profile-layout">
      <div className="management-stack">
        <section className="management-surface">
          <div className="surface-head">
            <div><span className="eyebrow">ACCOUNT DETAILS</span><h2>Edit profile</h2></div>
            <span>Scoped management</span>
          </div>

          <form action={updateManagedProfile} className="compact-form managed-profile-form">
            <input type="hidden" name="user_id" value={profile.id}/>

            <label>
              <span>Display name</span>
              <input name="display_name" required defaultValue={profile.display_name??profile.full_name??''}/>
            </label>

            <label>
              <span>Full legal name</span>
              <input name="full_name" defaultValue={profile.full_name??''}/>
            </label>

            <label>
              <span>Login email</span>
              <input value={profile.email??''} readOnly disabled/>
              <small>Read-only here so the profile cannot become desynchronised from Supabase Auth.</small>
            </label>

            <div className="form-split">
              <label>
                <span>Phone</span>
                <input name="phone" type="tel" defaultValue={profile.phone??''} placeholder="+39..."/>
              </label>
              <label>
                <span>Date of birth</span>
                <input name="date_of_birth" type="date" defaultValue={profile.date_of_birth??''}/>
              </label>
            </div>

            {profile.can_edit_city
              ?<CitySearchSelect
                name="city_id"
                value={profile.city_id??''}
                initialCity={initialCity}
                label="City"
                placeholder="Search municipality…"
              />
              :<>
                <input type="hidden" name="city_id" value={profile.city_id??''}/>
                <div className="managed-profile-readonly">
                  <span>CITY</span>
                  <strong>{profile.city_name??'Not set'}</strong>
                  <small>Only Owner or Global Admin can change an account city.</small>
                </div>
              </>}

            <button>Save profile</button>
          </form>
        </section>
      </div>

      <aside className="management-stack">
        <section className="management-surface">
          <div className="surface-head">
            <div><span className="eyebrow">ACCESS</span><h2>Current roles</h2></div>
            <span>{grants.length}</span>
          </div>
          <div className="managed-profile-grants">
            {grants.map((grant:any)=><article key={grant.id}>
              <span>{accessLabel(grant.role,grant.scope_type)}</span>
              <strong>{grant.scope_label}</strong>
              {grant.note&&<small>{grant.note}</small>}
            </article>)}
            {!grants.length&&<div className="privacy-note">No active access grant is visible for this account.</div>}
          </div>
        </section>

        <section className="management-surface">
          <div className="surface-head">
            <div><span className="eyebrow">IPS PLAYER LINK</span><h2>{profile.linked_player_id?'Official identity':'Not linked'}</h2></div>
          </div>

          {profile.linked_player_id?<>
            <div className="managed-player-link-card">
              <PlayerAvatar name={profile.player_display_name??profile.display_name??'Player'} imageUrl={profile.player_image_url}/>
              <div>
                <strong>{profile.player_display_name}</strong>
                <span>{profile.ips_code}</span>
                <small>{[profile.city_name,profile.club_name,profile.team_name].filter(Boolean).join(' · ')||'No active Team'}</small>
              </div>
            </div>
            <Link href={'/manage/players/'+profile.linked_player_id} className="button-secondary managed-profile-player-button">Open player editor →</Link>
            <p className="privacy-note">Permanent cricket identity, official portrait, batting/bowling details and roster contacts are edited in the Player Registry.</p>
          </>:<p className="privacy-note">This account is not linked to a permanent IPS player identity. Account profile fields can still be maintained here.</p>}
        </section>
      </aside>
    </section>

    <SiteFooter/>
  </main>;
}
