export const dynamic = 'force-dynamic';
export const revalidate = 0;

import Link from 'next/link';
import { BrandMark } from '@ips/ui';
import { createClient } from '@/lib/supabase/server';

export default async function ControllerHome() {
  let supabase;
  try { supabase = await createClient(); }
  catch (e:any) { return <main className="controller-portal"><div className="portal-card"><BrandMark/><span className="micro">PROJECT 5 · CONTROLLER IMPORT</span><h1>Connect Supabase.</h1><p>{e?.message}</p><code>apps/controller/.env.local</code></div></main>; }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <main className="controller-portal"><div className="portal-card"><BrandMark/><span className="micro">IPS MATCH CONTROLLER</span><h1>Sign in first.</h1><p>The Controller uses the same IPS account and scoped permissions as the website.</p><Link className="portal-button" href="/auth/login?next=/">Sign in to Controller →</Link></div></main>;

  const { data, error } = await supabase.rpc('ips_controller_available_matches');
  const matches = (data ?? []) as any[];
  return <main className="controller-portal">
    <header className="portal-header"><BrandMark/><div><span>{user.email}</span><b>PROJECT 5.1 · OFFICIAL FIXTURE IMPORT</b></div></header>
    <section className="portal-hero"><span className="micro">MATCH CONTROLLER</span><h1>Open an official fixture.</h1><p>No team names, player names or match format are retyped here. IPS imports the tournament snapshot, with an audited Controller override available only when necessary.</p></section>
    {error && <div className="portal-error">{error.message}</div>}
    <section className="controller-match-list">
      {matches.map((m:any)=><Link className="controller-match-card" href={`/matches/${m.match_id}`} key={m.match_id}>
        <div className="match-card-top"><span className={`match-state ${String(m.match_status).toLowerCase()}`}>{String(m.match_status).replaceAll('_',' ')}</span><b>{m.match_code}</b></div>
        <h2>{m.home_team_name} <i>vs</i> {m.away_team_name}</h2>
        <p>{m.tournament_name}</p><footer><span>{new Date(m.scheduled_at).toLocaleString('en-IT',{timeZone:'Europe/Rome',dateStyle:'medium',timeStyle:'short'})}</span><strong>Open →</strong></footer>
      </Link>)}
      {!matches.length && <div className="portal-empty"><strong>No controller matches available.</strong><p>If you are an Owner or tournament administrator, this means IPS currently has no fixture you can open. Create a fixture first. Scorers appear here only after they are assigned to that fixture under Tournament → Officials.</p><Link href={(process.env.NEXT_PUBLIC_IPS_WEB_URL ?? 'http://localhost:3000')+'/manage/tournaments'}>Create / manage fixtures →</Link></div>}
    </section>
  </main>;
}
