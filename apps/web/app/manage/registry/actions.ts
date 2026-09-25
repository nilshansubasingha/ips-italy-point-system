'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

function s(form:FormData,key:string){return String(form.get(key)??'').trim();}
function nullable(form:FormData,key:string){const v=s(form,key);return v||null;}
function slugify(value:string){return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').replace(/-+/g,'-');}
function go(path:string,kind:'ok'|'error',message:string):never{redirect(`${path}${path.includes('?')?'&':'?'}${kind}=${encodeURIComponent(message)}`);}
function back(form:FormData,fallback:string){return s(form,'return_to')||fallback;}
function friendly(e:any,fallback:string){
  if(String(e?.digest??'').startsWith('NEXT_REDIRECT')||String(e?.message??'')==='NEXT_REDIRECT') throw e;
  const m=String(e?.message??fallback);
  if(m.includes('duplicate key')&&m.includes('clubs_slug')) return 'A club with that URL identity already exists.';
  if(m.includes('duplicate key')&&m.includes('teams_slug')) return 'A team with that URL identity already exists.';
  if(m.includes('player_contacts')) return 'That email or phone number is already connected to another IPS player.';
  return m;
}

export async function createTeamIdentity(form:FormData){
  const supabase=await createClient(); const ret=back(form,'/manage/teams/new');
  try{
    const {data,error}=await supabase.rpc('ips_create_team_identity',{
      p_city_id:s(form,'city_id'),
      p_name:s(form,'name'),
      p_short_name:nullable(form,'short_name'),
      p_category:s(form,'category')||'OPEN',
      p_structure:s(form,'structure')||'SINGLE'
    });
    if(error)throw error;
    const identity=Array.isArray(data)?data[0]:data;
    revalidatePath('/manage/teams'); revalidatePath('/teams'); revalidatePath('/');
    go(`/manage/teams/${identity.id}`,'ok','Team created. You can now manage its side(s) and players.');
  }catch(e:any){go(ret,'error',friendly(e,'Could not create team.'));}
}

export async function updateTeamIdentity(form:FormData){
  const supabase=await createClient(); const id=s(form,'team_identity_id'); const ret=back(form,`/manage/teams/${id}`);
  try{
    const founded=s(form,'founded_year');
    const {error}=await supabase.rpc('ips_update_team_identity',{
      p_team_identity_id:id,
      p_name:s(form,'name'),
      p_short_name:nullable(form,'short_name'),
      p_founded_year:founded?Number(founded):null,
      p_website_url:nullable(form,'website_url'),
      p_description:nullable(form,'description')
    });
    if(error)throw error;
    revalidatePath(ret); revalidatePath('/manage/teams'); revalidatePath('/teams'); revalidatePath('/');
    go(ret,'ok','Team identity updated.');
  }catch(e:any){go(ret,'error',friendly(e,'Could not update team.'));}
}

export async function addTeamSide(form:FormData){
  const supabase=await createClient(); const id=s(form,'team_identity_id'); const ret=back(form,`/manage/teams/${id}`);
  try{
    const {data,error}=await supabase.rpc('ips_add_team_side',{
      p_team_identity_id:id,
      p_side_label:s(form,'side_label'),
      p_category:s(form,'category')||'OPEN'
    });
    if(error)throw error;
    const side=Array.isArray(data)?data[0]:data;
    revalidatePath(ret); revalidatePath('/manage/teams'); revalidatePath('/teams');
    go(ret,'ok',`${side?.name??'Team side'} added.`);
  }catch(e:any){go(ret,'error',friendly(e,'Could not add team side.'));}
}

export async function deleteTeamIdentity(form:FormData){
  const supabase=await createClient(); const id=s(form,'team_identity_id');
  try{
    const {data:identity,error:readError}=await supabase.from('clubs').select('name,logo_path').eq('id',id).single(); if(readError)throw readError;
    const {error}=await supabase.rpc('ips_delete_team_identity',{p_team_identity_id:id}); if(error)throw error;
    if(identity?.logo_path)await supabase.storage.from('ips-media').remove([identity.logo_path]);
    revalidatePath('/manage/teams'); revalidatePath('/teams'); revalidatePath('/players'); revalidatePath('/');
    go('/manage/teams','ok',`${identity?.name??'Team'} permanently deleted.`);
  }catch(e:any){go(`/manage/teams/${id}`,'error',friendly(e,'Could not delete team.'));}
}

export async function createClub(form:FormData){
  const supabase=await createClient(); const ret=back(form,'/manage/clubs');
  try{
    const name=s(form,'name'); if(!name)throw new Error('Club name is required.');
    const base=slugify(name); const slug=base||`club-${Date.now()}`;
    const payload={city_id:s(form,'city_id'),name,short_name:nullable(form,'short_name'),slug,founded_year:Number(s(form,'founded_year'))||null,description:nullable(form,'description'),website_url:nullable(form,'website_url'),status:'ACTIVE'};
    const {data,error}=await supabase.from('clubs').insert(payload).select('id').single(); if(error)throw error;
    revalidatePath('/manage/clubs'); go(`/manage/clubs/${data.id}`,'ok','Club created. You can now add teams.');
  }catch(e:any){go(ret,'error',friendly(e,'Could not create club.'));}
}

export async function updateClub(form:FormData){
  const supabase=await createClient(); const id=s(form,'club_id'); const ret=back(form,`/manage/clubs/${id}`);
  try{
    const payload={name:s(form,'name'),short_name:nullable(form,'short_name'),founded_year:Number(s(form,'founded_year'))||null,description:nullable(form,'description'),website_url:nullable(form,'website_url')};
    const {error}=await supabase.from('clubs').update(payload).eq('id',id); if(error)throw error;
    revalidatePath(ret); go(ret,'ok','Club details updated.');
  }catch(e:any){go(ret,'error',friendly(e,'Could not update club.'));}
}

export async function createTeam(form:FormData){
  const supabase=await createClient(); const clubId=s(form,'club_id'); const ret=back(form,`/manage/clubs/${clubId}`);
  try{
    const name=s(form,'name'); if(!name)throw new Error('Team name is required.');
    const {data:club}=await supabase.from('clubs').select('slug').eq('id',clubId).single();
    const slug=`${slugify(club?.slug??'club')}-${slugify(name)}`.replace(/-+/g,'-').slice(0,120);
    const {data,error}=await supabase.from('teams').insert({club_id:clubId,name,short_name:nullable(form,'short_name'),slug,category:s(form,'category')||'OPEN',status:'ACTIVE'}).select('id').single(); if(error)throw error;
    revalidatePath('/manage/teams'); revalidatePath(`/manage/clubs/${clubId}`); go(`/manage/teams/${data.id}`,'ok','Team created. Add players to build the roster.');
  }catch(e:any){go(ret,'error',friendly(e,'Could not create team.'));}
}

export async function updateTeam(form:FormData){
  const supabase=await createClient(); const id=s(form,'team_id'); const ret=back(form,`/manage/teams/${id}`);
  try{
    const {error}=await supabase.from('teams').update({name:s(form,'name'),short_name:nullable(form,'short_name'),category:s(form,'category')||'OPEN'}).eq('id',id); if(error)throw error;
    revalidatePath(ret); go(ret,'ok','Team details updated.');
  }catch(e:any){go(ret,'error',friendly(e,'Could not update team.'));}
}

export async function deleteTeam(form:FormData){
  const supabase=await createClient(); const id=s(form,'team_id'); const ret=back(form,'/manage/teams');
  try{
    const {data:team,error:readError}=await supabase.from('teams').select('name,logo_path').eq('id',id).single(); if(readError)throw readError;
    const {error}=await supabase.rpc('ips_delete_team',{p_team_id:id}); if(error)throw error;
    if(team?.logo_path)await supabase.storage.from('ips-media').remove([team.logo_path]);
    revalidatePath('/manage/teams'); revalidatePath('/teams'); revalidatePath('/players'); revalidatePath(ret);
    go(ret,'ok',`${team?.name??'Team side'} permanently deleted.`);
  }catch(e:any){go(ret,'error',friendly(e,'Could not delete team side.'));}
}

export async function deletePlayer(form:FormData){
  const supabase=await createClient(); const id=s(form,'player_id');
  try{
    const {data:player,error:readError}=await supabase.from('players').select('display_name,profile_image_path').eq('id',id).single(); if(readError)throw readError;
    const {error}=await supabase.rpc('ips_delete_player',{p_player_id:id}); if(error)throw error;
    if(player?.profile_image_path)await supabase.storage.from('ips-media').remove([player.profile_image_path]);
    revalidatePath('/manage/players'); revalidatePath('/players'); revalidatePath('/manage/teams');
    go('/manage/players','ok',`${player?.display_name??'Player'} permanently deleted.`);
  }catch(e:any){go(`/manage/players/${id}`,'error',friendly(e,'Could not delete player.'));}
}

export async function createPlayerForTeam(form:FormData){
  const supabase=await createClient(); const teamId=s(form,'team_id'); const ret=back(form,`/manage/teams/${teamId}/players/add`);
  try{
    const shirt=s(form,'shirt_number'); const dob=s(form,'date_of_birth');
    const {data,error}=await supabase.rpc('ips_create_player_for_team_v2',{
      p_team_id:teamId,p_full_name:s(form,'full_name'),p_display_name:s(form,'display_name'),p_date_of_birth:dob||null,
      p_primary_role:nullable(form,'primary_role'),p_batting_style:nullable(form,'batting_style'),p_bowling_style:nullable(form,'bowling_style'),
      p_shirt_number:shirt?Number(shirt):null,p_email:nullable(form,'email'),p_phone:nullable(form,'phone'),p_whatsapp_consent:s(form,'whatsapp_consent')==='on'
    }); if(error)throw error;
    const player=Array.isArray(data)?data[0]:data;
    revalidatePath(`/manage/teams/${teamId}`); revalidatePath(`/manage/teams/${teamId}/players/add`); revalidatePath('/manage/players');
    go(`/manage/teams/${teamId}/players/add`,'ok',`${player?.display_name??'Player'} created and added to the roster.`);
  }catch(e:any){go(ret,'error',friendly(e,'Could not create player.'));}
}

export async function addExistingPlayer(form:FormData){
  const supabase=await createClient(); const teamId=s(form,'team_id'); const ret=back(form,`/manage/teams/${teamId}/players/add`); const shirt=s(form,'shirt_number');
  try{
    const {data,error}=await supabase.rpc('ips_request_existing_player_for_team',{p_team_id:teamId,p_player_id:s(form,'player_id'),p_shirt_number:shirt?Number(shirt):null}); if(error)throw error;
    revalidatePath(`/manage/teams/${teamId}`); revalidatePath(`/manage/teams/${teamId}/players/add`); revalidatePath('/manage/players'); revalidatePath('/manage/registrations');
    const status=data?.status;
    go(`/manage/teams/${teamId}/players/add`,'ok',
      status==='REQUESTED_FREE'
        ?'Join request sent. The player must approve it before joining this Team.'
        :status==='REQUESTED_TRANSFER'
          ?'Transfer request sent. The player or their current Team must approve before the roster changes.'
          :'Player request sent for approval.'
    );
  }catch(e:any){go(ret,'error',friendly(e,'Could not add existing player.'));}
}

export async function updateRosterPlayer(form:FormData){
  const supabase=await createClient(); const teamId=s(form,'team_id'); const ret=back(form,`/manage/teams/${teamId}/players/add`); const shirt=s(form,'shirt_number');
  try{
    const {error}=await supabase.rpc('ips_update_team_roster_player',{
      p_membership_id:s(form,'membership_id'),
      p_shirt_number:shirt?Number(shirt):null,
      p_team_role:s(form,'team_role')||'Player'
    });
    if(error)throw error;
    revalidatePath(`/manage/teams/${teamId}`); revalidatePath(ret); revalidatePath('/manage/players');
    go(ret,'ok','Roster role updated.');
  }catch(e:any){go(ret,'error',friendly(e,'Could not update roster role.'));}
}

export async function updateMembership(form:FormData){
  const supabase=await createClient(); const ret=back(form,'/manage/teams'); const shirt=s(form,'shirt_number');
  try{const {error}=await supabase.rpc('ips_update_team_membership',{p_membership_id:s(form,'membership_id'),p_shirt_number:shirt?Number(shirt):null});if(error)throw error;revalidatePath(ret);go(ret,'ok','Roster detail updated.');}
  catch(e:any){go(ret,'error',friendly(e,'Could not update roster detail.'));}
}

export async function endMembership(form:FormData){
  const supabase=await createClient(); const ret=back(form,'/manage/teams');
  try{const {error}=await supabase.rpc('ips_end_team_membership',{p_membership_id:s(form,'membership_id')});if(error)throw error;revalidatePath(ret);go(ret,'ok','Player removed from the active roster. Membership history was preserved.');}
  catch(e:any){go(ret,'error',friendly(e,'Could not remove player from roster.'));}
}

export async function updatePlayerIdentity(form:FormData){
  const supabase=await createClient(); const id=s(form,'player_id'); const ret=back(form,`/manage/players/${id}`);
  try{const {error}=await supabase.rpc('ips_update_player_identity',{p_player_id:id,p_display_name:s(form,'display_name'),p_given_name:nullable(form,'given_name'),p_family_name:nullable(form,'family_name'),p_primary_role:nullable(form,'primary_role'),p_batting_style:nullable(form,'batting_style'),p_bowling_style:nullable(form,'bowling_style')});if(error)throw error;revalidatePath(ret);go(ret,'ok','Player identity updated.');}
  catch(e:any){go(ret,'error',friendly(e,'Could not update player.'));}
}

export async function updatePlayerContacts(form:FormData){
  const supabase=await createClient(); const id=s(form,'player_id'); const ret=back(form,`/manage/players/${id}`);
  try{const {error}=await supabase.rpc('ips_set_player_contacts',{p_player_id:id,p_email:nullable(form,'email'),p_phone:nullable(form,'phone'),p_whatsapp_consent:s(form,'whatsapp_consent')==='on'});if(error)throw error;revalidatePath(ret);go(ret,'ok','Private contact details updated.');}
  catch(e:any){go(ret,'error',friendly(e,'Could not update contacts.'));}
}

function imageExtension(file:File){const map:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};return map[file.type]??null;}

export async function uploadEntityImage(form:FormData){
  const supabase=await createClient(); const kind=s(form,'kind'); const id=s(form,'entity_id'); const ret=back(form,'/manage');
  try{
    const file=form.get('image'); if(!(file instanceof File)||file.size===0)throw new Error('Choose an image first.');
    if(file.size>10*1024*1024)throw new Error('Image must be 10 MB or smaller.');
    const ext=imageExtension(file); if(!ext)throw new Error('Use JPG, PNG or WEBP.');
    if(!['players','clubs','teams'].includes(kind))throw new Error('Unsupported media type.');
    if(kind==='players'){
      const {data:allowed,error:allowError}=await supabase.rpc('ips_can_admin_player',{p_player_id:id}); if(allowError)throw allowError; if(!allowed)throw new Error('Only an IPS administrator can change an official player portrait.');
    }
    const table=kind==='players'?'players':kind; const pathColumn=kind==='players'?'profile_image_path':'logo_path'; const urlColumn=kind==='players'?'profile_image_url':'logo_url';
    const {data:existing}=await supabase.from(table).select(`${pathColumn}`).eq('id',id).single();
    const oldPath=(existing as any)?.[pathColumn] as string|undefined;
    const path=`${kind}/${id}/${kind==='players'?'profile':'logo'}-${Date.now()}.${ext}`;
    const bytes=new Uint8Array(await file.arrayBuffer());
    const {error:uploadError}=await supabase.storage.from('ips-media').upload(path,bytes,{contentType:file.type,upsert:false}); if(uploadError)throw uploadError;
    const {data:pub}=supabase.storage.from('ips-media').getPublicUrl(path);
    let updateError:any=null;
    if(kind==='players'){
      const result=await supabase.rpc('ips_set_player_profile_image',{p_player_id:id,p_profile_image_url:pub.publicUrl,p_profile_image_path:path}); updateError=result.error;
    }else{
      const result=await supabase.from(table).update({[pathColumn]:path,[urlColumn]:pub.publicUrl}).eq('id',id); updateError=result.error;
    }
    if(updateError){await supabase.storage.from('ips-media').remove([path]);throw updateError;}
    if(oldPath&&oldPath!==path)await supabase.storage.from('ips-media').remove([oldPath]);
    revalidatePath(ret); revalidatePath('/players'); revalidatePath('/clubs'); go(ret,'ok',kind==='players'?'Official player photo updated.':'Logo updated.');
  }catch(e:any){go(ret,'error',friendly(e,'Could not upload image.'));}
}

export async function removeEntityImage(form:FormData){
  const supabase=await createClient(); const kind=s(form,'kind'); const id=s(form,'entity_id'); const ret=back(form,'/manage');
  try{
    if(!['players','clubs','teams'].includes(kind))throw new Error('Unsupported media type.');
    if(kind==='players'){
      const {data:allowed,error:allowError}=await supabase.rpc('ips_can_admin_player',{p_player_id:id}); if(allowError)throw allowError; if(!allowed)throw new Error('Only an IPS administrator can remove an official player portrait.');
    }
    const table=kind==='players'?'players':kind; const pathColumn=kind==='players'?'profile_image_path':'logo_path'; const urlColumn=kind==='players'?'profile_image_url':'logo_url';
    const {data}=await supabase.from(table).select(`${pathColumn}`).eq('id',id).single(); const old=(data as any)?.[pathColumn];
    let error:any=null;
    if(kind==='players'){
      const result=await supabase.rpc('ips_set_player_profile_image',{p_player_id:id,p_profile_image_url:null,p_profile_image_path:null}); error=result.error;
    }else{
      const result=await supabase.from(table).update({[pathColumn]:null,[urlColumn]:null}).eq('id',id); error=result.error;
    }
    if(error)throw error;
    if(old)await supabase.storage.from('ips-media').remove([old]);
    revalidatePath(ret); revalidatePath('/players'); revalidatePath('/clubs'); go(ret,'ok','Image removed.');
  }catch(e:any){go(ret,'error',friendly(e,'Could not remove image.'));}
}

export async function claimMyPlayer(form:FormData){
  const supabase=await createClient();
  try{const {data,error}=await supabase.rpc('ips_claim_my_player',{p_player_id:s(form,'player_id')});if(error)throw error;const p=Array.isArray(data)?data[0]:data;revalidatePath('/dashboard');go('/dashboard','ok',`${p?.display_name??'Player'} linked to your IPS account.`);}
  catch(e:any){go('/claim-player','error',friendly(e,'Could not claim this player profile.'));}
}
