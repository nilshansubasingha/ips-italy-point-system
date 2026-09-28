import {createServerClient,type CookieOptions} from '@supabase/ssr';
import {cookies} from 'next/headers';
type CookieToSet={name:string;value:string;options:CookieOptions};
export async function createClient(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY??process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!key)throw new Error('Director Supabase environment variables are missing.');
  const store=await cookies();
  return createServerClient(url,key,{cookies:{getAll:()=>store.getAll(),setAll(items:CookieToSet[]){try{items.forEach(({name,value,options})=>store.set(name,value,options));}catch{}}}});
}
