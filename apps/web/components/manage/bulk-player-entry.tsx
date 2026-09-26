'use client';

import {useMemo,useState} from 'react';
import {addRequestedTeamMembersBulk} from '@/app/registration/actions';
import {addExistingPlayersBulk,createPlayersForTeamBulk} from '@/app/manage/registry/actions';
import {PlayerAvatar} from '@/components/identity';

const ROLES=['','Batter','Bowler','All-rounder','Wicketkeeper','Wicketkeeper-batter'];

type Draft={
  key:number;
  full_name:string;
  display_name:string;
  date_of_birth:string;
  primary_role:string;
  side_label:string;
  shirt_number:string;
  email:string;
  phone:string;
};

let nextKey=1000;
function blank(side='MAIN'):Draft{
  return {key:nextKey++,full_name:'',display_name:'',date_of_birth:'',primary_role:'',side_label:side,shirt_number:'',email:'',phone:''};
}
function usable(rows:Draft[]){
  return rows.filter(row=>row.full_name.trim()||row.display_name.trim());
}
function parsePaste(text:string,side:string){
  return text.split(/\r?\n/)
    .map(line=>line.trim())
    .filter(Boolean)
    .map(line=>{
      const cols=line.includes('\t')?line.split('\t'):line.split(/\s*;\s*/);
      const row=blank(side);
      row.full_name=(cols[0]??'').trim();
      row.display_name=(cols[1]??'').trim();
      row.date_of_birth=(cols[2]??'').trim();
      row.primary_role=(cols[3]??'').trim();
      row.shirt_number=(cols[4]??'').trim();
      row.email=(cols[5]??'').trim();
      row.phone=(cols[6]??'').trim();
      row.side_label=(cols[7]??side).trim()||side;
      return row;
    });
}

function RowActions({onAdd,onAddFive}:{onAdd:()=>void;onAddFive:()=>void}){
  return <div className="bulk-entry-actions">
    <button type="button" onClick={onAdd}>+ Add row</button>
    <button type="button" onClick={onAddFive}>+ Add 5 rows</button>
  </div>;
}

export function BulkTeamRequestRoster({requestId,structure}:{requestId:string;structure:string}){
  const defaultSide=structure==='SINGLE'?'MAIN':'A';
  const [rows,setRows]=useState<Draft[]>(()=>Array.from({length:5},()=>blank(defaultSide)));
  const [paste,setPaste]=useState('');
  const payload=useMemo(()=>usable(rows).map(({key,...row})=>row),[rows]);

  const sideOptions=structure==='SINGLE'?['MAIN']:structure==='A_B_C'?['A','B','C']:['A','B'];

  function update(key:number,field:keyof Draft,value:string){
    setRows(current=>current.map(row=>row.key===key?{...row,[field]:value}:row));
  }
  function addPaste(){
    const parsed=parsePaste(paste,defaultSide);
    if(!parsed.length)return;
    setRows(current=>{
      const empty=current.every(row=>!row.full_name&&!row.display_name);
      return empty?parsed:[...current,...parsed];
    });
    setPaste('');
  }

  return <div className="bulk-entry-shell">
    <div className="bulk-entry-intro">
      <div><span className="eyebrow">BULK ENTRY</span><h3>Add the whole roster together.</h3><p>Enter several players, or paste names from Excel/Notes. IPS still checks every person separately during approval.</p></div>
      <strong>{payload.length}<span>ready</span></strong>
    </div>

    <div className="bulk-paste-box">
      <textarea value={paste} onChange={e=>setPaste(e.target.value)} rows={3} placeholder={'Paste names — one per line\nOr tab-separated: Full name | Display name | DOB | Role | Shirt | Email | Phone | Side'}/>
      <button type="button" onClick={addPaste} disabled={!paste.trim()}>Import pasted names</button>
    </div>

    <form action={addRequestedTeamMembersBulk}>
      <input type="hidden" name="team_request_id" value={requestId}/>
      <input type="hidden" name="members_json" value={JSON.stringify(payload)}/>
      <div className="bulk-player-table-wrap">
        <div className="bulk-player-table registration-bulk">
          <div className="bulk-player-head">
            <span>#</span><span>Full name *</span><span>Display name</span><span>DOB</span><span>Role</span><span>Side</span><span>Email</span><span>Phone</span><span/>
          </div>
          {rows.map((row,index)=><div className="bulk-player-row" key={row.key}>
            <b>{index+1}</b>
            <input value={row.full_name} onChange={e=>update(row.key,'full_name',e.target.value)} placeholder="Harsha Silva"/>
            <input value={row.display_name} onChange={e=>update(row.key,'display_name',e.target.value)} placeholder="H. Silva"/>
            <input type="date" value={row.date_of_birth} onChange={e=>update(row.key,'date_of_birth',e.target.value)}/>
            <select value={row.primary_role} onChange={e=>update(row.key,'primary_role',e.target.value)}>{ROLES.map(role=><option key={role} value={role}>{role||'Not set'}</option>)}</select>
            <select value={row.side_label} disabled={structure==='SINGLE'} onChange={e=>update(row.key,'side_label',e.target.value)}>{sideOptions.map(side=><option key={side}>{side}</option>)}</select>
            <input type="email" value={row.email} onChange={e=>update(row.key,'email',e.target.value)} placeholder="Optional"/>
            <input value={row.phone} onChange={e=>update(row.key,'phone',e.target.value)} placeholder="+39…"/>
            <button type="button" className="bulk-row-remove" onClick={()=>setRows(current=>current.filter(item=>item.key!==row.key))}>×</button>
          </div>)}
        </div>
      </div>

      <div className="bulk-entry-submitbar">
        <RowActions onAdd={()=>setRows(current=>[...current,blank(defaultSide)])} onAddFive={()=>setRows(current=>[...current,...Array.from({length:5},()=>blank(defaultSide))])}/>
        <button className="button-primary" disabled={!payload.length}>Add {payload.length||''} player{payload.length===1?'':'s'} together →</button>
      </div>
    </form>
  </div>;
}

export function BulkAdminPlayerCreate({teamId,teamRouteKey=teamId}:{teamId:string;teamRouteKey?:string}){
  const [rows,setRows]=useState<Draft[]>(()=>Array.from({length:5},()=>blank()));
  const [paste,setPaste]=useState('');
  const payload=useMemo(()=>usable(rows).map(({key,side_label,...row})=>({
    ...row,
    batting_style:'',
    bowling_style:'',
    whatsapp_consent:false
  })),[rows]);

  function update(key:number,field:keyof Draft,value:string){
    setRows(current=>current.map(row=>row.key===key?{...row,[field]:value}:row));
  }
  function addPaste(){
    const parsed=parsePaste(paste,'MAIN');
    if(!parsed.length)return;
    setRows(current=>{
      const empty=current.every(row=>!row.full_name&&!row.display_name);
      return empty?parsed:[...current,...parsed];
    });
    setPaste('');
  }

  return <div className="bulk-entry-shell admin-bulk-entry">
    <div className="bulk-entry-intro">
      <div><span className="eyebrow">BULK NEW PLAYERS</span><h3>Create several new identities at once.</h3><p>Use this only for genuinely new players. Strong email/phone or full-name + DOB matches are blocked per row, while the other valid rows can continue.</p></div>
      <strong>{payload.length}<span>ready</span></strong>
    </div>

    <div className="bulk-paste-box">
      <textarea value={paste} onChange={e=>setPaste(e.target.value)} rows={3} placeholder={'Paste one name per line\nOr from Excel: Full name | Display name | DOB | Role | Shirt | Email | Phone'}/>
      <button type="button" onClick={addPaste} disabled={!paste.trim()}>Import pasted players</button>
    </div>

    <form action={createPlayersForTeamBulk}>
      <input type="hidden" name="team_id" value={teamId}/>
      <input type="hidden" name="return_to" value={'/manage/teams/'+teamRouteKey+'/players/add'}/>
      <input type="hidden" name="players_json" value={JSON.stringify(payload)}/>

      <div className="bulk-player-table-wrap">
        <div className="bulk-player-table admin-create-bulk">
          <div className="bulk-player-head">
            <span>#</span><span>Full legal name *</span><span>Display name</span><span>DOB</span><span>Role</span><span>Shirt</span><span>Email</span><span>Phone</span><span/>
          </div>
          {rows.map((row,index)=><div className="bulk-player-row" key={row.key}>
            <b>{index+1}</b>
            <input value={row.full_name} onChange={e=>update(row.key,'full_name',e.target.value)} placeholder="Dinesh Fernando"/>
            <input value={row.display_name} onChange={e=>update(row.key,'display_name',e.target.value)} placeholder="D. Fernando"/>
            <input type="date" value={row.date_of_birth} onChange={e=>update(row.key,'date_of_birth',e.target.value)}/>
            <select value={row.primary_role} onChange={e=>update(row.key,'primary_role',e.target.value)}>{ROLES.map(role=><option key={role} value={role}>{role||'Player'}</option>)}</select>
            <input type="number" min="0" max="999" value={row.shirt_number} onChange={e=>update(row.key,'shirt_number',e.target.value)} placeholder="—"/>
            <input type="email" value={row.email} onChange={e=>update(row.key,'email',e.target.value)} placeholder="Optional"/>
            <input value={row.phone} onChange={e=>update(row.key,'phone',e.target.value)} placeholder="+39…"/>
            <button type="button" className="bulk-row-remove" onClick={()=>setRows(current=>current.filter(item=>item.key!==row.key))}>×</button>
          </div>)}
        </div>
      </div>

      <div className="bulk-entry-submitbar">
        <RowActions onAdd={()=>setRows(current=>[...current,blank()])} onAddFive={()=>setRows(current=>[...current,...Array.from({length:5},()=>blank())])}/>
        <button className="button-primary" disabled={!payload.length}>Create & add {payload.length||''} player{payload.length===1?'':'s'} →</button>
      </div>
      <p className="bulk-entry-footnote">Batting/bowling style and other profile details can be refined later from each player's profile.</p>
    </form>
  </div>;
}

type SearchPlayer={
  id:string;
  display_name:string;
  profile_image_url:string|null;
  ips_code:string;
  primary_role:string|null;
  current_team_identity_name:string|null;
  birth_year:number|null;
  matched_by:string;
  is_on_target_team:boolean;
};

export function BulkExistingPlayerRequests({teamId,teamRouteKey=teamId,results}:{teamId:string;teamRouteKey?:string;results:SearchPlayer[]}){
  const [selected,setSelected]=useState<Record<string,boolean>>({});
  const [shirts,setShirts]=useState<Record<string,string>>({});
  const payload=results
    .filter(player=>selected[player.id]&&!player.is_on_target_team)
    .map(player=>({player_id:player.id,shirt_number:shirts[player.id]??''}));

  return <form action={addExistingPlayersBulk} className="bulk-existing-results">
    <input type="hidden" name="team_id" value={teamId}/>
    <input type="hidden" name="return_to" value={'/manage/teams/'+teamRouteKey+'/players/add'}/>
    <input type="hidden" name="players_json" value={JSON.stringify(payload)}/>

    <div className="bulk-existing-toolbar">
      <span><strong>{payload.length}</strong> selected</span>
      <button disabled={!payload.length}>Request selected players →</button>
    </div>

    <div className="search-result-stack">
      {results.map(player=><article className={'player-search-result bulk-select-result '+(selected[player.id]?'selected':'')} key={player.id}>
        <label className="bulk-select-check">
          <input type="checkbox" checked={!!selected[player.id]} disabled={player.is_on_target_team} onChange={e=>setSelected(current=>({...current,[player.id]:e.target.checked}))}/>
          <span>✓</span>
        </label>
        <PlayerAvatar name={player.display_name} imageUrl={player.profile_image_url}/>
        <div>
          <span>{player.matched_by}</span>
          <h3>{player.display_name}</h3>
          <p>{player.ips_code} · {player.primary_role||'Player'}{player.current_team_identity_name?' · '+String(player.current_team_identity_name).replace(/\s+Cricket Club$/i,''):' · Unattached'}{player.birth_year?' · born '+player.birth_year:''}</p>
        </div>
        {player.is_on_target_team
          ?<b className="already-chip">Already on team</b>
          :<input className="bulk-shirt-input" type="number" min="0" max="999" value={shirts[player.id]??''} onChange={e=>setShirts(current=>({...current,[player.id]:e.target.value}))} placeholder="Shirt #"/>}
      </article>)}
    </div>
  </form>;
}
