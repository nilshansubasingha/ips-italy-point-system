'use client';

import {useMemo,useState,useTransition} from 'react';
import {createQuickMatchPlayerInline,createQuickMatchTeamInline} from '@/app/manage/tournaments/actions';

type City={id:string;name:string};
type Team={
  id:string;
  name:string;
  shortName:string|null;
  cityId:string;
  cityName:string|null;
  memberCount:number;
};

function SideTools({
  label,
  teamId,
  teams,
  onPlayerCreated
}:{
  label:string;
  teamId:string;
  teams:Team[];
  onPlayerCreated:(teamId:string)=>void;
}){
  const [open,setOpen]=useState(false);
  const [fullName,setFullName]=useState('');
  const [displayName,setDisplayName]=useState('');
  const [role,setRole]=useState('');
  const [dob,setDob]=useState('');
  const [message,setMessage]=useState<{kind:'ok'|'error';text:string}|null>(null);
  const [pending,startTransition]=useTransition();
  const team=teams.find(item=>item.id===teamId);

  function addPlayer(){
    if(!teamId||!fullName.trim())return;
    startTransition(async()=>{
      setMessage(null);
      const result=await createQuickMatchPlayerInline({
        teamId,
        fullName,
        displayName,
        primaryRole:role,
        dateOfBirth:dob
      });
      if(result.ok){
        onPlayerCreated(teamId);
        setMessage({kind:'ok',text:`${result.player?.displayName??fullName} saved to IPS and added to ${team?.name??label}.`});
        setFullName('');setDisplayName('');setRole('');setDob('');
      }else{
        setMessage({kind:'error',text:result.error??'Could not create player.'});
      }
    });
  }

  return <div className="quick-inline-side-tools">
    <button type="button" onClick={()=>setOpen(value=>!value)} disabled={!teamId}>
      {open?'Close player entry':'+ Add new player'}
    </button>
    {team&&<span>{team.memberCount} active player{team.memberCount===1?'':'s'}</span>}
    {open&&teamId&&<div className="quick-inline-player-form">
      <div className="form-split">
        <label><span>Full legal name *</span><input value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="Dinesh Fernando"/></label>
        <label><span>Display name</span><input value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="D. Fernando"/></label>
      </div>
      <div className="form-split">
        <label><span>Date of birth</span><input type="date" value={dob} onChange={e=>setDob(e.target.value)}/></label>
        <label><span>Role</span><select value={role} onChange={e=>setRole(e.target.value)}>
          <option value="">Player</option><option>Batter</option><option>Bowler</option><option>All-rounder</option><option>Wicketkeeper</option><option>Wicketkeeper-batter</option>
        </select></label>
      </div>
      <button type="button" className="button-primary" onClick={addPlayer} disabled={pending||!fullName.trim()}>{pending?'Saving…':'Save player to IPS'}</button>
      {message&&<div className={'quick-inline-message '+message.kind}>{message.text}</div>}
    </div>}
  </div>;
}

export function QuickMatchParticipantsBuilder({
  cities,
  initialTeams
}:{
  cities:City[];
  initialTeams:Team[];
}){
  const [teams,setTeams]=useState<Team[]>(initialTeams);
  const [cityId,setCityId]=useState(cities[0]?.id??'');
  const [homeId,setHomeId]=useState('');
  const [awayId,setAwayId]=useState('');
  const [newTeamOpen,setNewTeamOpen]=useState(false);
  const [newTeamName,setNewTeamName]=useState('');
  const [newTeamShort,setNewTeamShort]=useState('');
  const [message,setMessage]=useState<{kind:'ok'|'error';text:string}|null>(null);
  const [pending,startTransition]=useTransition();

  const cityTeams=useMemo(()=>teams.filter(team=>team.cityId===cityId),[teams,cityId]);

  function createTeam(){
    if(!cityId||!newTeamName.trim())return;
    startTransition(async()=>{
      setMessage(null);
      const result=await createQuickMatchTeamInline({cityId,name:newTeamName,shortName:newTeamShort});
      if(result.ok&&result.team){
        setTeams(current=>[...current,result.team!].sort((a,b)=>a.name.localeCompare(b.name)));
        if(!homeId)setHomeId(result.team.id);
        else if(!awayId)setAwayId(result.team.id);
        setNewTeamName('');setNewTeamShort('');setNewTeamOpen(false);
        setMessage({kind:'ok',text:`${result.team.name} saved permanently to IPS and is ready for this Quick Match.`});
      }else{
        setMessage({kind:'error',text:result.error??'Could not create team.'});
      }
    });
  }

  function incrementTeam(teamId:string){
    setTeams(current=>current.map(team=>team.id===teamId?{...team,memberCount:team.memberCount+1}:team));
  }

  function changeCity(value:string){
    setCityId(value);
    setHomeId('');
    setAwayId('');
    setMessage(null);
  }

  return <section className="quick-match-card quick-participants-builder">
    <div className="quick-match-card-head">
      <span className="eyebrow">01 · MATCH</span>
      <strong>Who is playing?</strong>
    </div>

    <div className="quick-match-grid three">
      <label>
        <span>Registered city</span>
        <select name="city_id" required value={cityId} onChange={e=>changeCity(e.target.value)}>
          {cities.map(city=><option value={city.id} key={city.id}>{city.name}</option>)}
        </select>
      </label>
      <label>
        <span>Team A</span>
        <select name="home_team_id" required value={homeId} onChange={e=>setHomeId(e.target.value)}>
          <option value="">Select team</option>
          {cityTeams.map(team=><option value={team.id} key={team.id}>{team.name} · {team.memberCount} players</option>)}
        </select>
      </label>
      <label>
        <span>Team B</span>
        <select name="away_team_id" required value={awayId} onChange={e=>setAwayId(e.target.value)}>
          <option value="">Select team</option>
          {cityTeams.map(team=><option value={team.id} key={team.id} disabled={team.id===homeId}>{team.name} · {team.memberCount} players</option>)}
        </select>
      </label>
    </div>

    <div className="quick-inline-actions-row">
      <button type="button" onClick={()=>setNewTeamOpen(value=>!value)}>{newTeamOpen?'Cancel new team':'+ Create new team'}</button>
      <span>New teams and players are saved immediately to the permanent IPS database.</span>
    </div>

    {newTeamOpen&&<div className="quick-inline-team-form">
      <div className="form-split">
        <label><span>Team name *</span><input value={newTeamName} onChange={e=>setNewTeamName(e.target.value)} placeholder="Napoli Lions"/></label>
        <label><span>Short name</span><input value={newTeamShort} onChange={e=>setNewTeamShort(e.target.value)} placeholder="NPL"/></label>
      </div>
      <button type="button" className="button-primary" onClick={createTeam} disabled={pending||!newTeamName.trim()}>{pending?'Creating…':'Create & save team'}</button>
    </div>}

    <div className="quick-inline-player-grid">
      <div>
        <span className="eyebrow">TEAM A PLAYERS</span>
        <SideTools label="Team A" teamId={homeId} teams={teams} onPlayerCreated={incrementTeam}/>
      </div>
      <div>
        <span className="eyebrow">TEAM B PLAYERS</span>
        <SideTools label="Team B" teamId={awayId} teams={teams} onPlayerCreated={incrementTeam}/>
      </div>
    </div>

    {homeId&&awayId&&homeId===awayId&&<div className="quick-inline-message error">Choose two different teams.</div>}
    {message&&<div className={'quick-inline-message '+message.kind}>{message.text}</div>}
  </section>;
}
