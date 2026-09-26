'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

function s(form:FormData,key:string){return String(form.get(key)??'').trim();}
function n(form:FormData,key:string){const raw=s(form,key); if(!raw)return null; const value=Number(raw); return Number.isFinite(value)?value:null;}

export async function overrideMatchFormat(form:FormData){
  const matchId=s(form,'match_id');
  let errorMessage:string|null=null;
  try{
    const supabase=await createClient();
    const {error}=await supabase.rpc('ips_override_match_format',{
      p_match_id:matchId,
      p_players_per_side:n(form,'players_per_side'),
      p_overs_per_innings:n(form,'overs_per_innings'),
      p_balls_per_over:n(form,'balls_per_over'),
      p_wicket_limit:n(form,'wicket_limit'),
      p_max_overs_per_bowler:n(form,'max_overs_per_bowler'),
      p_reason:s(form,'reason')||null,
    });
    if(error)throw error;
    revalidatePath(`/matches/${matchId}`);
  }catch(e:any){
    errorMessage=e?.message||'Could not override match format.';
  }
  if(errorMessage)redirect(`/matches/${matchId}?error=${encodeURIComponent(errorMessage)}`);
  redirect(`/matches/${matchId}?ok=${encodeURIComponent('Match format override saved and audited.')}`);
}


function actionError(error:any,fallback:string){
  return {ok:false as const,error:String(error?.message||fallback)};
}

async function attachOverHistory(supabase:any,matchId:string,context:any){
  const {data,error}=await supabase.rpc('ips_scoring_over_history',{p_match_id:matchId});
  if(error)return {...(context??{}),over_history:context?.over_history??[]};
  return {...(context??{}),over_history:Array.isArray(data)?data:[]};
}

export async function refreshScoringContext(matchId:string){
  try{
    const supabase=await createClient();
    const {data,error}=await supabase.rpc('ips_scoring_context',{p_match_id:matchId});
    if(error)throw error;
    return {ok:true as const,context:await attachOverHistory(supabase,matchId,data)};
  }catch(error:any){
    return actionError(error,'Could not refresh the scoring state.');
  }
}

export async function startInningsAction(input:{
  matchId:string;
  battingTeamId:string;
  strikerId:string;
  nonStrikerId:string;
  bowlerId:string;
}){
  try{
    const supabase=await createClient();
    const {data,error}=await supabase.rpc('ips_start_innings',{
      p_match_id:input.matchId,
      p_batting_team_id:input.battingTeamId,
      p_striker_id:input.strikerId,
      p_non_striker_id:input.nonStrikerId,
      p_bowler_id:input.bowlerId
    });
    if(error)throw error;
    revalidatePath('/matches/'+input.matchId);
    return {ok:true as const,context:await attachOverHistory(supabase,input.matchId,data)};
  }catch(error:any){
    return actionError(error,'Could not start the innings.');
  }
}

export async function scoreDeliveryAction(input:{
  matchId:string;
  runsOffBat?:number;
  extraType?:'WIDE'|'NO_BALL'|'BYE'|'LEG_BYE'|null;
  extraAdditionalRuns?:number;
  wicketKind?:'BOWLED'|'CAUGHT'|'RUN_OUT'|'HIT_WICKET'|null;
  dismissedPlayerId?:string|null;
  incomingBatterId?:string|null;
}){
  try{
    const supabase=await createClient();
    const {data,error}=await supabase.rpc('ips_score_delivery',{
      p_match_id:input.matchId,
      p_runs_off_bat:input.runsOffBat??0,
      p_extra_type:input.extraType??null,
      p_extra_additional_runs:input.extraAdditionalRuns??0,
      p_wicket_kind:input.wicketKind??null,
      p_dismissed_player_id:input.dismissedPlayerId??null,
      p_incoming_batter_id:input.incomingBatterId??null
    });
    if(error)throw error;
    revalidatePath('/matches/'+input.matchId);
    return {ok:true as const,context:await attachOverHistory(supabase,input.matchId,data)};
  }catch(error:any){
    return actionError(error,'Could not record the delivery.');
  }
}

export async function selectNextBowlerAction(input:{matchId:string;bowlerId:string}){
  try{
    const supabase=await createClient();
    const {data,error}=await supabase.rpc('ips_set_next_bowler',{
      p_match_id:input.matchId,
      p_bowler_id:input.bowlerId
    });
    if(error)throw error;
    revalidatePath('/matches/'+input.matchId);
    return {ok:true as const,context:await attachOverHistory(supabase,input.matchId,data)};
  }catch(error:any){
    return actionError(error,'Could not select the bowler.');
  }
}


export async function undoLastDeliveryAction(input:{matchId:string}){
  try{
    const supabase=await createClient();
    const {data,error}=await supabase.rpc('ips_undo_last_delivery',{
      p_match_id:input.matchId
    });
    if(error)throw error;
    revalidatePath('/matches/'+input.matchId);
    return {ok:true as const,context:await attachOverHistory(supabase,input.matchId,data)};
  }catch(error:any){
    return actionError(error,'Could not undo the last delivery.');
  }
}

export async function resetCurrentInningsAction(input:{matchId:string;reason?:string|null}){
  try{
    const supabase=await createClient();
    const {data,error}=await supabase.rpc('ips_reset_current_innings',{
      p_match_id:input.matchId,
      p_reason:input.reason??null
    });
    if(error)throw error;
    revalidatePath('/matches/'+input.matchId);
    return {ok:true as const,context:await attachOverHistory(supabase,input.matchId,data)};
  }catch(error:any){
    return actionError(error,'Could not reset the innings.');
  }
}
