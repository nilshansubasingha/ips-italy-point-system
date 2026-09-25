'use server';

import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';

function value(form:FormData,key:string){const v=form.get(key);return typeof v==='string'?v.trim():'';}

export async function decideMyTeamRequest(form:FormData){
  const supabase=await createClient();
  const requestId=value(form,'request_id');
  const approve=value(form,'decision')==='approve';
  const {error}=await supabase.rpc('ips_decide_player_team_request',{p_request_id:requestId,p_approve:approve,p_note:null});
  if(error)redirect('/dashboard?error='+encodeURIComponent(error.message));
  revalidatePath('/dashboard');revalidatePath('/players');revalidatePath('/teams');revalidatePath('/manage/registrations');
  redirect('/dashboard?ok='+encodeURIComponent(approve?'Team request approved. Your roster has been updated.':'Team request declined.'));
}
