'use server';

import {createClient} from '@/lib/supabase/server';
import type {BroadcastGraphicId,BroadcastMode,BroadcastOutput} from '@ips/broadcast';

export async function emitBroadcastCueAction(input:{
  matchId:string;
  output:BroadcastOutput;
  graphic:BroadcastGraphicId;
  mode:BroadcastMode;
  layer:number;
  payload?:Record<string,unknown>;
  durationMs?:number|null;
}){
  try{
    const supabase=await createClient();
    const {data,error}=await supabase.rpc('ips_emit_broadcast_cue',{
      p_match_id:input.matchId,
      p_output:input.output,
      p_graphic:input.graphic,
      p_mode:input.mode,
      p_layer:input.layer,
      p_payload:input.payload??{},
      p_duration_ms:input.durationMs??null
    });
    if(error)throw error;
    return {ok:true as const,cue:data};
  }catch(error:any){
    return {ok:false as const,error:String(error?.message??'Could not send the broadcast cue.')};
  }
}
