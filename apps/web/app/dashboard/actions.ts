'use server';

import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';

function s(form:FormData,key:string){return String(form.get(key)??'').trim();}
function go(kind:'ok'|'error',message:string){redirect('/dashboard?'+kind+'='+encodeURIComponent(message));}

export async function decideMyTeamRequest(form:FormData){
  const supabase=await createClient();
  try{
    const {data,error}=await supabase.rpc('ips_decide_player_team_request',{
      p_request_id:s(form,'request_id'),
      p_approve:s(form,'approve')==='true',
      p_note:s(form,'note')||null
    });
    if(error)throw error;
    revalidatePath('/dashboard');revalidatePath('/players');revalidatePath('/teams');revalidatePath('/manage/registrations');
    go('ok',data?.status==='APPROVED'?'Team request accepted. Your IPS player identity has been moved to the new roster.':'Team request rejected.');
  }catch(e:any){
    go('error',String(e?.message??'Could not decide this Team request.'));
  }
}
