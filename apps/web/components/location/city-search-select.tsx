'use client';

import {useEffect,useMemo,useState} from 'react';

export type CitySearchOption={
  id:string;
  code:string;
  name:string;
  region?:string|null;
  province_name?:string|null;
  province_abbr?:string|null;
  istat_code?:string|null;
};

export function CitySearchSelect({
  name,
  value='',
  onChange,
  required=false,
  label='City',
  placeholder='Search municipality…',
  allowedCities,
  initialCity,
  className=''
}:{
  name:string;
  value?:string;
  onChange?:(id:string,city:CitySearchOption|null)=>void;
  required?:boolean;
  label?:string;
  placeholder?:string;
  allowedCities?:CitySearchOption[];
  initialCity?:CitySearchOption|null;
  className?:string;
}){
  const [selected,setSelected]=useState<CitySearchOption|null>(()=>{
    return allowedCities?.find(c=>c.id===value)??(initialCity?.id===value?initialCity:null);
  });
  const [query,setQuery]=useState(selected?.name??'');
  const [results,setResults]=useState<CitySearchOption[]>([]);
  const [open,setOpen]=useState(false);
  const [loading,setLoading]=useState(false);

  useEffect(()=>{
    if(!value){
      if(selected){setSelected(null);setQuery('');}
      return;
    }
    if(selected?.id===value)return;
    const local=allowedCities?.find(c=>c.id===value)??(initialCity?.id===value?initialCity:null);
    if(local){setSelected(local);setQuery(local.name);}
  },[value,allowedCities,initialCity,selected]);

  const localResults=useMemo(()=>{
    if(!allowedCities)return [];
    const q=query.trim().toLocaleLowerCase('it');
    if(q.length<1)return allowedCities.slice(0,12);
    return allowedCities.filter(c=>
      c.name.toLocaleLowerCase('it').includes(q)
      || (c.province_name??'').toLocaleLowerCase('it').includes(q)
      || (c.province_abbr??'').toLocaleLowerCase('it').startsWith(q)
      || (c.region??'').toLocaleLowerCase('it').includes(q)
    ).slice(0,12);
  },[allowedCities,query]);

  useEffect(()=>{
    if(allowedCities){setResults(localResults);return;}
    const q=query.trim();
    if(selected&&q===selected.name){setResults([]);return;}
    if(q.length<2){setResults([]);return;}
    const controller=new AbortController();
    const timer=window.setTimeout(async()=>{
      setLoading(true);
      try{
        const res=await fetch('/api/locations/cities?q='+encodeURIComponent(q)+'&limit=12',{signal:controller.signal});
        const json=await res.json();
        setResults(Array.isArray(json.cities)?json.cities:[]);
      }catch(err:any){
        if(err?.name!=='AbortError')setResults([]);
      }finally{setLoading(false);}
    },180);
    return ()=>{window.clearTimeout(timer);controller.abort();};
  },[query,allowedCities,selected,localResults]);

  function choose(city:CitySearchOption){
    setSelected(city);
    setQuery(city.name);
    setOpen(false);
    setResults([]);
    onChange?.(city.id,city);
  }
  function edit(text:string){
    setQuery(text);
    setOpen(true);
    if(selected){
      setSelected(null);
      onChange?.('',null);
    }
  }

  const cityClass='city-search-field '+className;
  return <div className={cityClass}>
    <label>
      <span>{label}{required?' *':''}</span>
      <div className={'city-search-control '+(open?'open':'')}>
        <input
          type="text"
          value={query}
          onChange={e=>edit(e.target.value)}
          onFocus={()=>setOpen(true)}
          placeholder={placeholder}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
        />
        {selected?<button type="button" className="city-clear" aria-label="Clear city" onClick={()=>{setSelected(null);setQuery('');setOpen(false);onChange?.('',null)}}>×</button>:<span className="city-search-icon">⌕</span>}
      </div>
      <input type="hidden" name={name} value={selected?.id??''} required={required}/>
    </label>
    {open&&<div className="city-search-results" role="listbox">
      {loading&&<div className="city-search-state">Searching Italy…</div>}
      {!loading&&query.trim().length<(allowedCities?1:2)&&<div className="city-search-state">{allowedCities?'Start typing a city.':'Type at least 2 characters.'}</div>}
      {!loading&&results.map(city=><button type="button" key={city.id} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(city)}>
        <strong>{city.name}</strong>
        <span>{(city.province_abbr?city.province_abbr+' · ':'')+(city.province_name??'')+(city.region?(city.province_name?' · ':'')+city.region:'')}</span>
      </button>)}
      {!loading&&query.trim().length>=(allowedCities?1:2)&&!results.length&&<div className="city-search-state">No Italian municipality found.</div>}
    </div>}
  </div>;
}
