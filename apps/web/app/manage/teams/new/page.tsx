export const dynamic='force-dynamic'; export const revalidate=0;

import Link from 'next/link';
import {redirect} from 'next/navigation';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {ManagementNav} from '@/components/manage/manage-nav';
import {requireAccount} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {createTeamIdentity} from '../../registry/actions';
import {TeamStructureSelector} from '@/components/manage/team-structure-selector';
import {CitySearchSelect} from '@/components/location/city-search-select';

export default async function NewTeamPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const account=await requireAccount();
  const sp=await searchParams;
  const error=typeof sp.error==='string'?sp.error:null;
  const supabase=await createClient();

  const global=account.grants.some(g=>(g.role==='OWNER'&&g.scope_type==='GLOBAL')||(g.role==='ADMIN'&&g.scope_type==='GLOBAL'));
  const cityScopeIds=account.grants.filter(g=>g.role==='ADMIN'&&g.scope_type==='CITY'&&g.city_id).map(g=>g.city_id as string);
  let allowedCities:any[]|undefined=undefined;
  if(!global){
    if(!cityScopeIds.length) redirect('/manage/teams?error='+encodeURIComponent('A City Admin, Global Admin or Owner scope is required to create a Team.'));
    const {data}=await supabase.from('cities').select('id,name,code,region,province_name,province_abbr,istat_code').in('id',cityScopeIds).order('name');
    allowedCities=data??[];
  }

  return <main className="shell sports-shell">
    <SiteHeader/>
    <ManagementNav account={account} active="teams"/>
    <section className="manage-titlebar compact">
      <div>
        <Link className="back-link" href="/manage/teams">← Teams</Link>
        <span className="eyebrow">NEW TEAM</span>
        <h1>Add a team</h1>
        <p>Create the public Team identity once. If the organisation operates A/B/C sides, IPS creates those competitive sides underneath the same Team.</p>
      </div>
    </section>
    {error&&<div className="ops-message error">{error}</div>}
    <section className="form-workspace">
      <form action={createTeamIdentity} className="professional-form standalone-form">
        <input type="hidden" name="return_to" value="/manage/teams/new"/>
        <div className="form-block">
          <div className="form-block-head"><span>01</span><div><strong>Team identity</strong><small>This is the name supporters, players and rankings will see.</small></div></div>
          <label className="wide"><span>Team name *</span><input name="name" required placeholder="Napoli Youth"/></label>
          <label><span>Short name</span><input name="short_name" placeholder="Napoli Youth"/></label>
          <CitySearchSelect name="city_id" required label="City" allowedCities={allowedCities}/>
          <label><span>Category</span><select name="category" defaultValue="OPEN"><option value="OPEN">Open</option><option value="MEN">Men</option><option value="WOMEN">Women</option><option value="YOUTH">Youth</option><option value="VETERANS">Veterans</option></select></label>
          <TeamStructureSelector/>
        </div>

        <div className="registry-identity-note"><b>One Team identity. Optional multiple sides.</b><span>Fixtures and tournament squads use the competitive side, while the public directory keeps the Team together.</span></div>
        <button className="button-primary">Create team →</button>
      </form>
    </section>
    <SiteFooter/>
  </main>;
}
