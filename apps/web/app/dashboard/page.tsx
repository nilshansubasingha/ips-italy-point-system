export const dynamic='force-dynamic'; export const revalidate=0;
import Link from 'next/link';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {requireAccount,hasManagementRole,grantScopeId} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {decideMyTeamRequest} from './actions';

function contextName(role:string,scope:string){if(role==='OWNER'&&scope==='GLOBAL')return 'Platform Owner';return `${role.charAt(0)}${role.slice(1).toLowerCase()} · ${scope.charAt(0)}${scope.slice(1).toLowerCase()}`;}

export default async function DashboardPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const account=await requireAccount(); const sp=await searchParams; const ok=typeof sp.ok==='string'?sp.ok:null; const error=typeof sp.error==='string'?sp.error:null; const name=account.profile?.display_name??account.user.email??'IPS User'; const supabase=await createClient(); const [{data:registration},{data:teamRequests}]=await Promise.all([supabase.rpc('ips_my_registration_status'),supabase.rpc('ips_my_player_team_requests')]); const playerRequest=registration?.player_request??null; const requests=(teamRequests??[]) as any[]; const pendingRequests=requests.filter(r=>r.status==='PENDING');
 return <main className="shell sports-shell"><SiteHeader/><section className="account-hero"><div><span className="eyebrow">MY IPS</span><h1>{name}</h1><p>Your account is separate from your cricket identity. Permissions are scoped, while a claimed player keeps the same permanent IPS ID across teams and seasons.</p></div><div className="account-id-card"><span>PLAYER LINK</span><strong>{account.profile?.linked_player_id?'CLAIMED':'NOT LINKED'}</strong><small>{account.user.email}</small>{!account.profile?.linked_player_id&&playerRequest?<Link href="/registration">Registration · {playerRequest.status} →</Link>:!account.profile?.linked_player_id?<Link href="/claim-player">Check for my player profile →</Link>:null}</div></section>{ok&&<div className="ops-message success">{ok}</div>}{error&&<div className="ops-message error">{error}</div>}
 <section className="sports-section player-team-requests"><div className="sports-section-head"><div><span className="eyebrow">TEAM REQUESTS</span><h2>Roster invitations.</h2></div><span className="section-note">{pendingRequests.length} waiting for you</span></div>
 {pendingRequests.length?<div className="player-request-grid">{pendingRequests.map((r:any)=><article className="player-request-card" key={r.id}>
   <div className="player-request-route"><span>{r.from_team_name??'Unattached'}</span><i>→</i><strong>{String(r.to_team_name??'Team').replace(/\s+Cricket Club$/i,'')}</strong></div>
   <h3>{r.request_type==='JOIN'?'Join request':r.request_type==='SIDE_MOVE'?'Side move request':'Transfer request'}</h3>
   <p>{r.request_type==='JOIN'?'This Team wants to add your claimed IPS player identity to its roster.':'Accepting will move your existing IPS identity to the destination roster without creating a duplicate player.'}</p>
   <small>{r.to_side_name}{r.requested_shirt_number!=null?` · requested #${r.requested_shirt_number}`:''}</small>
   <div className="player-request-actions">
    <form action={decideMyTeamRequest}><input type="hidden" name="request_id" value={r.id}/><button className="button-primary" name="approve" value="true">Accept request</button></form>
    <form action={decideMyTeamRequest}><input type="hidden" name="request_id" value={r.id}/><button className="danger-link" name="approve" value="false">Reject</button></form>
   </div>
 </article>)}</div>:<div className="sports-empty compact-empty"><strong>No Team requests waiting.</strong><p>When a Team requests your player, it will appear here before any roster change happens.</p></div>}</section>
 <section className="sports-section no-top"><div className="sports-section-head"><div><span className="eyebrow">ACCESS CONTEXTS</span><h2>Your roles.</h2></div>{hasManagementRole(account)&&<Link href="/manage">Open management →</Link>}</div>{account.grants.length?<div className="role-context-grid">{account.grants.map(grant=><article className="role-context-card" key={grant.id}><span>{grant.scope_type}</span><h3>{contextName(grant.role,grant.scope_type)}</h3><p>{grantScopeId(grant)?`Scope ID ${grantScopeId(grant)!.slice(0,8)}…`:'Applies across the IPS platform.'}</p><div><b>{grant.role}</b><em>Active</em></div></article>)}</div>:<div className="empty-account-state"><strong>Public/User account ready</strong><p>No management role has been assigned yet.</p></div>}</section>
 <section className="sports-section account-quick-grid"><Link href="/match-centre"><span>01</span><strong>Match Centre</strong><p>Follow live, upcoming and finished fixtures.</p></Link><Link href="/players"><span>02</span><strong>Players</strong><p>Browse permanent IPS identities.</p></Link><Link href="/rankings"><span>03</span><strong>Rankings</strong><p>Official ranking presentation.</p></Link></section><SiteFooter/></main>;
}
