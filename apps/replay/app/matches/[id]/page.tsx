import {notFound,redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {ReplayWorkstation} from '@/components/replay-workstation';
export const dynamic='force-dynamic';export const revalidate=0;
export default async function ReplayMatch({params}:{params:Promise<{id:string}>}){
  const {id:identifier}=await params;
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect('/director/auth/login');
  const isUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identifier);
  const lookup=isUuid
    ?supabase.from('matches').select('id,match_code,status,tournaments(name),home:teams!matches_home_team_id_fkey(name,short_name),away:teams!matches_away_team_id_fkey(name,short_name)').eq('id',identifier).maybeSingle()
    :supabase.from('matches').select('id,match_code,status,tournaments(name),home:teams!matches_home_team_id_fkey(name,short_name),away:teams!matches_away_team_id_fkey(name,short_name)').eq('match_code',decodeURIComponent(identifier).toUpperCase()).maybeSingle();
  const {data,error}=await lookup;
  if(error||!data)notFound();
  return <ReplayWorkstation matchId={data.id} match={data as any}/>;
}
