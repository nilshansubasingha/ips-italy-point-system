'use client';

import {useMemo,useState,useTransition} from 'react';
import {saveQuickMatchSetup} from '@/app/manage/tournaments/actions';

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

function PlayerPool({
  side,
  selected,
  required,
  onToggle
}:{
  side:Side;
  selected:string[];
  required:number;
  onToggle:(id:string,checked:boolean)=>void;
}){
  const full=selected.length>=required;
  return <section className="quick-side-card">
    <header>
      <div><span>{side.shortName}</span><h3>{side.teamName}</h3></div>
      <b className={selected.length===required?'ready':'waiting'}>{selected.length}/{required}</b>
    </header>
    <div className="quick-player-pool">
      {side.roster.map(player=>{
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

  const homeSelected=useMemo(()=>home.roster.filter(p=>homeIds.includes(p.id)),[home.roster,homeIds]);
  const awaySelected=useMemo(()=>away.roster.filter(p=>awayIds.includes(p.id)),[away.roster,awayIds]);

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
      <div><span className="eyebrow">ONE STEP</span><h2>Pick players. Set roles. Score.</h2><p>The full registered team pool is already prepared by IPS. Select exactly {required} players for each side.</p></div>
      <div className="quick-match-progress"><span>HOME <b>{homeIds.length}/{required}</b></span><span>AWAY <b>{awayIds.length}/{required}</b></span></div>
    </div>

    <div className="quick-side-grid">
      <PlayerPool side={home} selected={homeIds} required={required} onToggle={(id,checked)=>toggle('home',id,checked)}/>
      <PlayerPool side={away} selected={awayIds} required={required} onToggle={(id,checked)=>toggle('away',id,checked)}/>
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
