export const dynamic='force-dynamic'; export const revalidate=0;

import Link from 'next/link';
import {notFound} from 'next/navigation';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {ManagementNav} from '@/components/manage/manage-nav';
import {requireAccount} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {PlayerAvatar} from '@/components/identity';
import {releaseTransfer,finalizeTransfer} from '../../actions';

export default async function TransferDetail({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const account=await requireAccount();
  const {id}=await params;
  const sp=await searchParams;
  const supabase=await createClient();
  const {data:t,error}=await supabase.rpc('ips_transfer_detail',{p_transfer_id:id});
  if(error||!t)notFound();

  return <main className="shell sports-shell">
    <SiteHeader/><ManagementNav account={account} active="registrations"/>
    <section className="manage-titlebar compact">
      <div><Link className="back-link" href="/manage/registrations">← Registration Requests</Link><span className="eyebrow">PLAYER TRANSFER</span><h1>{t.player_name}</h1><p>IPS permits one active top-level Team at a time. Moving to another Team preserves the same permanent player identity and historical records.</p></div>
      <div className={`registration-state-badge ${String(t.status).toLowerCase()}`}><span>STATUS</span><strong>{t.status}</strong></div>
    </section>
    {typeof sp.ok==='string'&&<div className="ops-message success">{sp.ok}</div>}
    {typeof sp.error==='string'&&<div className="ops-message error">{sp.error}</div>}

    <section className="transfer-identity-card management-surface">
      <PlayerAvatar name={t.player_name} large/>
      <div><span>{t.ips_code}</span><h2>{t.player_name}</h2><Link href={`/manage/players/${t.player_id}`}>Open player profile →</Link></div>
      <div className="transfer-route">
        <article><span>FROM</span><strong>{String(t.from_team_name).replace(/\s+Cricket Club$/i,'')}</strong><small>{t.from_side_name??'Current side'}</small></article>
        <i>→</i>
        <article><span>TO</span><strong>{String(t.to_team_name).replace(/\s+Cricket Club$/i,'')}</strong><small>{t.to_side_name}</small></article>
      </div>
    </section>

    <section className="registration-review-grid">
      <article className="management-surface">
        <div className="surface-head"><div><span className="eyebrow">STEP 1</span><h2>Current Team release</h2></div><span>{t.released_at?'Completed':'Required'}</span></div>
        <p className="management-help">The current Team administrator, City Admin or Global Admin can confirm the player is released.</p>
        {t.can_release&&t.status==='REQUESTED'&&<form action={releaseTransfer} className="compact-form"><input type="hidden" name="transfer_id" value={id}/><label><span>Note</span><textarea name="note" rows={2}/></label><div className="decision-buttons"><button className="button-primary" name="approve" value="true">Release player</button><button className="danger-link" name="approve" value="false">Reject transfer</button></div></form>}
        {t.status!=='REQUESTED'&&<div className="reviewer-note"><strong>{t.status==='RELEASED'||t.status==='APPROVED'?'Player released':'Release decision complete'}</strong><p>{t.released_at?new Intl.DateTimeFormat('en-GB',{dateStyle:'medium'}).format(new Date(t.released_at)):t.status}</p></div>}
      </article>

      <article className="management-surface">
        <div className="surface-head"><div><span className="eyebrow">STEP 2</span><h2>City / Global final approval</h2></div><span>{t.final_review_at?'Completed':'Pending'}</span></div>
        <p className="management-help">Final approval closes the old Team membership and activates the destination side without changing the player's IPS ID.</p>
        {t.can_finalize&&['RELEASED','REQUESTED'].includes(t.status)&&<form action={finalizeTransfer} className="compact-form"><input type="hidden" name="transfer_id" value={id}/><label><span>Final note</span><textarea name="note" rows={2}/></label><div className="decision-buttons"><button className="button-primary" name="approve" value="true">Approve transfer</button><button className="danger-link" name="approve" value="false">Reject transfer</button></div></form>}
      </article>
    </section>
    <SiteFooter/>
  </main>;
}
