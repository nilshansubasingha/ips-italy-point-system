export const dynamic='force-dynamic'; export const revalidate=0;

import {notFound} from 'next/navigation';
import Link from 'next/link';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {requireAccount} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {addRequestedTeamMember,removeRequestedTeamMember} from '../../actions';

export default async function TeamRequestRosterPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
  await requireAccount();
  const {id}=await params;
  const sp=await searchParams;
  const supabase=await createClient();
  const {data:request,error}=await supabase.rpc('ips_team_registration_detail',{p_request_id:id});
  if(error||!request)notFound();

  const editable=['PENDING_EMAIL','PENDING','CHANGES_REQUESTED'].includes(request.status);
  const members=request.members??[];
  const matches=await Promise.all(members.map(async(m:any)=>{
    const {data}=await supabase.rpc('ips_team_member_possible_matches',{p_member_id:m.id});
    return [m.id,(data??[]) as any[]] as const;
  }));
  const matchMap=new Map(matches);

  return <main className="shell sports-shell">
    <SiteHeader/>
    <section className="manage-titlebar">
      <div><Link className="back-link" href="/registration">← My registration</Link><span className="eyebrow">PROVISIONAL TEAM ROSTER</span><h1>{request.name}</h1><p>Add the people you expect to be on this Team. Names are provisional only; IPS checks the permanent player registry before any official identity is created.</p></div>
      <div className="directory-hero-stat"><strong>{members.length}</strong><span>provisional members</span></div>
    </section>
    {typeof sp.ok==='string'&&<div className="ops-message success">{sp.ok}</div>}
    {typeof sp.error==='string'&&<div className="ops-message error">{sp.error}</div>}

    <section className="registration-overview-grid">
      {editable&&<article className="management-surface">
        <div className="surface-head"><div><span className="eyebrow">ADD MEMBER</span><h2>Provisional roster</h2></div><span>{request.structure.replaceAll('_',' + ')}</span></div>
        <form action={addRequestedTeamMember} className="compact-form">
          <input type="hidden" name="team_request_id" value={id}/>
          <label><span>Full name *</span><input name="full_name" required placeholder="Harsha Silva"/></label>
          <label><span>Public display name</span><input name="display_name" placeholder="H. Silva"/></label>
          <div className="form-split"><label><span>Date of birth</span><input name="date_of_birth" type="date"/></label><label><span>Primary role</span><select name="primary_role" defaultValue=""><option value="">Not set</option><option>Batter</option><option>Bowler</option><option>All-rounder</option><option>Wicketkeeper</option><option>Wicketkeeper-batter</option></select></label></div>
          <div className="form-split"><label><span>Email</span><input name="email" type="email"/></label><label><span>Phone</span><input name="phone" type="tel" placeholder="+393451234567"/></label></div>
          {request.structure==='SINGLE'?<input type="hidden" name="side_label" value="MAIN"/>:<label><span>Requested side</span><select name="side_label" defaultValue="A"><option>A</option><option>B</option>{request.structure==='A_B_C'&&<option>C</option>}</select></label>}
          <button>Add provisional member</button>
        </form>
      </article>}

      <article className="management-surface">
        <div className="surface-head"><div><span className="eyebrow">WHY PROVISIONAL?</span><h2>Duplicate protection</h2></div></div>
        <div className="identity-safety-copy"><p>Two different people may both be called <b>H. Silva</b>. IPS never treats a name as a unique identity.</p><p>Exact email/phone or full-name + date-of-birth matches are treated as strong existing-player signals. Name-only matches require human review.</p></div>
      </article>
    </section>

    <section className="management-surface">
      <div className="surface-head"><div><span className="eyebrow">MEMBERS</span><h2>Requested Team roster</h2></div><span>{members.length} names</span></div>
      <div className="request-member-grid">
        {members.map((m:any)=>{
          const possible=(matchMap.get(m.id)??[]) as any[];
          return <article className="request-member-card" key={m.id}>
            <div className="request-member-head"><div><span>{m.side_label==='MAIN'?'MAIN':`${m.side_label} TEAM`}</span><h3>{m.display_name}</h3><p>{m.full_name}{m.birth_year?` · born ${m.birth_year}`:''}</p></div><b>{m.status}</b></div>
            {possible.length>0&&<div className="possible-match-box"><strong>Possible IPS matches</strong>{possible.slice(0,3).map((p:any)=><div key={p.player_id}><span>{p.display_name} · {p.ips_code}</span><small>{p.current_team_name??'Unattached'}{p.birth_year?` · born ${p.birth_year}`:''} · {p.match_reason}</small></div>)}</div>}
            {editable&&!m.account_user_id&&<form action={removeRequestedTeamMember}><input type="hidden" name="team_request_id" value={id}/><input type="hidden" name="member_id" value={m.id}/><button className="danger-link">Remove</button></form>}
            {m.account_user_id&&<span className="account-member-chip">Account holder · handled through player registration</span>}
          </article>;
        })}
      </div>
    </section>
    <SiteFooter/>
  </main>;
}
