export const dynamic='force-dynamic'; export const revalidate=0;
import Link from 'next/link';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {ManagementNav} from '@/components/manage/manage-nav';
import {requireAccount,hasManagementRole} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {Crest} from '@/components/identity';
import {ConfirmSubmitButton} from '@/components/manage/confirm-submit-button';
import {deleteTeam} from '../registry/actions';

export default async function ManageTeamsPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const account=await requireAccount(); if(!hasManagementRole(account))return null; const sp=await searchParams; const error=typeof sp.error==='string'?sp.error:null; const ok=typeof sp.ok==='string'?sp.ok:null; const supabase=await createClient();
 const [{data:teams},{data:members}]=await Promise.all([supabase.from('teams').select('id,name,short_name,category,logo_url,status,club:clubs(id,name,city:cities(name))').order('name'),supabase.from('team_memberships').select('team_id').eq('status','ACTIVE').is('end_on',null)]);
 const counts=new Map<string,number>(); for(const m of members??[])counts.set(m.team_id,(counts.get(m.team_id)||0)+1);
 const canCreate=account.grants.some(g=>(g.role==='OWNER'&&g.scope_type==='GLOBAL')||(g.role==='ADMIN'&&['GLOBAL','CITY'].includes(g.scope_type))||(g.role==='LEADER'&&g.scope_type==='CLUB'));
 const canGlobalDelete=account.grants.some(g=>(g.role==='OWNER'&&g.scope_type==='GLOBAL')||(g.role==='ADMIN'&&g.scope_type==='GLOBAL'));
 return <main className="shell sports-shell"><SiteHeader/><ManagementNav account={account} active="teams"/><section className="manage-titlebar"><div><span className="eyebrow">TEAM REGISTRY</span><h1>Teams</h1><p>Team rosters sit between permanent player identities and tournament squads. Manage the roster here; select competition squads later.</p></div>{canCreate&&<Link className="button-primary" href="/manage/teams/new">+ Add team</Link>}</section>{(error||ok)&&<div className={`ops-message ${error?'error':'success'}`}>{error||ok}</div>}
 <section className="ops-kpi-strip"><article><span>Teams</span><strong>{teams?.length??0}</strong><small>registered</small></article><article><span>Roster players</span><strong>{members?.length??0}</strong><small>active memberships</small></article><article><span>Average roster</span><strong>{teams?.length?Math.round((members?.length??0)/teams.length):0}</strong><small>players / team</small></article><article><span>Registry</span><strong>LIVE</strong><small>permanent IDs</small></article></section>
 <section className="management-surface"><div className="surface-head"><div><span className="eyebrow">ALL TEAMS</span><h2>Roster operations</h2></div></div><div className="team-table">{(teams??[]).map((t:any)=><article key={t.id} className="team-table-row"><Link href={`/manage/teams/${t.id}`} className="team-row-main"><Crest name={t.name} imageUrl={t.logo_url}/><div><h3>{t.name}</h3><p>{(t.club as any)?.name} · {(t.club as any)?.city?.name??'Italy'}</p></div></Link>{canGlobalDelete?<form action={deleteTeam} className="team-row-delete"><input type="hidden" name="team_id" value={t.id}/><ConfirmSubmitButton className="team-delete-x" title={`Delete ${t.name}`} message={`Delete ${t.name}? This permanently removes the team and its roster memberships. Players themselves are not deleted. Teams already used in tournaments or matches are protected and cannot be deleted.`}>×</ConfirmSubmitButton></form>:<span/>}<span className="team-category">{t.category}</span><strong>{counts.get(t.id)||0}<small> players</small></strong><Link href={`/manage/teams/${t.id}`} className="team-row-arrow" aria-label={`Open ${t.name}`}>→</Link></article>)}</div></section><SiteFooter/></main>;
}
