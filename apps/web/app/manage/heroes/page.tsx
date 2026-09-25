export const dynamic='force-dynamic';
export const revalidate=0;

import {redirect} from 'next/navigation';
import {getActiveCities} from '@ips/data';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {ManagementNav} from '@/components/manage/manage-nav';
import {ImageCropField} from '@/components/media/image-crop-field';
import {isOwner,requireAccount} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {removeDirectoryHero,uploadDirectoryHero} from './actions';

type HeroRow={scope_key:string;city_id:string|null;image_url:string;image_path:string;updated_at:string};

export default async function HeroBackgroundsPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const account=await requireAccount();
  if(!isOwner(account))redirect('/dashboard?access=owner-required');

  const sp=await searchParams;
  const error=typeof sp.error==='string'?sp.error:null;
  const ok=typeof sp.ok==='string'?sp.ok:null;
  const supabase=await createClient();

  const [citiesResult,heroesResult]=await Promise.all([
    getActiveCities(50),
    supabase.from('directory_hero_backgrounds').select('scope_key,city_id,image_url,image_path,updated_at').order('updated_at',{ascending:false})
  ]);

  const cities=citiesResult??[];
  const heroes=(heroesResult.data??[]) as HeroRow[];
  const heroMap=new Map(heroes.map(hero=>[hero.scope_key,hero]));

  const editor=(scope:'italy'|'city',key:string,label:string,cityId?:string)=>{
    const hero=heroMap.get(key);
    return <article className="hero-admin-card" key={key}>
      <div className="hero-admin-preview">
        {hero?.image_url?<img src={hero.image_url} alt={label+' hero background'}/>:<div className="hero-admin-empty"><span>NO CUSTOM IMAGE</span><strong>{label}</strong><small>{label==='Napoli'?'Built-in Vesuvius fallback is currently used.':'The standard IPS background is currently used.'}</small></div>}
        <span className={hero?'hero-status custom':'hero-status default'}>{hero?'CUSTOM':'DEFAULT'}</span>
      </div>
      <div className="hero-admin-copy">
        <div><span className="eyebrow">{scope==='italy'?'NATIONAL HERO':'CITY HERO'}</span><h3>{label}</h3></div>
        {hero&&<small>Updated {new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',day:'2-digit',month:'short',year:'numeric'}).format(new Date(hero.updated_at))}</small>}
      </div>
      <details className="hero-editor-details">
        <summary>{hero?'Replace background':'Upload background'}</summary>
        <form action={uploadDirectoryHero} className="hero-upload-form" encType="multipart/form-data">
          <input type="hidden" name="scope" value={scope}/>
          {cityId&&<input type="hidden" name="city_id" value={cityId}/>}
          <ImageCropField name="image" label="Choose hero image" aspect="hero" required initialUrl={hero?.image_url??null}/>
          <button>Save hero background</button>
        </form>
      </details>
      {hero&&<form action={removeDirectoryHero} className="hero-remove-form">
        <input type="hidden" name="scope_key" value={key}/>
        <button className="danger-link">Remove custom background</button>
      </form>}
    </article>;
  };

  return <main className="shell sports-shell">
    <SiteHeader/>
    <ManagementNav account={account} active="heroes"/>

    <section className="manage-titlebar">
      <div><span className="eyebrow">OWNER ONLY</span><h1>Hero backgrounds</h1><p>Upload the national and city artwork used behind the public Teams directory. Images are cropped to a wide 3:1 hero; drag to reposition and use the zoom control before saving.</p></div>
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
