'use client';

import {useMemo,useState,useTransition} from 'react';
import {broadcastCommandAction} from '@/app/matches/[id]/director/actions';

type Variant={
  key:string;
  name:string;
  scene:string;
  presentation:string;
  duration:number|null;
  direct:boolean;
  group:string;
  priority:number;
};

export function BroadcastDirector({
  matchId,overlayUrl,matchName,variants,initialAutomation
}:{
  matchId:string;
  overlayUrl:string;
  matchName:string;
  variants:Variant[];
  initialAutomation:boolean;
}){
  const [selected,setSelected]=useState(variants.find(v=>v.key==='six.fullscreen')?.key||variants[0]?.key||'');
  const [notice,setNotice]=useState('');
  const [pending,startTransition]=useTransition();
  const [automation,setAutomation]=useState(initialAutomation);
  const selectedMeta=variants.find(v=>v.key===selected);
  const output=useMemo(()=>overlayUrl+'/?match='+encodeURIComponent(matchId),[overlayUrl,matchId]);
  const groups=useMemo(()=>{
    const map=new Map<string,Variant[]>();
    for(const v of variants){
      const key=v.scene.toUpperCase();
      map.set(key,[...(map.get(key)||[]),v]);
    }
    return [...map.entries()];
  },[variants]);

  const command=(payload:Record<string,unknown>,success:string)=>{
    startTransition(async()=>{
      const result=await broadcastCommandAction(matchId,payload);
      setNotice(result.ok?success:result.error);
    });
  };

  const take=()=>command({type:'TAKE',variantKey:selected,payload:{}},(selectedMeta?.name||selected)+' LIVE');
  const preview=()=>command({type:'PREVIEW',variantKey:selected,payload:{}},(selectedMeta?.name||selected)+' prepared in Preview');

  return <main className="broadcast-director-studio">
    <header className="broadcast-director-head">
      <div>
        <span>IPS PRISM · BROADCAST GRAPHICS</span>
        <h1>Director Studio</h1>
        <p>{matchName}</p>
      </div>
      <div className="broadcast-director-head-actions">
        <a href={output} target="_blank" rel="noreferrer">CLEAN OUTPUT ↗</a>
        <button onClick={()=>command({type:'PANIC_ON'},'Clean feed enabled')}>PANIC / CLEAN</button>
      </div>
    </header>

    <section className="broadcast-director-workspace">
      <div className="broadcast-director-preview">
        <div className="broadcast-monitor-label">
          <b>PROGRAM</b>
          <span>{pending?'UPDATING…':'LIVE OUTPUT'}</span>
        </div>
        <iframe src={output} title="IPS PRISM program output"/>
      </div>

      <aside className="broadcast-director-inspector">
        <span className="broadcast-micro">SELECTED GRAPHIC</span>
        <h2>{selectedMeta?.name||'—'}</h2>
        <p>{selectedMeta?.presentation||'—'} · Priority {selectedMeta?.priority??'—'}{selectedMeta?.duration?' · '+(selectedMeta.duration/1000).toFixed(1)+'s':''}</p>

        <div className="broadcast-take-row">
          <button className="preview" onClick={preview}>PREVIEW</button>
          <button className="take" onClick={take}>TAKE LIVE</button>
          <button onClick={()=>command({type:'CLEAR_TEMPORARY'},'Temporary layers cleared')}>HIDE</button>
          <button onClick={()=>command({type:'CLEAR_ALL'},'All graphics cleared')}>CLEAR ALL</button>
        </div>

        <button className="broadcast-restore" onClick={()=>command({type:'RESTORE_PERSISTENT'},'Persistent graphics restored')}>RESTORE SCOREBAR</button>

        <label className="broadcast-toggle">
          <input
            type="checkbox"
            checked={automation}
            onChange={event=>{
              const enabled=event.target.checked;
              setAutomation(enabled);
              command({type:'SET_AUTOMATION',enabled},enabled?'Automation on':'Automation off');
            }}
          />
          AUTOMATION
        </label>

        {notice&&<div className="broadcast-director-notice">{notice}</div>}
      </aside>
    </section>

    <section className="broadcast-trigger-bank">
      {groups.map(([scene,list])=><article className="broadcast-trigger-group" key={scene}>
        <h3>{scene.replaceAll('-',' ')}</h3>
        <div>
          {list.map(variant=><button
            key={variant.key}
            className={selected===variant.key?'selected':''}
            onClick={()=>{
              setSelected(variant.key);
              if(variant.direct)command({type:'TAKE',variantKey:variant.key,payload:{}},variant.name+' LIVE');
            }}
          >
            <b>{variant.presentation}</b>
            <span>{variant.name}</span>
            <small>{variant.direct?'DIRECT TAKE':'PREVIEW → TAKE'}</small>
          </button>)}
        </div>
      </article>)}
    </section>
  </main>;
}
