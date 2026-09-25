export const dynamic='force-dynamic'; export const revalidate=0;

import Link from 'next/link';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {ManagementNav} from '@/components/manage/manage-nav';
import {requireAccount,hasManagementRole} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {decideRosterRequest} from './actions';

export default async function RegistrationQueuePage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const account=await requireAccount();
  if(!hasManagementRole(account))return null;
  const sp=await searchParams;
  const supabase=await createClient();
  const [{data,error},{data:rosterRequests,error:rosterError}]=await Promise.all([supabase.rpc('ips_registration_queue'),supabase.rpc('ips_player_team_request_queue')]);
  const players=data?.players??[];
  const teams=data?.teams??[];
  const transfers=data?.transfers??[];
  const roster=(rosterRequests??[]) as any[];
  const total=players.length+teams.length+transfers.length+roster.length;

  return <main className="shell sports-shell">
    <SiteHeader/>
    <ManagementNav account={account} active="registrations"/>
    <section className="manage-titlebar">
      <div><span className="eyebrow">REGISTRATION REQUESTS</span><h1>Identity approval queue</h1><p>Approve real players and Teams without creating duplicate cricket identities. Requests are automatically scoped to the Global, City or Team administrators who are allowed to review them.</p></div>
      <div className="directory-hero-stat"><strong>{total}</strong><span>actions in your scope</span></div>
    </section>
    {(error||rosterError)&&<div className="ops-message error">{error?.message||rosterError?.message}</div>}
    {typeof sp.ok==='string'&&<div className="ops-message success">{sp.ok}</div>}

    <section className="registration-queue-kpis">
      <article><span>PLAYER REQUESTS</span><strong>{players.length}</strong><small>new accounts / identity reviews</small></article>
      <article><span>NEW TEAM REQUESTS</span><strong>{teams.length}</strong><small>City / Global approval</small></article>
      <article><span>TRANSFERS</span><strong>{transfers.length}</strong><small>legacy / registration transfers</small></article>
      <article><span>ROSTER REQUESTS</span><strong>{roster.length}</strong><small>player or current-Team consent</small></article>
    </section>

    <section className="management-surface">
      <div className="surface-head"><div><span className="eyebrow">PLAYERS</span><h2>Player registration requests</h2></div><span>{players.length}</span></div>
      <div className="registration-request-list">
        {players.map((r:any)=><Link href={`/manage/registrations/${r.id}`} className="registration-request-row" key={r.id}>
          <div className="request-status-dot"><span>{r.status}</span></div>
          <div><strong>{r.display_name}</strong><small>{r.full_name}{r.birth_year?` · ${r.birth_year}`:''}</small></div>
          <div><span>CITY</span><b>{r.city_name}</b></div>
          <div><span>TEAM</span><b>{String(r.team_name??'Unattached').replace(/\s+Cricket Club$/i,'')}</b><small>{r.side_name??'Side pending'}</small></div>
          <i>→</i>
        </Link>)}
        {!players.length&&<div className="sports-empty compact-empty"><strong>No player requests in your scope.</strong></div>}
      </div>
    </section>

    <section className="management-surface">
      <div className="surface-head"><div><span className="eyebrow">NEW TEAMS</span><h2>Team registration requests</h2></div><span>{teams.length}</span></div>
      <div className="registration-card-grid">
        {teams.map((r:any)=><Link href={`/manage/registrations/team/${r.id}`} className="registration-team-card" key={r.id}>
          <span>{r.city_name} · {r.status}</span><h3>{r.name}</h3><p>{r.structure.replaceAll('_',' + ')} · {r.member_count} provisional members</p><b>Review Team →</b>
        </Link>)}
        {!teams.length&&<div className="sports-empty compact-empty"><strong>No Team requests in your scope.</strong></div>}
      </div>
    </section>

    <section className="management-surface">
      <div className="surface-head"><div><span className="eyebrow">ROSTER REQUESTS</span><h2>Current-Team approval queue</h2></div><span>{roster.length}</span></div>
      <div className="registration-request-list">
        {roster.map((r:any)=><article className="registration-request-row roster-consent-row" key={r.id}>
          <div className="request-status-dot"><span>{r.request_type}</span></div>
          <div><strong>{r.player_name}</strong><small>{r.ips_code}</small></div>
          <div><span>FROM</span><b>{r.from_team_name?String(r.from_team_name).replace(/\s+Cricket Club$/i,''):'Unattached'}</b></div>
          <div><span>TO</span><b>{String(r.to_team_name).replace(/\s+Cricket Club$/i,'')}</b><small>{r.to_side_name}</small></div>
          <div className="inline-request-actions">
            <form action={decideRosterRequest}><input type="hidden" name="request_id" value={r.id}/><button className="button-primary" name="approve" value="true">Accept</button></form>
            <form action={decideRosterRequest}><input type="hidden" name="request_id" value={r.id}/><button className="danger-link" name="approve" value="false">Reject</button></form>
          </div>
        </article>)}
        {!roster.length&&<div className="sports-empty compact-empty"><strong>No roster requests need a Team decision.</strong></div>}
      </div>
    </section>

    <section className="management-surface">
      <div className="surface-head"><div><span className="eyebrow">TRANSFERS</span><h2>One active Team rule</h2></div><span>{transfers.length}</span></div>
      <div className="registration-request-list">
        {transfers.map((t:any)=><Link href={`/manage/registrations/transfer/${t.id}`} className="registration-request-row transfer-row" key={t.id}>
          <div className="request-status-dot"><span>{t.status}</span></div>
          <div><strong>{t.player_name}</strong><small>{t.ips_code}</small></div>
          <div><span>FROM</span><b>{String(t.from_team_name).replace(/\s+Cricket Club$/i,'')}</b></div>
          <div><span>TO</span><b>{String(t.to_team_name).replace(/\s+Cricket Club$/i,'')}</b><small>{t.to_side_name}</small></div>
          <i>→</i>
        </Link>)}
        {!transfers.length&&<div className="sports-empty compact-empty"><strong>No transfer requests in your scope.</strong></div>}
      </div>
    </section>
    <SiteFooter/>
  </main>;
}
