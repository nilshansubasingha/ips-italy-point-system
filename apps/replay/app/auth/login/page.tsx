import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {LoginForm} from '@/components/login-form';

export const dynamic='force-dynamic';

export default async function LoginPage({searchParams}:{searchParams:Promise<{next?:string}>}){
  const params=await searchParams;
  const next=params?.next&&params.next.startsWith('/')&&!params.next.startsWith('//')?params.next:'/';
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(user)redirect(next);

  return <main className="login-page"><section className="login-card">
    <div className="replay-wordmark"><b>IPS</b><span>REPLAY ENGINE</span></div>
    <p className="eyebrow">PRODUCTION ACCESS</p><h1>Replay Workstation</h1>
    <p className="login-copy">Sign in to open the Replay workstation on this device.</p>
    <LoginForm nextPath={next}/>
  </section></main>;
}
