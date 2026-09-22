export const dynamic='force-dynamic'; export const revalidate=0;
import Link from 'next/link';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {ManagementNav} from '@/components/manage/manage-nav';
import {requireAccount,hasManagementRole} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {Crest} from '@/components/identity';

export default async function ManageClubsPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const account=await requireAccount(); if(!hasManagementRole(account))return null; const sp=await searchParams; const error=typeof sp.error==='string'?sp.error:null; const ok=typeof sp.ok==='string'?sp.ok:null; const supabase=await createClient();
 const [clubsRes,teamsRes,membersRes]=await Promise.all([
   supabase.from('clubs').select('id,name,short_name,logo_url,verified,status,city_id,city:cities(name)').order('name'),
   supabase.from('teams').select('id,club_id,status'),
   supabase.from('team_memberships').select('id,team_id,status,end_on').eq('status','ACTIVE').is('end_on',null),
 ]);
 const clubs=(clubsRes.data??[]) as any[]; const teamByClub=new Map<string,number>(); for(const t of teamsRes.data??[])teamByClub.set(t.club_id,(teamByClub.get(t.club_id)||0)+1);
 const teamClub=new Map((teamsRes.data??[]).map((t:any)=>[t.id,t.club_id])); const playerByClub=new Map<string,number>(); for(const m of membersRes.data??[]){const c=teamClub.get(m.team_id);if(c)playerByClub.set(c,(playerByClub.get(c)||0)+1);}
 const canCreate=account.grants.some(g=>g.role==='OWNER'||(g.role==='ADMIN'&&['GLOBAL','CITY'].includes(g.scope_type)));
 return <main className="shell sports-shell"><SiteHeader/><ManagementNav account={account} active="clubs"/>
  <section className="manage-titlebar"><div><span className="eyebrow">ORGANISATION REGISTRY</span><h1>Clubs</h1><p>One canonical club identity can own multiple teams while its history, crest and city remain consistent across IPS.</p></div>{canCreate&&<Link className="button-primary" href="/manage/clubs/new">+ Add club</Link>}</section>
  {(error||ok)&&<div className={`ops-message ${error?'error':'success'}`}>{error||ok}</div>}
  <section className="ops-kpi-strip"><article><span>Clubs</span><strong>{clubs.length}</strong><small>registered</small></article><article><span>Teams</span><strong>{teamsRes.data?.length??0}</strong><small>under clubs</small></article><article><span>Active players</span><strong>{membersRes.data?.length??0}</strong><small>roster memberships</small></article><article><span>Verified</span><strong>{clubs.filter(c=>c.verified).length}</strong><small>club identities</small></article></section>
  <section className="management-surface"><div className="surface-head"><div><span className="eyebrow">CLUB DIRECTORY</span><h2>Registered organisations</h2></div><span>{clubs.length} clubs</span></div>
   <div className="registry-card-grid">{clubs.map(club=><Link href={`/manage/clubs/${club.id}`} className="registry-card" key={club.id}><Crest name={club.name} imageUrl={club.logo_url} large/><div className="registry-card-copy"><span>{(club.city as any)?.name??'Italy'} · {club.verified?'Verified':'Club'}</span><h3>{club.name}</h3><p>{club.short_name||'Canonical IPS club identity'}</p><div><b>{teamByClub.get(club.id)||0}</b> teams <b>{playerByClub.get(club.id)||0}</b> players</div></div><i>→</i></Link>)}</div>
  </section><SiteFooter/></main>;
}
