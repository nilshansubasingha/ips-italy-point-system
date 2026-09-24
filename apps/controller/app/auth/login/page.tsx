import Link from 'next/link';
import {redirect} from 'next/navigation';
import {BrandMark} from '@ips/ui';
import {createClient} from '@/lib/supabase/server';
import {ControllerLoginForm} from '@/components/controller-login-form';

const WEB_URL=process.env.NEXT_PUBLIC_IPS_WEB_URL??'http://localhost:3000';

export const dynamic='force-dynamic';
export const revalidate=0;

export default async function ControllerLoginPage(){
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(user)redirect('/');

  return <main className="controller-portal controller-auth-page">
    <section className="controller-auth-card">
      <div className="controller-auth-brand">
        <BrandMark/>
        <div>
          <span>IPS MATCH CONTROLLER</span>
          <strong>Official scoring access</strong>
        </div>
      </div>
      <div className="controller-auth-copy">
        <span className="micro">SAME IPS ACCOUNT</span>
        <h1>Sign in to the Controller.</h1>
        <p>Use the same email and password as the main IPS website. Railway hosts the Controller on a separate domain, so it needs its own browser session.</p>
      </div>
      <ControllerLoginForm/>
      <div className="controller-auth-foot">
        <span>Need to manage your IPS account?</span>
        <Link href={WEB_URL+'/dashboard'}>Open IPS dashboard →</Link>
      </div>
    </section>
  </main>;
}
