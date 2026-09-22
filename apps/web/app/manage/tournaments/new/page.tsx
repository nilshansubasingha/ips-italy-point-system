export const dynamic='force-dynamic'; export const revalidate=0;

import Link from 'next/link';
import { SiteFooter,SiteHeader } from '@/components/site-header';
import { ManagementNav } from '@/components/manage/manage-nav';
import { requireAccount } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { canCreateTournament } from '@/lib/project4';
import { createTournament,createCatalogCity,createCatalogSeason,createCatalogRuleset } from '../actions';
import { TournamentCreatorFields } from '../components/tournament-creator-fields';

export default async function NewTournamentPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const account=await requireAccount(); if(!canCreateTournament(account))return <main className="shell sports-shell"><SiteHeader/><ManagementNav account={account} active="tournaments"/><div className="management-surface"><h2>Admin scope required</h2><p>Your current role cannot create tournaments.</p></div><SiteFooter/></main>;
 const sp=await searchParams; const error=typeof sp.error==='string'?sp.error:null; const ok=typeof sp.ok==='string'?sp.ok:null; const supabase=await createClient();
 const [citiesRes,seasonsRes,rulesRes,venuesRes]=await Promise.all([
   supabase.from('cities').select('id,name').eq('status','ACTIVE').order('name'),
   supabase.from('seasons').select('id,name').order('starts_on',{ascending:false}),
   supabase.from('competition_rulesets').select('id,name,version,max_overs,balls_per_over,playing_xi_size,innings_wicket_limit,max_overs_per_bowler').eq('is_active',true).order('name'),
   supabase.from('venues').select('id,city_id,name').eq('status','ACTIVE').order('name'),
 ]);
 const canCatalog=account.grants.some(g=>g.role==='OWNER'||(g.role==='ADMIN'&&g.scope_type==='GLOBAL'));
 return <main className="shell sports-shell"><SiteHeader/><ManagementNav account={account} active="tournaments"/>
   <section className="manage-titlebar compact"><div><Link className="back-link" href="/manage/tournaments">← Tournaments</Link><span className="eyebrow">NEW COMPETITION</span><h1>Create tournament</h1><p>Configure the competition once. Fixtures inherit these defaults automatically and keep their own frozen match-format snapshot.</p></div></section>
   {(error||ok)&&<div className={`ops-message ${error?'error':'success'}`}>{error||ok}</div>}
   <form action={createTournament} className="tournament-workspace"><input type="hidden" name="return_to" value="/manage/tournaments/new"/>
     <div className="tournament-form-canvas"><TournamentCreatorFields cities={(citiesRes.data??[]) as any[]} seasons={(seasonsRes.data??[]) as any[]} rulesets={(rulesRes.data??[]) as any[]} venues={(venuesRes.data??[]) as any[]}/></div>
     <footer className="creation-footer"><div><strong>Draft first.</strong><span>You can review teams, squads and fixtures before publishing the competition.</span></div><button className="button-primary">Create draft tournament →</button></footer>
   </form>
   {canCatalog&&<details className="management-surface catalog-workspace"><summary>Catalogue setup · add a city, season or reusable ruleset</summary><div className="catalog-light-grid">
      <form action={createCatalogCity} className="light-form-card"><input type="hidden" name="return_to" value="/manage/tournaments/new"/><strong>New city</strong><input name="city_name" required placeholder="Genova"/><input name="city_code" required placeholder="GEN" maxLength={8}/><input name="city_region" placeholder="Liguria (optional)"/><button>Add city</button></form>
      <form action={createCatalogSeason} className="light-form-card"><input type="hidden" name="return_to" value="/manage/tournaments/new"/><strong>New season</strong><input name="season_name" required placeholder="2028 Season"/><input name="season_code" required placeholder="2028"/><div className="form-split"><label><span>Starts</span><input name="season_starts" type="date" required/></label><label><span>Ends</span><input name="season_ends" type="date" required/></label></div><button>Add season</button></form>
      <form action={createCatalogRuleset} className="light-form-card"><input type="hidden" name="return_to" value="/manage/tournaments/new"/><strong>New ruleset</strong><input name="ruleset_name" required placeholder="IPS T8 Softball"/><div className="form-split"><input name="ruleset_version" type="number" min="1" defaultValue="1"/><input name="max_overs" type="number" min="1" defaultValue="8"/></div><div className="form-split"><input name="balls_per_over" type="number" min="1" max="12" defaultValue="6"/><input name="playing_xi_size" type="number" min="2" max="20" defaultValue="7"/></div><div className="form-split"><input name="innings_wicket_limit" type="number" min="1" max="19" defaultValue="6"/><input name="max_overs_per_bowler" type="number" min="1" defaultValue="2"/></div><input type="hidden" name="retirement_mode" value="NONE"/><input type="hidden" name="points_win" value="2"/><input type="hidden" name="points_tie" value="1"/><input type="hidden" name="points_no_result" value="1"/><input type="hidden" name="points_loss" value="0"/><button>Add ruleset</button></form>
   </div></details>}
   <SiteFooter/></main>;
}
