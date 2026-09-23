export const dynamic='force-dynamic'; export const revalidate=0;

import Link from 'next/link';
import {notFound} from 'next/navigation';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {ManagementNav} from '@/components/manage/manage-nav';
import {requireAccount} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {PlayerAvatar} from '@/components/identity';
import {approveTeamRegistration,decideTeamRegistration,resolveTeamRequestMember} from '../../actions';

export default async function TeamRegistrationDetail({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const account=await requireAccount();
  const {id}=await params;
  const sp=await searchParams;
  const supabase=await createClient();
  const {data:req,error}=await supabase.rpc('ips_team_registration_detail',{p_request_id:id});
  if(error||!req)notFound();

  const members=req.members??[];
  const candidatePairs=await Promise.all(members.map(async(m:any)=>{
    const {data}=await supabase.rpc('ips_team_member_possible_matches',{p_member_id:m.id});
    return [m.id,data??[]] as const;
  }));
  const candidates=new Map(candidatePairs);

  return <main className="shell sports-shell">
    <SiteHeader/><ManagementNav account={account} active="registrations"/>
    <section className="manage-titlebar compact">
      <div><Link className="back-link" href="/manage/registrations">← Registration Requests</Link><span className="eyebrow">NEW TEAM REQUEST</span><h1>{req.name}</h1><p>Approve the Team identity first. Provisional member names remain separate until each player is matched or explicitly created by an authorised administrator.</p></div>
      <div className={`registration-state-badge ${String(req.status).toLowerCase()}`}><span>STATUS</span><strong>{req.status}</strong></div>
    </section>
    {typeof sp.ok==='string'&&<div className="ops-message success">{sp.ok}</div>}
    {typeof sp.error==='string'&&<div className="ops-message error">{sp.error}</div>}

    <section className="registration-review-grid">
      <article className="management-surface">
        <div className="surface-head"><div><span className="eyebrow">TEAM IDENTITY</span><h2>{req.name}</h2></div><span>{req.city_name}</span></div>
        <dl className="registration-facts">
          <div><dt>Short name</dt><dd>{req.short_name??'—'}</dd></div>
          <div><dt>Structure</dt><dd>{req.structure.replaceAll('_',' + ')}</dd></div>
          <div><dt>Category</dt><dd>{req.category}</dd></div>
          <div><dt>Provisional members</dt><dd>{members.length}</dd></div>
        </dl>
        {req.reviewer_note&&<div className="reviewer-note"><strong>Administrator note</strong><p>{req.reviewer_note}</p></div>}
        {req.approved_team_identity_id&&<Link className="button-primary" href={`/manage/teams/${req.approved_team_identity_id}`}>Open official Team →</Link>}
      </article>

      {['PENDING','CHANGES_REQUESTED'].includes(req.status)&&<article className="management-surface registration-decision-panel">
        <div className="surface-head"><div><span className="eyebrow">TEAM DECISION</span><h2>Approve or return</h2></div></div>
        <form action={approveTeamRegistration} className="compact-form">
          <input type="hidden" name="request_id" value={id}/>
          <label><span>Reviewer note</span><textarea name="note" rows={2} placeholder="Optional"/></label>
          <button className="button-primary">Approve Team & create sides →</button>
        </form>
        <form action={decideTeamRegistration} className="compact-form secondary-decision-form">
          <input type="hidden" name="request_id" value={id}/>
          <label><span>Reason / requested changes</span><textarea name="note" rows={2} required/></label>
          <div className="decision-buttons"><button name="action" value="CHANGES">Request changes</button><button className="danger-link" name="action" value="REJECT">Reject Team</button></div>
        </form>
      </article>}
    </section>

    <section className="management-surface">
      <div className="surface-head"><div><span className="eyebrow">PROVISIONAL ROSTER</span><h2>Resolve each person safely</h2></div><span>{members.length} names</span></div>
      <div className="team-member-review-grid">
        {members.map((m:any)=>{
          const possible=candidates.get(m.id)??[];
          const resolved=['APPROVED','TRANSFER_REQUIRED'].includes(m.status);
          return <article className="team-member-review-card" key={m.id}>
            <div className="request-member-head"><div><span>{m.side_label==='MAIN'?'MAIN':`${m.side_label} TEAM`}</span><h3>{m.display_name}</h3><p>{m.full_name}{m.birth_year?` · born ${m.birth_year}`:''}</p></div><b>{m.status}</b></div>
            <div className="member-private-summary">{m.email_masked&&<span>Email {m.email_masked}</span>}{m.phone_masked&&<span>Phone {m.phone_masked}</span>}{m.primary_role&&<span>{m.primary_role}</span>}</div>

            {m.account_user_id?<div className="identity-warning soft"><strong>Account registration</strong><p>This person created the account that requested the Team. Resolve them through the Player Registration request so the account can be linked correctly.</p></div>:<>
              {possible.length>0&&<div className="possible-match-box"><strong>Possible existing players</strong>{possible.map((p:any)=><div className={p.strong_match?'strong-match-row':''} key={p.player_id}>
                <PlayerAvatar name={p.display_name}/>
                <span>{p.display_name} · {p.ips_code}<small>{p.current_team_name??'Unattached'}{p.birth_year?` · born ${p.birth_year}`:''} · {p.match_reason}</small></span>
                {!resolved&&req.status==='APPROVED'&&<form action={resolveTeamRequestMember}><input type="hidden" name="team_request_id" value={id}/><input type="hidden" name="member_id" value={m.id}/><input type="hidden" name="existing_player_id" value={p.player_id}/><button>Use existing</button></form>}
              </div>)}</div>}
              {!resolved&&req.status==='APPROVED'&&<form action={resolveTeamRequestMember} className="create-member-action"><input type="hidden" name="team_request_id" value={id}/><input type="hidden" name="member_id" value={m.id}/><strong>Create new IPS player</strong><p>Only if none of the possible matches is the same person.</p><button className="button-primary">Create & add to Team →</button></form>}
            </>}
            {m.approved_player_id&&<Link className="roster-profile-link" href={`/manage/players/${m.approved_player_id}`}>Open official player →</Link>}
          </article>;
        })}
      </div>
      {!members.length&&<div className="sports-empty"><strong>No provisional members supplied.</strong></div>}
    </section>
    <SiteFooter/>
  </main>;
}
