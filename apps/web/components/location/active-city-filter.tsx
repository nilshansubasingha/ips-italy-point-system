'use client';

import Link from 'next/link';
import {useMemo,useState} from 'react';

type City={
  id:string;
  code:string;
  name:string;
  region?:string|null;
  province_name?:string|null;
  province_abbr?:string|null;
  activity_score?:number;
};

export function ActiveCityFilter({cities,basePath,selectedCode,allLabel='All Italy'}:{cities:City[];basePath:string;selectedCode?:string;allLabel?:string}){
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState('');
  const selected=cities.find(c=>c.code.toLowerCase()===selectedCode?.toLowerCase());
  const quick=[...cities.slice(0,5)];
  if(selected&&!quick.some(c=>c.id===selected.id))quick.push(selected);
  const filtered=useMemo(()=>{
    const q=query.trim().toLocaleLowerCase('it');
    if(!q)return cities;
    return cities.filter(c=>
      c.name.toLocaleLowerCase('it').includes(q)
      || (c.province_name??'').toLocaleLowerCase('it').includes(q)
      || (c.province_abbr??'').toLocaleLowerCase('it').includes(q)
      || (c.region??'').toLocaleLowerCase('it').includes(q)
    );
  },[cities,query]);

  return <div className="active-city-filter">
    <div className="active-city-filter-quick">
      <Link className={!selectedCode?'active':''} href={basePath}>{allLabel}</Link>
      {quick.map(city=><Link key={city.id} className={selected?.id===city.id?'active':''} href={basePath+'?city='+encodeURIComponent(city.code.toLowerCase())}>{city.name}</Link>)}
      {cities.length>quick.length&&<button type="button" className={open?'active':''} onClick={()=>setOpen(v=>!v)}>More cities <span>⌄</span></button>}
    </div>
    {open&&<div className="active-city-filter-panel">
      <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search active IPS city…" autoFocus/>
      <div className="active-city-filter-results">
        {filtered.map(city=><Link key={city.id} href={basePath+'?city='+encodeURIComponent(city.code.toLowerCase())}>
          <strong>{city.name}</strong><span>{(city.province_abbr?city.province_abbr+' · ':'')+(city.region??'')}</span>
        </Link>)}
        {!filtered.length&&<div className="city-search-state">No active IPS city found.</div>}
      </div>
    </div>}
  </div>;
}
