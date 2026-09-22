import Link from 'next/link';
import { BrandMark } from '@ips/ui';
import { AuthForm } from '@/components/auth/auth-form';

export default function SignupPage() {
  return <main className="auth-page">
    <section className="auth-brand-panel">
      <Link href="/" className="auth-brand"><BrandMark /></Link>
      <div><span className="eyebrow light">JOIN IPS</span><h1>One account.<br/><b>Multiple roles.</b></h1><p>Create your personal account. Management roles are granted separately and always remain scoped to the right club, tournament or match.</p></div>
      <div className="auth-flow"><span>Player</span><i>+</i><span>Leader</span><i>+</i><span>Scorer</span></div>
    </section>
    <section className="auth-card-panel"><div className="auth-card"><span className="micro-label">CREATE ACCOUNT</span><h2>Join the IPS network</h2><p>Creating an account does not automatically grant administrative access.</p><AuthForm mode="signup" /></div></section>
  </main>;
}
