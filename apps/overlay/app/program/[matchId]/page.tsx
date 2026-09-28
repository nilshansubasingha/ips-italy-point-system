import {createClient} from '@supabase/supabase-js';
import {ProgramRenderer} from '../../program-renderer';

export const dynamic='force-dynamic';
export const revalidate=0;

export default async function ProgramOutput({params}:{params:Promise<{matchId:string}>}){
  const {matchId:identifier}=await params;
  const isUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identifier);

  let matchId:string|null=isUuid?identifier:null;
  if(!matchId){
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if(url&&key){
      const supabase=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
      const {data}=await supabase.from('matches').select('id').eq('match_code',decodeURIComponent(identifier).toUpperCase()).maybeSingle();
      matchId=data?.id??null;
    }
  }

  return <ProgramRenderer matchId={matchId}/>;
}
