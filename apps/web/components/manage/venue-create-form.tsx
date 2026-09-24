'use client';

import {useMemo,useState} from 'react';
import {createVenue} from '@/app/manage/venues/actions';

type VenueCity={
  id:string;
  name:string;
  province_abbr:string|null;
  region:string|null;
};

function slugify(value:string){
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'')
    .replace(/-{2,}/g,'-');
}

export function VenueCreateForm({
  availableCities,
  allowOtherCity
}:{
  availableCities:VenueCity[];
  allowOtherCity:boolean;
}){
  const [cityChoice,setCityChoice]=useState(availableCities[0]?.id??(allowOtherCity?'__other__':''));
  const [cityName,setCityName]=useState('');
  const [name,setName]=useState('');

  const selectedCity=availableCities.find(city=>city.id===cityChoice)??null;
  const isOther=cityChoice==='__other__';
  const generatedSlug=useMemo(()=>slugify(name),[name]);

  return <form action={createVenue} className="ops-form venue-create-form">
    <label>
      <span>City *</span>
      <select value={cityChoice} onChange={event=>setCityChoice(event.target.value)} required>
        {!availableCities.length&&!allowOtherCity&&<option value="">No available cities</option>}
        {availableCities.map(city=><option key={city.id} value={city.id}>
          {city.name+(city.province_abbr?' · '+city.province_abbr:'')}
        </option>)}
        {allowOtherCity&&<option value="__other__">Other city…</option>}
      </select>
      <small className="venue-field-help">Only cities already active in IPS are listed here.</small>
    </label>

    <input type="hidden" name="city_id" value={selectedCity?.id??''}/>

    {isOther&&<label className="venue-other-city">
      <span>Type city name *</span>
      <input
        name="city_name"
        value={cityName}
        onChange={event=>setCityName(event.target.value)}
        required
        placeholder="e.g. Bergamo or Bergamo, BG"
        autoComplete="off"
      />
      <small className="venue-field-help">IPS will match this against the Italian municipality registry when the ground is created.</small>
    </label>}

    <label>
      <span>Name *</span>
      <input
        name="name"
        value={name}
        onChange={event=>setName(event.target.value)}
        required
        placeholder="Napoli Cricket Ground"
      />
    </label>

    <div className="venue-slug-preview">
      <span>SLUG</span>
      <strong>{generatedSlug||'generated-from-ground-name'}</strong>
      <small>Generated automatically. If that slug already exists, IPS adds the city or a number.</small>
    </div>

    <label><span>Address</span><input name="address_text" placeholder="Street / facility"/></label>
    <div className="form-split">
      <label><span>Latitude</span><input name="latitude" type="number" step="any"/></label>
      <label><span>Longitude</span><input name="longitude" type="number" step="any"/></label>
    </div>
    <button className="button-primary" disabled={!cityChoice||!name.trim()||(isOther&&!cityName.trim())}>Create venue</button>
  </form>;
}
