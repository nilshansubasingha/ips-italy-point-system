'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {CitySearchSelect} from '@/components/location/city-search-select';

type Mode = 'login' | 'signup';
type LoginMethod = 'email' | 'phone';
 type SideOption={id:string;name:string;label:string;order:number};
type TeamOption={id:string;name:string;city_id:string;sides:SideOption[]};

export function AuthForm({ mode, registrationOptions }:{mode:Mode;registrationOptions?:{teams:TeamOption[]}}) {
  const router = useRouter();
  const params = useSearchParams();
  const phoneAuthEnabled = process.env.NEXT_PUBLIC_PHONE_AUTH_ENABLED === 'true';
  const [method,setMethod] = useState<LoginMethod>('email');
  const [otpSent,setOtpSent] = useState(false);
  const [pendingPhone,setPendingPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cityId,setCityId]=useState('');
  const [teamChoice,setTeamChoice]=useState('');
  const [proposedStructure,setProposedStructure]=useState('SINGLE');

  const teamsForCity=useMemo(()=>registrationOptions?.teams.filter(t=>!cityId||t.city_id===cityId)??[],[registrationOptions,cityId]);
  const selectedTeam=teamsForCity.find(t=>t.id===teamChoice);
  const missingTeam=teamChoice==='NOT_LISTED';

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
      router.push('/registration'); router.refresh(); return;
    }

    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setError(error.message); setLoading(false); return; }
      const next = params.get('next') || '/dashboard';
      router.push(next); router.refresh(); return;
    }

    const fullName=String(form.get('fullName')??'').trim();
    const displayName=String(form.get('displayName')??'').trim()||fullName;
    const dateOfBirth=String(form.get('dateOfBirth')??'').trim();
    const phone=String(form.get('registrationPhone')??'').trim();
    const city=String(form.get('cityId')??'').trim();
    const teamIdentity=missingTeam?'':String(form.get('teamIdentityId')??'').trim();
    const sideId=missingTeam?'':String(form.get('sideId')??'').trim();
    const primaryRole=String(form.get('primaryRole')??'').trim();
    const requestedSideLabel=missingTeam
      ? (proposedStructure==='SINGLE'?'MAIN':String(form.get('requestedSideLabel')??'A'))
      : (selectedTeam?.sides.find(s=>s.id===sideId)?.label??'MAIN');

    if(!fullName||!city){setError('Full name and city are required.');setLoading(false);return;}
    if(!teamChoice){setError('Select your Team, choose Team not listed, or choose No current Team.');setLoading(false);return;}

    const redirectTo = `${window.location.origin}/auth/confirm?next=/registration`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: {
          registration_intent:'PLAYER',
          full_name:fullName,
          display_name:displayName,
          date_of_birth:dateOfBirth||null,
          phone:phone||null,
          city_id:city,
          team_identity_id:teamIdentity||null,
          side_id:sideId||null,
          requested_side_label:requestedSideLabel,
          primary_role:primaryRole||null,
          team_not_listed:missingTeam,
          proposed_team_name:missingTeam?String(form.get('proposedTeamName')??'').trim():null,
          proposed_team_short_name:missingTeam?String(form.get('proposedTeamShortName')??'').trim():null,
          proposed_team_structure:missingTeam?proposedStructure:null,
          proposed_team_category:missingTeam?String(form.get('proposedTeamCategory')??'OPEN'):null,
        }
      },
    });
    if (error) { setError(error.message); setLoading(false); return; }
    if (data.session) {
      router.push('/registration'); router.refresh();
    } else {
      setMessage('Account created. Check your email to confirm it. Your IPS player registration will then enter the approval queue.');
      setLoading(false);
    }
  }

  const login = mode === 'login';
  return <form className="auth-form" onSubmit={submit}>
    {login&&phoneAuthEnabled&&<div className="auth-method-tabs" role="tablist" aria-label="Sign-in method"><button type="button" className={method==='email'?'active':''} onClick={()=>{setMethod('email');setOtpSent(false);setMessage(null);setError(null)}}>Email</button><button type="button" className={method==='phone'?'active':''} onClick={()=>{setMethod('phone');setOtpSent(false);setMessage(null);setError(null)}}>Phone</button></div>}

    {!login&&<>
      <div className="signup-section-head"><span>01</span><div><strong>Account & identity</strong><small>Private identity data is used for duplicate checking.</small></div></div>
      <div className="auth-form-grid">
        <label className="wide"><span>Full legal name *</span><input name="fullName" autoComplete="name" placeholder="Harsha Silva" required /></label>
        <label><span>Public display name</span><input name="displayName" placeholder="H. Silva" /><small className="field-note">Optional. Used on scorecards and rankings.</small></label>
        <label><span>Date of birth</span><input name="dateOfBirth" type="date" /><small className="field-note">Optional and private.</small></label>
        <label><span>Phone</span><input name="registrationPhone" type="tel" autoComplete="tel" placeholder="+393451234567"/><small className="field-note">Optional. International format recommended.</small></label>
      </div>
    </>}

    {(!login||method==='email')&&<>
      <label><span>Email</span><input name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></label>
      <label><span>Password</span><input name="password" type="password" minLength={8} autoComplete={login ? 'current-password' : 'new-password'} placeholder="Minimum 8 characters" required /></label>
    </>}

    {!login&&registrationOptions&&<>
      <div className="signup-section-head"><span>02</span><div><strong>Cricket registration</strong><small>Choose the city and Team you currently belong to.</small></div></div>
      <CitySearchSelect name="cityId" value={cityId} required label="City" onChange={(id)=>{setCityId(id);setTeamChoice('')}}/>
      <label><span>Your Team *</span><select name="teamIdentityId" value={teamChoice} onChange={e=>setTeamChoice(e.target.value)} required>
        <option value="">Select Team</option>
        <option value="NO_TEAM">No current Team</option>
        <option value="NOT_LISTED">My Team is not listed</option>
        {teamsForCity.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
      </select></label>

      {selectedTeam&&selectedTeam.sides.length>1&&<label><span>Competitive side *</span><select name="sideId" required defaultValue=""><option value="">Select A / B / C side</option>{selectedTeam.sides.map(s=><option key={s.id} value={s.id}>{s.label==='MAIN'?s.name:`${s.label} Team · ${s.name}`}</option>)}</select></label>}
      {selectedTeam&&selectedTeam.sides.length===1&&<input type="hidden" name="sideId" value={selectedTeam.sides[0]?.id??''}/>}

      {missingTeam&&<div className="missing-team-signup">
        <div className="signup-inline-note"><strong>Request a new Team</strong><span>This creates a request, not a live Team. A City or Global Admin must approve it.</span></div>
        <label className="wide"><span>Team name *</span><input name="proposedTeamName" required placeholder="Roma Eagles"/></label>
        <label><span>Short name</span><input name="proposedTeamShortName" placeholder="Roma Eagles"/></label>
        <label><span>Structure *</span><select value={proposedStructure} onChange={e=>setProposedStructure(e.target.value)} name="proposedTeamStructure"><option value="SINGLE">Single side</option><option value="A_B">A + B sides</option><option value="A_B_C">A + B + C sides</option></select></label>
        <label><span>Category</span><select name="proposedTeamCategory" defaultValue="OPEN"><option value="OPEN">Open</option><option value="MEN">Men</option><option value="WOMEN">Women</option><option value="YOUTH">Youth</option><option value="VETERANS">Veterans</option></select></label>
        {proposedStructure!=='SINGLE'&&<label><span>Your side *</span><select name="requestedSideLabel" defaultValue="A">{['A','B',...(proposedStructure==='A_B_C'?['C']:[])].map(v=><option key={v}>{v}</option>)}</select></label>}
      </div>}

      <label><span>Primary playing role</span><select name="primaryRole" defaultValue=""><option value="">Not set</option><option>Batter</option><option>Bowler</option><option>All-rounder</option><option>Wicketkeeper</option><option>Wicketkeeper-batter</option></select></label>
      <div className="signup-approval-note"><strong>Approval required.</strong><span>IPS checks for an existing player first. If your player already belongs to another Team, the system creates a transfer request instead of duplicating the player.</span></div>
    </>}

    {login&&method==='phone'&&<>{!otpSent?<label><span>Phone number</span><input name="phone" type="tel" autoComplete="tel" placeholder="+393451234567" required/><small className="field-note">Use international format. IPS will send a one-time verification code.</small></label>:<><div className="auth-phone-target"><span>Code sent to</span><strong>{pendingPhone}</strong><button type="button" onClick={()=>{setOtpSent(false);setMessage(null);setError(null)}}>Change</button></div><label><span>6-digit verification code</span><input name="otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" required autoFocus/></label></>}</>}

    {error && <div className="auth-message error">{error}</div>}
    {message && <div className="auth-message success">{message}</div>}
    <button className="button-primary auth-submit" disabled={loading}>{loading ? 'Please wait…' : login ? method==='phone' ? otpSent?'Verify & sign in':'Send verification code' : 'Sign in to IPS' : 'Create account & submit registration'}</button>
    <p className="auth-switch">{login ? <>New to IPS? <Link href="/auth/sign-up">Create an account</Link></> : <>Already have an account? <Link href="/auth/login">Sign in</Link></>}</p>
    {login&&!phoneAuthEnabled&&<p className="auth-capability-note">Phone login is prepared in IPS and becomes available when the SMS authentication provider is enabled.</p>}
  </form>;
}
