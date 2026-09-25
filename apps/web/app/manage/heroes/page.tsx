export const dynamic='force-dynamic';
export const revalidate=0;

import {redirect} from 'next/navigation';
import {getActiveCities} from '@ips/data';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {ManagementNav} from '@/components/manage/manage-nav';
import {HeroBackgroundEditor} from '@/components/manage/hero-background-editor';
import {isOwner,requireAccount} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';

type HeroRow={scope_key:string;city_id:string|null;image_url:string|null;image_path:string|null;mobile_image_url:string|null;mobile_image_path:string|null;updated_at:string};

export default async function HeroBackgroundsPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const account=await requireAccount();
  if(!isOwner(account))redirect('/dashboard?access=owner-required');

  const sp=await searchParams;
  const error=typeof sp.error==='string'?sp.error:null;
  const ok=typeof sp.ok==='string'?sp.ok:null;
  const supabase=await createClient();

  const [citiesResult,heroesResult]=await Promise.all([
    getActiveCities(50),
    supabase.from('directory_hero_backgrounds').select('scope_key,city_id,image_url,image_path,mobile_image_url,mobile_image_path,updated_at').order('updated_at',{ascending:false})
  ]);

  const cities=citiesResult??[];
  const heroes=(heroesResult.data??[]) as HeroRow[];
  const heroMap=new Map(heroes.map(hero=>[hero.scope_key,hero]));

  const editor=(scope:'italy'|'city',key:string,label:string,cityId?:string)=>{
    const hero=heroMap.get(key);
    return <HeroBackgroundEditor
      key={key}
      scope={scope}
      scopeKey={key}
      label={label}
      cityId={cityId}
      desktopUrl={hero?.image_url??null}
      mobileUrl={hero?.mobile_image_url??null}
      updatedAt={hero?.updated_at??null}
    />;
  };

  return <main className="shell sports-shell">
    <SiteHeader/>
    <ManagementNav account={account} active="heroes"/>

    <section className="manage-titlebar">
      <div><span className="eyebrow">OWNER ONLY</span><h1>Hero backgrounds</h1><p>Manage separate desktop and mobile artwork for the public Teams directory. On a phone the editor opens in Mobile mode automatically; drag and zoom the image without affecting the desktop version.</p></div>
    </section>

    {(error||ok)&&<div className={'ops-message '+(error?'error':'success')}>{error||ok}</div>}

    <section className="sports-section compact-section">
      <div className="sports-section-head premium-section-head">
        <div><span className="eyebrow">ALL ITALY</span><h2>National directory background</h2></div>
        <span className="section-note">Owner-managed · public-facing</span>
      </div>
      <div className="hero-admin-national">{editor('italy','italy','All Italy')}</div>
    </section>

    <section className="sports-section compact-section">
      <div className="sports-section-head premium-section-head">
        <div><span className="eyebrow">ACTIVE CITIES</span><h2>City backgrounds</h2></div>
        <span className="section-note">{cities.length} active cities</span>
      </div>
      <div className="hero-admin-grid">
        {cities.map((city:any)=>editor('city','city:'+city.id,city.name,city.id))}
      </div>
    </section>

    <SiteFooter/>
  </main>;
}
