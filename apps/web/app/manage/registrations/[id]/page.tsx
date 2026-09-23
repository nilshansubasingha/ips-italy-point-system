export const dynamic='force-dynamic'; export const revalidate=0;

import Link from 'next/link';
import {notFound} from 'next/navigation';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {ManagementNav} from '@/components/manage/manage-nav';
import {requireAccount} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {PlayerAvatar} from '@/components/identity';
import {approvePlayerRegistration,decidePlayerRegistration} from '../actions';

export default async function PlayerRegistrationDetail({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const account=await requireAccount();
  const {id}=await params;
  const sp=await searchParams;
  const supabase=await createClient();
  const [{data:req,error},{data:matches}]=await Promise.all([
    supabase.rpc('ips_registration_request_detail',{p_request_id:id}),
    supabase.rpc('ips_registration_possible_matches',{p_request_id:id})
  ]);
  if(error||!req)notFound();

  let sides:any[]=[];
  if(req.team_identity_id){
    const {data}=await supabase.from('teams').select('id,name,side_label,side_order').eq('club_id',req.team_identity_id).eq('status','ACTIVE').order('side_order');
    sides=data??[];
  }

  return <main className="shell sports-shell">
    <SiteHeader/><ManagementNav account={account} active="registrations"/>
    <section className="manage-titlebar compact">
      <div><Link className="back-link" href="/manage/registrations">← Registration Requests</Link><span className="eyebrow">PLAYER REGISTRATION</span><h1>{req.display_name}</h1><p>Resolve identity first. A matching name alone never proves that two records are the same person.</p></div>
      <div className={`registration-state-badge ${String(req.status).toLowerCase()}`}><span>STATUS</span><strong>{req.status}</strong></div>
    </section>
    {typeof sp.ok==='string'&&<div className="ops-message success">{sp.ok}</div>}
    {typeof sp.error==='string'&&<div className="ops-message error">{sp.error}</div>}

    <section className="registration-review-grid">
      <article className="management-surface">
        <div className="surface-head"><div><span className="eyebrow">REQUESTED IDENTITY</span><h2>{req.full_name}</h2></div><span>{req.city_name}</span></div>
        <dl className="registration-facts">
          <div><dt>Public display</dt><dd>{req.display_name}</dd></div>
          <div><dt>Date of birth</dt><dd>{req.date_of_birth??'Not provided'}</dd></div>
          <div><dt>Email</dt><dd>{req.email_masked??'—'}</dd></div>
          <div><dt>Phone</dt><dd>{req.phone_masked??'Not provided'}</dd></div>
          <div><dt>Account</dt><dd>{req.account_confirmed?'Confirmed':'Not yet confirmed'}</dd></div>
          <div><dt>Role</dt><dd>{req.primary_role??'Not set'}</dd></div>
          <div><dt>Requested Team</dt><dd>{String(req.team_name??'No current Team').replace(/\s+Cricket Club$/i,'')}</dd></div>
          <div><dt>Requested side</dt><dd>{req.side_name??req.requested_side_label??'None'}</dd></div>
        </dl>
        {req.reviewer_note&&<div className="reviewer-note"><strong>Previous note</strong><p>{req.reviewer_note}</p></div>}
      </article>

      <article className="management-surface">
        <div className="surface-head"><div><span className="eyebrow">APPROVAL TARGET</span><h2>Team / side</h2></div></div>
        {req.team_request_id&&!req.team_identity_id?<div className="identity-warning"><strong>Team request must be approved first.</strong><p>This player requested a Team that does not yet exist in the official registry.</p><Link href={`/manage/registrations/team/${req.team_request_id}`}>Review Team request →</Link></div>:<>
          {sides.length>0?<div className="side-choice-summary">{sides.map(s=><span key={s.id} className={req.side_id===s.id?'active':''}>{s.side_label==='MAIN'?'Main side':`${s.side_label} Team`}</span>)}</div>:<p className="management-help">No Team membership requested. Approval can create/link the player without attaching a Team.</p>}
        </>}
      </article>
    </section>

    <section className="management-surface">
      <div className="surface-head"><div><span className="eyebrow">DUPLICATE CHECK</span><h2>Possible existing IPS identities</h2></div><span>{matches?.length??0} candidates</span></div>
      <div className="identity-match-grid">
        {(matches??[]).map((p:any)=><article className={`identity-match-card ${p.strong_match?'strong':''}`} key={p.player_id}>
          <PlayerAvatar name={p.display_name}/>
          <div><span>{p.strong_match?'STRONG MATCH':'NAME / IDENTITY MATCH'}</span><h3>{p.display_name}</h3><p>{p.ips_code} · {p.current_team_name??'Unattached'}{p.birth_year?` · born ${p.birth_year}`:''}</p><small>{p.match_reason}</small></div>
          <form action={approvePlayerRegistration}>
            <input type="hidden" name="request_id" value={id}/><input type="hidden" name="existing_player_id" value={p.player_id}/>
            {sides.length>0&&<select name="side_id" defaultValue={req.side_id??(sides.length===1?sides[0].id:'')} required><option value="">Select side</option>{sides.map(s=><option key={s.id} value={s.id}>{s.side_label==='MAIN'?s.name:`${s.side_label} Team · ${s.name}`}</option>)}</select>}
            <button>Approve as this player</button>
          </form>
        </article>)}
        {!matches?.length&&<div className="sports-empty compact-empty"><strong>No existing candidates found.</strong><p>A new permanent IPS player may be created after administrator approval.</p></div>}
      </div>
    </section>

    {['PENDING','POSSIBLE_MATCH','CHANGES_REQUESTED'].includes(req.status)&&!(!req.team_identity_id&&req.team_request_id)&&<section className="management-surface registration-decision-panel">
      <div className="surface-head"><div><span className="eyebrow">DECISION</span><h2>Create a new identity or return the request.</h2></div></div>
      <div className="registration-decision-grid">
        <form action={approvePlayerRegistration}>
          <input type="hidden" name="request_id" value={id}/>
          <strong>Create new IPS player</strong><p>Use only when the possible-match check does not identify the same person.</p>
          {sides.length>0&&<label><span>Competitive side</span><select name="side_id" defaultValue={req.side_id??(sides.length===1?sides[0].id:'')} required><option value="">Select side</option>{sides.map(s=><option key={s.id} value={s.id}>{s.side_label==='MAIN'?s.name:`${s.side_label} Team · ${s.name}`}</option>)}</select></label>}
          <label><span>Reviewer note</span><textarea name="note" rows={3}/></label><button className="button-primary">Create & approve →</button>
        </form>
        <form action={decidePlayerRegistration}>
          <input type="hidden" name="request_id" value={id}/>
          <strong>Return or reject</strong><p>Ask for clarification when identity data is not enough.</p>
          <label><span>Administrator note</span><textarea name="note" rows={3} required/></label>
          <div className="decision-buttons"><button name="action" value="CHANGES">Request changes</button><button className="danger-link" name="action" value="REJECT">Reject request</button></div>
        </form>
      </div>
    </section>}

    <SiteFooter/>
  </main>;
}
