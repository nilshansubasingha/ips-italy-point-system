import {notFound,redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {DirectorStudio} from '@/components/director-studio';
export const dynamic='force-dynamic';export const revalidate=0;
export default async function MatchDirector({params}:{params:Promise<{id:string}>}){
  const {id:identifier}=await params;
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect('/auth/login');

  const isUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identifier);
  const matchLookup=isUuid
    ?supabase.from('matches').select('id,match_code').eq('id',identifier).maybeSingle()
    :supabase.from('matches').select('id,match_code').eq('match_code',decodeURIComponent(identifier).toUpperCase()).maybeSingle();
  const {data:matchRef,error:matchError}=await matchLookup;
  if(matchError||!matchRef)notFound();
  const id=matchRef.id;

  const ensured=await supabase.rpc('ips_broadcast_ensure_match_session',{p_match_id:id});
  if(ensured.error)throw new Error(ensured.error.message);
  const snap=await supabase.rpc('ips_broadcast_director_snapshot',{p_match_id:id});
  if(snap.error)throw new Error(snap.error.message);
  return <DirectorStudio matchId={id} initial={snap.data}/>;
}
