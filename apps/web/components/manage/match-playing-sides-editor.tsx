'use client';

import {useEffect,useMemo,useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {saveMatchPlayingSides,setMatchTeamRoles} from '@/app/manage/tournaments/actions';

type PlayerOption={
  id:string;
  displayName:string;
  ipsCode:string;
};

export type MatchSideEditorData={
  teamId:string;
  teamName:string;
  shortName:string;
  roster:PlayerOption[];
  selectedIds:string[];
  captainId:string|null;
  captainName:string|null;
  keeperId:string|null;
  keeperName:string|null;
  canManage:boolean;
  locked:boolean;
};

function sameIds(a:string[],b:string[]){
  return a.length===b.length&&a.every((id,index)=>id===b[index]);
}

function SideCard({
  side,
  selected,
  required,
  onToggle,
  returnTo
}:{
  side:MatchSideEditorData;
  selected:string[];
  required:number;
  onToggle:(id:string,checked:boolean)=>void;
  returnTo:string;
}){
  const savedReady=side.selectedIds.length===required&&!!side.captainId&&!!side.keeperId;
  const full=selected.length>=required;

  return <div className="lineup-side">
    <div className="lineup-head">
      <div><span>{side.shortName||'TEAM'}</span><h3>{side.teamName}</h3></div>
      <b className={savedReady?'ready':'waiting'}>{savedReady?'CONTROLLER READY':'SETUP REQUIRED'}</b>
    </div>

    <div className="lineup-metrics">
      <span>Squad <b>{side.roster.length}</b></span>
      <span>Side <b>{selected.length}/{required||'—'}</b></span>
      <span>Captain <b>{side.captainName??'—'}</b></span>
      <span>Keeper <b>{side.keeperName??'—'}</b></span>
    </div>

    {side.canManage&&side.locked?<>
      <div className="xi-selector xi-selector-live">
        <div className="xi-check-list">
          {side.roster.map(player=>{
            const checked=selected.includes(player.id);
            return <label key={player.id}>
              <input
                type="checkbox"
                checked={checked}
                disabled={!checked&&full}
                onChange={event=>onToggle(player.id,event.target.checked)}
              />
              <span><strong>{player.displayName}</strong><small>{player.ipsCode}</small></span>
            </label>;
          })}
        </div>
        <small className="xi-live-note">{selected.length===required?required+' selected — ready to save.':'Select exactly '+required+' players.'}</small>
      </div>

      {side.selectedIds.length===required&&<form action={setMatchTeamRoles} className="role-selector">
        <input type="hidden" name="match_id" value={returnTo.split('::')[0]}/>
        <input type="hidden" name="team_id" value={side.teamId}/>
        <input type="hidden" name="return_to" value={returnTo.split('::')[1]}/>
        <label><span>Captain</span><select name="captain_id" defaultValue={side.captainId??side.selectedIds[0]}>
          {side.selectedIds.map(id=>{const player=side.roster.find(item=>item.id===id);return <option key={id} value={id}>{player?.displayName??'Player'}</option>})}
        </select></label>
        <label><span>Wicketkeeper</span><select name="wicketkeeper_id" defaultValue={side.keeperId??side.selectedIds[0]}>
          {side.selectedIds.map(id=>{const player=side.roster.find(item=>item.id===id);return <option key={id} value={id}>{player?.displayName??'Player'}</option>})}
        </select></label>
        <button>Save roles</button>
      </form>}
    </>:<div className="lineup-blocked">
      <strong>{!side.locked?'Lock the tournament squad first.':'Read-only lineup.'}</strong>
      <p>{!side.locked?'IPS refuses to import an editable/unofficial squad into the Controller.':'Your current role cannot change this team.'}</p>
    </div>}
  </div>;
}

export function MatchPlayingSidesEditor({
  tournamentId,
  matchId,
  required,
  returnPath,
  home,
  away
}:{
  tournamentId:string;
  matchId:string;
  required:number;
  returnPath:string;
  home:MatchSideEditorData;
  away:MatchSideEditorData;
}){
  const router=useRouter();
  const [pending,startTransition]=useTransition();
  const [homeIds,setHomeIds]=useState<string[]>(home.selectedIds);
  const [awayIds,setAwayIds]=useState<string[]>(away.selectedIds);
  const [message,setMessage]=useState<{kind:'ok'|'error';text:string}|null>(null);

  useEffect(()=>{if(!sameIds(homeIds,home.selectedIds))setHomeIds(home.selectedIds)},[home.selectedIds.join('|')]);
  useEffect(()=>{if(!sameIds(awayIds,away.selectedIds))setAwayIds(away.selectedIds)},[away.selectedIds.join('|')]);

  const homeEditable=home.canManage&&home.locked;
  const awayEditable=away.canManage&&away.locked;
  const editableCount=Number(homeEditable)+Number(awayEditable);
  const valid=(!homeEditable||homeIds.length===required)&&(!awayEditable||awayIds.length===required)&&editableCount>0;
  const dirty=useMemo(
    ()=>!sameIds(homeIds,home.selectedIds)||!sameIds(awayIds,away.selectedIds),
    [homeIds,awayIds,home.selectedIds,away.selectedIds]
  );

  function toggle(which:'home'|'away',id:string,checked:boolean){
    const set=which==='home'?setHomeIds:setAwayIds;
    set(current=>{
      if(checked){
        if(current.includes(id)||current.length>=required)return current;
        return [...current,id];
      }
      return current.filter(value=>value!==id);
    });
    setMessage(null);
  }

  function save(){
    if(!valid)return;
    startTransition(async()=>{
      const result=await saveMatchPlayingSides({
        tournamentId,
        matchId,
        homePlayerIds:homeEditable?homeIds:null,
        awayPlayerIds:awayEditable?awayIds:null
      });
      if(result.ok){
        setMessage({kind:'ok',text:result.message??'Playing sides saved.'});
        router.refresh();
      }else{
        setMessage({kind:'error',text:result.error??'Could not save playing sides.'});
      }
    });
  }

  const roleReturn=matchId+'::'+returnPath+'#lineups';

  return <div className="match-playing-sides-editor">
    <div className="lineup-side-grid">
      <SideCard side={home} selected={homeIds} required={required} onToggle={(id,checked)=>toggle('home',id,checked)} returnTo={roleReturn}/>
      <SideCard side={away} selected={awayIds} required={required} onToggle={(id,checked)=>toggle('away',id,checked)} returnTo={roleReturn}/>
    </div>

    {(homeEditable||awayEditable)&&<div className="playing-sides-savebar">
      <div>
        <span>{editableCount===2?'BOTH TEAMS':'PLAYING SIDE'}</span>
        <strong>{editableCount===2?'Select both teams, then save once.':'Select the playing side, then save once.'}</strong>
        <small>{required} players required per editable side. Saving does not reload or jump to the top.</small>
      </div>
      <button type="button" onClick={save} disabled={!valid||pending||!dirty}>
        {pending?'Saving…':editableCount===2?'Save both playing sides':'Save playing side'}
      </button>
    </div>}

    {message&&<div className={'playing-sides-message '+message.kind}>{message.text}</div>}
  </div>;
}
