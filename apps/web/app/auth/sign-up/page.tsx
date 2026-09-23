import Link from 'next/link';
import { BrandMark } from '@ips/ui';
import { AuthForm } from '@/components/auth/auth-form';
import { createClient } from '@/lib/supabase/server';

export const dynamic='force-dynamic';

export default async function SignupPage() {
  const supabase=await createClient();
  const [{data:cities},{data:teamIdentities},{data:sides}]=await Promise.all([
    supabase.from('cities').select('id,name,code').eq('status','ACTIVE').order('name'),
    supabase.from('clubs').select('id,name,city_id').eq('status','ACTIVE').order('name'),
    supabase.from('teams').select('id,club_id,name,side_label,side_order').eq('status','ACTIVE').order('side_order')
  ]);
  const sideByTeam=new Map<string,any[]>();
  for(const side of sides??[]){
    if(!sideByTeam.has(side.club_id))sideByTeam.set(side.club_id,[]);
    sideByTeam.get(side.club_id)!.push(side);
  }
  const teams=(teamIdentities??[]).map((team:any)=>({
    id:team.id,
    name:String(team.name).replace(/\s+Cricket Club$/i,''),
    city_id:team.city_id,
    sides:(sideByTeam.get(team.id)??[]).map((side:any)=>({id:side.id,name:side.name,label:side.side_label,order:side.side_order}))
  }));

  return <main className="auth-page auth-page-registration">
    <section className="auth-brand-panel">
      <Link href="/" className="auth-brand"><BrandMark /></Link>
      <div><span className="eyebrow light">JOIN IPS</span><h1>Your account.<br/><b>Your cricket identity.</b></h1><p>Create the account first. IPS then checks existing player identities and sends the registration to the correct City or Team administrators for approval.</p></div>
      <div className="auth-flow"><span>Account</span><i>→</i><span>Identity check</span><i>→</i><span>Approval</span></div>
    </section>
    <section className="auth-card-panel"><div className="auth-card auth-card-wide"><span className="micro-label">CREATE PLAYER ACCOUNT</span><h2>Join the IPS network</h2><p>Full name and city help IPS prevent duplicate players. Date of birth and phone are optional and private.</p><AuthForm mode="signup" registrationOptions={{cities:cities??[],teams}} /></div></section>
  </main>;
}
