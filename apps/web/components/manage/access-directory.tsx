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
  protectLastOwner=false
}:{
  title:string;
  note:string;
  grants:AccessDirectoryGrant[];
  protectLastOwner?:boolean;
}){
  return <section className="access-directory-group">
    <header>
      <div><span>{title.toUpperCase()}</span><strong>{title}</strong><small>{note}</small></div>
      <b>{grants.length}</b>
    </header>

    <div className="access-directory-list">
      {grants.map(grant=>{
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

      {!grants.length&&<div className="access-directory-empty">No active access grants in this level.</div>}
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
  const [cityId,setCityId]=useState('');

  const grouped=useMemo(()=>{
    const keep=(grant:AccessDirectoryGrant)=>{
      const group=groupFor(grant);
      if(!cityId)return true;
      if(group==='owner'||group==='admins')return true;
      return grant.scope_city_id===cityId;
    };

    const filtered=grants.filter(keep);
    return {
      owner:filtered.filter(g=>groupFor(g)==='owner'),
      admins:filtered.filter(g=>groupFor(g)==='admins'),
      city:filtered.filter(g=>groupFor(g)==='city'),
      team:filtered.filter(g=>groupFor(g)==='team'),
      players:filtered.filter(g=>groupFor(g)==='players'),
      operations:filtered.filter(g=>groupFor(g)==='operations')
    };
  },[grants,cityId]);

  const selectedCity=cities.find(city=>city.id===cityId)??null;

  return <div className="access-directory-stack">
    <AccessGroup title="Owner" note="National ownership and final authority." grants={grouped.owner} protectLastOwner/>
    <AccessGroup title="Global Admins" note="National administration below Owner level." grants={grouped.admins}/>

    <div className="access-directory-toolbar">
      <div>
        <span>FILTER CITY-SCOPED ACCESS</span>
        <strong>{selectedCity?selectedCity.name:'All registered cities'}</strong>
        <small>Filters City Admins, Team Admins, Players and other city-scoped roles below.</small>
      </div>
      <label>
        <span>City</span>
        <select value={cityId} onChange={event=>setCityId(event.target.value)}>
          <option value="">All cities</option>
          {cities.map(city=><option key={city.id} value={city.id}>
            {city.name+(city.province_abbr?' · '+city.province_abbr:'')}
          </option>)}
        </select>
      </label>
    </div>

    <AccessGroup title="City Admins" note="Administration restricted to one City." grants={grouped.city}/>
    <AccessGroup title="Team Admins" note="Administration restricted to one Team or competitive side." grants={grouped.team}/>
    <AccessGroup title="Players" note="Account access tied to a permanent IPS player identity." grants={grouped.players}/>
    {!!grouped.operations.length&&<AccessGroup title="Operations" note="Existing scorer, leader and tournament-level operational access." grants={grouped.operations}/>}
  </div>;
}
