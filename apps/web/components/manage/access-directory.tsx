'use client';

import {useMemo,useState} from 'react';
import {revokeRoleGrant} from '@/app/manage/roles/actions';

export type AccessDirectoryGrant={
  id:string;
  user_id:string;
  display_name:string;
  email:string|null;
  role:string;
  scope_type:string;
  note:string|null;
  scope_label:string;
  can_revoke:boolean;
  scope_city_id:string|null;
  scope_city_name:string|null;
};

export type AccessDirectoryCity={
  id:string;
  name:string;
  province_abbr:string|null;
};

function groupFor(grant:AccessDirectoryGrant){
  if(grant.role==='OWNER'&&grant.scope_type==='GLOBAL')return 'owner';
  if(grant.role==='ADMIN'&&grant.scope_type==='GLOBAL')return 'admins';
  if(grant.role==='ADMIN'&&grant.scope_type==='CITY')return 'city';
  if(grant.role==='ADMIN'&&(grant.scope_type==='CLUB'||grant.scope_type==='TEAM'))return 'team';
  if(grant.role==='PLAYER')return 'players';
  return 'operations';
}

function roleLabel(grant:AccessDirectoryGrant){
  if(grant.role==='OWNER')return 'OWNER';
  if(grant.role==='ADMIN'&&grant.scope_type==='GLOBAL')return 'GLOBAL ADMIN';
  if(grant.role==='ADMIN'&&grant.scope_type==='CITY')return 'CITY ADMIN';
  if(grant.role==='ADMIN'&&grant.scope_type==='CLUB')return 'TEAM ADMIN';
  if(grant.role==='ADMIN'&&grant.scope_type==='TEAM')return 'SIDE ADMIN';
  return grant.role;
}

function AccessGroup({
  title,
  note,
  grants,
  cities=[],
  cityFilter=false,
  protectLastOwner=false
}:{
  title:string;
  note:string;
  grants:AccessDirectoryGrant[];
  cities?:AccessDirectoryCity[];
  cityFilter?:boolean;
  protectLastOwner?:boolean;
}){
  const [cityId,setCityId]=useState('');

  const availableCities=useMemo(()=>{
    const ids=new Set(grants.map(grant=>grant.scope_city_id).filter((id):id is string=>!!id));
    return cities.filter(city=>ids.has(city.id));
  },[grants,cities]);

  const hasUnassigned=grants.some(grant=>!grant.scope_city_id);

  const visibleGrants=useMemo(()=>{
    if(!cityFilter||!cityId)return grants;
    if(cityId==='__none__')return grants.filter(grant=>!grant.scope_city_id);
    return grants.filter(grant=>grant.scope_city_id===cityId);
  },[grants,cityFilter,cityId]);

  return <section className="access-directory-group">
    <header>
      <div className="access-group-heading">
        <span>{title.toUpperCase()}</span>
        <strong>{title}</strong>
        <small>{note}</small>
      </div>

      <div className="access-group-controls">
        {cityFilter&&<label className="access-group-city-filter">
          <span>City</span>
          <select value={cityId} onChange={event=>setCityId(event.target.value)}>
            <option value="">All cities</option>
            {availableCities.map(city=><option key={city.id} value={city.id}>
              {city.name+(city.province_abbr?' · '+city.province_abbr:'')}
            </option>)}
            {hasUnassigned&&<option value="__none__">No city assigned</option>}
          </select>
        </label>}
        <b title={cityId?visibleGrants.length+' filtered from '+grants.length:grants.length+' active grants'}>
          {visibleGrants.length}
        </b>
      </div>
    </header>

    <div className="access-directory-list">
      {visibleGrants.map(grant=>{
        const protectedOwner=protectLastOwner&&grants.length<=1;
        return <article key={grant.id}>
          <div className="access-directory-person">
            <span className="access-directory-avatar">{grant.display_name.slice(0,2).toUpperCase()}</span>
            <div>
              <strong>{grant.display_name}</strong>
              <small>{grant.email??'No email on profile'}</small>
            </div>
          </div>

          <div className="access-directory-scope">
            <span>{roleLabel(grant)}</span>
            <b>{grant.scope_label}</b>
            {grant.scope_city_name&&grant.scope_type!=='CITY'&&<small>{grant.scope_city_name}</small>}
            {grant.note&&<small>{grant.note}</small>}
          </div>

          {grant.can_revoke&&!protectedOwner
            ?<form action={revokeRoleGrant}><input type="hidden" name="id" value={grant.id}/><button>Revoke</button></form>
            :<em>{protectedOwner?'Protected':'View only'}</em>}
        </article>;
      })}

      {!visibleGrants.length&&<div className="access-directory-empty">
        {cityId?'No active access grants for this city.':'No active access grants in this level.'}
      </div>}
    </div>
  </section>;
}

export function AccessDirectory({
  grants,
  cities
}:{
  grants:AccessDirectoryGrant[];
  cities:AccessDirectoryCity[];
}){
  const grouped=useMemo(()=>({
    owner:grants.filter(g=>groupFor(g)==='owner'),
    admins:grants.filter(g=>groupFor(g)==='admins'),
    city:grants.filter(g=>groupFor(g)==='city'),
    team:grants.filter(g=>groupFor(g)==='team'),
    players:grants.filter(g=>groupFor(g)==='players'),
    operations:grants.filter(g=>groupFor(g)==='operations')
  }),[grants]);

  return <div className="access-directory-stack">
    <AccessGroup
      title="Owner"
      note="National ownership and final authority."
      grants={grouped.owner}
      protectLastOwner
    />
    <AccessGroup
      title="Global Admins"
      note="National administration below Owner level."
      grants={grouped.admins}
    />
    <AccessGroup
      title="City Admins"
      note="Administration restricted to one City."
      grants={grouped.city}
      cities={cities}
      cityFilter
    />
    <AccessGroup
      title="Team Admins"
      note="Administration restricted to one Team or competitive side."
      grants={grouped.team}
      cities={cities}
      cityFilter
    />
    <AccessGroup
      title="Players"
      note="Account access tied to a permanent IPS player identity."
      grants={grouped.players}
      cities={cities}
      cityFilter
    />
    {!!grouped.operations.length&&<AccessGroup
      title="Operations"
      note="Existing scorer, leader and tournament-level operational access."
      grants={grouped.operations}
      cities={cities}
      cityFilter
    />}
  </div>;
}
