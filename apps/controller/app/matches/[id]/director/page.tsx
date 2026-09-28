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

  if(!user){
    return <main className="controller-portal"><div className="portal-card"><h1>Sign in required.</h1><Link className="portal-button" href={'/auth/login?next=/matches/'+id+'/director'}>Sign in →</Link></div></main>;
  }

  const {data,error}=await supabase.rpc('ips_broadcast_director_snapshot',{p_match_id:id});
  if(error||!data){
    return <main className="controller-portal"><div className="portal-card"><h1>Director unavailable.</h1><p>{error?.message||'Match unavailable.'}</p></div></main>;
  }

  const snapshot=data as any;
  const manifest=snapshot.release?.manifest?.variants??{};
  const variants=Object.entries(manifest).map(([key,raw])=>{
    const meta=raw as any;
    return {
      key,
      name:meta.name??key,
      scene:meta.sceneKey??key.split('.')[0],
      presentation:meta.presentation??'GRAPHIC',
      duration:meta.durationMs??null,
      direct:!!meta.directTake,
      group:meta.replacementGroup??'',
      priority:Number(meta.priority??50)
    };
  }).sort((a,b)=>b.priority-a.priority||a.scene.localeCompare(b.scene)||a.key.localeCompare(b.key));

  const match=snapshot.data?.match??{};
  const matchName=(match.home_team?.name??'Home')+' vs '+(match.away_team?.name??'Away');

  return <BroadcastDirector
    matchId={id}
    overlayUrl={OVERLAY_URL}
    matchName={matchName}
    variants={variants}
    initialAutomation={snapshot.session?.automation_enabled!==false}
  />;
}
