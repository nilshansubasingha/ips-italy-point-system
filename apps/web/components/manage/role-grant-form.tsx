'use client';

import {useEffect,useMemo,useState} from 'react';
import {createRoleGrant} from '@/app/manage/roles/actions';
import type {RoleManagementTier} from '@/lib/auth';

type TeamIdentity={id:string;name:string;city_id:string};
type RegisteredCity={id:string;name:string;province_abbr:string|null;region:string|null};
type AccessLevel='OWNER'|'GLOBAL_ADMIN'|'CITY_ADMIN'|'TEAM_ADMIN'|'PLAYER';

type AccountResult={
  id:string;
  display_name:string;
  email:string|null;
  status:string;
  linked_player:{id:string;display_name:string;ips_code:string;primary_role:string|null}|null;
  city:{id:string;name:string;province_abbr:string|null;region:string|null}|null;
  team:{id:string;name:string}|null;
  side:{id:string;name:string;side_label:string|null}|null;
};

function teamName(name:string){
  return name.replace(/\s+Cricket Club$/i,'');
}

function initialLevel(tier:RoleManagementTier):AccessLevel{
  if(tier==='OWNER')return 'GLOBAL_ADMIN';
  if(tier==='GLOBAL_ADMIN')return 'CITY_ADMIN';
  if(tier==='CITY_ADMIN')return 'TEAM_ADMIN';
  return 'PLAYER';
}

function allowedLevels(tier:RoleManagementTier):AccessLevel[]{
  if(tier==='OWNER')return ['OWNER','GLOBAL_ADMIN','CITY_ADMIN','TEAM_ADMIN','PLAYER'];
  if(tier==='GLOBAL_ADMIN')return ['CITY_ADMIN','TEAM_ADMIN','PLAYER'];
  if(tier==='CITY_ADMIN')return ['TEAM_ADMIN','PLAYER'];
  return ['PLAYER'];
}

const labels:Record<AccessLevel,{title:string;note:string}>={
  OWNER:{title:'Owner',note:'Full national ownership access.'},
  GLOBAL_ADMIN:{title:'Global Admin',note:'National administration below Owner level.'},
  CITY_ADMIN:{title:'City Admin',note:'Manages access and operations inside one registered city.'},
  TEAM_ADMIN:{title:'Team Admin',note:'Manages one Team identity and all of its competitive sides.'},
  PLAYER:{title:'Player',note:'Links account access to the selected official IPS player identity.'}
};

export function RoleGrantForm({
  actorTier,
  registeredCities,
  clubs,
  controllerUrl
}:{
  actorTier:RoleManagementTier;
  registeredCities:RegisteredCity[];
  clubs:TeamIdentity[];
  controllerUrl:string;
}){
  const levels=useMemo(()=>allowedLevels(actorTier),[actorTier]);
  const [accessLevel,setAccessLevel]=useState<AccessLevel>(initialLevel(actorTier));
  const [query,setQuery]=useState('');
  const [selectedCity,setSelectedCity]=useState<RegisteredCity|null>(null);
  const [results,setResults]=useState<AccountResult[]>([]);
  const [cityResults,setCityResults]=useState<RegisteredCity[]>([]);
  const [selected,setSelected]=useState<AccountResult|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [open,setOpen]=useState(false);
  const [scopeCityId,setScopeCityId]=useState('');
  const [scopeClubId,setScopeClubId]=useState('');

  useEffect(()=>{
    if(!levels.includes(accessLevel))setAccessLevel(levels[0]??'PLAYER');
  },[accessLevel,levels]);

  useEffect(()=>{
    if(!open)return;
    const controller=new AbortController();
    const timer=window.setTimeout(async()=>{
      setLoading(true);
      setError('');
      try{
        const params=new URLSearchParams();
        const trimmed=query.trim();
        if(trimmed)params.set('q',trimmed);
        if(selectedCity)params.set('city_id',selectedCity.id);
        params.set('limit','16');

        const response=await fetch('/api/manage/accounts/search?'+params.toString(),{
          signal:controller.signal,
          cache:'no-store'
        });
        const json=await response.json();
        if(!response.ok)throw new Error(json.error||'Could not search accounts.');
        setResults(Array.isArray(json.accounts)?json.accounts:[]);
        setCityResults(Array.isArray(json.cities)?json.cities:[]);
      }catch(err:any){
        if(err?.name!=='AbortError'){
          setResults([]);
          setCityResults([]);
          setError(String(err?.message??'Could not search accounts.'));
        }
      }finally{
        if(!controller.signal.aborted)setLoading(false);
      }
    },180);

    return ()=>{window.clearTimeout(timer);controller.abort();};
  },[open,query,selectedCity]);

  function resetSearch(){
    setQuery('');
    setSelectedCity(null);
    setSelected(null);
    setResults([]);
    setCityResults([]);
    setOpen(false);
  }

  function chooseCity(city:RegisteredCity){
    setSelectedCity(city);
    setQuery(city.name);
    setSelected(null);
    setOpen(true);
  }

  const scopeId=
    accessLevel==='CITY_ADMIN'?scopeCityId:
    accessLevel==='TEAM_ADMIN'?scopeClubId:
    accessLevel==='PLAYER'?(selected?.linked_player?.id??''):
    '';

  const needsScope=accessLevel==='CITY_ADMIN'||accessLevel==='TEAM_ADMIN'||accessLevel==='PLAYER';
  const canSubmit=!!selected&&(!needsScope||!!scopeId);

  return <form action={createRoleGrant} className="role-grant-form">
    <input type="hidden" name="user_id" value={selected?.id??''}/>
    <input type="hidden" name="access_level" value={accessLevel}/>
    <input type="hidden" name="scope_id" value={scopeId}/>

    <section className="access-account-search">
      <div className="access-search-head">
        <div>
          <span>FIND ACCOUNT</span>
          <strong>Search registered people</strong>
        </div>
        {(query||selectedCity||selected)&&<button type="button" onClick={resetSearch}>Reset</button>}
      </div>

      <label className="access-search-query">
        <span>Search</span>
        <div className="access-search-input">
          <input
            value={query}
            onChange={event=>{
              const value=event.target.value;
              setQuery(value);
              if(selectedCity&&value!==selectedCity.name)setSelectedCity(null);
              setOpen(true);
            }}
            onFocus={()=>setOpen(true)}
            placeholder="Name, email, phone, IPS ID, Team or City…"
            autoComplete="off"
          />
          <i>{loading?'•••':'⌕'}</i>
        </div>

        {selectedCity&&<div className="selected-city-chip">
          <span>City</span>
          <b>{selectedCity.name+(selectedCity.province_abbr?' · '+selectedCity.province_abbr:'')}</b>
          <button type="button" onClick={()=>{setSelectedCity(null);setQuery('');setOpen(true)}} aria-label="Clear selected city">×</button>
        </div>}

        {open&&<div className="access-search-results">
          {loading&&<div className="access-search-state">Searching IPS accounts…</div>}
          {!loading&&error&&<div className="access-search-state error">{error}</div>}

          {!loading&&!error&&cityResults.length>0&&<>
            <div className="access-dropdown-label">REGISTERED CITIES</div>
            <div className="access-city-results">
              {cityResults.map(city=><button type="button" key={city.id} className="access-city-result" onClick={()=>chooseCity(city)}>
                <span className="access-city-pin">⌖</span>
                <div><strong>{city.name}</strong><small>{[city.province_abbr,city.region].filter(Boolean).join(' · ')}</small></div>
                <i>SELECT CITY</i>
              </button>)}
            </div>
          </>}

          {!loading&&!error&&<>
            <div className="access-dropdown-label">REGISTERED PEOPLE</div>
            {results.map(account=><button type="button" key={account.id} className="access-account-result" onClick={()=>{setSelected(account);setOpen(false)}}>
              <div className="access-result-avatar">{account.display_name.slice(0,2).toUpperCase()}</div>
              <div className="access-result-main">
                <strong>{account.display_name}</strong>
                <span>{account.email??'No email on profile'}</span>
                <small>{account.linked_player?account.linked_player.display_name+' · '+account.linked_player.ips_code:'Account not linked to an IPS player'}</small>
              </div>
              <div className="access-result-context">
                <b>{account.city?.name??'City not set'}</b>
                <span>{account.team?.name??'No current Team'}</span>
                <small>{account.side?.name??'No competitive side'}</small>
              </div>
              <i>SELECT</i>
            </button>)}
            {!results.length&&<div className="access-search-state">No matching registered account found.</div>}
          </>}
        </div>}
      </label>
    </section>

    <section className={'selected-access-account '+(selected?'ready':'empty')}>
      {selected?<>
        <div className="selected-access-avatar">{selected.display_name.slice(0,2).toUpperCase()}</div>
        <div>
          <span>SELECTED ACCOUNT</span>
          <strong>{selected.display_name}</strong>
          <small>{(selected.email??'No email')+(selected.linked_player?' · '+selected.linked_player.ips_code:'')}</small>
          <em>{[selected.city?.name,selected.team?.name,selected.side?.name].filter(Boolean).join(' · ')||'No cricket assignment yet'}</em>
        </div>
        <button type="button" onClick={()=>{setSelected(null);setOpen(true)}}>Change</button>
      </>:<>
        <div className="selected-access-avatar">?</div>
        <div><span>ACCOUNT</span><strong>No account selected</strong><small>Search above and choose the correct registered person.</small></div>
      </>}
    </section>

    <section className="access-level-section">
      <div className="access-section-label"><span>ACCESS LEVEL</span><small>Your own level controls what you can delegate.</small></div>
      <div className="access-level-grid">
        {levels.map(level=><button type="button" key={level} className={accessLevel===level?'active':''} onClick={()=>setAccessLevel(level)}>
          <span className="choice-check">{accessLevel===level?'✓':''}</span>
          <strong>{labels[level].title}</strong>
          <small>{labels[level].note}</small>
        </button>)}
        <div className="controller-access-tile">
          <div>
            <span>MATCH CONTROLLER</span>
            <strong>Scoring access is per fixture.</strong>
            <small>Owner and tournament administrators inherit access. Assign normal scorers from Tournament → Officials.</small>
          </div>
          <div className="controller-access-tile-actions">
            <a href={controllerUrl} target="_blank" rel="noreferrer">Open Controller ↗</a>
            <a href="/manage/tournaments">Fixtures & scorers →</a>
          </div>
        </div>
      </div>
    </section>

    {accessLevel==='CITY_ADMIN'&&<label>
      <span>Registered city</span>
      <select value={scopeCityId} onChange={event=>setScopeCityId(event.target.value)}>
        <option value="">Choose a registered city…</option>
        {registeredCities.map(city=><option key={city.id} value={city.id}>{city.name+(city.province_abbr?' · '+city.province_abbr:'')}</option>)}
      </select>
    </label>}

    {accessLevel==='TEAM_ADMIN'&&<label>
      <span>Team</span>
      <select value={scopeClubId} onChange={event=>setScopeClubId(event.target.value)}>
        <option value="">Choose a Team…</option>
        {clubs.map(club=><option key={club.id} value={club.id}>{teamName(club.name)}</option>)}
      </select>
    </label>}

    {accessLevel==='PLAYER'&&<div className={'access-auto-scope '+(selected?.linked_player?'ready':'warning')}>
      <span>PLAYER IDENTITY</span>
      {selected?.linked_player?<><strong>{selected.linked_player.display_name}</strong><small>{selected.linked_player.ips_code+' · Player access will be tied to this permanent identity.'}</small></>:<><strong>Official player identity required</strong><small>This account must be linked to an IPS player before Player access can be granted.</small></>}
    </div>}

    <label><span>Note</span><input name="note" placeholder="Why this access was granted"/></label>
    <button className="button-primary access-grant-submit" disabled={!canSubmit}>Grant access</button>
  </form>;
}
