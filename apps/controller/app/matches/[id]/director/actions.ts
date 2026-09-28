'use server';
import {createClient} from '@/lib/supabase/server';

export async function setBroadcastGraphicAction(input:{
  matchId:string;graphic:string;mode:'FULLSCREEN'|'LOWER_THIRD'|'SIDE_PANEL'|'COMPACT';
  payload?:Record<string,unknown>;visible?:boolean;durationMs?:number;transition?:string;
}){
  try{
    const supabase=await createClient();
    const {data,error}=await supabase.rpc('ips_set_broadcast_graphic',{
      p_match_id:input.matchId,
      p_graphic:input.graphic,
      p_mode:input.mode,
      p_payload:input.payload??{},
      p_visible:input.visible??true,
      p_duration_ms:input.durationMs??5000,
      p_transition:input.transition??'AUTO'
    });
    if(error)throw error;
    return {ok:true as const,state:data};
  }catch(error:any){
    return {ok:false as const,error:String(error?.message||'Could not update broadcast graphic.')};
  }
}
