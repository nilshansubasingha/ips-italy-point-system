import {notFound} from 'next/navigation';
import Link from 'next/link';
import {getPublicMatchScorecard} from '@ips/data';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {Crest} from '@/components/identity';
import {PublicMatchScorecardView} from '@/components/public-match-scorecard';
import {formatDate} from '@/lib/format';

export const dynamic='force-dynamic';
export const revalidate=0;

export default async function PublicMatchScorecardPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  if(!/^[0-9a-f-]{36}$/i.test(id))notFound();
  const scorecard=await getPublicMatchScorecard(id);
  if(!scorecard)notFound();

  const {match}=scorecard;
  return <main className="shell sports-shell">
    <SiteHeader/>

    <section className="public-match-detail-hero">
      <div className="public-match-detail-top">
        <div>
          <Link href="/match-centre" className="back-link">← Match Centre</Link>
          <span className="eyebrow">{match.status.replaceAll('_',' ')}</span>
          <h1>{match.home_team.name} <i>vs</i> {match.away_team.name}</h1>
          <p>{match.tournament_name} · {formatDate(match.scheduled_at,true,false)}</p>
        </div>
        <span className="public-match-number">MATCH {String(match.number).padStart(2,'0')}</span>
      </div>

      <div className="public-match-result-strip">
        <div className="public-match-result-team">
          <Crest name={match.home_team.name} large/>
          <strong>{match.home_team.name}</strong>
        </div>
        <div className="public-match-result-centre">
          <span>{scorecard.result_text?'RESULT':'MATCH'}</span>
          <strong>{scorecard.result_text??match.status.replaceAll('_',' ')}</strong>
          <small>{match.code}</small>
        </div>
        <div className="public-match-result-team right">
          <Crest name={match.away_team.name} large/>
          <strong>{match.away_team.name}</strong>
        </div>
      </div>
    </section>

    <section className="sports-section public-scorecard-section">
      <PublicMatchScorecardView scorecard={scorecard}/>
    </section>

    <SiteFooter/>
  </main>;
}
