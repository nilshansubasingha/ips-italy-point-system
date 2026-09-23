export const dynamic='force-dynamic';
export const revalidate=0;

import Link from 'next/link';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {ManagementNav} from '@/components/manage/manage-nav';
import {requireAccount,hasManagementRole} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {canCreateVenue} from '@/lib/project4';
import {CitySearchSelect} from '@/components/location/city-search-select';
import {createVenue} from './actions';

export default async function VenuesPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const account=await requireAccount();
  if(!hasManagementRole(account))return null;
  const sp=await searchParams;
  const error=typeof sp.error==='string'?sp.error:null;
  const ok=typeof sp.ok==='string'?sp.ok:null;
  const supabase=await createClient();

  const {data:venues}=await supabase.from('venues').select('*,city:cities(id,name,region,province_abbr)').order('name');

  const global=account.grants.some(g=>(g.role==='OWNER'&&g.scope_type==='GLOBAL')||(g.role==='ADMIN'&&g.scope_type==='GLOBAL'));
  const cityScopeIds=account.grants.filter(g=>g.role==='ADMIN'&&g.scope_type==='CITY'&&g.city_id).map(g=>g.city_id as string);
  let allowedCities:any[]|undefined=undefined;
  if(!global&&cityScopeIds.length){
    const {data}=await supabase.from('cities').select('id,name,code,region,province_name,province_abbr,istat_code').in('id',cityScopeIds).order('name');
    allowedCities=data??[];
  }

  return <main className="shell sports-shell">
    <SiteHeader/>
    <ManagementNav account={account} active="venues"/>

    <section className="ops-hero compact">
      <div><span className="eyebrow">VENUES</span><h1>Grounds & venues.</h1><p>Fixtures reference one canonical venue record. Search any Italian municipality when creating a ground; the scorer never has to retype it.</p></div>
      <div className="ops-summary-card"><span>VENUES</span><strong>{venues?.length??0}</strong><small>canonical grounds</small><Link href="/manage/tournaments">← Tournaments</Link></div>
    </section>

    {(error||ok)&&<div className={`ops-message ${error?'error':'success'}`}>{error||ok}</div>}

    <section className="ops-layout">
      <div className="ops-main">
        <div className="ops-list">
          {(venues??[]).map((v:any)=><article key={v.id}>
            <div><span>{(v.city as any)?.name??'Italy'}{(v.city as any)?.province_abbr?` · ${(v.city as any).province_abbr}`:''}</span><strong>{v.name}</strong><small>{v.address_text||'Address not set'}</small></div>
            <b>{v.status}</b>
          </article>)}
        </div>
      </div>

      <aside className="ops-side-card">
        <span className="eyebrow light">NEW VENUE</span>
        <h2>Add ground</h2>
        {canCreateVenue(account)?<form action={createVenue} className="ops-form">
          <CitySearchSelect name="city_id" required label="City" allowedCities={allowedCities}/>
          <label><span>Name</span><input name="name" required placeholder="Napoli Cricket Ground"/></label>
          <label><span>Slug</span><input name="slug" required placeholder="napoli-cricket-ground"/></label>
          <label><span>Address</span><input name="address_text" placeholder="Street / facility"/></label>
          <div className="form-split"><label><span>Latitude</span><input name="latitude" type="number" step="any"/></label><label><span>Longitude</span><input name="longitude" type="number" step="any"/></label></div>
          <button className="button-primary">Create venue</button>
        </form>:<p className="ops-help">Your current role cannot create venues.</p>}
      </aside>
    </section>

    <SiteFooter/>
  </main>;
}
