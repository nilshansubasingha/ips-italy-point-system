'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
function s(f:FormData,k:string){return String(f.get(k)??'').trim()}
function go(kind:'ok'|'error',m:string):never{redirect(`/manage/venues?${kind}=${encodeURIComponent(m)}`)}
export async function createVenue(form:FormData){const supabase=await createClient();try{const payload:any={city_id:s(form,'city_id'),name:s(form,'name'),slug:s(form,'slug').toLowerCase(),address_text:s(form,'address_text')||null,status:'ACTIVE'};const lat=s(form,'latitude'),lng=s(form,'longitude');if(lat)payload.latitude=Number(lat);if(lng)payload.longitude=Number(lng);const{error}=await supabase.from('venues').insert(payload);if(error)throw error;revalidatePath('/manage/venues');go('ok','Venue created.')}catch(e:any){go('error',e?.message||'Could not create venue.')}}
