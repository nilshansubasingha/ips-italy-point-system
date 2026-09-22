export const dynamic='force-dynamic'; export const revalidate=0;

import Link from 'next/link';
import {redirect} from 'next/navigation';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {ManagementNav} from '@/components/manage/manage-nav';
import {requireAccount} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {createTeam} from '../../registry/actions';

export default async function NewTeamPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const account=await requireAccount(); const sp=await searchParams; const selectedClub=typeof sp.club==='string'?sp.club:''; const error=typeof sp.error==='string'?sp.error:null; const supabase=await createClient();
  const {data:allClubs}=await supabase.from('clubs').select('id,name,city_id,city:cities(name)').eq('status','ACTIVE').order('name');
  const global=account.grants.some(g=>(g.role==='OWNER'&&g.scope_type==='GLOBAL')||(g.role==='ADMIN'&&g.scope_type==='GLOBAL'));
  const cityScopes=new Set(account.grants.filter(g=>g.role==='ADMIN'&&g.scope_type==='CITY'&&g.city_id).map(g=>g.city_id as string));
  const clubScopes=new Set(account.grants.filter(g=>g.role==='LEADER'&&g.scope_type==='CLUB'&&g.club_id).map(g=>g.club_id as string));
  const clubs=(allClubs??[]).filter((c:any)=>global||cityScopes.has(c.city_id)||clubScopes.has(c.id));
  if(!clubs.length) redirect('/manage/teams?error='+encodeURIComponent('A Club Leader, City Admin, Global Admin or Owner scope is required to create a team.'));
  const initial=clubs.some((c:any)=>c.id===selectedClub)?selectedClub:clubs[0].id;
  return <main className="shell sports-shell"><SiteHeader/><ManagementNav account={account} active="teams"/>
    <section className="manage-titlebar compact"><div><Link className="back-link" href="/manage/teams">← Teams</Link><span className="eyebrow">NEW TEAM</span><h1>Add a team</h1><p>Every team belongs to one canonical club. The club identity stays separate so one club can operate A, B, youth or other teams without duplicating the organisation.</p></div></section>
    {error&&<div className="ops-message error">{error}</div>}
    <section className="form-workspace"><form action={createTeam} className="professional-form standalone-form"><input type="hidden" name="return_to" value="/manage/teams/new"/>
      <div className="form-block"><div className="form-block-head"><span>01</span><div><strong>Club & team identity</strong><small>Create the team under the correct parent club.</small></div></div>
        <label className="wide"><span>Parent club *</span><select name="club_id" defaultValue={initial} required>{clubs.map((c:any)=><option key={c.id} value={c.id}>{c.name} · {(c.city as any)?.name??'Italy'}</option>)}</select></label>
        <label><span>Team name *</span><input name="name" required placeholder="Napoli Lions A"/></label><label><span>Short name</span><input name="short_name" placeholder="Lions A"/></label>
        <label><span>Category</span><select name="category" defaultValue="OPEN"><option value="OPEN">Open</option><option value="MEN">Men</option><option value="WOMEN">Women</option><option value="YOUTH">Youth</option><option value="VETERANS">Veterans</option></select></label>
      </div>
      <div className="registry-identity-note"><b>Team identity is canonical.</b><span>Players belong to the team through membership history; tournament squads are selected later from the roster.</span></div>
      <button className="button-primary">Create team →</button>
    </form></section><SiteFooter/></main>;
}
