export const dynamic='force-dynamic';
export const revalidate=0;

import Link from 'next/link';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {ManagementNav} from '@/components/manage/manage-nav';
import {requireAccount} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {canCreateTournament} from '@/lib/project4';
import {createQuickMatch} from '../actions';

export default async function QuickMatchPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const account=await requireAccount();
  if(!canCreateTournament(account)){
    return <main className="shell sports-shell"><SiteHeader/><ManagementNav account={account} active="tournaments"/><div className="management-surface"><h2>Admin scope required</h2><p>Your current role cannot create Quick Matches.</p></div><SiteFooter/></main>;
  }

  const sp=await searchParams;
  const error=typeof sp.error==='string'?sp.error:null;
  const supabase=await createClient();
  const [citiesRes,teamsRes,seasonsRes,rulesRes,venuesRes]=await Promise.all([
    supabase.from('cities').select('id,name,code').eq('status','ACTIVE').order('name'),
    supabase.from('teams').select('id,name,short_name,club:clubs(city_id,city:cities(name))').order('name'),
    supabase.from('seasons').select('id,name,starts_on').order('starts_on',{ascending:false}).limit(5),
    supabase.from('competition_rulesets').select('id,name,version,playing_xi_size,max_overs,balls_per_over,innings_wicket_limit,max_overs_per_bowler').eq('is_active',true).order('name'),
    supabase.from('venues').select('id,name,city_id,city:cities(name)').eq('status','ACTIVE').order('name')
  ]);

  const cities=citiesRes.data??[];
  const teams=teamsRes.data??[];
  const seasons=seasonsRes.data??[];
  const rules=rulesRes.data??[];
  const venues=venuesRes.data??[];
  const defaultSeason=seasons[0];
  const defaultRule=rules[0];

  return <main className="shell sports-shell">
    <SiteHeader/>
    <ManagementNav account={account} active="tournaments"/>

    <section className="manage-titlebar compact">
      <div>
        <Link className="back-link" href="/manage/tournaments">← Match operations</Link>
        <span className="eyebrow">FAST SETUP</span>
        <h1>Quick Match</h1>
        <p>Create one match without building a full tournament. IPS prepares the two team squads automatically; you only choose the playing sides before scoring.</p>
      </div>
    </section>

    {error&&<div className="ops-message error">{error}</div>}

    {!defaultSeason||!defaultRule?<div className="management-surface"><strong>Quick Match needs an active season and ruleset.</strong><p>Create those once from Tournament setup, then Quick Match can reuse them.</p></div>:
    <form action={createQuickMatch} className="quick-match-setup">
      <input type="hidden" name="return_to" value="/manage/tournaments/quick"/>
      <input type="hidden" name="season_id" value={defaultSeason.id}/>

      <section className="quick-match-card">
        <div className="quick-match-card-head"><span className="eyebrow">01 · MATCH</span><strong>Who is playing?</strong></div>
        <div className="quick-match-grid three">
          <label><span>City</span><select name="city_id" required>{cities.map((city:any)=><option value={city.id} key={city.id}>{city.name}</option>)}</select></label>
          <label><span>Team A</span><select name="home_team_id" required><option value="">Select team</option>{teams.map((team:any)=><option value={team.id} key={team.id}>{team.name} · {(team.club as any)?.city?.name??'Italy'}</option>)}</select></label>
          <label><span>Team B</span><select name="away_team_id" required><option value="">Select team</option>{teams.map((team:any)=><option value={team.id} key={team.id}>{team.name} · {(team.club as any)?.city?.name??'Italy'}</option>)}</select></label>
        </div>
      </section>

      <section className="quick-match-card">
        <div className="quick-match-card-head"><span className="eyebrow">02 · FORMAT</span><strong>Set the match in seconds.</strong></div>
        <div className="quick-match-grid four">
          <label><span>Players / side</span><select name="players_per_side" defaultValue={String(defaultRule.playing_xi_size??7)}>{[4,5,6,7,8,9,10,11].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
          <label><span>Overs</span><select name="overs_per_innings" defaultValue={String(Math.min(Number(defaultRule.max_overs??8),10))}>{[5,6,8,10,12,15,20].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
          <label><span>Balls / over</span><select name="balls_per_over" defaultValue={String(defaultRule.balls_per_over??6)}>{[5,6,8].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
          <label><span>Venue</span><select name="venue_id" defaultValue=""><option value="">Venue TBC</option>{venues.map((venue:any)=><option key={venue.id} value={venue.id}>{venue.name} · {(venue.city as any)?.name??'Italy'}</option>)}</select></label>
        </div>

        <details className="quick-match-advanced">
          <summary>Match rules · optional</summary>
          <div className="quick-match-grid three">
            <label><span>Ruleset</span><select name="ruleset_id" defaultValue={defaultRule.id}>{rules.map((rule:any)=><option key={rule.id} value={rule.id}>{rule.name} v{rule.version}</option>)}</select></label>
            <label><span>Wicket limit</span><input name="wicket_limit" type="number" min="1" max="19" defaultValue={defaultRule.innings_wicket_limit??''}/></label>
            <label><span>Max overs / bowler</span><input name="max_overs_per_bowler" type="number" min="1" max="100" defaultValue={defaultRule.max_overs_per_bowler??''}/></label>
          </div>
        </details>
      </section>

      <footer className="quick-match-footer">
        <div><strong>Next step: Playing Side</strong><span>After creation, choose the players, captain and wicketkeeper, then open the Controller.</span></div>
        <button className="button-primary">Create Quick Match →</button>
      </footer>
    </form>}

    <SiteFooter/>
  </main>;
}
