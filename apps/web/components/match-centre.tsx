'use client';

import { useMemo, useState } from 'react';
import type { CityRow, FixtureContextRow } from '@ips/data';
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

export function MatchCentre({ fixtures, cities, compact = false }: { fixtures: FixtureContextRow[]; cities: CityRow[]; compact?: boolean }) {
  const initial: Tab = fixtures.some((fixture) => fixture.match_status === 'LIVE') ? 'LIVE' : 'YET_TO_PLAY';
  const [tab, setTab] = useState<Tab>(initial);
  const [city, setCity] = useState<string>('ALL');

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
        <div className="sports-empty premium-empty"><div className="empty-icon">IPS</div><div><strong>No matches in this view.</strong><span>Change the city or match-state filter. The layout stays ready for live data.</span></div></div>
      ) : (
        <div className={`fixture-grid ${visible.length === 1 ? 'fixture-grid-single' : ''}`}>
          {visible.map((fixture, index) => (
            <article className={`fixture-card premium-fixture-card ${fixture.match_status === 'LIVE' ? 'fixture-live' : ''}`} key={fixture.match_id}>
              <div className="fixture-card-accent" />
              <div className="fixture-card-top">
                <div><span className="fixture-index">MATCH {String(fixture.match_number ?? index + 1).padStart(2, '0')}</span><strong>{fixture.tournament_name}</strong><span>{fixture.city_name} · {fixture.venue_name ?? 'Venue TBC'}</span></div>
                <span className={`status-chip status-${fixture.match_status.toLowerCase()}`}>{fixture.match_status === 'LIVE' && <i className="live-pulse"/>}{statusLabel(fixture.match_status)}</span>
              </div>
              <div className="fixture-versus premium-versus">
                <div className="fixture-team"><Crest name={fixture.home_team_name} large/><strong>{fixture.home_team_name}</strong><span>HOME</span></div>
                <div className="fixture-middle"><span>{formatDate(fixture.scheduled_at, true)}</span><strong>VS</strong><small>{fixture.match_code}</small></div>
                <div className="fixture-team right"><Crest name={fixture.away_team_name} large/><strong>{fixture.away_team_name}</strong><span>AWAY</span></div>
              </div>
              <div className="fixture-card-bottom premium-fixture-meta">
                <div><span>Format</span><strong>{fixture.overs_per_innings} overs · {fixture.players_per_side} players</strong></div>
                <div><span>Stage</span><strong>{fixture.round_label ?? fixture.stage}</strong></div>
                <div><span>Rules</span><strong>{fixture.ruleset_name} v{fixture.ruleset_version}</strong></div>
              </div>
              <div className="fixture-card-foot"><span>{fixture.match_status === 'LIVE' ? 'Live score will appear here' : 'Official fixture context'}</span><b>→</b></div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
