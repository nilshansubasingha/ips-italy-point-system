export const dynamic='force-dynamic'; export const revalidate=0;

import Link from 'next/link';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {requireAccount} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';

function statusCopy(status?:string){
  switch(status){
    case 'PENDING_EMAIL': return ['Confirm your account','Check your email and confirm the account before an administrator can approve the registration.'];
    case 'PENDING': return ['Registration pending','Your registration is visible to the appropriate IPS administrators.'];
    case 'POSSIBLE_MATCH': return ['Identity match needs review','IPS found a possible existing player. An administrator must resolve it before a new identity can be created.'];
    case 'CHANGES_REQUESTED': return ['Changes requested','An administrator needs more information before approval.'];
    case 'TRANSFER_REQUIRED': return ['Transfer required','Your IPS identity was found on another Team. A transfer workflow is now required instead of creating a duplicate player.'];
    case 'APPROVED': return ['Registration approved','Your account is linked to an official IPS player identity.'];
    case 'REJECTED': return ['Registration not approved','Review the administrator note or contact IPS administration.'];
    default: return ['Account ready','No player registration request was found for this account.'];
  }
}

export default async function RegistrationPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const account=await requireAccount();
  const sp=await searchParams;
  const supabase=await createClient();
  const {data,error}=await supabase.rpc('ips_my_registration_status');
  const player=data?.player_request??null;
  const team=data?.team_request??null;
  const [title,copy]=statusCopy(player?.status);

  return <main className="shell sports-shell">
    <SiteHeader/>
    <section className="registration-status-hero">
      <div>
        <span className="eyebrow">MY IPS REGISTRATION</span>
        <h1>{title}</h1>
        <p>{copy}</p>
      </div>
      <div className={`registration-state-badge ${String(player?.status??'NONE').toLowerCase()}`}>
        <span>STATUS</span><strong>{player?.status??'NO REQUEST'}</strong>
      </div>
    </section>
    {error&&<div className="ops-message error">{error.message}</div>}
    {typeof sp.ok==='string'&&<div className="ops-message success">{sp.ok}</div>}
    {typeof sp.error==='string'&&<div className="ops-message error">{sp.error}</div>}

    {player&&<section className="registration-overview-grid">
      <article className="management-surface">
        <div className="surface-head"><div><span className="eyebrow">PLAYER REQUEST</span><h2>{player.display_name}</h2></div><span>{player.city}</span></div>
        <dl className="registration-facts">
          <div><dt>Full name</dt><dd>{player.full_name}</dd></div>
          <div><dt>Requested Team</dt><dd>{player.team_name??'No current Team'}</dd></div>
          <div><dt>Competitive side</dt><dd>{player.side_name??'Pending / none'}</dd></div>
          <div><dt>Submitted</dt><dd>{new Intl.DateTimeFormat('en-GB',{dateStyle:'medium'}).format(new Date(player.created_at))}</dd></div>
        </dl>
        {player.reviewer_note&&<div className="reviewer-note"><strong>Administrator note</strong><p>{player.reviewer_note}</p></div>}
        {player.status==='APPROVED'&&<Link className="button-primary" href="/dashboard">Open My IPS →</Link>}
      </article>

      {team&&<article className="management-surface">
        <div className="surface-head"><div><span className="eyebrow">NEW TEAM REQUEST</span><h2>{team.name}</h2></div><span>{team.status}</span></div>
        <dl className="registration-facts">
          <div><dt>City</dt><dd>{team.city}</dd></div>
          <div><dt>Structure</dt><dd>{team.structure.replaceAll('_',' + ')}</dd></div>
          <div><dt>Provisional members</dt><dd>{team.member_count}</dd></div>
        </dl>
        {team.reviewer_note&&<div className="reviewer-note"><strong>Administrator note</strong><p>{team.reviewer_note}</p></div>}
        {['PENDING_EMAIL','PENDING','CHANGES_REQUESTED'].includes(team.status)&&<Link className="button-primary" href={`/registration/team-request/${team.id}`}>Add / review Team members →</Link>}
      </article>}
    </section>}

    {!player&&<section className="management-surface claim-empty"><strong>No player registration request.</strong><p>This account may have been created before the new IPS registration workflow. You can continue using the existing claim process or contact an administrator.</p><Link className="button-secondary" href="/claim-player">Check existing player identity →</Link></section>}
    <SiteFooter/>
  </main>;
}
