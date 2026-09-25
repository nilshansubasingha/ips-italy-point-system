'use client';

import {useEffect,useState} from 'react';
import {ImageCropField} from '@/components/media/image-crop-field';
import {removeDirectoryHero,uploadDirectoryHero} from '@/app/manage/heroes/actions';

type Props={
  scope:'italy'|'city';
  scopeKey:string;
  label:string;
  cityId?:string;
  desktopUrl?:string|null;
  mobileUrl?:string|null;
  updatedAt?:string|null;
};

export function HeroBackgroundEditor({scope,scopeKey,label,cityId,desktopUrl=null,mobileUrl=null,updatedAt=null}:Props){
  const [variant,setVariant]=useState<'desktop'|'mobile'|null>(null);

  useEffect(()=>{
    const media=window.matchMedia('(max-width: 650px)');
    const sync=()=>setVariant(media.matches?'mobile':'desktop');
    sync();
    media.addEventListener?.('change',sync);
    return()=>media.removeEventListener?.('change',sync);
  },[]);

  const active=variant??'desktop';
  const currentUrl=active==='mobile'?mobileUrl:desktopUrl;
  const isMobile=active==='mobile';

  return <article className="hero-admin-card">
    <div className="hero-editor-modebar">
      <div>
        <span className="eyebrow">EDITING</span>
        <strong>{active.toUpperCase()}</strong>
      </div>
      <div className="hero-device-toggle" role="group" aria-label="Hero device version">
        <button type="button" className={active==='desktop'?'active':''} onClick={()=>setVariant('desktop')}>Desktop</button>
        <button type="button" className={active==='mobile'?'active':''} onClick={()=>setVariant('mobile')}>Mobile</button>
      </div>
    </div>

    <div className={'hero-admin-preview '+(isMobile?'mobile-preview':'desktop-preview')}>
      {currentUrl?<img src={currentUrl} alt={label+' '+active+' hero background'}/>:<div className="hero-admin-empty">
        <span>NO CUSTOM {active.toUpperCase()} IMAGE</span>
        <strong>{label}</strong>
        <small>{isMobile
          ?'Mobile will fall back to the desktop background until you save a mobile crop.'
          :label==='Napoli'
            ?'Built-in Vesuvius fallback is currently used.'
            :'The standard IPS background is currently used.'}</small>
      </div>}
      <span className={currentUrl?'hero-status custom':'hero-status default'}>{currentUrl?'CUSTOM':'DEFAULT'}</span>
    </div>

    <div className="hero-admin-copy">
      <div><span className="eyebrow">{scope==='italy'?'NATIONAL HERO':'CITY HERO'}</span><h3>{label}</h3></div>
      {updatedAt&&<small>Updated {new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(updatedAt))}</small>}
    </div>

    <details className="hero-editor-details">
      <summary>{currentUrl?'Replace '+active+' background':'Upload '+active+' background'}</summary>
      <form action={uploadDirectoryHero} className="hero-upload-form" encType="multipart/form-data">
        <input type="hidden" name="scope" value={scope}/>
        <input type="hidden" name="variant" value={active}/>
        {cityId&&<input type="hidden" name="city_id" value={cityId}/>}
        <ImageCropField
          key={active}
          name="image"
          label={isMobile?'Choose mobile hero image':'Choose desktop hero image'}
          aspect={isMobile?'mobileHero':'hero'}
          required
          initialUrl={currentUrl}
        />
        <div className="hero-editor-note">
          <strong>{isMobile?'Mobile only':'Desktop only'}</strong>
          <span>{isMobile?'This save will not change the desktop hero.':'This save will not change the mobile crop.'}</span>
        </div>
        <button>Save {active} hero background</button>
      </form>
    </details>

    {currentUrl&&<form action={removeDirectoryHero} className="hero-remove-form">
      <input type="hidden" name="scope_key" value={scopeKey}/>
      <input type="hidden" name="variant" value={active}/>
      <button className="danger-link">Remove custom {active} background</button>
    </form>}
  </article>;
}
