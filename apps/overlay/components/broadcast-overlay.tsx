'use client';

import {CSSProperties,ReactNode,useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {createBroadcastClient} from '@/lib/supabase';

type J=Record<string,any>;
type Snapshot={match_id:string;session:J;program:J;release:J;data:J;signal:J};
type SponsorBrand={id:string;name:string;logoUrl:string;message:string;placement:string};
type InfoItem={key:string;label:string;value:string;sub?:string;sponsor?:SponsorBrand};
type SponsorExposure={key:string;sponsor:SponsorBrand;scene:string;start:number;end:number|null;duration:number|null;placement:string};

function initials(name?:string|null){
  return String(name||'IPS').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()).join('');
}
function teamName(team:any){return team?.name||team?.short_name||'TEAM';}
function prettyStage(value?:string|null){
  return String(value||'').replaceAll('_',' ').replaceAll('-',' ').trim().replace(/\b\w/g,c=>c.toUpperCase());
}
function Logo({team,className=''}:{team:any;className?:string}){
  return <span className={'tv-logo '+className}>{team?.logo_url?<img src={team.logo_url} alt=""/>:<b>{initials(team?.short_name||team?.name)}</b>}</span>;
}
function PlayerThumb({player}:{player:any}){
  return <span className="tv-player-thumb">{player?.photo_url?<img src={player.photo_url} alt=""/>:<b>{initials(player?.name)}</b>}</span>;
}
function ballClass(label:string){
  if(/^W/.test(label))return 'w';
  if(label==='4')return 'four';
  if(label==='6')return 'six';
  if(/^WD|^NB/.test(label))return 'extra';
  return '';
}
function playerName(data:J,kind:'batter'|'bowler',payload:J){
  if(payload?.playerName||payload?.player_name)return String(payload.playerName||payload.player_name);
  if(kind==='bowler')return data.current?.bowler?.name||'BOWLER';
  return data.current?.striker?.name||'BATTER';
}
function scoreText(data:J){return data.innings?.score_display||String(data.innings?.runs??0)+'/'+String(data.innings?.wickets??0);}
function cssVars(data:J):CSSProperties{
  const home=data.match?.home_team||{},away=data.match?.away_team||{},batting=data.innings?.batting_team||{};
  return {
    '--home':home.primary_color||'#ffffff','--away':away.primary_color||'#dfe5e8',
    '--accent':data.match?.tournament?.primary_color||batting.primary_color||'#22d89a',
    '--accent2':batting.secondary_color||'#14191d'
  } as CSSProperties;
}

function directSponsor(payload:J):SponsorBrand|null{
  const s=payload?.sponsor;
  if(!s||(!s.name&&!s.logo_url&&!s.logoUrl))return null;
  return {id:String(s.id||''),name:String(s.name||'Sponsor'),logoUrl:String(s.logo_url||s.logoUrl||''),message:String(s.message||'SPONSORED BY'),placement:String(s.placement||'auto').toLowerCase()};
}
function playlistSponsors(payload:J):SponsorBrand[]{
  const list=payload?.sponsorPlaylist?.sponsors;
  if(!Array.isArray(list))return [];
  return list.filter(Boolean).map((s:any)=>({id:String(s.id||''),name:String(s.name||'Sponsor'),logoUrl:String(s.logo_url||s.logoUrl||''),message:String(s.message||'SPONSORED BY'),placement:String(payload?.sponsor?.placement||s.placement||'auto').toLowerCase()}));
}
function resolveSponsor(payload:J,startedAt:string|undefined,now:number){
  const list=playlistSponsors(payload);
  if(list.length){
    const interval=Math.max(1000,Number(payload?.sponsorPlaylist?.rotation_interval_ms||10000));
    const start=Date.parse(startedAt||'');
    const elapsed=Number.isFinite(start)?Math.max(0,now-start):now;
    const cycle=Math.floor(elapsed/interval);
    return {sponsor:list[cycle%list.length],cycle,interval};
  }
  return {sponsor:directSponsor(payload),cycle:0,interval:0};
}
function visualPlacement(raw:string,kind:string){
  const p=String(raw||'auto').toLowerCase();
  if(['top-left','top-right','bottom-right','fullscreen','scorebar','lower-third'].includes(p))return p;
  if(p==='auto')return kind==='scorebar'?'scorebar':kind==='fullscreen'?'top-right':'lower-third';
  if(['boundary','six','wicket','over','player-info'].includes(p))return 'lower-third';
  if(['batting-scorecard','bowling-scorecard','match-intro','vs-graphic','playing-xi','result','replay'].includes(p))return kind==='fullscreen'?'top-right':'lower-third';
  return 'lower-third';
}
function SponsorTag({payload,kind,startedAt,now}:{payload:J;kind:string;startedAt?:string;now:number}){
  const {sponsor}=resolveSponsor(payload,startedAt,now);
  if(!sponsor)return null;
  const placement=visualPlacement(sponsor.placement,kind);
  return <aside className={'tv-sponsor-tag place-'+placement}>
    <span>{sponsor.message}</span>
    {sponsor.logoUrl?<img src={sponsor.logoUrl} alt=""/>:<b>{sponsor.name}</b>}
  </aside>;
}

function infoItems(data:J,payload:J,startedAt:string|undefined,now:number):InfoItem[]{
  const inn=data.innings||{},cur=data.current||{},chase=Number(inn.number)===2;
  const items:InfoItem[]=[];
  if(chase){
    if(inn.target!=null)items.push({key:'TARGET',label:'TARGET',value:String(inn.target)});
    if(inn.runs_required!=null&&inn.balls_remaining!=null)items.push({key:'NEED',label:'NEED',value:String(inn.runs_required)+' FROM '+String(inn.balls_remaining),sub:'RUNS · BALLS'});
    if(inn.rrr!=null)items.push({key:'RRR',label:'RRR',value:Number(inn.rrr||0).toFixed(2)});
    items.push({key:'CRR',label:'CRR',value:Number(inn.crr||0).toFixed(2)});
  }else{
    items.push({key:'CRR',label:'CRR',value:Number(inn.crr||0).toFixed(2)});
    items.push({key:'OVERS',label:'OVERS',value:String(inn.overs||'0.0')});
  }
  const p=cur.partnership||{};
  if(Number(p.balls||0)>0)items.push({key:'PARTNERSHIP',label:'PARTNERSHIP',value:String(p.runs??0)+' ('+String(p.balls??0)+')'});
  const lw=cur.last_wicket||{};
  if(lw?.name)items.push({key:'LAST_WICKET',label:'LAST WICKET',value:String(lw.name),sub:String(lw.score_display||'')});
  const cfg=payload?.scorebar||{};
  if(cfg.includeSponsorInRotation){
    const {sponsor}=resolveSponsor(payload,startedAt,now);
    if(sponsor)items.push({key:'SPONSOR',label:sponsor.message,value:sponsor.name,sponsor});
  }
  const selected=Array.isArray(payload?.scorebar?.matchInfo?.items)?payload.scorebar.matchInfo.items.map((x:any)=>String(x).toUpperCase()):[];
  const filtered=items.filter(x=>x.value!==''&&x.value!=='null');
  return selected.length?filtered.filter(x=>selected.includes(x.key)):filtered;
}
function pickInfo(items:InfoItem[],payload:J,startedAt:string|undefined,now:number){
  if(!items.length)return null;
  const cfg=payload?.scorebar?.matchInfo||{};
  const pin=String(cfg.pin||'AUTO').toUpperCase();
  if(pin!=='AUTO'){
    const mapped=pin==='NEED_FROM'?'NEED':pin;
    return items.find(x=>x.key===mapped)||items[0];
  }
  if(cfg.autoRotate===false)return items[0];
  const interval=Math.max(3000,Number(cfg.intervalMs||4000));
  const start=Date.parse(startedAt||'');
  const elapsed=Number.isFinite(start)?Math.max(0,now-start):now;
  return items[Math.floor(elapsed/interval)%items.length];
}

function MatchInfo({data,payload,startedAt,now}:{data:J;payload:J;startedAt?:string;now:number}){
  const items=infoItems(data,payload,startedAt,now);
  const item=pickInfo(items,payload,startedAt,now);
  if(!item)return <div className="tv-match-info"><span>IPS LIVE</span><strong>—</strong></div>;
  return <div className="tv-match-info"><div className="tv-match-info-inner" key={item.key+'-'+item.value}>
    {item.sponsor?.logoUrl?<><span>{item.label}</span><img src={item.sponsor.logoUrl} alt=""/><small>{item.sponsor.name}</small></>:<>
      <span>{item.label}</span><strong>{item.value}</strong>{item.sub&&<small>{item.sub}</small>}
    </>}
  </div></div>;
}

function matchCardItems(data:J){
  const match=data.match||{},home=match.home_team||{},away=match.away_team||{};
  const items:any[]=[{key:'TEAMS',kind:'teams',home,away}];
  if(match.number!=null)items.push({key:'MATCH_NUMBER',kind:'text',label:'MATCH',value:String(match.number).padStart(2,'0')});
  const stage=prettyStage(match.round||match.stage);
  if(stage)items.push({key:'MATCH_STAGE',kind:'text',label:match.round?'ROUND':'STAGE',value:stage});
  return items;
}
function MatchIdentifierCard({data,payload,startedAt,now}:{data:J;payload:J;startedAt?:string;now:number}){
  const cfg=payload?.scorebar?.matchCard||{};
  if(cfg.show===false)return null;
  const items=matchCardItems(data);
  const mode=String(cfg.mode||'AUTO').toUpperCase();
  let item=items[0];
  if(mode!=='AUTO')item=items.find(x=>x.key===mode)||items[0];
  else{
    const interval=Math.max(3000,Number(cfg.intervalMs||5000));
    const start=Date.parse(startedAt||'');
    const elapsed=Number.isFinite(start)?Math.max(0,now-start):now;
    item=items[Math.floor(elapsed/interval)%items.length];
  }
  const placement=String(cfg.placement||'TOP_LEFT').toLowerCase().replace('_','-');
  const logos=cfg.showTeamLogos!==false;
  return <aside className={'tv-match-card '+placement}><div key={item.key+(item.value||'')} className="tv-match-card-inner">
    {item.kind==='teams'?<>
      <div className="tv-match-card-team">{logos&&<Logo team={item.home}/>}<b>{teamName(item.home)}</b></div>
      <i>VS</i>
      <div className="tv-match-card-team away"><b>{teamName(item.away)}</b>{logos&&<Logo team={item.away}/>}</div>
    </>:<><span>{item.label}</span><strong>{item.value}</strong></>}
  </div></aside>;
}

function Scorebar({data,payload,startedAt,now}:{data:J;payload:J;startedAt?:string;now:number}){
  const inn=data.innings||{},cur=data.current||{},batting=inn.batting_team||{};
  const showPhotos=Boolean(payload?.scorebar?.showBatterPhotos);
  const overBalls=(cur.current_over||[]).slice(-8);
  return <>
    <MatchIdentifierCard data={data} payload={payload} startedAt={startedAt} now={now}/>
    <section className="tv-scorebar">
      <div className="tv-scorebar-accent"/>

      <div className="tv-team-block">
        <Logo team={batting} className="tv-team-logo-small"/>
        <div className="tv-team-copy">
          <span className="tv-team-name">{teamName(batting)}</span>
          <div className="tv-team-score-stack">
            <strong className="tv-team-score-big">{scoreText(data)}</strong>
            <small className="tv-team-overs">{inn.overs||'0.0'} OV</small>
          </div>
        </div>
      </div>

      <div className={'tv-batter tv-striker '+(showPhotos?'with-photo':'')}>
        {showPhotos&&<PlayerThumb player={cur.striker}/>}
        <div className="tv-person-copy"><span>STRIKER</span><b>{cur.striker?.name||'—'}</b></div>
        <strong>{cur.striker?.runs??0}<i>{cur.striker?.balls??0} BALLS</i></strong>
      </div>

      <div className={'tv-batter tv-nonstriker '+(showPhotos?'with-photo':'')}>
        {showPhotos&&<PlayerThumb player={cur.non_striker}/>}
        <div className="tv-person-copy"><span>NON-STRIKER</span><b>{cur.non_striker?.name||'—'}</b></div>
        <strong>{cur.non_striker?.runs??0}<i>{cur.non_striker?.balls??0} BALLS</i></strong>
      </div>

      <MatchInfo data={data} payload={payload} startedAt={startedAt} now={now}/>

      <div className="tv-bowler tv-bowler-rearranged">
        <div className="tv-bowler-top">
          <div className="tv-bowler-copy">
            <span>BOWLER</span>
            <b>{cur.bowler?.name||'—'}</b>
            <small>{cur.bowler?.overs||'0.0'} OV</small>
          </div>
          <strong className="tv-bowler-figures">{cur.bowler?.wickets??0}/{cur.bowler?.runs??0}</strong>
        </div>
        <div className="tv-bowler-over">
          <em>THIS OVER</em>
          <div>{overBalls.length?overBalls.map((ball:string,i:number)=><i className={ballClass(ball)} key={i}>{ball==='0'?'•':ball}</i>):<small>—</small>}</div>
          {inn.free_hit&&<b>FREE HIT</b>}
        </div>
      </div>

      {!payload?.scorebar?.includeSponsorInRotation&&<SponsorTag payload={payload} kind="scorebar" startedAt={startedAt} now={now}/>}
    </section>
  </>;
}

function ScorebarEvent({variantKey,data,payload,startedAt,now}:{variantKey:string;data:J;payload:J;startedAt?:string;now:number}){
  const kind=variantKey.split('.')[0],label=kind==='four'?'FOUR':kind==='six'?'SIX':'WICKET',mark=kind==='four'?'4':kind==='six'?'6':'W';
  const person=kind==='wicket'?(payload?.playerName||payload?.player_name||data.last_delivery?.dismissed_player?.name||'WICKET'):playerName(data,'batter',payload);
  return <section className={'tv-scorebar-event kind-'+kind}>
    <div className="tv-scorebar-event-sweep"/><div className="tv-scorebar-event-mark">{mark}</div>
    <div className="tv-scorebar-event-copy"><span>{kind==='wicket'?'DISMISSAL':'BOUNDARY'}</span><strong>{label}</strong><b>{person}</b></div>
    <div className="tv-scorebar-event-score">{scoreText(data)}</div>
    <SponsorTag payload={payload} kind="lower-third" startedAt={startedAt} now={now}/>
  </section>;
}
function EventImpact({variantKey,data,payload,startedAt,now}:{variantKey:string;data:J;payload:J;startedAt?:string;now:number}){
  const kind=variantKey.split('.')[0],label=kind==='four'?'FOUR':kind==='six'?'SIX':kind==='wicket'?'WICKET':kind==='50'?'FIFTY':'CENTURY',mark=kind==='four'?'4':kind==='six'?'6':kind==='wicket'?'W':kind==='50'?'50':'100';
  const person=kind==='wicket'?(payload?.playerName||payload?.player_name||data.last_delivery?.dismissed_player?.name||'WICKET'):playerName(data,'batter',payload);
  return <section className={'tv-impact full kind-'+kind}>
    <div className="tv-impact-beam"/><div className="tv-impact-mark">{mark}</div>
    <div className="tv-impact-copy"><span>{data.match?.tournament?.name||'IPS CRICKET'}</span><strong>{label}</strong><b>{person}</b><small>{scoreText(data)}</small></div>
    <div className="tv-impact-rule"/><SponsorTag payload={payload} kind="fullscreen" startedAt={startedAt} now={now}/>
  </section>;
}
function PlayerFeature({kind,data,payload,startedAt,now}:{kind:'batter'|'bowler';data:J;payload:J;startedAt?:string;now:number}){
  const p=kind==='batter'?(data.current?.striker||{}):(data.current?.bowler||{}),name=playerName(data,kind,payload);
  const primary=kind==='batter'?String(p.runs??0):String(p.wickets??0)+'/'+String(p.runs??0);
  const secondary=kind==='batter'?String(p.balls??0)+' BALLS':String(p.overs||'0.0')+' OV';
  const tertiary=kind==='batter'?'SR '+Number(p.strike_rate||0).toFixed(1):'ECON '+Number(p.economy||0).toFixed(2);
  return <section className={'tv-player-feature '+kind}>
    <div className="tv-player-photo">{p.photo_url?<img src={p.photo_url} alt=""/>:<span>{initials(name)}</span>}</div>
    <div className="tv-player-data"><span>{kind==='batter'?'NEW BATTER':'NEW OVER · BOWLER'}</span><strong>{name}</strong><div><b>{primary}</b><i>{secondary}</i><em>{tertiary}</em></div></div>
    <div className="tv-player-edge">{kind==='batter'?'BAT':'BOWL'}</div>
    <SponsorTag payload={payload} kind="lower-third" startedAt={startedAt} now={now}/>
  </section>;
}
function Versus({data,payload,startedAt,now}:{data:J;payload:J;startedAt?:string;now:number}){
  const home=data.match?.home_team||{},away=data.match?.away_team||{};
  return <section className="tv-fullboard tv-versus"><div className="tv-board-top"><span>IPS BROADCAST</span><b>{data.match?.tournament?.name||'MATCH'}</b></div>
    <div className="tv-versus-grid"><div><Logo team={home}/><strong>{home.name||'HOME'}</strong><span>{home.short_name||''}</span></div><i><small>MATCH</small>VS</i><div><Logo team={away}/><strong>{away.name||'AWAY'}</strong><span>{away.short_name||''}</span></div></div>
    <footer><span>{data.match?.venue||''}</span><b>{data.match?.code||''}</b></footer><SponsorTag payload={payload} kind="fullscreen" startedAt={startedAt} now={now}/>
  </section>;
}
function PlayingXI({side,data,payload,startedAt,now}:{side:'home'|'away';data:J;payload:J;startedAt?:string;now:number}){
  const team=data.match?.[side+'_team']||{},players=data.playing_xi?.[side]||[];
  return <section className="tv-fullboard tv-xi"><div className="tv-board-top"><span>PLAYING XI</span><b>{data.match?.tournament?.name||'IPS CRICKET'}</b></div>
    <header><Logo team={team}/><div><span>{side.toUpperCase()} TEAM</span><strong>{team.name||'TEAM'}</strong></div></header>
    <div className="tv-xi-list">{players.slice(0,11).map((p:any,i:number)=><div key={p.id||i}><i>{String(i+1).padStart(2,'0')}</i><b>{p.name}</b><span>{p.role||''}</span></div>)}</div>
    <footer><span>{data.match?.venue||''}</span><b>{data.match?.code||''}</b></footer><SponsorTag payload={payload} kind="fullscreen" startedAt={startedAt} now={now}/>
  </section>;
}
function Scorecard({type,data,payload,startedAt,now}:{type:'batting'|'bowling';data:J;payload:J;startedAt?:string;now:number}){
  const batting=type==='batting',rows=batting?(data.batting_scorecard||[]):(data.bowling_scorecard||[]),team=batting?data.innings?.batting_team:data.innings?.bowling_team;
  return <section className="tv-fullboard tv-scorecard"><div className="tv-board-top"><span>{batting?'BATTING':'BOWLING'} SCORECARD</span><b>{data.match?.tournament?.name||'IPS CRICKET'}</b></div>
    <div className="tv-scorecard-head"><div><Logo team={team}/><span>{team?.name||'TEAM'}</span></div><strong>{batting?scoreText(data):(data.innings?.overs||'')}</strong></div>
    <div className={'tv-score-table '+(batting?'batting':'bowling')}><div className="tv-score-columns">{batting?<><b>BATTER</b><span>R</span><span>B</span><span>4</span><span>6</span><span>SR</span></>:<><b>BOWLER</b><span>O</span><span>M</span><span>R</span><span>W</span><span>ECON</span></>}</div>
      {rows.slice(0,11).map((r:any,i:number)=><div className="tv-score-row" key={r.player_id||i}><b>{r.name}<small>{batting?r.dismissal:''}</small></b>{batting?<><span>{r.runs}</span><span>{r.balls}</span><span>{r.fours}</span><span>{r.sixes}</span><span>{Number(r.strike_rate||0).toFixed(1)}</span></>:<><span>{r.overs}</span><span>{r.maidens}</span><span>{r.runs}</span><span>{r.wickets}</span><span>{Number(r.economy||0).toFixed(2)}</span></>}</div>)}
    </div><footer><span>{data.match?.venue||''}</span><b>{data.match?.code||''}</b></footer><SponsorTag payload={payload} kind="fullscreen" startedAt={startedAt} now={now}/>
  </section>;
}
function LowerThird({type,data,payload,startedAt,now}:{type:'partnership'|'need';data:J;payload:J;startedAt?:string;now:number}){
  const p=data.current?.partnership||{};
  return type==='partnership'?<section className="tv-lower-info"><span>PARTNERSHIP</span><strong>{p.runs??0}<i>{p.balls??0} BALLS</i></strong><b>{data.current?.striker?.name||'—'} + {data.current?.non_striker?.name||'—'}</b><SponsorTag payload={payload} kind="lower-third" startedAt={startedAt} now={now}/></section>
    :<section className="tv-lower-info chase"><span>CHASE</span><strong>{data.innings?.runs_required??0}<i>RUNS</i></strong><b>NEEDED FROM {data.innings?.balls_remaining??0} BALLS · TARGET {data.innings?.target??'—'} · RRR {Number(data.innings?.rrr||0).toFixed(2)}</b><SponsorTag payload={payload} kind="lower-third" startedAt={startedAt} now={now}/></section>;
}
function SponsorFullscreen({payload,startedAt,now}:{payload:J;startedAt?:string;now:number}){
  const {sponsor}=resolveSponsor(payload,startedAt,now);
  return <section className="tv-sponsor-fullscreen"><div className="tv-sponsor-fullscreen-glow"/><div className="tv-sponsor-fullscreen-content">
    <span>{sponsor?.message||'SPONSORED BY'}</span>
    {sponsor?.logoUrl?<img src={sponsor.logoUrl} alt=""/>:<strong>{sponsor?.name||'SPONSOR'}</strong>}
    {sponsor?.logoUrl&&<b>{sponsor.name}</b>}
  </div></section>;
}
function withSponsor(content:ReactNode,payload:J,kind:string,startedAt:string|undefined,now:number){
  return <>{content}<SponsorTag payload={payload} kind={kind} startedAt={startedAt} now={now}/></>;
}
function BroadcastSkin({variantKey,data,payload,startedAt,now}:{variantKey:string;data:J;payload:J;startedAt?:string;now:number}){
  if(variantKey==='scorebar.default')return <Scorebar data={data} payload={payload} startedAt={startedAt} now={now}/>;
  if(variantKey==='sponsor.fullscreen')return <SponsorFullscreen payload={payload} startedAt={startedAt} now={now}/>;
  if(variantKey==='vs.fullscreen')return <Versus data={data} payload={payload} startedAt={startedAt} now={now}/>;
  if(variantKey==='playing-xi.home')return <PlayingXI side="home" data={data} payload={payload} startedAt={startedAt} now={now}/>;
  if(variantKey==='playing-xi.away')return <PlayingXI side="away" data={data} payload={payload} startedAt={startedAt} now={now}/>;
  if(variantKey==='batter-info.large')return <PlayerFeature kind="batter" data={data} payload={payload} startedAt={startedAt} now={now}/>;
  if(variantKey==='bowler-info.large')return <PlayerFeature kind="bowler" data={data} payload={payload} startedAt={startedAt} now={now}/>;
  if(/^four\.|^six\.|^wicket\./.test(variantKey))return variantKey.includes('lower-third')?<ScorebarEvent variantKey={variantKey} data={data} payload={payload} startedAt={startedAt} now={now}/>:<EventImpact variantKey={variantKey} data={data} payload={payload} startedAt={startedAt} now={now}/>;
  if(/^50\.|^100\./.test(variantKey))return <EventImpact variantKey={variantKey} data={data} payload={payload} startedAt={startedAt} now={now}/>;
  if(variantKey==='batting-scorecard.fullscreen')return <Scorecard type="batting" data={data} payload={payload} startedAt={startedAt} now={now}/>;
  if(variantKey==='bowling-scorecard.fullscreen')return <Scorecard type="bowling" data={data} payload={payload} startedAt={startedAt} now={now}/>;
  if(variantKey==='partnership.lower-third')return <LowerThird type="partnership" data={data} payload={payload} startedAt={startedAt} now={now}/>;
  if(variantKey==='need-from.lower-third')return <LowerThird type="need" data={data} payload={payload} startedAt={startedAt} now={now}/>;
  return withSponsor(<section className="tv-unknown"><span>IPS BROADCAST</span><strong>{variantKey}</strong></section>,payload,'lower-third',startedAt,now);
}

export function BroadcastOverlay({matchId}:{matchId?:string}){
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[error,setError]=useState(''),[now,setNow]=useState(()=>Date.now());
  const exposureRef=useRef<Map<string,SponsorExposure>>(new Map());
  const supabase=useMemo(()=>matchId?createBroadcastClient():null,[matchId]);
  const refresh=useCallback(async()=>{
    if(!supabase||!matchId)return;
    const result=await supabase.rpc('ips_broadcast_program_snapshot',{p_match_id:matchId});
    if(result.error){setError(result.error.message);return}
    setSnapshot(result.data as Snapshot);setError('');
  },[supabase,matchId]);

  useEffect(()=>{void refresh()},[refresh]);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),100);return()=>clearInterval(timer)},[]);
  useEffect(()=>{
    if(!supabase||!matchId)return;
    const ch=supabase.channel('prism-tv-'+matchId)
      .on('postgres_changes',{event:'*',schema:'public',table:'broadcast_realtime_signals',filter:'match_id=eq.'+matchId},()=>void refresh())
      .on('postgres_changes',{event:'*',schema:'public',table:'match_live_state',filter:'match_id=eq.'+matchId},()=>void refresh())
      .subscribe();
    return()=>{void supabase.removeChannel(ch)};
  },[supabase,matchId,refresh]);

  const layers=(snapshot?.program?.active_layers||[]).filter((x:J)=>!x.expiresAt||Date.parse(x.expiresAt)>now).sort((a:J,b:J)=>(a.priority??0)-(b.priority??0));
  const manifest=snapshot?.release?.manifest?.variants||{};
  const hideScorebar=layers.some((x:J)=>manifest?.[x.variantKey]?.conflictBehavior==='HIDE_SCOREBAR');
  const visible=hideScorebar?layers.filter((x:J)=>x.replacementGroup!=='scorebar'):layers;

  const exposureState=useMemo<SponsorExposure[]>(()=>{
    return visible.flatMap((layer:J)=>{
      const p=layer.payload||{};
      const started=Date.parse(layer.startedAt||'');
      const list=playlistSponsors(p);
      if(list.length){
        const interval=Math.max(1000,Number(p?.sponsorPlaylist?.rotation_interval_ms||10000));
        const cycle=Math.floor(Math.max(0,now-(Number.isFinite(started)?started:now))/interval);
        const sponsor=list[cycle%list.length];
        const cycleStart=(Number.isFinite(started)?started:now)+cycle*interval;
        const layerEnd=layer.expiresAt?Date.parse(layer.expiresAt):Infinity;
        const cycleEnd=Math.min(cycleStart+interval,layerEnd);
        return sponsor?.id?[{key:layer.instanceId+':'+sponsor.id+':'+cycle,sponsor,scene:layer.variantKey,start:cycleStart,end:Number.isFinite(cycleEnd)?cycleEnd:null,duration:Number.isFinite(cycleEnd)?Math.max(0,cycleEnd-cycleStart):interval,placement:sponsor.placement}]:[];
      }
      const sponsor=directSponsor(p);
      if(!sponsor?.id)return [];
      const end=layer.expiresAt?Date.parse(layer.expiresAt):null;
      return [{key:layer.instanceId+':'+sponsor.id,sponsor,scene:layer.variantKey,start:Number.isFinite(started)?started:now,end,duration:end&&Number.isFinite(started)?Math.max(0,end-started):null,placement:sponsor.placement}];
    });
  },[visible,now]);
  const exposureSignature=exposureState.map((x:SponsorExposure)=>x.key).join('|');
  useEffect(()=>{
    if(!supabase||!matchId)return;
    const next=new Map(exposureState.map(x=>[x.key,x]));
    for(const previous of exposureRef.current.values()){
      if(!next.has(previous.key)&&previous.end==null){
        const ended=Date.now();
        void supabase.rpc('ips_broadcast_log_sponsor_exposure',{
          p_match_id:matchId,p_sponsor_id:previous.sponsor.id,p_scene_key:previous.scene,
          p_started_at:new Date(previous.start).toISOString(),p_ended_at:new Date(ended).toISOString(),
          p_duration_ms:Math.max(0,ended-previous.start),p_metadata:{placement:previous.placement,source:'overlay',closed:'program-change'},p_exposure_key:previous.key
        });
      }
    }
    for(const x of exposureState){
      void supabase.rpc('ips_broadcast_log_sponsor_exposure',{
        p_match_id:matchId,p_sponsor_id:x.sponsor.id,p_scene_key:x.scene,
        p_started_at:new Date(x.start).toISOString(),p_ended_at:x.end?new Date(x.end).toISOString():null,
        p_duration_ms:x.duration,p_metadata:{placement:x.placement,source:'overlay'},p_exposure_key:x.key
      });
    }
    exposureRef.current=next;
  },[supabase,matchId,exposureSignature]);

  if(!matchId)return <main className="tv-empty"><b>IPS BROADCAST</b><span>Open this output from the Director so the current match is attached automatically.</span></main>;
  if(error)return <main className="tv-empty"><b>OVERLAY OFFLINE</b><span>{error}</span></main>;
  if(!snapshot)return <main className="tv-empty"><b>IPS BROADCAST</b><span>Connecting to live match…</span></main>;
  if(snapshot.session?.clean_feed)return <main className="tv-output"/>;

  return <main className="tv-output" style={cssVars(snapshot.data||{})}>
    {visible.map((layer:J)=><div className="tv-layer" key={layer.instanceId||layer.variantKey}><BroadcastSkin variantKey={layer.variantKey} data={snapshot.data||{}} payload={layer.payload||{}} startedAt={layer.startedAt} now={now}/></div>)}
  </main>;
}
