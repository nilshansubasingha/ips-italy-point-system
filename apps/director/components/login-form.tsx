'use client';
import {FormEvent,useState} from 'react';
import {useRouter} from 'next/navigation';
import {createClient} from '@/lib/supabase/client';
export function LoginForm(){
  const router=useRouter();const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [error,setError]=useState<string|null>(null);const [busy,setBusy]=useState(false);
  async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError(null);const supabase=createClient();const {error}=await supabase.auth.signInWithPassword({email,password});setBusy(false);if(error){setError(error.message);return;}router.replace('/');router.refresh();}
  return <form className="login-form" onSubmit={submit}><label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email"/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="current-password"/></label>{error&&<p className="form-error">{error}</p>}<button disabled={busy}>{busy?'SIGNING IN…':'SIGN IN TO DIRECTOR'}</button></form>;
}
