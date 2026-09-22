'use client';

import Link from 'next/link';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="shell sports-shell"><section className="page-hero premium-page-hero"><div className="page-hero-copy"><span className="eyebrow">IPS DATA CONNECTION</span><h1>Public data is<br/><span>temporarily unavailable.</span></h1><p>The sports shell is still running and no cricket data has been changed. Retry the request or check the central database connection.</p><div className="hero-actions"><button className="button-primary" onClick={() => reset()}>Retry request →</button><Link className="button-secondary" href="/dev/database">Database health</Link></div></div><aside className="hero-insight-card dark-insight"><span className="micro-label">SAFE FAILURE MODE</span><h2>UI stays alive.<br/>Data stays untouched.</h2><p>IPS does not replace missing official data with fabricated results.</p></aside></section></main>;
}
