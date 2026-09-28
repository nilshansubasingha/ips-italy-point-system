import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {LoginForm} from '@/components/login-form';
export const dynamic='force-dynamic';
export default async function LoginPage(){
  const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(user)redirect('/');
  return <main className="login-page"><section className="login-card"><div className="director-wordmark"><b>IPS</b><span>PRISM DIRECTOR</span></div><p className="eyebrow">LIVE PRODUCTION ACCESS</p><h1>Director Studio</h1><p className="login-copy">Control the published broadcast package. Scoring remains separate and authoritative.</p><LoginForm/></section></main>;
}
