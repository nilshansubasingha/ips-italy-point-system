import Link from 'next/link';
import { BrandMark } from '@ips/ui';
import { AuthForm } from '@/components/auth/auth-form';

export default function LoginPage() {
  return <main className="auth-page">
    <section className="auth-brand-panel">
      <Link href="/" className="auth-brand"><BrandMark /></Link>
      <div><span className="eyebrow light">IPS ACCOUNT</span><h1>Your role.<br/><b>Your cricket context.</b></h1><p>One account can represent you as a player, club leader, tournament administrator or assigned scorer without creating duplicate logins.</p></div>
      <div className="auth-flow"><span>Identity</span><i>→</i><span>Role</span><i>→</i><span>Scope</span><i>→</i><span>Access</span></div>
    </section>
    <section className="auth-card-panel"><div className="auth-card"><span className="micro-label">WELCOME BACK</span><h2>Sign in to IPS</h2><p>Public cricket remains open to everyone. Sign in only when you need your account or management tools.</p><AuthForm mode="login" /></div></section>
  </main>;
}
