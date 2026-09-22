export const dynamic='force-dynamic';
import Link from 'next/link';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {ManagementNav} from '@/components/manage/manage-nav';
import {requireAccount} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {createClub} from '../../registry/actions';

export default async function NewClubPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const account=await requireAccount(); const sp=await searchParams; const error=typeof sp.error==='string'?sp.error:null; const supabase=await createClient(); const {data:cities}=await supabase.from('cities').select('id,name').eq('status','ACTIVE').order('name');
 return <main className="shell sports-shell"><SiteHeader/><ManagementNav account={account} active="clubs"/><section className="manage-titlebar compact"><div><Link className="back-link" href="/manage/clubs">← Clubs</Link><span className="eyebrow">NEW CLUB</span><h1>Register a club</h1><p>Create the organisation once. Teams, leaders, players and future competition history will attach to this identity.</p></div></section>{error&&<div className="ops-message error">{error}</div>}
 <section className="form-workspace"><form action={createClub} className="professional-form"><input type="hidden" name="return_to" value="/manage/clubs/new"/><div className="form-block"><div className="form-block-head"><span>01</span><div><strong>Club identity</strong><small>Public organisation information</small></div></div><label className="wide"><span>Club name *</span><input name="name" required placeholder="Napoli Lions Cricket Club"/></label><div className="form-split"><label><span>Short name</span><input name="short_name" placeholder="Napoli Lions"/></label><label><span>City *</span><select name="city_id" required>{(cities??[]).map((c:any)=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label></div><div className="form-split"><label><span>Founded year</span><input type="number" name="founded_year" min="1900" max="2200" placeholder="2024"/></label><label><span>Website</span><input name="website_url" type="url" placeholder="https://..."/></label></div><label className="wide"><span>Public description</span><textarea name="description" rows={4} placeholder="Short description of the club"/></label></div><div className="form-actionbar"><Link href="/manage/clubs">Cancel</Link><button className="button-primary">Create club →</button></div></form></section><SiteFooter/></main>;
}
