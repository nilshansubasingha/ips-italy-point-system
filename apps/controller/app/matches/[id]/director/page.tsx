export const dynamic='force-dynamic';
export const revalidate=0;

import Link from 'next/link';
import {notFound} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {DirectorStudio} from '@/components/director-studio';

const OVERLAY_URL=process.env.NEXT_PUBLIC_IPS_OVERLAY_URL??'http://localhost:3002/';

export default async function DirectorPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();

  if(!user){
    return <main className="controller-portal"><div className="portal-card">
      <h1>Sign in required.</h1>
      <p>Use your IPS account before opening Broadcast Director.</p>
      <Link className="portal-button" href={'/auth/login?next=/matches/'+id+'/director'}>Sign in to Director →</Link>
    </div></main>;
  }

  const [{data:context,error},{data:scoring,error:scoringError}]=await Promise.all([
    supabase.rpc('ips_controller_match_context',{p_match_id:id}),
    supabase.rpc('ips_scoring_context',{p_match_id:id})
  ]);

  if(error||scoringError){
    return <main className="controller-portal"><div className="portal-card">
      <span className="micro">BROADCAST ACCESS</span>
      <h1>Director unavailable.</h1>
      <p>{error?.message??scoringError?.message}</p>
      <Link className="portal-button" href={'/matches/'+id}>← Match Controller</Link>
    </div></main>;
  }

  if(!context)notFound();

  return <DirectorStudio context={context as any} scoring={scoring as any} overlayUrl={OVERLAY_URL.replace(/\/$/,'')}/>;
}
