'use client';

import {useEffect,useMemo,useState} from 'react';
import {CitySearchSelect} from '@/components/location/city-search-select';
import {createRoleGrant} from '@/app/manage/roles/actions';

type TeamIdentity={id:string;name:string;city_id:string};
type CompetitiveSide={id:string;name:string;club_id:string;side_label:string|null};
type ScopeOption={id:string;label:string};

type AccountResult={
  id:string;
  display_name:string;
  full_name:string|null;
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

export function RoleGrantForm({
  clubs,
  teams,
  tournaments,
  matches,
  players
}:{
  clubs:TeamIdentity[];
  teams:CompetitiveSide[];
  tournaments:ScopeOption[];
  matches:ScopeOption[];
  players:ScopeOption[];
}){
  const [query,setQuery]=useState('');
  const [filterCity,setFilterCity]=useState('');
  const [filterClub,setFilterClub]=useState('');
  const [filterTeam,setFilterTeam]=useState('');
  const [linkedOnly,setLinkedOnly]=useState(false);
  const [results,setResults]=useState<AccountResult[]>([]);
  const [selected,setSelected]=useState<AccountResult|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [open,setOpen]=useState(false);

  const teamIdentities=useMemo(
    ()=>clubs.filter(club=>!filterCity||club.city_id===filterCity),
    [clubs,filterCity]
  );
  const sides=useMemo(
    ()=>teams.filter(side=>(!filterClub||side.club_id===filterClub)&&(!filterCity||clubs.find(club=>club.id===side.club_id)?.city_id===filterCity)),
    [teams,clubs,filterClub,filterCity]
  );

  useEffect(()=>{
    if(filterClub&&!teamIdentities.some(club=>club.id===filterClub)){
      setFilterClub('');
      setFilterTeam('');
    }
  },[filterClub,teamIdentities]);

  useEffect(()=>{
    if(filterTeam&&!sides.some(side=>side.id===filterTeam))setFilterTeam('');
  },[filterTeam,sides]);

  useEffect(()=>{
    const trimmed=query.trim();
    const canSearch=trimmed.length>=2||!!filterCity||!!filterClub||!!filterTeam||linkedOnly;
    if(!canSearch){
      setResults([]);
      setError('');
      setLoading(false);
      return;
    }

    const controller=new AbortController();
    const timer=window.setTimeout(async()=>{
      setLoading(true);
      setError('');
      try{
        const params=new URLSearchParams();
        if(trimmed.length>=2)params.set('q',trimmed);
        if(filterCity)params.set('city_id',filterCity);
        if(filterClub)params.set('club_id',filterClub);
        if(filterTeam)params.set('team_id',filterTeam);
        if(linkedOnly)params.set('linked_only','1');
        params.set('limit','16');

        const response=await fetch('/api/manage/accounts/search?'+params.toString(),{
          signal:controller.signal,
          cache:'no-store'
        });
        const json=await response.json();
        if(!response.ok)throw new Error(json.error||'Could not search accounts.');
        setResults(Array.isArray(json.accounts)?json.accounts:[]);
      }catch(err:any){
        if(err?.name!=='AbortError'){
          setResults([]);
          setError(String(err?.message??'Could not search accounts.'));
        }
      }finally{
        if(!controller.signal.aborted)setLoading(false);
      }
    },240);

    return ()=>{window.clearTimeout(timer);controller.abort();};
  },[query,filterCity,filterClub,filterTeam,linkedOnly]);

  function clearFilters(){
    setFilterCity('');
    setFilterClub('');
    setFilterTeam('');
    setLinkedOnly(false);
    setQuery('');
    setResults([]);
    setOpen(false);
  }

  return <form action={createRoleGrant} className="role-grant-form">
    <input type="hidden" name="user_id" value={selected?.id??''}/>

    <section className="access-account-search">
      <div className="access-search-head">
        <div>
          <span>FIND ACCOUNT</span>
          <strong>Search registered people</strong>
        </div>
        {(query||filterCity||filterClub||filterTeam||linkedOnly)&&<button type="button" onClick={clearFilters}>Reset</button>}
      </div>

      <label className="access-search-query">
        <span>Search</span>
        <div className="access-search-input">
          <input
            value={query}
            onChange={event=>{setQuery(event.target.value);setOpen(true)}}
            onFocus={()=>setOpen(true)}
            placeholder="Name, email, phone, IPS ID or Team…"
            autoComplete="off"
          />
          <i>{loading?'•••':'⌕'}</i>
        </div>
      </label>

      <div className="access-filter-grid">
        <CitySearchSelect
          name="filter_city_id"
          label="Filter city"
          value={filterCity}
          onChange={(id)=>{setFilterCity(id);setFilterClub('');setFilterTeam('');setOpen(true)}}
          placeholder="Any municipality…"
        />
        <label>
          <span>Team</span>
          <select value={filterClub} onChange={event=>{setFilterClub(event.target.value);setFilterTeam('');setOpen(true)}}>
            <option value="">All Teams</option>
            {teamIdentities.map(club=><option key={club.id} value={club.id}>{teamName(club.name)}</option>)}
          </select>
        </label>
        <label>
          <span>Competitive side</span>
          <select value={filterTeam} onChange={event=>{setFilterTeam(event.target.value);setOpen(true)}}>
            <option value="">All sides</option>
            {sides.map(side=><option key={side.id} value={side.id}>{side.name}</option>)}
          </select>
        </label>
        <label className="access-linked-toggle">
          <input type="checkbox" checked={linkedOnly} onChange={event=>{setLinkedOnly(event.target.checked);setOpen(true)}}/>
          <span><b>Linked IPS players only</b><small>Hide accounts without an official player identity.</small></span>
        </label>
      </div>

      {open&&<div className="access-search-results">
        {loading&&<div className="access-search-state">Searching registered accounts…</div>}
        {!loading&&error&&<div className="access-search-state error">{error}</div>}
        {!loading&&!error&&query.trim().length<2&&!filterCity&&!filterClub&&!filterTeam&&!linkedOnly&&<div className="access-search-state">Type at least 2 characters or choose a filter.</div>}
        {!loading&&!error&&results.map(account=><button type="button" key={account.id} className="access-account-result" onClick={()=>{setSelected(account);setOpen(false)}}>
          <div className="access-result-avatar">{account.display_name.slice(0,2).toUpperCase()}</div>
          <div className="access-result-main">
            <strong>{account.display_name}</strong>
            <span>{account.email??'No email on profile'}</span>
            <small>
              {account.linked_player
                ? `${account.linked_player.display_name} · ${account.linked_player.ips_code}`
                : 'Account not linked to an IPS player'}
            </small>
          </div>
          <div className="access-result-context">
            <b>{account.city?.name??'City not set'}</b>
            <span>{account.team?.name??'No current Team'}</span>
            <small>{account.side?.name??'No competitive side'}</small>
          </div>
          <i>SELECT</i>
        </button>)}
        {!loading&&!error&&(query.trim().length>=2||filterCity||filterClub||filterTeam||linkedOnly)&&!results.length&&<div className="access-search-state">No matching registered account found.</div>}
      </div>}
    </section>

    <section className={'selected-access-account '+(selected?'ready':'empty')}>
      {selected?<>
        <div className="selected-access-avatar">{selected.display_name.slice(0,2).toUpperCase()}</div>
        <div>
          <span>SELECTED ACCOUNT</span>
          <strong>{selected.display_name}</strong>
          <small>{selected.email??'No email'}{selected.linked_player?` · ${selected.linked_player.ips_code}`:''}</small>
          <em>{[selected.city?.name,selected.team?.name,selected.side?.name].filter(Boolean).join(' · ')||'No cricket assignment yet'}</em>
        </div>
        <button type="button" onClick={()=>{setSelected(null);setOpen(true)}}>Change</button>
      </>:<>
        <div className="selected-access-avatar">?</div>
        <div><span>ACCOUNT</span><strong>No account selected</strong><small>Search above and select the correct person first.</small></div>
      </>}
    </section>

    <div className="form-split">
      <label><span>Role</span><select name="role"><option>ADMIN</option><option>LEADER</option><option>SCORER</option><option>PLAYER</option><option>OWNER</option></select></label>
      <label><span>Scope type</span><select name="scope_type"><option value="GLOBAL">GLOBAL</option><option value="CITY">CITY</option><option value="CLUB">TEAM · ALL SIDES</option><option value="TEAM">COMPETITIVE SIDE ONLY</option><option value="TOURNAMENT">TOURNAMENT</option><option value="MATCH">MATCH</option><option value="PLAYER">PLAYER</option></select></label>
    </div>

    <details className="scope-selectors">
      <summary>Select the matching scope record</summary>
      <CitySearchSelect name="city_id" label="Scope city"/>
      <label><span>Team identity (all sides)</span><select name="club_id"><option value="">—</option>{clubs.map(x=><option key={x.id} value={x.id}>{teamName(x.name)}</option>)}</select></label>
      <label><span>Competitive side</span><select name="team_id"><option value="">—</option>{teams.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      <label><span>Tournament</span><select name="tournament_id"><option value="">—</option>{tournaments.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
      <label><span>Match</span><select name="match_id"><option value="">—</option>{matches.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
      <label><span>Player</span><select name="player_id"><option value="">—</option>{players.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
    </details>

    <label><span>Note</span><input name="note" placeholder="Why this access was granted"/></label>
    <button className="button-primary access-grant-submit" disabled={!selected}>Grant role</button>
  </form>;
}
