export const dynamic='force-dynamic';
export const revalidate=0;

import Link from 'next/link';
import {createClient} from '@/lib/supabase/server';
import {BroadcastDirector} from '@/components/broadcast-director';

const OVERLAY_URL=process.env.NEXT_PUBLIC_IPS_OVERLAY_URL??'http://localhost:3002';

export default async function DirectorPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return <main className="controller-portal"><div className="portal-card"><h1>Sign in required.</h1><Link className="portal-button" href={'/auth/login?next=/matches/'+id+'/director'}>Sign in →</Link></div></main>;
  const {data,error}=await supabase.rpc('ips_controller_match_context',{p_match_id:id});
  if(error||!data)return <main className="controller-portal"><div className="portal-card"><h1>Director unavailable.</h1><p>{error?.message||'Match not found.'}</p></div></main>;
  const c=data as any;
  return <BroadcastDirector matchId={id} overlayUrl={OVERLAY_URL} matchName={(c.home?.team?.name??'Home')+' vs '+(c.away?.team?.name??'Away')}/>;
}
