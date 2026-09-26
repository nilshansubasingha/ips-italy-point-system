export const dynamic='force-dynamic';
export const revalidate=0;

import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {ManagementNav} from '@/components/manage/manage-nav';
import {requireAccount} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';

function globalAdmin(account:Awaited<ReturnType<typeof requireAccount>>){
  return account.grants.some(grant=>
    (grant.role==='OWNER'&&grant.scope_type==='GLOBAL')||
    (grant.role==='ADMIN'&&grant.scope_type==='GLOBAL')
  );
}

export default async function MatchHistoryDetail({params}:{params:Promise<{id:string}>}){
  const account=await requireAccount();
  if(!globalAdmin(account))redirect('/manage');

  const {id:identifier}=await params;
  const supabase=await createClient();
  const isUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identifier);
  const matchLookup=isUuid
    ?supabase.from('matches').select('*').eq('id',identifier).maybeSingle()
    :supabase.from('matches').select('*').eq('match_code',decodeURIComponent(identifier).toUpperCase()).maybeSingle();
  const {data:match}=await matchLookup;
  if(!match)notFound();
  const id=match.id;

  const {data:archive}=await supabase.from('match_archives').select('*').eq('match_id',id).maybeSingle();
  if(!archive)notFound();

  const [{data:stats},{data:awards}]=await Promise.all([
    supabase.from('player_match_stats').select('*').eq('match_id',id).order('runs',{ascending:false}),
    supabase.from('match_player_awards').select('*').eq('match_id',id).order('created_at')
  ]);

  const tournamentId=match?.tournament_id??archive.tournament_id;
  const {data:tournament}=await supabase.from('tournaments').select('*').eq('id',tournamentId).maybeSingle();

  const cityId=tournament?.city_id??null;
  const teamIds=[match?.home_team_id,match?.away_team_id].filter(Boolean);
  const playerIds=[...new Set([
    ...(stats??[]).map((row:any)=>row.player_id),
    ...(awards??[]).map((row:any)=>row.player_id)
  ].filter(Boolean))];

  const [{data:city},{data:teams},{data:players}]=await Promise.all([
    cityId?supabase.from('cities').select('id,name,code').eq('id',cityId).maybeSingle():Promise.resolve({data:null} as any),
    teamIds.length?supabase.from('teams').select('id,name,short_name,logo_url').in('id',teamIds):Promise.resolve({data:[]} as any),
    playerIds.length?supabase.from('players').select('id,display_name,ips_code,slug,primary_role').in('id',playerIds):Promise.resolve({data:[]} as any)
  ]);

  const teamMap=new Map<string,any>((teams??[]).map((row:any)=>[String(row.id),row] as [string,any]));
  const playerMap=new Map<string,any>((players??[]).map((row:any)=>[String(row.id),row] as [string,any]));
  const snap=archive.snapshot??{};
  const archivedMatch=snap.match??{};
  const innings=Array.isArray(snap.innings)?snap.innings:[];
  const home=teamMap.get(match?.home_team_id)?.name??archivedMatch.home_team?.name??'Home';
  const away=teamMap.get(match?.away_team_id)?.name??archivedMatch.away_team?.name??'Away';
  const rankingEligible=Boolean(match?.ranking_eligible??snap.ranking_eligible);
  const classification=String(match?.match_classification??snap.match_classification??(rankingEligible?'RANKING':'FRIENDLY'));
  const official=['OFFICIAL','LOCKED'].includes(match?.status??archive.match_status);
  const status=String(match?.status??archive.match_status);

  return <main className="shell sports-shell">
    <SiteHeader/>
    <ManagementNav account={account} active="matches"/>

    <section className="match-history-detail-hero">
      <div>
        <Link className="back-link" href="/manage/matches">← Match History</Link>
        <span className="eyebrow">{archive.competition_kind==='QUICK_MATCH'?'QUICK MATCH':'TOURNAMENT MATCH'} · {classification}</span>
        <h1>{home} <i>vs</i> {away}</h1>
        <p>{tournament?.name??archivedMatch.tournament_name??'IPS Match'} · {city?.name??'Italy'} · {archive.match_code}</p>
      </div>
      <div className="history-detail-status">
        <span>STATUS</span>
        <strong>{status.replaceAll('_',' ')}</strong>
        <small>{rankingEligible?'Ranking eligible':'Ranking excluded'}</small>
      </div>
    </section>

    <section className="history-detail-summary">
      <div className="history-result-large">
        <span>RESULT</span>
        <strong>{archive.result_text??'Completed'}</strong>
      </div>
      <div><span>Completed</span><strong>{archive.completed_at?new Date(archive.completed_at).toLocaleString('en-GB',{timeZone:'Europe/Rome'}):'—'}</strong></div>
      <div><span>Certified</span><strong>{archive.certified_at?new Date(archive.certified_at).toLocaleString('en-GB',{timeZone:'Europe/Rome'}):official?'Official':'Not yet'}</strong></div>
      <div><span>Format</span><strong>{match?.format_overs_per_innings??archivedMatch.overs_per_innings??'—'} overs · {match?.format_players_per_side??archivedMatch.players_per_side??'—'} players</strong></div>
      <div><span>Classification</span><strong>{classification.replaceAll('_',' ')}</strong></div>
      <div><span>Ranking</span><strong>{rankingEligible?'Eligible after certification':'Excluded'}</strong></div>
    </section>

    <div className="history-detail-actions">
      <Link href={'/match-centre/'+encodeURIComponent(match.match_code)} target="_blank">Open public scorecard ↗</Link>
      <Link href={'/manage/tournaments/'+(tournament?.slug??tournamentId)}>Tournament operations →</Link>
    </div>

    <section className="sports-section history-detail-innings-section">
      <div className="sports-section-head">
        <div><span className="eyebrow">ARCHIVED SCORECARD</span><h2>Innings detail.</h2></div>
        <span className="section-note">This is the permanent archive snapshot saved by IPS when the match finished.</span>
      </div>

      <div className="history-innings-stack">
        {innings.map((inn:any)=><article className="history-innings-card" key={inn.innings_no}>
          <header>
            <div>
              <span>{inn.innings_no===1?'1ST INNINGS':'2ND INNINGS'}</span>
              <strong>{inn.batting_team?.name??'Team'}</strong>
            </div>
            <div><strong>{inn.runs}/{inn.wickets}</strong><span>{inn.overs} ov</span></div>
          </header>

          <div className="history-score-tables">
            <div className="history-score-table">
              <div className="history-score-title">Batting</div>
              <div className="history-score-head batting"><span>Player</span><b>R</b><b>B</b><b>4</b><b>6</b></div>
              {(inn.batting??[]).filter((p:any)=>(p.balls??0)>0||(p.runs??0)>0||p.dismissed).map((p:any)=><div className="history-score-row batting" key={p.player_id}>
                <span><strong>{p.name}</strong><small>{p.dismissed?(p.dismissal||'OUT').replaceAll('_',' '):'NOT OUT'}</small></span>
                <b>{p.runs??0}</b><b>{p.balls??0}</b><b>{p.fours??0}</b><b>{p.sixes??0}</b>
              </div>)}
            </div>

            <div className="history-score-table">
              <div className="history-score-title">Bowling</div>
              <div className="history-score-head bowling"><span>Player</span><b>OV</b><b>R</b><b>W</b></div>
              {(inn.bowling??[]).map((p:any)=><div className="history-score-row bowling" key={p.player_id}>
                <span><strong>{p.name}</strong><small>{p.ips_code??''}</small></span>
                <b>{p.overs??'0.0'}</b><b>{p.runs??0}</b><b>{p.wickets??0}</b>
              </div>)}
              {!(inn.bowling??[]).length&&<p>No bowling figures recorded.</p>}
            </div>
          </div>
        </article>)}
      </div>
    </section>

    <section className="sports-section">
      <div className="sports-section-head">
        <div><span className="eyebrow">PLAYER FACTS</span><h2>Stored performance records.</h2></div>
        <span className="section-note">{official?'Official player facts':'Provisional player facts'} · {rankingEligible?'ranking eligible':'ranking excluded'}.</span>
      </div>

      <div className="history-player-table">
        <div className="history-player-head"><span>Player</span><b>Runs</b><b>Balls</b><b>4s</b><b>6s</b><b>Wkts</b><b>Bowling</b><b>Official</b></div>
        {(stats??[]).map((row:any)=>{
          const player=playerMap.get(row.player_id) as any;
          const bowlingOvers=Number(row.bowling_balls??0);
          const ballsPerOver=Number(match?.format_balls_per_over??6);
          const overText=(Math.floor(bowlingOvers/ballsPerOver))+'.'+(bowlingOvers%ballsPerOver);
          return <div className="history-player-row" key={row.player_id}>
            <span><strong>{player?.display_name??'Player'}</strong><small>{player?.ips_code??row.player_id}</small></span>
            <b>{row.runs}</b><b>{row.balls}</b><b>{row.fours}</b><b>{row.sixes}</b><b>{row.wickets}</b><b>{row.bowling_runs}/{overText}</b><b>{row.is_official?'YES':'NO'}</b>
          </div>;
        })}
      </div>
    </section>

    <section className="sports-section history-detail-two-col">
      <div>
        <div className="sports-section-head"><div><span className="eyebrow">AWARDS</span><h2>Manual match awards.</h2></div></div>
        <div className="history-detail-list">
          {(awards??[]).map((award:any)=>{
            const player=playerMap.get(award.player_id) as any;
            return <div key={award.id}><span>{award.award_name}</span><strong>{player?.display_name??'Player'}</strong><small>{player?.ips_code??''}</small></div>;
          })}
          {!(awards??[]).length&&<div className="history-detail-empty">No manual awards have been added for this match.</div>}
        </div>
      </div>

      <div>
        <div className="sports-section-head"><div><span className="eyebrow">ARCHIVE RECORD</span><h2>Data integrity.</h2></div></div>
        <div className="history-detail-list">
          <div><span>Match ID</span><strong className="history-mono">{id}</strong></div>
          <div><span>Match code</span><strong>{archive.match_code}</strong></div>
          <div><span>Archived</span><strong>{archive.archived_at?new Date(archive.archived_at).toLocaleString('en-GB',{timeZone:'Europe/Rome'}):'—'}</strong></div>
          <div><span>Last archive update</span><strong>{archive.updated_at?new Date(archive.updated_at).toLocaleString('en-GB',{timeZone:'Europe/Rome'}):'—'}</strong></div>
          <div><span>Competition kind</span><strong>{archive.competition_kind.replaceAll('_',' ')}</strong></div>
          <div><span>Player fact rows</span><strong>{(stats??[]).length}</strong></div>
        </div>
      </div>
    </section>

    <SiteFooter/>
  </main>;
}
