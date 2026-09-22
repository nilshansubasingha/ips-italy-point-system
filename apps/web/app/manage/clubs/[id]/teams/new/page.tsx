export const dynamic='force-dynamic';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {ManagementNav} from '@/components/manage/manage-nav';
import {requireAccount} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {createTeam} from '../../../../registry/actions';

export default async function NewTeamPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const account=await requireAccount(); const {id}=await params; const sp=await searchParams; const error=typeof sp.error==='string'?sp.error:null; const supabase=await createClient(); const {data:club}=await supabase.from('clubs').select('id,name').eq('id',id).maybeSingle(); if(!club)notFound();
 return <main className="shell sports-shell"><SiteHeader/><ManagementNav account={account} active="clubs"/><section className="manage-titlebar compact"><div><Link className="back-link" href={`/manage/clubs/${id}`}>← {club.name}</Link><span className="eyebrow">NEW TEAM</span><h1>Add a team</h1><p>Teams live under a club. Players then join the team roster without creating duplicate identities.</p></div></section>{error&&<div className="ops-message error">{error}</div>}
 <section className="form-workspace narrow"><form action={createTeam} className="professional-form"><input type="hidden" name="club_id" value={id}/><input type="hidden" name="return_to" value={`/manage/clubs/${id}/teams/new`}/><div className="form-block"><div className="form-block-head"><span>01</span><div><strong>Team identity</strong><small>{club.name}</small></div></div><label className="wide"><span>Team name *</span><input name="name" required placeholder="Napoli Lions A"/></label><div className="form-split"><label><span>Short name</span><input name="short_name" placeholder="Lions A"/></label><label><span>Category</span><select name="category" defaultValue="OPEN"><option value="OPEN">Open</option><option value="MEN">Men</option><option value="WOMEN">Women</option><option value="YOUTH">Youth</option><option value="SOCIAL">Social</option></select></label></div></div><div className="form-actionbar"><Link href={`/manage/clubs/${id}`}>Cancel</Link><button className="button-primary">Create team →</button></div></form></section><SiteFooter/></main>;
}
