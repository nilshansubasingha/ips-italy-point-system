export const dynamic = 'force-dynamic';
export const revalidate = 0;

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ControllerMatch } from '@/components/controller-match';

const WEB_URL = process.env.NEXT_PUBLIC_IPS_WEB_URL ?? 'http://localhost:3000';
const OVERLAY_URL = process.env.NEXT_PUBLIC_IPS_OVERLAY_URL ?? 'http://localhost:3002';

export default async function MatchControllerPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const {id}=await params; const sp=await searchParams;
  const ok=typeof sp.ok==='string'?sp.ok:null; const rawError=typeof sp.error==='string'?sp.error:null; const errorMessage=rawError==='NEXT_REDIRECT'?null:rawError;
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) return <main className="controller-portal"><div className="portal-card"><h1>Sign in required.</h1><p>Use your IPS account before opening the Match Controller.</p><Link className="portal-button" href={`/auth/login?next=/matches/${id}`}>Sign in to Controller →</Link></div></main>;
  await supabase.rpc('ips_broadcast_ensure_match_session',{p_match_id:id});
  const [{data,error},{data:scoringData,error:scoringError},{data:overHistory},{data:nextMatchRows}]=await Promise.all([
    supabase.rpc('ips_controller_match_context',{p_match_id:id}),
    supabase.rpc('ips_scoring_context',{p_match_id:id}),
    supabase.rpc('ips_scoring_over_history',{p_match_id:id}),
    supabase.rpc('ips_controller_next_match',{p_match_id:id})
  ]);
  if(error||scoringError) return <main className="controller-portal"><div className="portal-card"><span className="micro">ACCESS / READINESS</span><h1>Controller unavailable.</h1><p>{error?.message||scoringError?.message}</p><Link className="portal-button" href="/">← Controller matches</Link></div></main>;
  if(!data) notFound();
  const scoringWithHistory={...(scoringData as any),over_history:Array.isArray(overHistory)?overHistory:[]};
  const nextMatch=Array.isArray(nextMatchRows)?nextMatchRows[0]??null:null;
  return <ControllerMatch context={data as any} initialScoring={scoringWithHistory} nextMatch={nextMatch as any} webUrl={WEB_URL} overlayUrl={OVERLAY_URL} message={ok} errorMessage={errorMessage}/>;
}
