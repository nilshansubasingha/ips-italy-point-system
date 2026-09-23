export const dynamic='force-dynamic'; export const revalidate=0;
import {redirect} from 'next/navigation';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {requireAccount} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {PlayerAvatar} from '@/components/identity';
import {claimMyPlayer} from '../manage/registry/actions';

export default async function ClaimPlayerPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const account=await requireAccount(); if(account.profile?.linked_player_id)redirect('/dashboard'); const sp=await searchParams; const error=typeof sp.error==='string'?sp.error:null; const supabase=await createClient(); const {data:candidates,error:rpcError}=await supabase.rpc('ips_my_claim_candidates');
 return <main className="shell sports-shell"><SiteHeader/><section className="claim-hero"><span className="eyebrow">LINK CRICKET IDENTITY</span><h1>Claim your IPS player profile</h1><p>If a team has already registered you using the same verified email or phone as this account, IPS can link the account to that existing player. It will never create a second cricket career.</p></section>{(error||rpcError)&&<div className="ops-message error">{error||rpcError?.message}</div>}
 <section className="claim-grid">{(candidates??[]).map((p:any)=><article className="claim-card" key={p.id}><PlayerAvatar name={p.display_name} imageUrl={p.profile_image_url} large/><span>{p.matched_by}</span><h2>{p.display_name}</h2><code>{p.ips_code}</code><form action={claimMyPlayer}><input type="hidden" name="player_id" value={p.id}/><button className="button-primary">This is me · Link account</button></form></article>)}{!candidates?.length&&<div className="management-surface claim-empty"><strong>No matching player record found.</strong><p>Your verified account email/phone does not currently match an unclaimed IPS player. A Team or IPS administrator can add the contact to your existing player record first.</p></div>}</section><SiteFooter/></main>;
}
