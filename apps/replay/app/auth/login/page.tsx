import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {LoginForm} from '@/components/login-form';
export const dynamic='force-dynamic';
export default async function LoginPage(){
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(user)redirect('/');
  return <main className="login-page"><section className="login-card">
    <div className="replay-wordmark"><b>IPS</b><span>REPLAY ENGINE</span></div>
    <p className="eyebrow">LOCAL PRODUCTION ACCESS</p><h1>Replay Workstation</h1>
    <p className="login-copy">Arm local cameras, capture scorer-linked replay clips and drive the clean IPS PROGRAM output for PRISM.</p>
    <LoginForm/>
  </section></main>;
}
