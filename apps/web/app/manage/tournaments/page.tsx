export const dynamic='force-dynamic'; export const revalidate=0;

import Link from 'next/link';
import { SiteFooter,SiteHeader } from '@/components/site-header';
import { ManagementNav } from '@/components/manage/manage-nav';
import { requireAccount,hasManagementRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { canCreateTournament,formatItalyDateTime } from '@/lib/project4';

export default async function TournamentManagementPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const account=await requireAccount(); if(!hasManagementRole(account))return null;
  const sp=await searchParams; const error=typeof sp.error==='string'?sp.error:null; const ok=typeof sp.ok==='string'?sp.ok:null;
  const supabase=await createClient();
  const [tRes,ttRes,mRes]=await Promise.all([
    supabase.from('tournaments').select('id,name,code,status,starts_at,format_label,players_per_side,overs_per_innings,balls_per_over,city:cities(name)').order('starts_at',{ascending:false}),
    supabase.from('tournament_teams').select('tournament_id,status'),
    supabase.from('matches').select('tournament_id,status'),
  ]);
  const tournaments=(tRes.data??[]) as any[];
  const teamCounts=new Map<string,number>(); for(const x of ttRes.data??[])if(['ACCEPTED','CONFIRMED'].includes(x.status))teamCounts.set(x.tournament_id,(teamCounts.get(x.tournament_id)||0)+1);
  const matchCounts=new Map<string,number>(); for(const x of mRes.data??[])matchCounts.set(x.tournament_id,(matchCounts.get(x.tournament_id)||0)+1);
  const live=tournaments.filter(t=>t.status==='LIVE').length; const drafts=tournaments.filter(t=>t.status==='DRAFT').length;
  return <main className="shell sports-shell"><SiteHeader/><ManagementNav account={account} active="tournaments"/>
    <section className="manage-titlebar"><div><span className="eyebrow">TOURNAMENT OPERATIONS</span><h1>Competitions</h1><p>Create a tournament on its own workspace, then operate it here without crowding the directory.</p></div>{canCreateTournament(account)&&<Link className="button-primary" href="/manage/tournaments/new">+ Create tournament</Link>}</section>
    {(error||ok)&&<div className={`ops-message ${error?'error':'success'}`}>{error||ok}</div>}
    <section className="ops-kpi-strip"><article><span>Total</span><strong>{tournaments.length}</strong><small>competitions</small></article><article><span>Live</span><strong>{live}</strong><small>in progress</small></article><article><span>Draft</span><strong>{drafts}</strong><small>being prepared</small></article><article><span>Fixtures</span><strong>{mRes.data?.length??0}</strong><small>across IPS</small></article></section>
    <section className="management-surface"><div className="surface-head"><div><span className="eyebrow">ALL COMPETITIONS</span><h2>Tournament control</h2></div><span>{tournaments.length} records</span></div>
      <div className="competition-list">{tournaments.map(t=><Link href={`/manage/tournaments/${t.id}`} className="competition-row" key={t.id}>
        <div className="competition-code">{t.code}</div><div className="competition-main"><div><span className={`ops-status ${String(t.status).toLowerCase()}`}>{String(t.status).replaceAll('_',' ')}</span><b>{(t.city as any)?.name??'Italy'}</b></div><h3>{t.name}</h3><p>{t.format_label} · {t.players_per_side} players · {t.overs_per_innings} overs · {t.balls_per_over} balls/over</p></div>
        <div className="competition-metrics"><span><b>{teamCounts.get(t.id)||0}</b> teams</span><span><b>{matchCounts.get(t.id)||0}</b> fixtures</span><span><b>{formatItalyDateTime(t.starts_at).split(',')[0]}</b> starts</span></div><div className="competition-open">Open →</div>
      </Link>)}</div>
      {!tournaments.length&&<div className="sports-empty"><strong>No tournaments yet.</strong><p>Create the first competition from the dedicated tournament workspace.</p></div>}
    </section><SiteFooter/></main>;
}
