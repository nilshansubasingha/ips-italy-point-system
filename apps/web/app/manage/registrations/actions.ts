'use server';

import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';

function s(form:FormData,key:string){return String(form.get(key)??'').trim();}
function go(path:string,key:'ok'|'error',message:string){redirect(`${path}?${key}=${encodeURIComponent(message)}`);}

export async function approvePlayerRegistration(form:FormData){
  const supabase=await createClient();
  const id=s(form,'request_id');
  const ret=`/manage/registrations/${id}`;
  try{
    const {data,error}=await supabase.rpc('ips_approve_player_registration',{
      p_request_id:id,
      p_existing_player_id:s(form,'existing_player_id')||null,
      p_side_id:s(form,'side_id')||null,
      p_reviewer_note:s(form,'note')||null
    });
    if(error)throw error;
    revalidatePath('/manage/registrations'); revalidatePath(ret); revalidatePath('/manage/players'); revalidatePath('/manage');
    const status=data?.status??'APPROVED';
    go(status==='TRANSFER_REQUIRED'?'/manage/registrations':ret,'ok',status==='TRANSFER_REQUIRED'?'Identity linked. A Team transfer is now waiting for release/approval.':'Player registration approved.');
  }catch(e:any){go(ret,'error',String(e?.message??'Could not approve player registration.'));}
}

export async function decidePlayerRegistration(form:FormData){
  const supabase=await createClient(); const id=s(form,'request_id'); const ret=`/manage/registrations/${id}`;
  try{
    const {error}=await supabase.rpc('ips_set_player_registration_decision',{p_request_id:id,p_action:s(form,'action'),p_note:s(form,'note')||null});
    if(error)throw error;
    revalidatePath('/manage/registrations'); revalidatePath(ret); revalidatePath('/manage');
    go('/manage/registrations','ok',s(form,'action')==='REJECT'?'Player registration rejected.':'Changes requested from player.');
  }catch(e:any){go(ret,'error',String(e?.message??'Could not update registration.'));}
}

export async function approveTeamRegistration(form:FormData){
  const supabase=await createClient(); const id=s(form,'request_id'); const ret=`/manage/registrations/team/${id}`;
  try{
    const {error}=await supabase.rpc('ips_approve_team_registration',{p_request_id:id,p_note:s(form,'note')||null});
    if(error)throw error;
    revalidatePath('/manage/registrations'); revalidatePath(ret); revalidatePath('/manage/teams'); revalidatePath('/teams'); revalidatePath('/manage');
    go(ret,'ok','Team approved. Review the provisional roster below before creating/linking official players.');
  }catch(e:any){go(ret,'error',String(e?.message??'Could not approve Team request.'));}
}

export async function decideTeamRegistration(form:FormData){
  const supabase=await createClient(); const id=s(form,'request_id'); const ret=`/manage/registrations/team/${id}`;
  try{
    const {error}=await supabase.rpc('ips_set_team_registration_decision',{p_request_id:id,p_action:s(form,'action'),p_note:s(form,'note')||null});
    if(error)throw error;
    revalidatePath('/manage/registrations'); revalidatePath(ret); revalidatePath('/manage');
    go('/manage/registrations','ok',s(form,'action')==='REJECT'?'Team request rejected.':'Changes requested from requester.');
  }catch(e:any){go(ret,'error',String(e?.message??'Could not update Team request.'));}
}

export async function resolveTeamRequestMember(form:FormData){
  const supabase=await createClient(); const requestId=s(form,'team_request_id'); const memberId=s(form,'member_id'); const ret=`/manage/registrations/team/${requestId}`;
  try{
    const {data,error}=await supabase.rpc('ips_resolve_team_request_member',{
      p_member_id:memberId,
      p_existing_player_id:s(form,'existing_player_id')||null,
      p_note:s(form,'note')||null
    });
    if(error)throw error;
    revalidatePath(ret); revalidatePath('/manage/registrations'); revalidatePath('/manage/players'); revalidatePath('/manage');
    go(ret,'ok',data?.status==='TRANSFER_REQUIRED'?'Existing player found on another Team. Transfer request created.':'Provisional member resolved into the official IPS registry.');
  }catch(e:any){go(ret,'error',String(e?.message??'Could not resolve provisional member.'));}
}

export async function releaseTransfer(form:FormData){
  const supabase=await createClient(); const id=s(form,'transfer_id'); const ret=`/manage/registrations/transfer/${id}`;
  try{
    const {error}=await supabase.rpc('ips_release_transfer',{p_transfer_id:id,p_approve:s(form,'approve')==='true',p_note:s(form,'note')||null});
    if(error)throw error;
    revalidatePath('/manage/registrations'); revalidatePath(ret); revalidatePath('/manage');
    go(ret,'ok',s(form,'approve')==='true'?'Player released by current Team.':'Transfer rejected by current Team.');
  }catch(e:any){go(ret,'error',String(e?.message??'Could not review transfer release.'));}
}

export async function finalizeTransfer(form:FormData){
  const supabase=await createClient(); const id=s(form,'transfer_id'); const ret=`/manage/registrations/transfer/${id}`;
  try{
    const {error}=await supabase.rpc('ips_finalize_transfer',{p_transfer_id:id,p_approve:s(form,'approve')==='true',p_note:s(form,'note')||null});
    if(error)throw error;
    revalidatePath('/manage/registrations'); revalidatePath(ret); revalidatePath('/manage/players'); revalidatePath('/manage/teams'); revalidatePath('/manage');
    go('/manage/registrations','ok',s(form,'approve')==='true'?'Transfer approved and roster membership moved.':'Transfer rejected.');
  }catch(e:any){go(ret,'error',String(e?.message??'Could not finalise transfer.'));}
}
