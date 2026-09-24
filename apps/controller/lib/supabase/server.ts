import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

type CookieToSet = { name:string; value:string; options:CookieOptions };

export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Controller Supabase environment variables are missing.');
  const cookieStore = await cookies();
  return createServerClient(url, key, { cookies: {
    getAll: () => cookieStore.getAll(),
    setAll(cookiesToSet: CookieToSet[]) { try { cookiesToSet.forEach(({name,value,options}) => cookieStore.set(name,value,options)); } catch {} }
  }});
}
