'use server';

import {revalidatePath} from 'next/cache';
import {createClient} from '@/lib/supabase/server';

type AccessLevel='OWNER'|'GLOBAL_ADMIN'|'CITY_ADMIN'|'TEAM_ADMIN'|'PLAYER';

const mapping:Record<AccessLevel,{role:'OWNER'|'ADMIN'|'PLAYER';scope:'GLOBAL'|'CITY'|'CLUB'|'PLAYER'}>={
  OWNER:{role:'OWNER',scope:'GLOBAL'},
  GLOBAL_ADMIN:{role:'ADMIN',scope:'GLOBAL'},
  CITY_ADMIN:{role:'ADMIN',scope:'CITY'},
  TEAM_ADMIN:{role:'ADMIN',scope:'CLUB'},
  PLAYER:{role:'PLAYER',scope:'PLAYER'}
};

export async function createRoleGrant(formData:FormData){
  const supabase=await createClient();
  const userId=String(formData.get('user_id')||'').trim();
  const accessLevel=String(formData.get('access_level')||'').trim() as AccessLevel;
  const scopeId=String(formData.get('scope_id')||'').trim()||null;
  const note=String(formData.get('note')||'').trim();

  if(!userId)throw new Error('Choose a registered account before granting access.');
  const mapped=mapping[accessLevel];
  if(!mapped)throw new Error('Choose a valid access level.');
  if(mapped.scope!=='GLOBAL'&&!scopeId)throw new Error('Choose the required scope before granting access.');

  const{data:{user}}=await supabase.auth.getUser();
  if(!user)throw new Error('Not authenticated');

  const{error}=await supabase.rpc('ips_create_role_grant',{
    p_user_id:userId,
    p_role:mapped.role,
    p_scope_type:mapped.scope,
    p_scope_id:scopeId,
    p_note:note||null
  });
  if(error)throw new Error(error.message);

  revalidatePath('/manage/roles');
  revalidatePath('/dashboard');
}

export async function revokeRoleGrant(formData:FormData){
  const supabase=await createClient();
  const id=String(formData.get('id')||'').trim();
  if(!id)throw new Error('Role grant not found.');

  const{data:{user}}=await supabase.auth.getUser();
  if(!user)throw new Error('Not authenticated');

  const{error}=await supabase.rpc('ips_revoke_role_grant',{p_grant_id:id});
  if(error)throw new Error(error.message);

  revalidatePath('/manage/roles');
  revalidatePath('/dashboard');
}
