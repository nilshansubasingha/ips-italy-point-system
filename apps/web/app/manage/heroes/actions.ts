'use server';

import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {isOwner,requireAccount} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';

function s(form:FormData,key:string){return String(form.get(key)??'').trim();}
function go(kind:'ok'|'error',message:string):never{redirect('/manage/heroes?'+kind+'='+encodeURIComponent(message));}
function ext(file:File){return ({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'} as Record<string,string>)[file.type]??null;}

async function requireOwner(){
  const account=await requireAccount();
  if(!isOwner(account))redirect('/dashboard?access=owner-required');
  return account;
}

function parseVariant(form:FormData){
  const variant=s(form,'variant');
  if(variant!=='desktop'&&variant!=='mobile')throw new Error('Unsupported hero variant.');
  return variant as 'desktop'|'mobile';
}

export async function uploadDirectoryHero(form:FormData){
  const account=await requireOwner();
  const supabase=await createClient();

  try{
    const scope=s(form,'scope');
    const cityId=s(form,'city_id')||null;
    const variant=parseVariant(form);
    const file=form.get('image');

    if(!(file instanceof File)||file.size===0)throw new Error('Choose and crop an image first.');
    if(file.size>10*1024*1024)throw new Error('Hero image must be 10 MB or smaller.');
    const extension=ext(file);
    if(!extension)throw new Error('Use JPG, PNG or WEBP.');

    let scopeKey='italy';
    let label='All Italy';
    let verifiedCityId:string|null=null;

    if(scope==='city'){
      if(!cityId)throw new Error('City is required.');
      const {data:city,error:cityError}=await supabase.from('cities').select('id,name').eq('id',cityId).eq('status','ACTIVE').maybeSingle();
      if(cityError)throw cityError;
      if(!city)throw new Error('City not found.');
      verifiedCityId=city.id;
      scopeKey='city:'+city.id;
      label=city.name;
    }else if(scope!=='italy'){
      throw new Error('Unsupported hero scope.');
    }

    const {data:existing,error:existingError}=await supabase
      .from('directory_hero_backgrounds')
      .select('image_path,image_url,mobile_image_path,mobile_image_url')
      .eq('scope_key',scopeKey)
      .maybeSingle();
    if(existingError)throw existingError;

    const folder=verifiedCityId??'italy';
    const path=`city-heroes/${folder}/hero-${variant}-${Date.now()}.${extension}`;
    const bytes=new Uint8Array(await file.arrayBuffer());
    const {error:uploadError}=await supabase.storage.from('ips-media').upload(path,bytes,{contentType:file.type,upsert:false});
    if(uploadError)throw uploadError;

    const {data:publicData}=supabase.storage.from('ips-media').getPublicUrl(path);

    const payload:any={
      scope_key:scopeKey,
      city_id:verifiedCityId,
      updated_by:account.user.id,
      updated_at:new Date().toISOString()
    };

    if(variant==='mobile'){
      payload.mobile_image_path=path;
      payload.mobile_image_url=publicData.publicUrl;
    }else{
      payload.image_path=path;
      payload.image_url=publicData.publicUrl;
    }

    const {error:saveError}=await supabase.from('directory_hero_backgrounds').upsert(payload,{onConflict:'scope_key'});

    if(saveError){
      await supabase.storage.from('ips-media').remove([path]);
      throw saveError;
    }

    const oldPath=variant==='mobile'?existing?.mobile_image_path:existing?.image_path;
    if(oldPath&&oldPath!==path)await supabase.storage.from('ips-media').remove([oldPath]);

    revalidatePath('/teams');
    revalidatePath('/manage/heroes');
    go('ok',label+' '+variant+' hero background updated.');
  }catch(error:any){
    if(String(error?.digest??'').startsWith('NEXT_REDIRECT'))throw error;
    go('error',error?.message||'Could not upload hero background.');
  }
}

export async function removeDirectoryHero(form:FormData){
  await requireOwner();
  const supabase=await createClient();

  try{
    const scopeKey=s(form,'scope_key');
    const variant=parseVariant(form);
    if(!scopeKey)throw new Error('Hero scope is required.');

    const {data:existing,error:readError}=await supabase
      .from('directory_hero_backgrounds')
      .select('image_path,image_url,mobile_image_path,mobile_image_url,city_id')
      .eq('scope_key',scopeKey)
      .maybeSingle();
    if(readError)throw readError;
    if(!existing)throw new Error('No custom background is set.');

    const selectedPath=variant==='mobile'?existing.mobile_image_path:existing.image_path;
    const otherPath=variant==='mobile'?existing.image_path:existing.mobile_image_path;
    if(!selectedPath)throw new Error('No custom '+variant+' background is set.');

    if(otherPath){
      const updates=variant==='mobile'
        ?{mobile_image_path:null,mobile_image_url:null,updated_at:new Date().toISOString()}
        :{image_path:null,image_url:null,updated_at:new Date().toISOString()};
      const {error:updateError}=await supabase.from('directory_hero_backgrounds').update(updates).eq('scope_key',scopeKey);
      if(updateError)throw updateError;
    }else{
      const {error:deleteError}=await supabase.from('directory_hero_backgrounds').delete().eq('scope_key',scopeKey);
      if(deleteError)throw deleteError;
    }

    await supabase.storage.from('ips-media').remove([selectedPath]);

    revalidatePath('/teams');
    revalidatePath('/manage/heroes');
    go('ok','Custom '+variant+' hero background removed.');
  }catch(error:any){
    if(String(error?.digest??'').startsWith('NEXT_REDIRECT'))throw error;
    go('error',error?.message||'Could not remove hero background.');
  }
}
