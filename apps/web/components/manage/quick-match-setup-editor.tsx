'use client';

import {useMemo,useState,useTransition} from 'react';
import {createQuickMatchRosterPlayerInline,saveQuickMatchSetup} from '@/app/manage/tournaments/actions';

type Player={id:string;displayName:string;ipsCode:string};
type Side={
  teamId:string;
  teamName:string;
  shortName:string;
  roster:Player[];
  selectedIds:string[];
  captainId:string|null;
  keeperId:string|null;
};

function InlineRosterAdd({
  matchId,
  teamId,
  teamName,
  onCreated
}:{
  matchId:string;
  teamId:string;
  teamName:string;
  onCreated:(player:Player)=>void;
}){
  const [open,setOpen]=useState(false);
  const [fullName,setFullName]=useState('');
  const [displayName,setDisplayName]=useState('');
  const [dob,setDob]=useState('');
  const [role,setRole]=useState('');
  const [message,setMessage]=useState<{kind:'ok'|'error';text:string}|null>(null);
  const [pending,startTransition]=useTransition();

  function save(){
    if(!fullName.trim())return;
    startTransition(async()=>{
      setMessage(null);
      const result=await createQuickMatchRosterPlayerInline({
        matchId,
        teamId,
        fullName,
        displayName,
        dateOfBirth:dob,
        primaryRole:role
      });
      if(result.ok&&result.player){
        onCreated({id:result.player.id,displayName:result.player.displayName,ipsCode:result.player.ipsCode});
        setMessage({kind:'ok',text:`${result.player.displayName} saved permanently to IPS and added to ${teamName}.`});
        setFullName('');setDisplayName('');setDob('');setRole('');
      }else{
        setMessage({kind:'error',text:result.error??'Could not create player.'});
      }
    });
  }

  return <div className="quick-roster-inline-add">
    <button type="button" onClick={()=>setOpen(value=>!value)}>{open?'Close':'+ New player'}</button>
    {open&&<div className="quick-roster-inline-form">
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
      <button type="button" className="button-primary" onClick={save} disabled={pending||!fullName.trim()}>{pending?'Saving…':'Save to IPS roster'}</button>
      {message&&<div className={'quick-inline-message '+message.kind}>{message.text}</div>}
    </div>}
  </div>;
}

function PlayerPool({
  side,
  roster,
  selected,
  required,
  matchId,
  onToggle,
  onPlayerCreated
}:{
  side:Side;
  roster:Player[];
  selected:string[];
  required:number;
  matchId:string;
  onToggle:(id:string,checked:boolean)=>void;
  onPlayerCreated:(player:Player)=>void;
}){
  const full=selected.length>=required;
  return <section className="quick-side-card">
    <header>
      <div><span>{side.shortName}</span><h3>{side.teamName}</h3></div>
      <b className={selected.length===required?'ready':'waiting'}>{selected.length}/{required}</b>
    </header>

    <InlineRosterAdd matchId={matchId} teamId={side.teamId} teamName={side.teamName} onCreated={onPlayerCreated}/>

    <div className="quick-player-pool">
      {roster.map(player=>{
        const checked=selected.includes(player.id);
        return <label className={checked?'selected':''} key={player.id}>
          <input type="checkbox" checked={checked} disabled={!checked&&full} onChange={event=>onToggle(player.id,event.target.checked)}/>
          <span className="quick-player-avatar">{player.displayName.slice(0,1).toUpperCase()}</span>
          <span className="quick-player-copy"><strong>{player.displayName}</strong><small>{player.ipsCode}</small></span>
          <b>{checked?'✓':'+'}</b>
        </label>;
      })}
    </div>
  </section>;
}

export function QuickMatchSetupEditor({
  tournamentId,
  matchId,
  required,
  controllerUrl,
  home,
  away
}:{
  tournamentId:string;
  matchId:string;
  required:number;
  controllerUrl:string;
  home:Side;
  away:Side;
}){
  const [pending,startTransition]=useTransition();
  const [homeRoster,setHomeRoster]=useState<Player[]>(home.roster);
  const [awayRoster,setAwayRoster]=useState<Player[]>(away.roster);
  const [homeIds,setHomeIds]=useState<string[]>(home.selectedIds);
  const [awayIds,setAwayIds]=useState<string[]>(away.selectedIds);
  const [homeCaptain,setHomeCaptain]=useState(home.captainId??home.selectedIds[0]??'');
  const [homeKeeper,setHomeKeeper]=useState(home.keeperId??home.selectedIds[0]??'');
  const [awayCaptain,setAwayCaptain]=useState(away.captainId??away.selectedIds[0]??'');
  const [awayKeeper,setAwayKeeper]=useState(away.keeperId??away.selectedIds[0]??'');
  const [message,setMessage]=useState<{kind:'ok'|'error';text:string}|null>(null);

  const ready=homeIds.length===required&&awayIds.length===required
    &&homeCaptain&&homeKeeper&&awayCaptain&&awayKeeper
    &&homeIds.includes(homeCaptain)&&homeIds.includes(homeKeeper)
    &&awayIds.includes(awayCaptain)&&awayIds.includes(awayKeeper);

  const homeSelected=useMemo(()=>homeRoster.filter(p=>homeIds.includes(p.id)),[homeRoster,homeIds]);
  const awaySelected=useMemo(()=>awayRoster.filter(p=>awayIds.includes(p.id)),[awayRoster,awayIds]);

  function toggle(which:'home'|'away',id:string,checked:boolean){
    const set=which==='home'?setHomeIds:setAwayIds;
    set(current=>{
      if(checked){
        if(current.includes(id)||current.length>=required)return current;
        return [...current,id];
      }
      return current.filter(x=>x!==id);
    });
    setMessage(null);
  }

  function addRosterPlayer(which:'home'|'away',player:Player){
    const setRoster=which==='home'?setHomeRoster:setAwayRoster;
    setRoster(current=>current.some(item=>item.id===player.id)?current:[...current,player].sort((a,b)=>a.displayName.localeCompare(b.displayName)));
    setMessage({kind:'ok',text:`${player.displayName} is now available in the Quick Match player pool.`});
  }

  function saveAndOpen(){
    if(!ready)return;
    startTransition(async()=>{
      const result=await saveQuickMatchSetup({
        tournamentId,
        matchId,
        homePlayerIds:homeIds,
        awayPlayerIds:awayIds,
        homeCaptainId:homeCaptain,
        homeWicketkeeperId:homeKeeper,
        awayCaptainId:awayCaptain,
        awayWicketkeeperId:awayKeeper
      });
      if(result.ok){
        setMessage({kind:'ok',text:'Quick Match ready. Opening Controller…'});
        window.location.href=controllerUrl;
      }else{
        setMessage({kind:'error',text:result.error??'Could not prepare Quick Match.'});
      }
    });
  }

  return <div className="quick-match-editor">
    <div className="quick-match-editor-head">
      <div><span className="eyebrow">ONE STEP</span><h2>Pick players. Set roles. Score.</h2><p>Select exactly {required} players per side. Missing player? Create them here—the new IPS identity and team membership are saved immediately without a page reload.</p></div>
      <div className="quick-match-progress"><span>HOME <b>{homeIds.length}/{required}</b></span><span>AWAY <b>{awayIds.length}/{required}</b></span></div>
    </div>

    <div className="quick-side-grid">
      <PlayerPool side={home} roster={homeRoster} selected={homeIds} required={required} matchId={matchId} onToggle={(id,checked)=>toggle('home',id,checked)} onPlayerCreated={player=>addRosterPlayer('home',player)}/>
      <PlayerPool side={away} roster={awayRoster} selected={awayIds} required={required} matchId={matchId} onToggle={(id,checked)=>toggle('away',id,checked)} onPlayerCreated={player=>addRosterPlayer('away',player)}/>
    </div>

    <section className="quick-role-grid">
      <div>
        <span className="eyebrow">{home.shortName} · ROLES</span>
        <div className="quick-role-controls">
          <label><span>Captain</span><select value={homeCaptain} onChange={e=>setHomeCaptain(e.target.value)} disabled={!homeSelected.length}><option value="">Select</option>{homeSelected.map(p=><option value={p.id} key={p.id}>{p.displayName}</option>)}</select></label>
          <label><span>Wicketkeeper</span><select value={homeKeeper} onChange={e=>setHomeKeeper(e.target.value)} disabled={!homeSelected.length}><option value="">Select</option>{homeSelected.map(p=><option value={p.id} key={p.id}>{p.displayName}</option>)}</select></label>
        </div>
      </div>
      <div>
        <span className="eyebrow">{away.shortName} · ROLES</span>
        <div className="quick-role-controls">
          <label><span>Captain</span><select value={awayCaptain} onChange={e=>setAwayCaptain(e.target.value)} disabled={!awaySelected.length}><option value="">Select</option>{awaySelected.map(p=><option value={p.id} key={p.id}>{p.displayName}</option>)}</select></label>
          <label><span>Wicketkeeper</span><select value={awayKeeper} onChange={e=>setAwayKeeper(e.target.value)} disabled={!awaySelected.length}><option value="">Select</option>{awaySelected.map(p=><option value={p.id} key={p.id}>{p.displayName}</option>)}</select></label>
        </div>
      </div>
    </section>

    <div className="quick-match-launchbar">
      <div>
        <span>{ready?'READY TO SCORE':'SETUP REQUIRED'}</span>
        <strong>{ready?'Both playing sides and roles are ready.':'Complete both sides and roles to open the Controller.'}</strong>
      </div>
      <button type="button" onClick={saveAndOpen} disabled={!ready||pending}>{pending?'Preparing…':'Save & Open Controller →'}</button>
    </div>

    {message&&<div className={'playing-sides-message '+message.kind}>{message.text}</div>}
  </div>;
}
