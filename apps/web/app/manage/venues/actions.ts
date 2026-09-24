'use server';

import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';

function s(form:FormData,key:string){
  return String(form.get(key)??'').trim();
}

function slugify(value:string){
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'')
    .replace(/-{2,}/g,'-');
}

function parseTypedCity(raw:string){
  const value=raw.trim();
  const comma=value.match(/^(.*?),\s*([A-Za-z]{2})$/);
  if(comma)return {name:comma[1].trim(),province:comma[2].toUpperCase()};
  const paren=value.match(/^(.*?)\s*\(([A-Za-z]{2})\)$/);
  if(paren)return {name:paren[1].trim(),province:paren[2].toUpperCase()};
  return {name:value,province:null as string|null};
}

async function resolveCity(supabase:any,form:FormData){
  const selectedId=s(form,'city_id');
  if(selectedId){
    const {data,error}=await supabase
      .from('cities')
      .select('id,name,province_abbr')
      .eq('id',selectedId)
      .eq('status','ACTIVE')
      .maybeSingle();
    if(error)throw error;
    if(!data)throw new Error('Selected city is no longer available.');
    return data as {id:string;name:string;province_abbr:string|null};
  }

  const typed=s(form,'city_name');
  if(!typed)throw new Error('Choose an available city or type the city name.');

  const parsed=parseTypedCity(typed);
  if(!parsed.name)throw new Error('Type a valid city name.');

  let query=supabase
    .from('cities')
    .select('id,name,province_abbr')
    .ilike('name',parsed.name)
    .eq('status','ACTIVE')
    .limit(5);

  if(parsed.province)query=query.eq('province_abbr',parsed.province);

  const {data,error}=await query;
  if(error)throw error;

  const matches=(data??[]) as Array<{id:string;name:string;province_abbr:string|null}>;
  if(!matches.length){
    throw new Error('City not found in the Italian municipality registry. Check the spelling, or type City, province code (for example Bergamo, BG).');
  }
  if(matches.length>1){
    throw new Error('More than one municipality has this name. Type the province code too, for example City, XX.');
  }
  return matches[0];
}

async function canManageVenueCity(supabase:any,cityId:string){
  const {data,error}=await supabase.rpc('ips_can_manage_venue',{p_city_id:cityId});
  if(error)throw error;
  return data===true;
}

export async function createVenue(form:FormData){
  const supabase=await createClient();

  try{
    const city=await resolveCity(supabase,form);
    if(!await canManageVenueCity(supabase,city.id)){
      throw new Error('Your current access does not allow creating a ground in this city.');
    }

    const name=s(form,'name');
    if(!name)throw new Error('Ground name is required.');

    const baseSlug=slugify(name);
    if(!baseSlug)throw new Error('Ground name must contain letters or numbers.');

    const {data:duplicate,error:duplicateError}=await supabase
      .from('venues')
      .select('id')
      .eq('city_id',city.id)
      .ilike('name',name)
      .limit(1);
    if(duplicateError)throw duplicateError;
    if((duplicate??[]).length){
      throw new Error('A ground with this name already exists in '+city.name+'.');
    }

    const lat=s(form,'latitude');
    const lng=s(form,'longitude');
    const payloadBase:any={
      city_id:city.id,
      name,
      address_text:s(form,'address_text')||null,
      status:'ACTIVE'
    };
    if(lat)payloadBase.latitude=Number(lat);
    if(lng)payloadBase.longitude=Number(lng);

    const citySlug=slugify(city.name);
    const candidates=[
      baseSlug,
      citySlug&&citySlug!==baseSlug?baseSlug+'-'+citySlug:'',
      ...Array.from({length:20},(_,index)=>baseSlug+'-'+(index+2))
    ].filter(Boolean);

    let created=false;
    let lastError:any=null;

    for(const slug of candidates){
      const {error}=await supabase.from('venues').insert({...payloadBase,slug});
      if(!error){
        created=true;
        break;
      }

      const slugCollision=error.code==='23505'&&(
        String(error.message??'').includes('venues_slug_key')
        || String(error.details??'').toLowerCase().includes('slug')
      );

      if(slugCollision){
        lastError=error;
        continue;
      }
      throw error;
    }

    if(!created){
      throw lastError??new Error('Could not generate a unique slug for this ground.');
    }
  }catch(error:any){
    redirect('/manage/venues?error='+encodeURIComponent(error?.message||'Could not create venue.'));
  }

  revalidatePath('/manage/venues');
  redirect('/manage/venues?ok='+encodeURIComponent('Venue created.'));
}


export async function updateVenue(form:FormData){
  const supabase=await createClient();
  const id=s(form,'venue_id');

  try{
    if(!id)throw new Error('Venue id is required.');

    const {data:existing,error:readError}=await supabase
      .from('venues')
      .select('id,city_id,name')
      .eq('id',id)
      .maybeSingle();
    if(readError)throw readError;
    if(!existing)throw new Error('Venue not found.');

    const city=await resolveCity(supabase,form);
    if(!await canManageVenueCity(supabase,existing.city_id)){
      throw new Error('Your current access does not allow editing this ground.');
    }
    if(!await canManageVenueCity(supabase,city.id)){
      throw new Error('Your current access does not allow moving this ground to that city.');
    }

    const name=s(form,'name');
    if(!name)throw new Error('Ground name is required.');

    const {data:duplicate,error:duplicateError}=await supabase
      .from('venues')
      .select('id')
      .eq('city_id',city.id)
      .ilike('name',name)
      .neq('id',id)
      .limit(1);
    if(duplicateError)throw duplicateError;
    if((duplicate??[]).length){
      throw new Error('A ground with this name already exists in '+city.name+'.');
    }

    const baseSlug=slugify(name);
    if(!baseSlug)throw new Error('Ground name must contain letters or numbers.');

    const citySlug=slugify(city.name);
    const candidates=[
      baseSlug,
      citySlug&&citySlug!==baseSlug?baseSlug+'-'+citySlug:'',
      ...Array.from({length:20},(_,index)=>baseSlug+'-'+(index+2))
    ].filter(Boolean);

    let chosenSlug='';
    for(const candidate of candidates){
      const {data:used,error}=await supabase
        .from('venues')
        .select('id')
        .eq('slug',candidate)
        .neq('id',id)
        .limit(1);
      if(error)throw error;
      if(!(used??[]).length){
        chosenSlug=candidate;
        break;
      }
    }
    if(!chosenSlug)throw new Error('Could not generate a unique slug for this ground.');

    const lat=s(form,'latitude');
    const lng=s(form,'longitude');
    const payload:any={
      city_id:city.id,
      name,
      slug:chosenSlug,
      address_text:s(form,'address_text')||null,
      latitude:lat?Number(lat):null,
      longitude:lng?Number(lng):null,
      updated_at:new Date().toISOString()
    };

    const {error}=await supabase.from('venues').update(payload).eq('id',id);
    if(error)throw error;
  }catch(error:any){
    redirect('/manage/venues?error='+encodeURIComponent(error?.message||'Could not update venue.'));
  }

  revalidatePath('/manage/venues');
  revalidatePath('/manage/tournaments');
  revalidatePath('/tournaments');
  redirect('/manage/venues?ok='+encodeURIComponent('Venue updated.'));
}

export async function deleteVenue(form:FormData){
  const supabase=await createClient();
  const id=s(form,'venue_id');

  try{
    if(!id)throw new Error('Venue id is required.');
    const {data:venue,error:readError}=await supabase
      .from('venues')
      .select('name')
      .eq('id',id)
      .maybeSingle();
    if(readError)throw readError;
    if(!venue)throw new Error('Venue not found.');

    const {error}=await supabase.rpc('ips_delete_venue',{p_venue_id:id});
    if(error)throw error;

    revalidatePath('/manage/venues');
    revalidatePath('/manage/tournaments');
    revalidatePath('/tournaments');
    redirect('/manage/venues?ok='+encodeURIComponent(venue.name+' permanently deleted.'));
  }catch(error:any){
    if(String(error?.digest??'').startsWith('NEXT_REDIRECT'))throw error;
    redirect('/manage/venues?error='+encodeURIComponent(error?.message||'Could not delete venue.'));
  }
}
