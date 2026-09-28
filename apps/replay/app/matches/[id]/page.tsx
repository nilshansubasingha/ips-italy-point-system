import {notFound,redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {ReplayWorkstation} from '@/components/replay-workstation';

export const dynamic='force-dynamic';
export const revalidate=0;

export default async function ReplayMatch({params}:{params:Promise<{id:string}>}){
  const {id:identifier}=await params;
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user){
    const base=process.env.PRISM_PREVIEW_GATEWAY==='1'?'/replay':'';
    redirect(base+'/auth/login?next='+encodeURIComponent(base+'/matches/'+identifier));
  }

  const isUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identifier);
  let matchId=identifier;

  if(!isUuid){
    const {data:row,error:lookupError}=await supabase
      .from('matches')
      .select('id')
      .eq('match_code',decodeURIComponent(identifier).toUpperCase())
      .maybeSingle();
    if(lookupError||!row?.id)notFound();
    matchId=row.id;
  }

  const {data,error}=await supabase.rpc('ips_broadcast_match_data',{p_match_id:matchId});
  const broadcast=data as any;
  if(error||!broadcast?.match?.id)notFound();

  const m=broadcast.match;
  const match={
    id:m.id,
    match_code:m.code,
    status:m.status,
    tournaments:{name:m.tournament?.name||'IPS MATCH'},
    home:m.home_team||{},
    away:m.away_team||{}
  };

  return <ReplayWorkstation matchId={m.id} match={match}/>;
}
