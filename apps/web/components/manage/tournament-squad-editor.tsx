'use client';

import {useMemo,useState,useTransition} from 'react';
import {
  lockTournamentSquadInline,
  saveTournamentSquadSelection,
  submitTournamentSquadInline
} from '@/app/manage/tournaments/actions';

type Candidate={
  id:string;
  displayName:string;
  ipsCode:string;
  role:string|null;
};

export function TournamentSquadEditor({
  tournamentId,
  teamId,
  teamName,
  shortName,
  maxSize,
  candidates,
  initialSelectedIds,
  initialStatus,
  canManage,
  canLock,
  locked
}:{
  tournamentId:string;
  teamId:string;
  teamName:string;
  shortName:string;
  maxSize:number|null;
  candidates:Candidate[];
  initialSelectedIds:string[];
  initialStatus:string;
  canManage:boolean;
  canLock:boolean;
  locked:boolean;
}){
  const [selected,setSelected]=useState<string[]>(initialSelectedIds);
  const [savedSelected,setSavedSelected]=useState<string[]>(initialSelectedIds);
  const [status,setStatus]=useState(initialStatus||'NOT_STARTED');
  const [query,setQuery]=useState('');
  const [message,setMessage]=useState<{kind:'ok'|'error';text:string}|null>(null);
  const [pending,startTransition]=useTransition();

  const effectiveLocked=locked||status==='LOCKED';
  const limit=maxSize&&maxSize>0?maxSize:candidates.length;
  const dirty=useMemo(()=>{
    const a=[...selected].sort().join(',');
    const b=[...savedSelected].sort().join(',');
    return a!==b;
  },[selected,savedSelected]);

  const visible=useMemo(()=>{
    const q=query.trim().toLowerCase();
    if(!q)return candidates;
    return candidates.filter(player=>
      player.displayName.toLowerCase().includes(q)||
      player.ipsCode.toLowerCase().includes(q)||
      String(player.role??'').toLowerCase().includes(q)
    );
  },[candidates,query]);

  function toggle(id:string){
    if(!canManage||effectiveLocked||pending)return;
    setMessage(null);
    setSelected(current=>{
      if(current.includes(id))return current.filter(value=>value!==id);
      if(current.length>=limit)return current;
      return [...current,id];
    });
  }

  function selectVisible(){
    if(!canManage||effectiveLocked||pending)return;
    setMessage(null);
    setSelected(current=>{
      const next=[...current];
      for(const player of visible){
        if(next.length>=limit)break;
        if(!next.includes(player.id))next.push(player.id);
      }
      return next;
    });
  }

  function clearAll(){
    if(!canManage||effectiveLocked||pending)return;
    setMessage(null);
    setSelected([]);
  }

  function save(){
    if(!canManage||effectiveLocked||pending)return;
    startTransition(async()=>{
      setMessage(null);
      const result=await saveTournamentSquadSelection({
        tournamentId,
        teamId,
        playerIds:selected
      });
      if(result.ok){
        setSavedSelected([...selected]);
        setStatus(result.status||'DRAFT');
        setMessage({kind:'ok',text:`${result.count??selected.length} player${(result.count??selected.length)===1?'':'s'} saved. No page refresh needed.`});
      }else{
        setMessage({kind:'error',text:result.error??'Could not save squad.'});
      }
    });
  }

  function submit(){
    if(pending||dirty||effectiveLocked)return;
    startTransition(async()=>{
      setMessage(null);
      const result=await submitTournamentSquadInline({tournamentId,teamId});
      if(result.ok){
        setStatus(result.status||'SUBMITTED');
        setMessage({kind:'ok',text:'Squad submitted.'});
      }else setMessage({kind:'error',text:result.error??'Could not submit squad.'});
    });
  }

  function lock(){
    if(pending||dirty||effectiveLocked||!canLock)return;
    startTransition(async()=>{
      setMessage(null);
      const result=await lockTournamentSquadInline({tournamentId,teamId});
      if(result.ok){
        setStatus('LOCKED');
        setMessage({kind:'ok',text:'Squad locked.'});
      }else setMessage({kind:'error',text:result.error??'Could not lock squad.'});
    });
  }

  return <article className="squad-card squad-card-modern">
    <header>
      <div><span>{shortName}</span><h3>{teamName}</h3></div>
      <b className={'ops-status '+(effectiveLocked?'locked':status.toLowerCase())}>{effectiveLocked?'LOCKED':status.replaceAll('_',' ')}</b>
    </header>

    <div className="squad-modern-toolbar">
      <div className="squad-count">
        <strong>{selected.length}</strong>
        <span>{maxSize?'/ '+maxSize:'selected'}</span>
      </div>
      <input
        value={query}
        onChange={event=>setQuery(event.target.value)}
        placeholder="Search player or IPS ID…"
        disabled={effectiveLocked}
      />
      {canManage&&!effectiveLocked&&<div className="squad-bulk-buttons">
        <button type="button" onClick={selectVisible}>Select visible</button>
        <button type="button" onClick={clearAll}>Clear</button>
      </div>}
    </div>

    <div className="squad-player-picker">
      {visible.map(player=>{
        const checked=selected.includes(player.id);
        const disabled=!checked&&selected.length>=limit;
        return <button
          type="button"
          key={player.id}
          className={checked?'selected':''}
          onClick={()=>toggle(player.id)}
          disabled={!canManage||effectiveLocked||pending||disabled}
        >
          <span className="squad-pick-mark">{checked?'✓':'+'}</span>
          <span className="squad-pick-copy">
            <strong>{player.displayName}</strong>
            <small>{player.ipsCode}{player.role?' · '+player.role:''}</small>
          </span>
        </button>;
      })}
      {!visible.length&&<div className="squad-picker-empty">No players match this search.</div>}
    </div>

    <footer className="squad-modern-footer">
      <div>
        {dirty?<span className="squad-unsaved">UNSAVED CHANGES</span>:<span className="squad-saved">SAVED</span>}
        <small>{effectiveLocked?'This squad is locked.':maxSize?`Select up to ${maxSize} registered team players.`:'Select registered team players.'}</small>
      </div>

      {canManage&&!effectiveLocked&&<div className="squad-modern-actions">
        <button type="button" className="button-primary" onClick={save} disabled={!dirty||pending}>
          {pending?'Saving…':dirty?'Save squad changes':'Saved'}
        </button>
        {status==='DRAFT'&&<button type="button" onClick={submit} disabled={dirty||pending||!selected.length}>Submit squad</button>}
        {canLock&&status!=='LOCKED'&&<button type="button" className="dark" onClick={lock} disabled={dirty||pending||!selected.length}>Lock</button>}
      </div>}
    </footer>

    {message&&<div className={'playing-sides-message '+message.kind}>{message.text}</div>}
  </article>;
}
