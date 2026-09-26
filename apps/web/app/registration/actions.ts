'use server';

import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';

function s(form:FormData,key:string){return String(form.get(key)??'').trim();}
function go(path:string,key:'ok'|'error',message:string){redirect(`${path}?${key}=${encodeURIComponent(message)}`);}

export async function addRequestedTeamMember(form:FormData){
  const supabase=await createClient();
  const requestId=s(form,'team_request_id');
  const ret=`/registration/team-request/${requestId}`;
  try{
    const dob=s(form,'date_of_birth');
    const {error}=await supabase.rpc('ips_add_team_request_member',{
      p_team_request_id:requestId,
      p_full_name:s(form,'full_name'),
      p_display_name:s(form,'display_name')||null,
      p_date_of_birth:dob||null,
      p_email:s(form,'email')||null,
      p_phone:s(form,'phone')||null,
      p_side_label:s(form,'side_label')||'MAIN',
      p_primary_role:s(form,'primary_role')||null
    });
    if(error)throw error;
    revalidatePath(ret);
    go(ret,'ok','Provisional member added. IPS will check for an existing player before approval.');
  }catch(e:any){go(ret,'error',String(e?.message??'Could not add provisional member.'));}
}

export async function addRequestedTeamMembersBulk(form:FormData){
  const supabase=await createClient();
  const requestId=s(form,'team_request_id');
  const ret=`/registration/team-request/${requestId}`;
  try{
    const raw=s(form,'members_json');
    const members=JSON.parse(raw||'[]');
    if(!Array.isArray(members))throw new Error('Invalid bulk roster data.');
    const {data,error}=await supabase.rpc('ips_bulk_add_team_request_members',{
      p_team_request_id:requestId,
      p_members:members
    });
    if(error)throw error;
    const created=Number(data?.created??0);
    const failed=Array.isArray(data?.failed)?data.failed:[];
    revalidatePath(ret);
    const details=failed.slice(0,3).map((x:any)=>`${x.full_name||'Row '+x.row}: ${x.error}`).join(' · ');
    go(ret,failed.length?'error':'ok',
      failed.length
        ?`${created} member${created===1?'':'s'} added. ${failed.length} need attention. ${details}`
        :`${created} provisional member${created===1?'':'s'} added together.`
    );
  }catch(e:any){go(ret,'error',String(e?.message??'Could not add roster members.'));}
}

export async function removeRequestedTeamMember(form:FormData){
  const supabase=await createClient();
  const requestId=s(form,'team_request_id');
  const ret=`/registration/team-request/${requestId}`;
  try{
    const {error}=await supabase.rpc('ips_remove_team_request_member',{p_member_id:s(form,'member_id')});
    if(error)throw error;
    revalidatePath(ret);
    go(ret,'ok','Provisional member removed.');
  }catch(e:any){go(ret,'error',String(e?.message??'Could not remove member.'));}
}
