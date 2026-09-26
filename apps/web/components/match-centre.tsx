'use client';

import { useMemo, useState } from 'react';
import type { CityRow, FixtureContextRow, MatchLiveSummary } from '@ips/data';
import { formatDate, titleCase } from '@/lib/format';
import { Crest } from './identity';

type Tab = 'LIVE' | 'YET_TO_PLAY' | 'FINISHED';

function bucket(status: string): Tab {
  if (status === 'LIVE') return 'LIVE';
  if (status === 'SCHEDULED' || status === 'READY') return 'YET_TO_PLAY';
  return 'FINISHED';
}

function statusLabel(status: string) {
  if (status === 'LIVE') return 'LIVE';
  if (status === 'READY') return 'READY';
  if (status === 'SCHEDULED') return 'SCHEDULED';
  if (status === 'AWAITING_CERTIFICATION') return 'AWAITING CERTIFICATION';
  return titleCase(status).toUpperCase();
}

function granularStatus(fixture:FixtureContextRow, live?:MatchLiveSummary|null){
  if(fixture.match_status==='READY')return 'Ready to start';
  if(fixture.match_status==='SCHEDULED')return 'Scheduled';
  if(fixture.match_status==='AWAITING_CERTIFICATION')return 'Awaiting certification';
  if(['COMPLETED','OFFICIAL','LOCKED'].includes(fixture.match_status))return 'Match complete';
  if(fixture.match_status!=='LIVE')return statusLabel(fixture.match_status);
  if(!live?.started)return 'Live · waiting for first innings';
  if(live.innings_no===1&&live.innings_complete)return 'Innings break';
  if(live.innings_no===1)return '1st innings';
  if(live.innings_no===2&&live.innings_complete)return 'Match complete';
  if(live.innings_no===2)return '2nd innings · chase';
  return 'Live';
}

function LiveScorePanel({live}:{live:MatchLiveSummary}){
  if(!live.started){
    return <div className="fixture-live-panel waiting">
      <span className="fixture-live-kicker">MATCH STATUS</span>
      <strong>Waiting for first innings</strong>
      <small>The Controller is live. Score will appear here from the first delivery.</small>
    </div>;
  }

  if(live.innings_no===1&&live.innings_complete){
    const target=(live.first_innings_runs??live.runs)+1;
    return <div className="fixture-live-panel innings-break">
      <span className="fixture-live-kicker">INNINGS BREAK</span>
      <div className="fixture-live-scoreline">
        <strong>{live.first_innings_runs??live.runs}/{live.first_innings_wickets??live.wickets}</strong>
        <span>{live.overs_text} OV</span>
      </div>
      <div className="fixture-next-bat">
        <span>NEXT TO BAT</span>
        <strong>{live.next_batting_team_name??'Next batting side'}</strong>
        <small>Target {target}</small>
      </div>
    </div>;
  }

  return <div className="fixture-live-panel">
    <div className="fixture-live-head">
      <div><span className="fixture-live-kicker">{live.innings_no===2?'2ND INNINGS · CHASE':'1ST INNINGS'}</span><strong>{live.batting_team_name??'Batting'}</strong></div>
      <div className="fixture-live-scoreline"><strong>{live.runs}/{live.wickets}</strong><span>{live.overs_text} OV</span></div>
    </div>
    {live.innings_no===2&&live.target_runs&&<div className="fixture-chase-line"><span>TARGET <b>{live.target_runs}</b></span><span>NEED <b>{Math.max(live.target_runs-live.runs,0)}</b></span></div>}
    <div className="fixture-live-players">
      <div><span>STRIKER</span><strong>{live.striker_name??'—'}</strong><b>{live.striker_runs} <small>({live.striker_balls})</small></b></div>
      <div><span>NON-STRIKER</span><strong>{live.non_striker_name??'—'}</strong><b>{live.non_striker_runs} <small>({live.non_striker_balls})</small></b></div>
      <div className="bowler"><span>BOWLER</span><strong>{live.bowler_name??'Select bowler'}</strong><b>{live.bowler_wickets}/{live.bowler_runs} <small>({live.bowler_overs})</small></b></div>
    </div>
  </div>;
}

export function MatchCentre({
  fixtures,
  cities,
  liveSummaries = [],
  compact = false
}:{
  fixtures: FixtureContextRow[];
  cities: CityRow[];
  liveSummaries?: MatchLiveSummary[];
  compact?: boolean
}) {
  const initial: Tab = fixtures.some((fixture) => fixture.match_status === 'LIVE') ? 'LIVE' : 'YET_TO_PLAY';
  const [tab, setTab] = useState<Tab>(initial);
  const [city, setCity] = useState<string>('ALL');

  const liveMap=useMemo(()=>new Map(liveSummaries.map(item=>[item.match_id,item])),[liveSummaries]);
  const visible = useMemo(() => fixtures.filter((fixture) => bucket(fixture.match_status) === tab && (city === 'ALL' || fixture.city_id === city)), [fixtures, tab, city]);
  const counts = useMemo(() => ({
    LIVE: fixtures.filter((f) => bucket(f.match_status) === 'LIVE' && (city === 'ALL' || f.city_id === city)).length,
    YET_TO_PLAY: fixtures.filter((f) => bucket(f.match_status) === 'YET_TO_PLAY' && (city === 'ALL' || f.city_id === city)).length,
    FINISHED: fixtures.filter((f) => bucket(f.match_status) === 'FINISHED' && (city === 'ALL' || f.city_id === city)).length,
  }), [fixtures, city]);

  const selectedCity = city === 'ALL' ? 'All Italy' : cities.find(c => c.id === city)?.name ?? 'City';

  return (
    <div className={`match-centre premium-match-centre ${compact ? 'match-centre-compact' : ''}`}>
      <div className="match-centre-commandbar">
        <div><span className="micro-label">MATCH CENTRE</span><strong>{selectedCity}</strong></div>
        <div className="match-tabs" role="tablist">
          <button className={tab === 'LIVE' ? 'active live-tab' : ''} onClick={() => setTab('LIVE')}><span className="tab-dot live"/>Live <b>{counts.LIVE}</b></button>
          <button className={tab === 'YET_TO_PLAY' ? 'active' : ''} onClick={() => setTab('YET_TO_PLAY')}>Upcoming <b>{counts.YET_TO_PLAY}</b></button>
          <button className={tab === 'FINISHED' ? 'active' : ''} onClick={() => setTab('FINISHED')}>Finished <b>{counts.FINISHED}</b></button>
        </div>
      </div>

      <div className="city-filter-row" aria-label="City filter">
        <button className={city === 'ALL' ? 'active' : ''} onClick={() => setCity('ALL')}>All Italy</button>
        {cities.map((item) => <button key={item.id} className={city === item.id ? 'active' : ''} onClick={() => setCity(item.id)}>{item.name}</button>)}
      </div>

      {visible.length === 0 ? (
        <div className="sports-empty premium-empty"><div className="empty-icon">IPS</div><div><strong>No matches in this view.</strong><span>Change the city or match-state filter.</span></div></div>
      ) : (
        <div className={`fixture-grid ${visible.length === 1 ? 'fixture-grid-single' : ''} ${tab==='LIVE'?'fixture-grid-live':''}`}>
          {visible.map((fixture, index) => {
            const live=liveMap.get(fixture.match_id)??null;
            const state=granularStatus(fixture,live);
            return <article className={`fixture-card premium-fixture-card ${fixture.match_status === 'LIVE' ? 'fixture-live' : ''}`} key={fixture.match_id}>
              <div className="fixture-card-accent" />
              <div className="fixture-card-top">
                <div><span className="fixture-index">MATCH {String(fixture.match_number ?? index + 1).padStart(2, '0')}</span><strong>{fixture.tournament_name}</strong><span>{fixture.city_name} · {fixture.venue_name ?? 'Venue TBC'}</span></div>
                <span className={`status-chip status-${fixture.match_status.toLowerCase()}`}>{fixture.match_status === 'LIVE' && <i className="live-pulse"/>}{statusLabel(fixture.match_status)}</span>
              </div>

              <div className="fixture-state-line">
                <span className={fixture.match_status==='LIVE'?'live':''}>{state}</span>
                {live?.updated_at&&fixture.match_status==='LIVE'&&<small>Live scoring</small>}
              </div>

              <div className={`fixture-versus premium-versus ${fixture.match_status==='LIVE'?'with-live-score':''}`}>
                <div className="fixture-team"><Crest name={fixture.home_team_name} large/><strong>{fixture.home_team_name}</strong><span>HOME</span></div>
                <div className="fixture-middle">
                  {fixture.match_status==='LIVE'&&live
                    ?<LiveScorePanel live={live}/>
                    :<><span>{formatDate(fixture.scheduled_at, true, fixture.scheduled_time_tbc)}</span><strong>VS</strong><small>{fixture.match_code}</small></>}
                </div>
                <div className="fixture-team right"><Crest name={fixture.away_team_name} large/><strong>{fixture.away_team_name}</strong><span>AWAY</span></div>
              </div>

              <div className="fixture-card-bottom premium-fixture-meta">
                <div><span>Format</span><strong>{fixture.overs_per_innings} overs · {fixture.players_per_side} players</strong></div>
                <div><span>Stage</span><strong>{fixture.round_label ?? fixture.stage}</strong></div>
              </div>
              <div className="fixture-card-foot"><span>{state}</span><b>→</b></div>
            </article>;
          })}
        </div>
      )}
    </div>
  );
}
