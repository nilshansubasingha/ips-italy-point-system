'use server';

import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';

function value(form:FormData,key:string){
  return String(form.get(key)??'').trim();
}

function go(id:string,kind:'ok'|'error',message:string):never{
  redirect('/manage/accounts/'+encodeURIComponent(id)+'?'+kind+'='+encodeURIComponent(message));
}

export async function updateManagedProfile(form:FormData){
  const supabase=await createClient();
  const userId=value(form,'user_id');
  const displayName=value(form,'display_name');
  const fullName=value(form,'full_name');
  const phone=value(form,'phone');
  const dateOfBirth=value(form,'date_of_birth');
  const cityId=value(form,'city_id')||null;

  if(!userId)throw new Error('Profile id is required.');

  const {error}=await supabase.rpc('ips_update_managed_profile',{
    p_user_id:userId,
    p_display_name:displayName,
    p_full_name:fullName,
    p_phone:phone,
    p_date_of_birth:dateOfBirth||null,
    p_city_id:cityId
  });

  if(error)go(userId,'error',error.message);

  revalidatePath('/manage/roles');
  revalidatePath('/manage/players');
  revalidatePath('/manage/accounts/'+userId);
  go(userId,'ok','Profile updated.');
}
