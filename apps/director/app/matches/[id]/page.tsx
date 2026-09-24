import {notFound,redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {DirectorStudio} from '@/components/director-studio';
export const dynamic='force-dynamic';export const revalidate=0;
export default async function MatchDirector({params}:{params:Promise<{id:string}>}){
  const {id}=await params;if(!/^[0-9a-f-]{36}$/i.test(id))notFound();
  const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect('/auth/login');
  const ensured=await supabase.rpc('ips_broadcast_ensure_match_session',{p_match_id:id});if(ensured.error)throw new Error(ensured.error.message);
  const snap=await supabase.rpc('ips_broadcast_director_snapshot',{p_match_id:id});if(snap.error)throw new Error(snap.error.message);
  return <DirectorStudio matchId={id} initial={snap.data}/>;
}
