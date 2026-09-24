export const dynamic='force-dynamic';
export const revalidate=0;

import Link from 'next/link';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {ManagementNav} from '@/components/manage/manage-nav';
import {requireAccount,hasManagementRole} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {canCreateVenue} from '@/lib/project4';
import {VenueCreateForm} from '@/components/manage/venue-create-form';
import {ConfirmSubmitButton} from '@/components/manage/confirm-submit-button';
import {deleteVenue,updateVenue} from './actions';

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
  const cityScopeSet=new Set(cityScopeIds);

  let availableCities:any[]=[];
  if(global){
    const {data}=await supabase.rpc('ips_active_cities',{p_limit:50});
    const cityMap=new Map<string,any>();
    for(const city of data??[])cityMap.set(city.id,city);
    for(const venue of venues??[]){
      const city=(venue as any).city;
      if(city?.id&&!cityMap.has(city.id))cityMap.set(city.id,city);
    }
    availableCities=Array.from(cityMap.values()).sort((a:any,b:any)=>String(a.name).localeCompare(String(b.name),'it'));
  }else if(cityScopeIds.length){
    const {data}=await supabase
      .from('cities')
      .select('id,name,region,province_abbr')
      .in('id',cityScopeIds)
      .eq('status','ACTIVE')
      .order('name');
    availableCities=data??[];
  }

  return <main className="shell sports-shell">
    <SiteHeader/>
    <ManagementNav account={account} active="venues"/>

    <section className="ops-hero compact">
      <div>
        <span className="eyebrow">VENUES</span>
        <h1>Grounds & venues.</h1>
        <p>Fixtures reference one canonical venue record. Choose an IPS-active city first; if the ground belongs to a new city, type the municipality name and IPS resolves it from the national registry.</p>
      </div>
      <div className="ops-summary-card">
        <span>VENUES</span>
        <strong>{venues?.length??0}</strong>
        <small>canonical grounds</small>
        <Link href="/manage/tournaments">← Tournaments</Link>
      </div>
    </section>

    {(error||ok)&&<div className={'ops-message '+(error?'error':'success')}>{error||ok}</div>}

    <section className="ops-layout">
      <div className="ops-main">
        <div className="venue-management-list">
          {(venues??[]).map((v:any)=>{
            const city=v.city as any;
            const canManage=global||cityScopeSet.has(v.city_id);
            return <article className="venue-management-card" key={v.id}>
              <div className="venue-management-summary">
                <div>
                  <span>{city?.name??'Italy'}{city?.province_abbr?' · '+city.province_abbr:''}</span>
                  <strong>{v.name}</strong>
                  <small>{v.address_text||'Address not set'}</small>
                </div>
                <b>{v.status}</b>
              </div>

              {canManage&&<div className="venue-management-actions">
                <details className="venue-edit-details">
                  <summary>Edit</summary>
                  <form action={updateVenue} className="venue-edit-form">
                    <input type="hidden" name="venue_id" value={v.id}/>
                    <label>
                      <span>City</span>
                      <select name="city_id" defaultValue={v.city_id} required>
                        {availableCities.map((option:any)=><option key={option.id} value={option.id}>
                          {option.name+(option.province_abbr?' · '+option.province_abbr:'')}
                        </option>)}
                      </select>
                    </label>
                    <label><span>Ground name</span><input name="name" defaultValue={v.name} required/></label>
                    <label><span>Address</span><input name="address_text" defaultValue={v.address_text??''} placeholder="Street / facility"/></label>
                    <div className="form-split">
                      <label><span>Latitude</span><input name="latitude" type="number" step="any" defaultValue={v.latitude??''}/></label>
                      <label><span>Longitude</span><input name="longitude" type="number" step="any" defaultValue={v.longitude??''}/></label>
                    </div>
                    <div className="venue-edit-meta"><span>Slug</span><b>{v.slug}</b><small>Regenerated automatically when the ground name changes.</small></div>
                    <button className="button-primary">Save venue</button>
                  </form>
                </details>

                {global&&<form action={deleteVenue}>
                  <input type="hidden" name="venue_id" value={v.id}/>
                  <ConfirmSubmitButton
                    className="registry-delete-button"
                    message={'Delete '+v.name+'? Scheduled/ready fixture references will be cleared automatically. Started, completed or official match history will block deletion.'}
                  >
                    Delete
                  </ConfirmSubmitButton>
                </form>}
              </div>}
            </article>;
          })}
        </div>
      </div>

      <aside className="ops-side-card">
        <span className="eyebrow light">NEW VENUE</span>
        <h2>Add ground</h2>
        {canCreateVenue(account)
          ?<VenueCreateForm
            availableCities={(availableCities??[]).map((city:any)=>({
              id:city.id,
              name:city.name,
              province_abbr:city.province_abbr??null,
              region:city.region??null
            }))}
            allowOtherCity={global}
          />
          :<p className="ops-help">Your current role cannot create venues.</p>}
      </aside>
    </section>

    <SiteFooter/>
  </main>;
}
