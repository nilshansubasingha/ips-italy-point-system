import Link from 'next/link';
import { getDatabaseHealth } from '@ips/data';
import { BrandMark, Pill } from '@ips/ui';

export const dynamic = 'force-dynamic';

export default async function DatabaseDevPage() {
  const health = await getDatabaseHealth();
  const entries = Object.entries(health.counts);

  return (
    <main className="shell dev-db-shell">
      <header className="topbar">
        <BrandMark />
        <nav>
          <Link href="/">IPS Home</Link>
          <span className="role">Project 1 · Database</span>
        </nav>
      </header>

      <section className="dev-db-hero">
        <div>
          <div className="eyebrow">PROJECT 1 VERIFICATION</div>
          <h1 className="dev-title">Central domain<br/><span>health check.</span></h1>
          <p>This page performs read-only checks against the Supabase database. It never uses a service-role key and contains no write controls.</p>
        </div>
        <div className={`db-status ${health.connected ? 'ok' : health.configured ? 'error' : 'pending'}`}>
          <div className="db-status-row">
            <span className="status-orb" />
            <strong>{health.connected ? 'CONNECTED' : health.configured ? 'CONNECTION ERROR' : 'NOT CONFIGURED'}</strong>
          </div>
          <p>{health.message}</p>
          <Pill tone={health.connected ? 'green' : health.configured ? 'red' : 'amber'}>
            {health.connected ? 'CENTRAL DATA READY' : health.configured ? 'CHECK SUPABASE' : 'ADD .ENV.LOCAL'}
          </Pill>
        </div>
      </section>

      <section className="section compact-section">
        <div className="section-head">
          <div><span className="eyebrow">ENTITY COUNTS</span><h2>Canonical records</h2></div>
        </div>
        {entries.length > 0 ? (
          <div className="db-count-grid">
            {entries.map(([name, value]) => (
              <div className="db-count-card" key={name}><strong>{value}</strong><span>{name.replaceAll('_', ' ')}</span></div>
            ))}
          </div>
        ) : <div className="empty-state">Connect Supabase to read the Project 1 tables.</div>}
      </section>

      <section className="section compact-section">
        <div className="section-head"><div><span className="eyebrow">FIXTURE CONTEXT</span><h2>Future controller import boundary</h2></div></div>
        {health.fixture ? (
          <article className="fixture-context-card">
            <div className="fixture-context-top"><span>{health.fixture.tournament_name}</span><Pill tone="blue">{health.fixture.match_status}</Pill></div>
            <div className="fixture-teams"><strong>{health.fixture.home_team_name}</strong><span>VS</span><strong>{health.fixture.away_team_name}</strong></div>
            <div className="fixture-meta-grid">
              <div><span>Match</span><strong>{health.fixture.match_code}</strong></div>
              <div><span>City</span><strong>{health.fixture.city_name}</strong></div>
              <div><span>Venue</span><strong>{health.fixture.venue_name ?? 'TBC'}</strong></div>
              <div><span>Ruleset</span><strong>{health.fixture.ruleset_name} · v{health.fixture.ruleset_version}</strong></div>
              <div><span>Overs</span><strong>{health.fixture.overs_per_innings}</strong></div>
              <div><span>Balls / over</span><strong>{health.fixture.balls_per_over}</strong></div>
            </div>
            <p className="dev-note">Project 5.1 extends this context with locked squads, Playing Side, scorer assignment and frozen match-format snapshots.</p>
          </article>
        ) : <div className="empty-state">No visible fixture found. The optional demo seed creates one.</div>}
      </section>
    </main>
  );
}
