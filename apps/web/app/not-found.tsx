import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';

export default function NotFound() {
  return <main className="shell sports-shell"><SiteHeader/><section className="page-hero premium-page-hero"><div className="page-hero-copy"><span className="eyebrow">IPS DIRECTORY</span><h1>Identity<br/><span>not found.</span></h1><p>This public IPS identity does not exist or is not currently visible.</p><div className="hero-actions"><Link className="button-primary" href="/">Back to IPS →</Link><Link className="button-secondary" href="/match-centre">Match Centre</Link></div></div><aside className="hero-insight-card dark-insight"><span className="micro-label">CANONICAL IDENTITY</span><h2>One record.<br/>No duplicates.</h2><p>IPS intentionally avoids creating substitute player or club records when an identity cannot be resolved.</p></aside></section></main>;
}
