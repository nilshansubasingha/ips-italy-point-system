export const dynamic='force-dynamic';
export const revalidate=0;

import Link from 'next/link';
import {getActiveCities} from '@ips/data';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {ManagementNav} from '@/components/manage/manage-nav';
import {NumberStepper} from '@/components/manage/number-stepper';
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
  const rawError=typeof sp.error==='string'?sp.error:null;
  const error=rawError?.includes('Squad is locked')?null:rawError;
  const supabase=await createClient();

  const [activeCities,teamsRes,seasonsRes,rulesRes,venuesRes]=await Promise.all([
    getActiveCities(50),
    supabase.from('teams').select('id,name,short_name,club:clubs(city_id,city:cities(name))').eq('status','ACTIVE').order('name'),
    supabase.from('seasons').select('id,name,starts_on').order('starts_on',{ascending:false}).limit(5),
    supabase.from('competition_rulesets').select('id,name,version,playing_xi_size,max_overs,balls_per_over,innings_wicket_limit,max_overs_per_bowler,free_hit_on_no_ball').eq('is_active',true).order('name'),
    supabase.from('venues').select('id,name,city_id,city:cities(name)').eq('status','ACTIVE').order('name')
  ]);

  const cities=activeCities.filter(city=>Number(city.team_count)>0);
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
        <p>Create one match without building a full tournament. Only IPS cities with registered teams appear here.</p>
      </div>
    </section>

    {error&&<div className="ops-message error">{error}</div>}

    {!defaultSeason||!defaultRule||!cities.length?<div className="management-surface"><strong>Quick Match setup is not ready.</strong><p>{!cities.length?'At least one IPS city with a registered team is required.':'An active season and ruleset are required.'}</p></div>:
    <form action={createQuickMatch} className="quick-match-setup">
      <input type="hidden" name="return_to" value="/manage/tournaments/quick"/>
      <input type="hidden" name="season_id" value={defaultSeason.id}/>

      <section className="quick-match-card">
        <div className="quick-match-card-head"><span className="eyebrow">01 · MATCH</span><strong>Who is playing?</strong></div>
        <div className="quick-match-grid three">
          <label><span>Registered city</span><select name="city_id" required>{cities.map(city=><option value={city.id} key={city.id}>{city.name}</option>)}</select></label>
          <label><span>Team A</span><select name="home_team_id" required><option value="">Select team</option>{teams.map((team:any)=><option value={team.id} key={team.id}>{team.name} · {(team.club as any)?.city?.name??'Italy'}</option>)}</select></label>
          <label><span>Team B</span><select name="away_team_id" required><option value="">Select team</option>{teams.map((team:any)=><option value={team.id} key={team.id}>{team.name} · {(team.club as any)?.city?.name??'Italy'}</option>)}</select></label>
        </div>
      </section>

      <section className="quick-match-card">
        <div className="quick-match-card-head"><span className="eyebrow">02 · FORMAT</span><strong>Set the match in seconds.</strong></div>

        <div className="quick-match-stepper-grid">
          <NumberStepper name="players_per_side" label="Players / side" defaultValue={Number(defaultRule.playing_xi_size??7)} min={2} max={20}/>
          <NumberStepper name="overs_per_innings" label="Overs" defaultValue={Math.min(Number(defaultRule.max_overs??10),20)} min={1} max={100}/>
          <NumberStepper name="balls_per_over" label="Balls / over" defaultValue={Number(defaultRule.balls_per_over??6)} min={1} max={12}/>
        </div>

        <fieldset className="quick-match-classification">
          <legend>Match classification</legend>
          <div className="quick-classification-options">
            <label>
              <input type="radio" name="match_classification" value="RANKING" defaultChecked/>
              <span><b>Ranking Match</b><small>After admin certification, this match updates official player rankings.</small></span>
            </label>
            <label>
              <input type="radio" name="match_classification" value="FRIENDLY"/>
              <span><b>Friendly</b><small>Saved in IPS history and scorecards, but never changes rankings.</small></span>
            </label>
            <label>
              <input type="radio" name="match_classification" value="PRACTICE"/>
              <span><b>Practice</b><small>For testing or informal games. Never changes rankings.</small></span>
            </label>
          </div>
        </fieldset>

        <div className="quick-match-grid three quick-match-rule-row">
          <label><span>Ruleset</span><select name="ruleset_id" defaultValue={defaultRule.id}>{rules.map((rule:any)=><option key={rule.id} value={rule.id}>{rule.name} v{rule.version}</option>)}</select></label>

          <fieldset className="quick-free-hit-field">
            <legend>Free hit after no-ball</legend>
            <div className="quick-free-hit-toggle">
              <label><input type="radio" name="free_hit_on_no_ball" value="yes" defaultChecked={Boolean(defaultRule.free_hit_on_no_ball)}/><span>Yes</span></label>
              <label><input type="radio" name="free_hit_on_no_ball" value="no" defaultChecked={!Boolean(defaultRule.free_hit_on_no_ball)}/><span>No</span></label>
            </div>
          </fieldset>

          <label><span>Venue</span><select name="venue_id" defaultValue=""><option value="">Venue TBC</option>{venues.map((venue:any)=><option key={venue.id} value={venue.id}>{venue.name} · {(venue.city as any)?.name??'Italy'}</option>)}</select></label>
        </div>

        <details className="quick-match-advanced">
          <summary>More match rules · optional</summary>
          <div className="quick-match-stepper-grid two">
            <NumberStepper name="wicket_limit" label="Wicket limit" defaultValue={Number(defaultRule.innings_wicket_limit??Math.max(Number(defaultRule.playing_xi_size??7)-1,1))} min={1} max={19}/>
            <NumberStepper name="max_overs_per_bowler" label="Max overs / bowler" defaultValue={Number(defaultRule.max_overs_per_bowler??2)} min={1} max={100}/>
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
