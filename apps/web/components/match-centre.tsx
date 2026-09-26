'use client';

import Link from 'next/link';
import {useCallback,useEffect,useMemo,useState} from 'react';
import type {CityRow,FixtureContextRow,MatchLiveSummary} from '@ips/data';
import {Crest} from './identity';
import {formatDate} from '@/lib/format';
import {createClient} from '@/lib/supabase/client';

type StateFilter='ALL'|'LIVE'|'UPCOMING'|'FINISHED';

function bucket(status:string):StateFilter{
  if(status==='LIVE')return 'LIVE';
  if(status==='SCHEDULED'||status==='READY')return 'UPCOMING';
  return 'FINISHED';
}
function statusLabel(status:string){
  if(status==='LIVE')return 'LIVE';
  if(status==='READY')return 'READY';
  if(status==='SCHEDULED')return 'UPCOMING';
  if(status==='AWAITING_CERTIFICATION')return 'AWAITING CERT.';
  if(status==='OFFICIAL'||status==='LOCKED')return 'OFFICIAL';
  if(status==='COMPLETED')return 'FINISHED';
  return status.replaceAll('_',' ');
}
function scoreForTeam(live:MatchLiveSummary|undefined,teamId:string){
  if(!live)return null;
  if(live.first_innings_team_id===teamId&&live.first_innings_runs!=null)return {runs:live.first_innings_runs,wickets:live.first_innings_wickets??0};
  if(live.second_innings_team_id===teamId&&live.second_innings_runs!=null)return {runs:live.second_innings_runs,wickets:live.second_innings_wickets??0};
  if(live.batting_team_id===teamId&&live.started)return {runs:live.runs,wickets:live.wickets};
  return null;
}
function teamState(live:MatchLiveSummary|undefined,teamId:string,status:string){
  const score=scoreForTeam(live,teamId);
  if(score)return score.runs+'/'+score.wickets;
  if(status==='LIVE'&&live?.next_batting_team_id===teamId)return 'NEXT TO BAT';
  if(status==='LIVE')return 'YET TO BAT';
  return '—';
}

export function MatchCentre({
  fixtures,
  cities,
  liveSummaries=[],
  compact=false
}:{
  fixtures:FixtureContextRow[];
  cities:CityRow[];
  liveSummaries?:MatchLiveSummary[];
  compact?:boolean;
}){
  const [city,setCity]=useState('ALL');
  const [tournament,setTournament]=useState('ALL');
  const [state,setState]=useState<StateFilter>('ALL');
  const [currentFixtures,setCurrentFixtures]=useState(fixtures);
  const [currentSummaries,setCurrentSummaries]=useState(liveSummaries);
  const supabase=useMemo(()=>createClient(),[]);
  const liveMap=useMemo(()=>new Map(currentSummaries.map(item=>[item.match_id,item])),[currentSummaries]);

  const refreshScores=useCallback(async()=>{
    const [summaryRes,matchRes]=await Promise.all([
      supabase.rpc('ips_public_match_live_summaries'),
      supabase.from('matches').select('id,status,scheduled_at')
    ]);
    if(!summaryRes.error&&Array.isArray(summaryRes.data)){
      setCurrentSummaries(summaryRes.data as MatchLiveSummary[]);
    }
    if(!matchRes.error&&Array.isArray(matchRes.data)){
      const statusMap=new Map(matchRes.data.map((row:any)=>[row.id,row]));
      setCurrentFixtures(current=>current.map(f=>{
        const row=statusMap.get(f.match_id);
        return row?{...f,match_status:row.status,scheduled_at:row.scheduled_at??f.scheduled_at}:f;
      }));
    }
  },[supabase]);

  useEffect(()=>{
    const channel=supabase
      .channel('public-match-centre-live')
      .on('postgres_changes',{event:'*',schema:'public',table:'broadcast_realtime_signals'},()=>{void refreshScores();})
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'matches'},payload=>{
        const next=payload.new as any;
        if(next?.id){
          setCurrentFixtures(current=>current.map(f=>f.match_id===next.id?{...f,match_status:next.status,scheduled_at:next.scheduled_at??f.scheduled_at}:f));
        }
        void refreshScores();
      })
      .subscribe();

    const safety=setInterval(()=>void refreshScores(),2500);
    return()=>{
      clearInterval(safety);
      void supabase.removeChannel(channel);
    };
  },[supabase,refreshScores]);

  const tournaments=useMemo(()=>{
    const map=new Map<string,string>();
    currentFixtures.forEach(f=>map.set(f.tournament_id,f.tournament_name));
    return [...map.entries()].sort((a,b)=>a[1].localeCompare(b[1]));
  },[currentFixtures]);

  const scoped=useMemo(()=>currentFixtures.filter(f=>(city==='ALL'||f.city_id===city)&&(tournament==='ALL'||f.tournament_id===tournament)),[currentFixtures,city,tournament]);
  const counts=useMemo(()=>({
    LIVE:scoped.filter(f=>bucket(f.match_status)==='LIVE').length,
    UPCOMING:scoped.filter(f=>bucket(f.match_status)==='UPCOMING').length,
    FINISHED:scoped.filter(f=>bucket(f.match_status)==='FINISHED').length
  }),[scoped]);

  const upcomingOrder=useMemo(()=>{
    const map=new Map<string,number>();
    scoped.filter(f=>bucket(f.match_status)==='UPCOMING')
      .sort((a,b)=>Date.parse(a.scheduled_at)-Date.parse(b.scheduled_at)||a.match_number-b.match_number)
      .forEach((f,i)=>map.set(f.match_id,i+1));
    return map;
  },[scoped]);

  const visible=useMemo(()=>{
    const weight=(f:FixtureContextRow)=>bucket(f.match_status)==='LIVE'?0:bucket(f.match_status)==='UPCOMING'?1:2;
    return scoped
      .filter(f=>state==='ALL'||bucket(f.match_status)===state)
      .sort((a,b)=>weight(a)-weight(b)||(weight(a)===2?Date.parse(b.scheduled_at)-Date.parse(a.scheduled_at):Date.parse(a.scheduled_at)-Date.parse(b.scheduled_at)));
  },[scoped,state]);

  const selectedCity=city==='ALL'?'All Italy':cities.find(c=>c.id===city)?.name??'City';

  return <div className={'match-centre sketch-match-centre '+(compact?'match-centre-compact':'')}>
    <div className="sketch-mc-head">
      <div><span className="micro-label">MATCH CENTRE</span><strong>{selectedCity}</strong></div>
      <div className="sketch-state-filters">
        <button className={state==='ALL'?'active':''} onClick={()=>setState('ALL')}>All <b>{scoped.length}</b></button>
        <button className={state==='LIVE'?'active live':''} onClick={()=>setState('LIVE')}>Live <b>{counts.LIVE}</b></button>
        <button className={state==='UPCOMING'?'active':''} onClick={()=>setState('UPCOMING')}>Upcoming <b>{counts.UPCOMING}</b></button>
        <button className={state==='FINISHED'?'active finished':''} onClick={()=>setState('FINISHED')}>Finished <b>{counts.FINISHED}</b></button>
      </div>
    </div>

    <div className="sketch-mc-filters">
      <div className="city-filter-row" aria-label="City filter">
        <button className={city==='ALL'?'active':''} onClick={()=>setCity('ALL')}>All Italy</button>
        {cities.map(item=><button key={item.id} className={city===item.id?'active':''} onClick={()=>setCity(item.id)}>{item.name}</button>)}
      </div>
      <label className="tournament-filter">
        <span>Tournament</span>
        <select value={tournament} onChange={e=>setTournament(e.target.value)}>
          <option value="ALL">All tournaments</option>
          {tournaments.map(([id,name])=><option key={id} value={id}>{name}</option>)}
        </select>
      </label>
    </div>

    {!visible.length?<div className="sports-empty premium-empty"><div className="empty-icon">IPS</div><div><strong>No matches in this view.</strong><span>Change the city, tournament or status filter.</span></div></div>:
    <div className="sketch-match-grid">
      {visible.map(fixture=>{
        const live=liveMap.get(fixture.match_id);
        const kind=bucket(fixture.match_status);
        const homeScore=teamState(live,fixture.home_team_id,fixture.match_status);
        const awayScore=teamState(live,fixture.away_team_id,fixture.match_status);
        const nextNo=upcomingOrder.get(fixture.match_id);
        const inningsBreak=fixture.match_status==='LIVE'&&live?.innings_no===1&&live.innings_complete;

        return <Link href={'/match-centre/'+encodeURIComponent(fixture.match_code)} className={'sketch-match-card '+kind.toLowerCase()} key={fixture.match_id}>
          <div className="sketch-card-top">
            <span>MATCH #{fixture.match_number}</span>
            <b className={'sketch-status '+kind.toLowerCase()}>{kind==='LIVE'&&<i/>}{statusLabel(fixture.match_status)}</b>
          </div>

          <div className="sketch-card-teams">
            <div className="sketch-team">
              <Crest name={fixture.home_team_name} imageUrl={fixture.home_team_logo_url}/>
              <strong>{fixture.home_team_name}</strong>
              <b>{homeScore}</b>
            </div>

            <div className="sketch-card-centre">
              {kind==='UPCOMING'?<>
                <span>NEXT MATCH {nextNo??''}</span>
                <strong>VS</strong>
                <small>{formatDate(fixture.scheduled_at,true,fixture.scheduled_time_tbc)}</small>
              </>:kind==='LIVE'?<>
                <span>{inningsBreak?'INNINGS BREAK':live?.innings_no===2?'2ND INNINGS':'1ST INNINGS'}</span>
                <strong>{inningsBreak?'NEXT':live?.overs_text?live.overs_text+' OV':'LIVE'}</strong>
                <small>{inningsBreak?(live?.next_batting_team_name??'Next side'):(live?.batting_team_name??'Scoring')}</small>
              </>:<>
                <span>RESULT</span>
                <strong>FT</strong>
                <small>{live?.result_text??'Match complete'}</small>
              </>}
            </div>

            <div className="sketch-team right">
              <Crest name={fixture.away_team_name} imageUrl={fixture.away_team_logo_url}/>
              <strong>{fixture.away_team_name}</strong>
              <b>{awayScore}</b>
            </div>
          </div>

          {kind==='LIVE'&&live&&!inningsBreak&&live.started&&<div className="sketch-live-strip">
            <span><b>{live.striker_name??'—'}</b> {live.striker_runs} ({live.striker_balls})</span>
            <span><b>{live.non_striker_name??'—'}</b> {live.non_striker_runs} ({live.non_striker_balls})</span>
            <span className="bowler"><b>{live.bowler_name??'Bowler'}</b> {live.bowler_wickets}/{live.bowler_runs} · {live.bowler_overs}</span>
          </div>}

          {kind==='LIVE'&&inningsBreak&&<div className="sketch-result-line"><strong>{live?.next_batting_team_name} next to bat</strong><span>Target {(live?.first_innings_runs??0)+1}</span></div>}
          {kind==='FINISHED'&&<div className="sketch-result-line finished"><strong>{live?.result_text??'Match complete'}</strong><span>Open scorecard →</span></div>}
          {kind==='UPCOMING'&&<div className="sketch-result-line"><strong>{fixture.tournament_name}</strong><span>{fixture.city_name}</span></div>}
        </Link>;
      })}
    </div>}
  </div>;
}
