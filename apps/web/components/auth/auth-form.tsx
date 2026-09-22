'use client';

import { FormEvent, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type Mode = 'login' | 'signup';
type LoginMethod = 'email' | 'phone';

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const phoneAuthEnabled = process.env.NEXT_PUBLIC_PHONE_AUTH_ENABLED === 'true';
  const [method,setMethod] = useState<LoginMethod>('email');
  const [otpSent,setOtpSent] = useState(false);
  const [pendingPhone,setPendingPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true); setError(null); setMessage(null);
    const form = new FormData(event.currentTarget);
    const supabase = createClient();

    if (mode === 'login' && method === 'phone') {
      const phone = String(form.get('phone') ?? pendingPhone).trim();
      if (!otpSent) {
        const { error } = await supabase.auth.signInWithOtp({ phone, options: { shouldCreateUser: true } });
        if (error) { setError(error.message); setLoading(false); return; }
        setPendingPhone(phone); setOtpSent(true); setMessage('Verification code sent. Enter the 6-digit code from your phone.'); setLoading(false); return;
      }
      const token = String(form.get('otp') ?? '').trim();
      const { error } = await supabase.auth.verifyOtp({ phone: pendingPhone || phone, token, type: 'sms' });
      if (error) { setError(error.message); setLoading(false); return; }
      router.push('/claim-player'); router.refresh(); return;
    }

    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    const displayName = String(form.get('displayName') ?? '').trim();

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setError(error.message); setLoading(false); return; }
      const next = params.get('next') || '/dashboard';
      router.push(next); router.refresh(); return;
    }

    const redirectTo = `${window.location.origin}/auth/confirm`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectTo, data: { display_name: displayName || email.split('@')[0] } },
    });
    if (error) { setError(error.message); setLoading(false); return; }
    if (data.session) {
      router.push('/claim-player'); router.refresh();
    } else {
      setMessage('Account created. Check your email to confirm the account, then sign in.');
      setLoading(false);
    }
  }

  const login = mode === 'login';
  return <form className="auth-form" onSubmit={submit}>
    {login&&phoneAuthEnabled&&<div className="auth-method-tabs" role="tablist" aria-label="Sign-in method"><button type="button" className={method==='email'?'active':''} onClick={()=>{setMethod('email');setOtpSent(false);setMessage(null);setError(null)}}>Email</button><button type="button" className={method==='phone'?'active':''} onClick={()=>{setMethod('phone');setOtpSent(false);setMessage(null);setError(null)}}>Phone</button></div>}
    {!login && <label><span>Display name</span><input name="displayName" autoComplete="name" placeholder="Your name" required /></label>}
    {(!login||method==='email')&&<><label><span>Email</span><input name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></label><label><span>Password</span><input name="password" type="password" minLength={8} autoComplete={login ? 'current-password' : 'new-password'} placeholder="Minimum 8 characters" required /></label></>}
    {login&&method==='phone'&&<>{!otpSent?<label><span>Phone number</span><input name="phone" type="tel" autoComplete="tel" placeholder="+393451234567" required/><small className="field-note">Use international format. IPS will send a one-time verification code.</small></label>:<><div className="auth-phone-target"><span>Code sent to</span><strong>{pendingPhone}</strong><button type="button" onClick={()=>{setOtpSent(false);setMessage(null);setError(null)}}>Change</button></div><label><span>6-digit verification code</span><input name="otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" required autoFocus/></label></>}</>}
    {error && <div className="auth-message error">{error}</div>}
    {message && <div className="auth-message success">{message}</div>}
    <button className="button-primary auth-submit" disabled={loading}>{loading ? 'Please wait…' : login ? method==='phone' ? otpSent?'Verify & sign in':'Send verification code' : 'Sign in to IPS' : 'Create IPS account'}</button>
    <p className="auth-switch">{login ? <>New to IPS? <Link href="/auth/sign-up">Create an account</Link></> : <>Already have an account? <Link href="/auth/login">Sign in</Link></>}</p>
    {login&&!phoneAuthEnabled&&<p className="auth-capability-note">Phone login is prepared in IPS and becomes available when the SMS authentication provider is enabled.</p>}
  </form>;
}
