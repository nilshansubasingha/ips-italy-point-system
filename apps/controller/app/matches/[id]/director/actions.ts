'use server';
import {createClient} from '@/lib/supabase/server';

export async function broadcastCommandAction(matchId:string,command:Record<string,unknown>){
  try{
    const supabase=await createClient();
    const {data,error}=await supabase.rpc('ips_broadcast_program_command',{p_match_id:matchId,p_command:command});
    if(error)throw error;
    return {ok:true as const,snapshot:data};
  }catch(error:any){
    return {ok:false as const,error:String(error?.message||'Broadcast command failed.')};
  }
}
