export const dynamic='force-dynamic'; export const revalidate=0;

import Link from 'next/link';
import { SiteFooter,SiteHeader } from '@/components/site-header';
import { ManagementNav } from '@/components/manage/manage-nav';
import { requireAccount,hasManagementRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { canCreateTournament,formatItalyDateTime } from '@/lib/project4';
import {ConfirmSubmitButton} from '@/components/manage/confirm-submit-button';
import {deleteTournament} from './actions';

export default async function TournamentManagementPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const account=await requireAccount(); if(!hasManagementRole(account))return null;
  const sp=await searchParams; const error=typeof sp.error==='string'?sp.error:null; const ok=typeof sp.ok==='string'?sp.ok:null;
  const supabase=await createClient();
  const [tRes,ttRes,mRes]=await Promise.all([
    supabase.from('tournaments').select('id,name,code,status,starts_at,format_label,players_per_side,overs_per_innings,balls_per_over,competition_kind,city:cities(name)').order('starts_at',{ascending:false}),
    supabase.from('tournament_teams').select('tournament_id,status'),
    supabase.from('matches').select('tournament_id,status'),
  ]);
  const allCompetitions=(tRes.data??[]) as any[];
  const tournaments=allCompetitions.filter(t=>t.competition_kind!=='QUICK_MATCH');
  const quickMatches=allCompetitions.filter(t=>t.competition_kind==='QUICK_MATCH');
  const teamCounts=new Map<string,number>(); for(const x of ttRes.data??[])if(['ACCEPTED','CONFIRMED'].includes(x.status))teamCounts.set(x.tournament_id,(teamCounts.get(x.tournament_id)||0)+1);
  const matchCounts=new Map<string,number>(); for(const x of mRes.data??[])matchCounts.set(x.tournament_id,(matchCounts.get(x.tournament_id)||0)+1);
  const live=tournaments.filter(t=>t.status==='LIVE').length; const drafts=tournaments.filter(t=>t.status==='DRAFT').length;
  const canGlobalDelete=account.grants.some(g=>(g.role==='OWNER'&&g.scope_type==='GLOBAL')||(g.role==='ADMIN'&&g.scope_type==='GLOBAL'));

  return <main className="shell sports-shell"><SiteHeader/><ManagementNav account={account} active="tournaments"/>
    <section className="manage-titlebar"><div><span className="eyebrow">TOURNAMENT OPERATIONS</span><h1>Competitions</h1><p>Create full competitions or launch a one-off Quick Match without the tournament setup workload.</p></div>{canCreateTournament(account)&&<div className="manage-title-actions"><Link className="button-secondary quick-match-launch" href="/manage/tournaments/quick">＋ Quick Match</Link><Link className="button-primary" href="/manage/tournaments/new">+ Create tournament</Link></div>}</section>
    {(error||ok)&&<div className={'ops-message '+(error?'error':'success')}>{error||ok}</div>}
    <section className="ops-kpi-strip"><article><span>Tournaments</span><strong>{tournaments.length}</strong><small>full competitions</small></article><article><span>Quick Matches</span><strong>{quickMatches.length}</strong><small>fast setups</small></article><article><span>Live</span><strong>{live+quickMatches.filter(t=>t.status==='LIVE').length}</strong><small>in progress</small></article><article><span>Fixtures</span><strong>{mRes.data?.length??0}</strong><small>across IPS</small></article></section>
    <section className="management-surface"><div className="surface-head"><div><span className="eyebrow">ALL COMPETITIONS</span><h2>Tournament control</h2></div><span>{tournaments.length} records</span></div>
      <div className="competition-list">{tournaments.map(t=><article className="competition-admin-card" key={t.id}>
        <Link href={'/manage/tournaments/'+t.id} className="competition-row">
          <div className="competition-code">{t.code}</div><div className="competition-main"><div><span className={'ops-status '+String(t.status).toLowerCase()}>{String(t.status).replaceAll('_',' ')}</span><b>{(t.city as any)?.name??'Italy'}</b></div><h3>{t.name}</h3><p>{t.format_label} · {t.players_per_side} players · {t.overs_per_innings} overs · {t.balls_per_over} balls/over</p></div>
          <div className="competition-metrics"><span><b>{teamCounts.get(t.id)||0}</b> teams</span><span><b>{matchCounts.get(t.id)||0}</b> fixtures</span><span><b>{formatItalyDateTime(t.starts_at).split(',')[0]}</b> starts</span></div><div className="competition-open">Open →</div>
        </Link>
        <div className="competition-admin-actions">
          <Link href={'/manage/tournaments/'+t.id+'#overview'}>Edit</Link>
          {canGlobalDelete&&<form action={deleteTournament}>
            <input type="hidden" name="tournament_id" value={t.id}/>
            <input type="hidden" name="return_to" value="/manage/tournaments"/>
            <ConfirmSubmitButton className="registry-delete-button" message={'Delete '+t.name+'? This removes tournament registrations, squads, scheduled/ready fixtures and their setup data. Started, completed or official match history is protected and will block deletion.'}>Delete</ConfirmSubmitButton>
          </form>}
        </div>
      </article>)}</div>
      {!tournaments.length&&<div className="sports-empty"><strong>No tournaments yet.</strong><p>Create the first competition from the dedicated tournament workspace.</p></div>}
    </section>
    {quickMatches.length>0&&<section className="management-surface quick-match-history"><div className="surface-head"><div><span className="eyebrow">QUICK MATCHES</span><h2>Recent one-off matches</h2></div><Link href="/manage/tournaments/quick">＋ New Quick Match</Link></div><div className="competition-list">{quickMatches.slice(0,8).map(t=><article className="competition-admin-card" key={t.id}><Link href={'/manage/tournaments/'+t.id+'#lineups'} className="competition-row"><div className="competition-code">QM</div><div className="competition-main"><div><span className={'ops-status '+String(t.status).toLowerCase()}>{String(t.status).replaceAll('_',' ')}</span><b>{(t.city as any)?.name??'Italy'}</b></div><h3>{t.name}</h3><p>{t.players_per_side} players · {t.overs_per_innings} overs · {t.balls_per_over} balls/over</p></div><div className="competition-open">Setup / score →</div></Link></article>)}</div></section>}
    <SiteFooter/></main>;
}
