import Link from 'next/link';
import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
export const dynamic='force-dynamic';export const revalidate=0;
export default async function ReplayHome(){
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect('/auth/login');
  const {data,error}=await supabase.rpc('ips_broadcast_director_matches');
  if(error)throw new Error(error.message);
  const matches=(data??[]) as any[];
  return <main className="replay-home">
    <header className="replay-top"><div className="replay-wordmark"><b>IPS</b><span>REPLAY ENGINE</span></div><small>{user.email}</small></header>
    <section className="match-browser"><div className="section-title"><span>REPLAY WORKSTATIONS</span><h1>Choose a match.</h1></div>
      <div className="match-grid">{matches.map(m=><Link className="match-card" href={'/matches/'+m.id} key={m.id}>
        <small>{m.tournament_name}</small><strong>{m.home_team?.short_name||m.home_team?.name} <i>vs</i> {m.away_team?.short_name||m.away_team?.name}</strong>
        <span>{m.match_code}</span><em>OPEN REPLAY →</em>
      </Link>)}</div>
    </section>
  </main>;
}
