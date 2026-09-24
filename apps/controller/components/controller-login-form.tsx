'use client';

import {FormEvent,useState} from 'react';
import {useRouter,useSearchParams} from 'next/navigation';
import {createClient} from '@/lib/supabase/client';

function safeNext(value:string|null){
  if(!value||!value.startsWith('/')||value.startsWith('//'))return '/';
  return value;
}

export function ControllerLoginForm(){
  const router=useRouter();
  const params=useSearchParams();
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    setLoading(true);
    setError(null);

    const form=new FormData(event.currentTarget);
    const email=String(form.get('email')??'').trim();
    const password=String(form.get('password')??'');
    const supabase=createClient();

    const {error}=await supabase.auth.signInWithPassword({email,password});
    if(error){
      setError(error.message);
      setLoading(false);
      return;
    }

    router.replace(safeNext(params.get('next')));
    router.refresh();
  }

  return <form className="controller-login-form" onSubmit={submit}>
    <label>
      <span>Email</span>
      <input name="email" type="email" autoComplete="email" placeholder="you@example.com" required autoFocus/>
    </label>
    <label>
      <span>Password</span>
      <input name="password" type="password" autoComplete="current-password" minLength={8} placeholder="Your IPS password" required/>
    </label>
    {error&&<div className="controller-login-error">{error}</div>}
    <button type="submit" disabled={loading}>{loading?'Signing in…':'Sign in to Match Controller'}</button>
  </form>;
}
