export const dynamic='force-dynamic';
export const revalidate=0;

import Link from 'next/link';
import {redirect} from 'next/navigation';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {ManagementNav} from '@/components/manage/manage-nav';
import {ConfirmSubmitButton} from '@/components/manage/confirm-submit-button';
import {requireAccount} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {updateMatchStatus} from '../tournaments/actions';

function globalAdmin(account:Awaited<ReturnType<typeof requireAccount>>){
  return account.grants.some(grant=>
    (grant.role==='OWNER'&&grant.scope_type==='GLOBAL')||
    (grant.role==='ADMIN'&&grant.scope_type==='GLOBAL')
  );
}

export default async function MatchHistoryPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const account=await requireAccount();
  if(!globalAdmin(account))redirect('/manage');

  const sp=await searchParams;
  const error=typeof sp.error==='string'?sp.error:null;
  const ok=typeof sp.ok==='string'?sp.ok:null;
  const supabase=await createClient();

  const {data,error:loadError}=await supabase
    .from('match_archives')
    .select('*')
    .order('completed_at',{ascending:false})
    .limit(200);

  const rows=(data??[]) as any[];

  return <main className="shell sports-shell">
    <SiteHeader/>
    <ManagementNav account={account} active="matches"/>

    <section className="manage-titlebar">
      <div>
        <span className="eyebrow">MATCH ARCHIVE</span>
        <h1>Completed match history</h1>
        <p>Every finished IPS match is snapshotted here with its scoring record. Certification controls whether its player facts count toward official career statistics and become eligible for the rankings engine.</p>
      </div>
      <div className="archive-title-stat"><strong>{rows.length}</strong><span>saved matches</span></div>
    </section>

    {(error||ok||loadError)&&<div className={'ops-message '+((error||loadError)?'error':'success')}>{loadError?.message||error||ok}</div>}

    <section className="match-archive-grid">
      {rows.map(row=>{
        const snap=row.snapshot??{};
        const match=snap.match??{};
        const innings=Array.isArray(snap.innings)?snap.innings:[];
        const home=match.home_team?.name??'Home';
        const away=match.away_team?.name??'Away';
        const official=row.match_status==='OFFICIAL'||row.match_status==='LOCKED';
        return <article className="match-archive-card" key={row.match_id}>
          <header>
            <div><span>{row.competition_kind==='QUICK_MATCH'?'QUICK MATCH':'TOURNAMENT MATCH'} · {row.match_code}</span><strong>{home} <i>vs</i> {away}</strong></div>
            <b className={official?'official':'provisional'}>{official?'OFFICIAL':'PROVISIONAL'}</b>
          </header>

          <div className="archive-innings">
            {innings.map((inn:any)=><div key={inn.innings_no}>
              <span>{inn.innings_no===1?'1ST':'2ND'} · {inn.batting_team?.name??'Team'}</span>
              <strong>{inn.runs}/{inn.wickets}</strong>
              <small>{inn.overs} ov</small>
            </div>)}
          </div>

          <div className="archive-result">
            <span>RESULT</span>
            <strong>{row.result_text??'Completed'}</strong>
          </div>

          <footer>
            <div>
              <span>{row.completed_at?new Date(row.completed_at).toLocaleString('en-GB',{timeZone:'Europe/Rome'}):'—'}</span>
              <small>{official?'Counts in official player statistics':'Saved, but not counted in official statistics yet'}</small>
            </div>
            <div className="archive-actions">
              <Link href={'/match-centre/'+row.match_id} target="_blank">Scorecard ↗</Link>
              {!official&&<form action={updateMatchStatus}>
                <input type="hidden" name="match_id" value={row.match_id}/>
                <input type="hidden" name="status" value="OFFICIAL"/>
                <input type="hidden" name="return_to" value="/manage/matches"/>
                <ConfirmSubmitButton className="archive-certify" message={'Certify '+home+' vs '+away+' as an official IPS result? Its player statistics will become official and available to the rankings engine.'}>Certify match</ConfirmSubmitButton>
              </form>}
            </div>
          </footer>
        </article>;
      })}

      {!rows.length&&<div className="sports-empty"><strong>No finished matches archived yet.</strong><span>When the Controller completes a match, IPS will save it here automatically.</span></div>}
    </section>

    <SiteFooter/>
  </main>;
}
