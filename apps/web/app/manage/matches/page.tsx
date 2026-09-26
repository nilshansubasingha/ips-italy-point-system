export const dynamic='force-dynamic';
export const revalidate=0;

import Link from 'next/link';
import {redirect} from 'next/navigation';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {ManagementNav} from '@/components/manage/manage-nav';
import {ConfirmSubmitButton} from '@/components/manage/confirm-submit-button';
import {requireAccount} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {revokeMatchCertification,updateMatchStatus} from '../tournaments/actions';

function globalAdmin(account:Awaited<ReturnType<typeof requireAccount>>){
  return account.grants.some(grant=>
    (grant.role==='OWNER'&&grant.scope_type==='GLOBAL')||
    (grant.role==='ADMIN'&&grant.scope_type==='GLOBAL')
  );
}
function one(value:string|string[]|undefined){return typeof value==='string'?value:''}
function clean(value:string){return value.trim().toLowerCase()}

export default async function MatchHistoryPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const account=await requireAccount();
  if(!globalAdmin(account))redirect('/manage');

  const sp=await searchParams;
  const error=one(sp.error)||null;
  const ok=one(sp.ok)||null;

  const search=one(sp.q);
  const cityFilter=one(sp.city);
  const tournamentFilter=one(sp.tournament);
  const statusFilter=one(sp.status);
  const kindFilter=one(sp.kind);
  const classificationFilter=one(sp.classification);
  const fromFilter=one(sp.from);
  const toFilter=one(sp.to);

  const supabase=await createClient();
  const {data,error:loadError}=await supabase
    .from('match_archives')
    .select('*')
    .order('completed_at',{ascending:false})
    .limit(500);

  const rows=(data??[]) as any[];
  const tournamentIds=[...new Set(rows.map(row=>row.tournament_id).filter(Boolean))];
  const matchIds=[...new Set(rows.map(row=>row.match_id).filter(Boolean))];

  const [{data:tournaments},{data:matches}]=await Promise.all([
    tournamentIds.length
      ?supabase.from('tournaments').select('id,name,city_id,competition_kind').in('id',tournamentIds)
      :Promise.resolve({data:[]} as any),
    matchIds.length
      ?supabase.from('matches').select('id,tournament_id,home_team_id,away_team_id,format_overs_per_innings,match_classification,ranking_eligible').in('id',matchIds)
      :Promise.resolve({data:[]} as any)
  ]);

  const cityIds=[...new Set((tournaments??[]).map((t:any)=>t.city_id).filter(Boolean))];
  const teamIds=[...new Set((matches??[]).flatMap((m:any)=>[m.home_team_id,m.away_team_id]).filter(Boolean))];

  const [{data:cities},{data:teams}]=await Promise.all([
    cityIds.length?supabase.from('cities').select('id,name').in('id',cityIds):Promise.resolve({data:[]} as any),
    teamIds.length?supabase.from('teams').select('id,name,short_name').in('id',teamIds):Promise.resolve({data:[]} as any)
  ]);

  const tournamentMap=new Map((tournaments??[]).map((item:any)=>[item.id,item]));
  const matchMap=new Map((matches??[]).map((item:any)=>[item.id,item]));
  const cityMap=new Map((cities??[]).map((item:any)=>[item.id,item]));
  const teamMap=new Map((teams??[]).map((item:any)=>[item.id,item]));

  const enriched=rows.map(row=>{
    const snapshot=row.snapshot??{};
    const archivedMatch=snapshot.match??{};
    const match=matchMap.get(row.match_id) as any;
    const tournament=tournamentMap.get(row.tournament_id) as any;
    const city=tournament?cityMap.get(tournament.city_id) as any:null;
    const home=match?teamMap.get(match.home_team_id) as any:null;
    const away=match?teamMap.get(match.away_team_id) as any:null;
    const rankingEligible=match?.ranking_eligible??Boolean(snapshot.ranking_eligible);
    const classification=String(match?.match_classification??snapshot.match_classification??(rankingEligible?'RANKING':'FRIENDLY'));
    return {
      ...row,
      snapshot,
      archivedMatch,
      tournament,
      city,
      match,
      homeName:home?.name??archivedMatch.home_team?.name??'Home',
      awayName:away?.name??archivedMatch.away_team?.name??'Away',
      rankingEligible:Boolean(rankingEligible),
      classification
    };
  });

  const q=clean(search);
  const fromTs=fromFilter?Date.parse(fromFilter+'T00:00:00'):null;
  const toTs=toFilter?Date.parse(toFilter+'T23:59:59.999'):null;

  const filtered=enriched.filter(row=>{
    const completedTs=row.completed_at?Date.parse(row.completed_at):0;
    const statusGroup=(row.match_status==='OFFICIAL'||row.match_status==='LOCKED')?'OFFICIAL'
      :row.match_status==='AWAITING_CERTIFICATION'?'AWAITING_CERTIFICATION'
      :'PROVISIONAL';
    const haystack=[
      row.match_code,row.homeName,row.awayName,row.result_text,
      row.tournament?.name,row.city?.name,row.classification,row.competition_kind
    ].filter(Boolean).join(' ').toLowerCase();

    return (!q||haystack.includes(q))
      &&(!cityFilter||row.city?.id===cityFilter)
      &&(!tournamentFilter||row.tournament_id===tournamentFilter)
      &&(!statusFilter||statusGroup===statusFilter)
      &&(!kindFilter||row.competition_kind===kindFilter)
      &&(!classificationFilter||row.classification===classificationFilter)
      &&(!fromTs||completedTs>=fromTs)
      &&(!toTs||completedTs<=toTs);
  });

  const cityOptions=[...new Map(enriched.filter(row=>row.city).map(row=>[row.city.id,row.city])).values()].sort((a:any,b:any)=>a.name.localeCompare(b.name));
  const tournamentOptions=[...new Map(enriched.filter(row=>row.tournament).map(row=>[row.tournament.id,row.tournament])).values()].sort((a:any,b:any)=>a.name.localeCompare(b.name));

  const filterParams=new URLSearchParams();
  if(search)filterParams.set('q',search);
  if(cityFilter)filterParams.set('city',cityFilter);
  if(tournamentFilter)filterParams.set('tournament',tournamentFilter);
  if(statusFilter)filterParams.set('status',statusFilter);
  if(kindFilter)filterParams.set('kind',kindFilter);
  if(classificationFilter)filterParams.set('classification',classificationFilter);
  if(fromFilter)filterParams.set('from',fromFilter);
  if(toFilter)filterParams.set('to',toFilter);
  const returnTo='/manage/matches'+(filterParams.toString()?'?'+filterParams.toString():'');

  const officialCount=enriched.filter(row=>['OFFICIAL','LOCKED'].includes(row.match_status)).length;
  const awaitingCount=enriched.filter(row=>row.match_status==='AWAITING_CERTIFICATION').length;

  return <main className="shell sports-shell">
    <SiteHeader/>
    <ManagementNav account={account} active="matches"/>

    <section className="manage-titlebar match-history-title">
      <div>
        <span className="eyebrow">MATCH ARCHIVE</span>
        <h1>Completed match history</h1>
        <p>Search and filter the permanent IPS match archive. Open Details when you need the full innings, player performances, awards and certification information.</p>
      </div>
      <div className="archive-title-metrics">
        <div><strong>{enriched.length}</strong><span>Saved</span></div>
        <div><strong>{officialCount}</strong><span>Official</span></div>
        <div><strong>{awaitingCount}</strong><span>Awaiting</span></div>
      </div>
    </section>

    {(error||ok||loadError)&&<div className={'ops-message '+((error||loadError)?'error':'success')}>{loadError?.message||error||ok}</div>}

    <form className="match-history-filters" method="get">
      <label className="history-search">
        <span>Search</span>
        <input name="q" defaultValue={search} placeholder="Team, match code, tournament…"/>
      </label>

      <label><span>City</span><select name="city" defaultValue={cityFilter}>
        <option value="">All cities</option>
        {cityOptions.map((item:any)=><option value={item.id} key={item.id}>{item.name}</option>)}
      </select></label>

      <label><span>Tournament</span><select name="tournament" defaultValue={tournamentFilter}>
        <option value="">All tournaments</option>
        {tournamentOptions.map((item:any)=><option value={item.id} key={item.id}>{item.name}</option>)}
      </select></label>

      <label><span>Certification</span><select name="status" defaultValue={statusFilter}>
        <option value="">All statuses</option>
        <option value="AWAITING_CERTIFICATION">Awaiting certification</option>
        <option value="OFFICIAL">Official</option>
        <option value="PROVISIONAL">Provisional</option>
      </select></label>

      <label><span>Match type</span><select name="kind" defaultValue={kindFilter}>
        <option value="">All types</option>
        <option value="TOURNAMENT">Tournament</option>
        <option value="QUICK_MATCH">Quick Match</option>
      </select></label>

      <label><span>Classification</span><select name="classification" defaultValue={classificationFilter}>
        <option value="">All classifications</option>
        <option value="RANKING">Ranking Match</option>
        <option value="FRIENDLY">Friendly</option>
        <option value="PRACTICE">Practice</option>
      </select></label>

      <label><span>From</span><input type="date" name="from" defaultValue={fromFilter}/></label>
      <label><span>To</span><input type="date" name="to" defaultValue={toFilter}/></label>

      <div className="history-filter-actions">
        <button>Apply filters</button>
        <Link href="/manage/matches">Reset</Link>
      </div>
    </form>

    <div className="match-history-resultbar">
      <span><strong>{filtered.length}</strong> of {enriched.length} matches</span>
      {(search||cityFilter||tournamentFilter||statusFilter||kindFilter||classificationFilter||fromFilter||toFilter)&&<b>FILTERED VIEW</b>}
    </div>

    <section className="match-archive-grid">
      {filtered.map(row=>{
        const innings=Array.isArray(row.snapshot.innings)?row.snapshot.innings:[];
        const official=row.match_status==='OFFICIAL'||row.match_status==='LOCKED';
        return <article className="match-archive-card" key={row.match_id}>
          <header>
            <div>
              <span>{row.competition_kind==='QUICK_MATCH'?'QUICK MATCH':'TOURNAMENT MATCH'} · {row.classification.replaceAll('_',' ')} · {row.match_code}</span>
              <strong>{row.homeName} <i>vs</i> {row.awayName}</strong>
              <small>{row.tournament?.name??row.archivedMatch.tournament_name??'IPS Match'} · {row.city?.name??'Italy'}</small>
            </div>
            <b className={official?'official':'provisional'}>{official?'OFFICIAL':row.match_status==='AWAITING_CERTIFICATION'?'AWAITING':'PROVISIONAL'}</b>
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

          <div className="archive-card-meta">
            <span><b>Completed</b>{row.completed_at?new Date(row.completed_at).toLocaleString('en-GB',{timeZone:'Europe/Rome'}):'—'}</span>
            <span><b>Format</b>{row.match?.format_overs_per_innings??row.archivedMatch.overs_per_innings??'—'} overs</span>
            <span><b>Ranking</b>{row.rankingEligible?'Eligible':'Excluded'}</span>
          </div>

          <footer>
            <div>
              <span>{official?(row.rankingEligible?'Official stats · counts in rankings':'Official stats · excluded from rankings'):(row.rankingEligible?'Awaiting certification before stats/rankings':'Saved history · ranking excluded')}</span>
            </div>
            <div className="archive-actions">
              <Link className="archive-detail-link" href={'/manage/matches/'+encodeURIComponent(row.match_code)}>Details →</Link>
              <Link href={'/match-centre/'+encodeURIComponent(row.match_code)} target="_blank">Public scorecard ↗</Link>
              {!official?<form action={updateMatchStatus}>
                <input type="hidden" name="match_id" value={row.match_id}/>
                <input type="hidden" name="status" value="OFFICIAL"/>
                <input type="hidden" name="return_to" value={returnTo}/>
                <ConfirmSubmitButton className="archive-certify" message={'Certify '+row.homeName+' vs '+row.awayName+' as an official IPS result? '+(row.rankingEligible?'Its player statistics will become official and update the rankings engine.':'Its player statistics will become official, but this match will remain excluded from rankings.')}>Certify</ConfirmSubmitButton>
              </form>:<form action={revokeMatchCertification} className="archive-revoke-form">
                <input type="hidden" name="match_id" value={row.match_id}/>
                <input type="hidden" name="return_to" value={returnTo}/>
                <input name="reason" minLength={3} required placeholder="Reason for revoking"/>
                <button className="archive-revoke">Revoke</button>
              </form>}
            </div>
          </footer>
        </article>;
      })}

      {!filtered.length&&<div className="sports-empty"><strong>No matches match these filters.</strong><span>Change or reset the archive filters to see more results.</span></div>}
    </section>

    <SiteFooter/>
  </main>;
}
