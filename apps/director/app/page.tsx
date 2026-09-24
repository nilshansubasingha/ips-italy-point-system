import Link from 'next/link';
import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
export const dynamic='force-dynamic';export const revalidate=0;
export default async function DirectorHome(){
  const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect('/auth/login');
  const {data,error}=await supabase.rpc('ips_broadcast_director_matches');if(error)throw new Error(error.message);
  const matches=(data??[]) as any[];
  return <main className="director-home"><header className="home-head"><div className="director-wordmark"><b>IPS</b><span>PRISM DIRECTOR</span></div><div><span>CONTROL ROOM</span><strong>{user.email}</strong></div></header><section className="match-browser"><div className="section-title"><span>AVAILABLE MATCHES</span><h1>Choose a production.</h1></div><div className="match-grid">{matches.map(m=><Link className="match-card" href={'/matches/'+m.id} key={m.id}><div className="match-status">{m.status}</div><small>{m.tournament_name}</small><strong>{m.home_team?.short_name||m.home_team?.name} <i>vs</i> {m.away_team?.short_name||m.away_team?.name}</strong><span>{m.match_code}</span><em>{m.has_session?'PRISM READY':'START PRISM SESSION'} →</em></Link>)}</div>{!matches.length&&<div className="empty">No matches are currently available to your Director role.</div>}</section></main>;
}
