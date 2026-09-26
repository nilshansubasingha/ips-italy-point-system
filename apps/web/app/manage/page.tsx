export const dynamic='force-dynamic'; export const revalidate=0;
import Link from 'next/link';
import {redirect} from 'next/navigation';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {ManagementNav} from '@/components/manage/manage-nav';
import {requireAccount,hasManagementRole,canManageRoles,isOwner} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';

export default async function ManagePage(){
  const account=await requireAccount(); if(!hasManagementRole(account))redirect('/dashboard?access=management-required'); const canManageAccess=canManageRoles(account); const owner=isOwner(account); const canManageRankingCatalogue=account.grants.some(g=>(g.role==='OWNER'&&g.scope_type==='GLOBAL')||(g.role==='ADMIN'&&g.scope_type==='GLOBAL')); const supabase=await createClient(); const controllerUrl=process.env.NEXT_PUBLIC_CONTROLLER_URL??'http://localhost:3001';
  const [tournaments,teamIdentities,sides,players,matches,applications,squads,registrationCounts]=await Promise.all([
    supabase.from('tournaments').select('id,name,status,starts_at',{count:'exact'}).order('starts_at',{ascending:true}).limit(8),
    supabase.from('clubs').select('id',{count:'exact',head:true}),supabase.from('teams').select('id',{count:'exact',head:true}),supabase.from('players').select('id',{count:'exact',head:true}),
    supabase.from('matches').select('id,match_code,status,scheduled_at,tournament:tournaments(name),home:teams!matches_home_team_id_fkey(name),away:teams!matches_away_team_id_fkey(name)').in('status',['READY','LIVE','SCHEDULED']).order('scheduled_at').limit(8),
    supabase.from('tournament_teams').select('id,tournament_id,team_id,tournament:tournaments(name),team:teams(name)',{count:'exact'}).eq('status','APPLIED').limit(8),
    supabase.from('tournament_squads').select('id,status,tournament_id,team_id,tournament:tournaments(name),team:teams(name)',{count:'exact'}).in('status',['DRAFT','SUBMITTED']).limit(8),
    supabase.rpc('ips_registration_queue_counts')
  ]);
  const registrationActionCount=Number(registrationCounts.data?.players??0)+Number(registrationCounts.data?.teams??0)+Number(registrationCounts.data?.transfers??0);
  const applicationCount=applications.count??applications.data?.length??0;
  const squadCount=squads.count??squads.data?.length??0;
  const firstApplication=(applications.data??[])[0] as any;
  const firstSquad=(squads.data??[])[0] as any;
  const applicationHref=firstApplication?`/manage/tournaments/${firstApplication.tournament_id}#teams`:'/manage/tournaments';
  const squadHref=firstSquad?`/manage/tournaments/${firstSquad.tournament_id}#squads`:'/manage/tournaments';
  const live=(matches.data??[]).filter((m:any)=>m.status==='LIVE').length;
  const actionCount=applicationCount+squadCount+registrationActionCount;
  return <main className="shell sports-shell"><SiteHeader/><ManagementNav account={account} active="overview"/><section className="command-hero"><div><span className="eyebrow">IPS MANAGEMENT</span><h1>Command Centre</h1><p>Operate the league from canonical data. Teams own one or more competitive sides, sides register players, tournaments consume locked squads, and the Match Controller receives the same identities.</p></div><a href={controllerUrl} target="_blank" rel="noreferrer" className="controller-launch"><span>LIVE OPERATIONS</span><strong>Open Match Controller</strong><small>Authorised fixtures only →</small></a></section>
  <section className="command-kpis"><article><span>LIVE MATCHES</span><strong>{live}</strong><small>currently active</small></article><article><span>TOURNAMENTS</span><strong>{tournaments.count??0}</strong><small>competition records</small></article><article><span>TEAMS / SIDES</span><strong>{teamIdentities.count??0}<i>/</i>{sides.count??0}</strong><small>public teams / competitive sides</small></article><article><span>PLAYERS</span><strong>{players.count??0}</strong><small>permanent identities</small></article><a href="#operational-queue" className="command-kpi-link"><article className={actionCount?'attention':''}><span>ACTION REQUIRED</span><strong>{actionCount}</strong><small>{actionCount?'Open the task queue ↓':'Nothing waiting'}</small></article></a></section>
  <section className="command-grid"><div className="management-surface"><div className="surface-head"><div><span className="eyebrow">UPCOMING / LIVE</span><h2>Match operations</h2></div><Link href="/manage/tournaments">All tournaments →</Link></div><div className="command-match-list">{(matches.data??[]).map((m:any)=><article key={m.id}><div className={`match-state ${String(m.status).toLowerCase()}`}>{m.status}</div><div><span>{m.tournament?.name} · {m.match_code}</span><strong>{m.home?.name} <i>vs</i> {m.away?.name}</strong><small>{new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(m.scheduled_at))}</small></div></article>)}{!matches.data?.length&&<div className="sports-empty"><strong>No active fixture queue.</strong><p>Fixtures will appear here as tournaments are scheduled.</p></div>}</div></div>
  <aside className="management-stack"><section id="operational-queue" className="management-surface action-panel"><div className="surface-head"><div><span className="eyebrow">ACTION REQUIRED</span><h2>Operational queue</h2></div><span className="section-note">Only items that need a decision or completion.</span></div>
  <Link href={applicationHref} className={applicationCount?'needs-action':''}><strong>{applicationCount}</strong><span>{applicationCount?<>Team application waiting{applicationCount===1?'':'s'}{firstApplication?<small>{firstApplication.team?.name??'Team'} · {firstApplication.tournament?.name??'Tournament'}</small>:null}</>:'No team applications waiting'}</span><i>→</i></Link>
  <Link href={squadHref} className={squadCount?'needs-action':''}><strong>{squadCount}</strong><span>{squadCount?<>Squad{ squadCount===1?'':'s'} not yet locked{firstSquad?<small>{firstSquad.team?.name??'Team'} · {firstSquad.tournament?.name??'Tournament'} · {firstSquad.status}</small>:null}</>:'All active squads locked'}</span><i>→</i></Link>
  <Link href="/manage/registrations" className={registrationActionCount?'needs-action':''}><strong>{registrationActionCount}</strong><span>{registrationActionCount?'Registration / transfer requests':'No registration / transfer requests'}</span><i>→</i></Link>
</section><section className="management-surface quick-panel"><span className="eyebrow">CREATE / MANAGE</span><div className="quick-links"><Link href="/manage/tournaments/new"><b>＋</b><span>New tournament</span></Link><Link href="/manage/teams/new"><b>＋</b><span>New team</span></Link><Link href="/manage/teams"><b>↗</b><span>Team & side rosters</span></Link><Link href="/manage/players"><b>◎</b><span>Player registry</span></Link>{canManageRankingCatalogue&&<Link href="/manage/rankings"><b>▦</b><span>Ranking catalogue</span></Link>}{owner&&<Link href="/manage/heroes"><b>▧</b><span>Hero backgrounds</span></Link>}{canManageAccess&&<Link href="/manage/roles"><b>⌁</b><span>Accounts & roles</span></Link>}</div></section></aside></section><SiteFooter/></main>;
}
