'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { italyLocalToIso } from '@/lib/project4';

function s(form: FormData, key: string) { return String(form.get(key) ?? '').trim(); }
function nullable(form: FormData, key: string) { const v=s(form,key); return v || null; }
function num(form: FormData,key:string,fallback:number|null=null){ const raw=s(form,key); if(!raw)return fallback; const n=Number(raw); return Number.isFinite(n)?n:fallback; }
function go(path: string, kind: 'ok'|'error', message: string): never {
  const hashIndex=path.indexOf('#');
  const base=hashIndex>=0?path.slice(0,hashIndex):path;
  const hash=hashIndex>=0?path.slice(hashIndex):'';
  redirect(`${base}${base.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(message)}${hash}`);
}
function returnPath(form: FormData, fallback='/manage/tournaments') { return s(form,'return_to') || fallback; }
function slugify(value:string){ return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').replace(/-+/g,'-'); }
function normalizeCode(value:string){ return value.toUpperCase().replace(/[^A-Z0-9-]+/g,'-').replace(/^-+|-+$/g,'').replace(/-+/g,'-'); }
async function uniqueTournamentCode(supabase:any,name:string,seasonId:string){
  const {data:season,error:seasonError}=await supabase.from('seasons').select('name').eq('id',seasonId).maybeSingle();
  if(seasonError)throw seasonError;

  const words=name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase().match(/[A-Z0-9]+/g)??[];
  let stem='';
  if(words.length>=4)stem=words.map((word:string)=>word[0]).join('').slice(0,12);
  else stem=words.map((word:string)=>word.slice(0,3)).join('-');
  if(stem.length<3&&words[0])stem=words[0].slice(0,6);

  const year=(String(season?.name??'').match(/\b(20\d{2})\b/)?.[1]??'').slice(-2);
  const base=normalizeCode([stem||'TOU',year].filter(Boolean).join('-')).slice(0,28);
  const candidates=[base,...Array.from({length:20},(_,index)=>normalizeCode(base+'-'+(index+2)).slice(0,32))];
  const {data:used,error}=await supabase.from('tournaments').select('code').in('code',candidates);
  if(error)throw error;
  const usedSet=new Set((used??[]).map((row:any)=>row.code));
  const available=candidates.find(code=>!usedSet.has(code));
  if(!available)throw new Error('Could not generate a unique tournament code. Please rename the tournament slightly.');
  return available;
}
function friendlyError(error:any, fallback:string){
  if(String(error?.digest??'').startsWith('NEXT_REDIRECT')||String(error?.message??'')==='NEXT_REDIRECT') throw error;
  const message=String(error?.message??fallback);
  if(message.includes('tournaments_slug_check')) return 'The tournament URL slug is invalid. Use lowercase letters, numbers and single hyphens only.';
  if(message.includes('tournaments_code_check')) return 'The tournament code can only contain capital letters, numbers and hyphens.';
  if(message.includes('duplicate key')&&message.includes('slug')) return 'That tournament URL slug is already in use. Choose a different tournament name or slug.';
  if(message.includes('duplicate key')&&message.includes('code')) return 'That tournament code is already in use.';
  return message;
}

export async function createTournament(form: FormData) {
  const supabase = await createClient(); const back=returnPath(form);
  try {
    const name=s(form,'name');
    const seasonId=s(form,'season_id');
    const slug=slugify(s(form,'slug')||name);
    const starts=italyLocalToIso(s(form,'starts_at'));
    if (!name || !seasonId || !slug || !starts) throw new Error('Name, season and start time are required. The code and slug are generated automatically from the competition details.');
    const code=await uniqueTournamentCode(supabase,name,seasonId);
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('Tournament URL slug is invalid.');

    const playersPerSide=num(form,'players_per_side');
    const overs=num(form,'overs_per_innings');
    const balls=num(form,'balls_per_over');
    const wicketLimit=num(form,'wicket_limit');
    const maxBowlerOvers=num(form,'tournament_max_overs_per_bowler');
    if(!playersPerSide || playersPerSide<2 || playersPerSide>20) throw new Error('Players per side must be between 2 and 20.');
    if(!overs || overs<1 || overs>100) throw new Error('Overs per innings must be between 1 and 100.');
    if(!balls || balls<1 || balls>12) throw new Error('Balls per over must be between 1 and 12.');

    const payload:any={
      season_id:seasonId, city_id:s(form,'city_id'), ruleset_id:s(form,'ruleset_id'),
      code,name,slug,format_label:s(form,'format_label')||`${overs} overs`,status:'DRAFT',
      starts_at:starts, ends_at:italyLocalToIso(s(form,'ends_at')),
      registration_deadline:italyLocalToIso(s(form,'registration_deadline')),
      squad_deadline:italyLocalToIso(s(form,'squad_deadline')),
      squad_size:num(form,'squad_size'), max_teams:num(form,'max_teams'),
      registration_mode:s(form,'registration_mode')||'OPEN', default_venue_id:nullable(form,'default_venue_id'),
      short_description:nullable(form,'short_description'),
      players_per_side:playersPerSide, overs_per_innings:overs, balls_per_over:balls,
      wicket_limit:wicketLimit, tournament_max_overs_per_bowler:maxBowlerOvers,
    };
    const {data,error}=await supabase.from('tournaments').insert(payload).select('id').single(); if(error) throw error;
    revalidatePath('/manage/tournaments'); go(`/manage/tournaments/${data.id}`,'ok','Tournament created with frozen tournament match defaults.');
  } catch(e:any) { go(back,'error',friendlyError(e,'Could not create tournament.')); }
}


export async function createQuickMatch(form: FormData) {
  const supabase=await createClient();
  const back=returnPath(form,'/manage/tournaments/quick');
  try{
    const cityId=s(form,'city_id');
    const homeTeamId=s(form,'home_team_id');
    const awayTeamId=s(form,'away_team_id');
    const seasonId=s(form,'season_id');
    const rulesetId=s(form,'ruleset_id');
    const venueId=nullable(form,'venue_id');
    const playersPerSide=num(form,'players_per_side');
    const overs=num(form,'overs_per_innings');
    const balls=num(form,'balls_per_over',6);
    const maxBowlerOvers=num(form,'max_overs_per_bowler');
    const wicketLimit=num(form,'wicket_limit');
    const freeHitOnNoBall=s(form,'free_hit_on_no_ball')==='yes';

    if(!cityId||!homeTeamId||!awayTeamId||!seasonId||!rulesetId)throw new Error('City, both teams, season and ruleset are required.');
    if(homeTeamId===awayTeamId)throw new Error('Choose two different teams.');
    if(!playersPerSide||playersPerSide<2||playersPerSide>20)throw new Error('Players per side must be between 2 and 20.');
    if(!overs||overs<1||overs>100)throw new Error('Overs must be between 1 and 100.');
    if(!balls||balls<1||balls>12)throw new Error('Balls per over must be between 1 and 12.');

    const [{data:home,error:homeError},{data:away,error:awayError},{data:{user}}]=await Promise.all([
      supabase.from('teams').select('id,name,short_name').eq('id',homeTeamId).maybeSingle(),
      supabase.from('teams').select('id,name,short_name').eq('id',awayTeamId).maybeSingle(),
      supabase.auth.getUser()
    ]);
    if(homeError)throw homeError;if(awayError)throw awayError;if(!home||!away)throw new Error('One of the selected teams no longer exists.');
    if(!user)throw new Error('Not signed in.');

    const [homeMembersRes,awayMembersRes]=await Promise.all([
      supabase.from('team_memberships').select('player_id').eq('team_id',homeTeamId).eq('status','ACTIVE'),
      supabase.from('team_memberships').select('player_id').eq('team_id',awayTeamId).eq('status','ACTIVE')
    ]);
    if(homeMembersRes.error)throw homeMembersRes.error;
    if(awayMembersRes.error)throw awayMembersRes.error;
    const homeMembers=homeMembersRes.data??[];
    const awayMembers=awayMembersRes.data??[];
    if(homeMembers.length<playersPerSide)throw new Error(home.name+' has only '+homeMembers.length+' active players. '+playersPerSide+' are required.');
    if(awayMembers.length<playersPerSide)throw new Error(away.name+' has only '+awayMembers.length+' active players. '+playersPerSide+' are required.');

    const stamp=Date.now();
    const displayName=`Quick Match · ${home.name} vs ${away.name}`;
    const code=await uniqueTournamentCode(supabase,`QM ${home.short_name||home.name} ${away.short_name||away.name} ${stamp}`,seasonId);
    const slug=slugify(`quick-${home.name}-vs-${away.name}-${stamp}`);
    const nowIso=new Date().toISOString();

    const tournamentPayload:any={
      season_id:seasonId,
      city_id:cityId,
      ruleset_id:rulesetId,
      code,
      name:displayName,
      slug,
      format_label:`${overs} overs · Quick Match`,
      status:'READY',
      starts_at:nowIso,
      ends_at:null,
      registration_deadline:null,
      squad_deadline:null,
      squad_size:null,
      max_teams:2,
      registration_mode:'INVITE_ONLY',
      default_venue_id:venueId,
      short_description:'Quick Match created from IPS Match Operations.',
      players_per_side:playersPerSide,
      overs_per_innings:overs,
      balls_per_over:balls,
      wicket_limit:wicketLimit,
      tournament_max_overs_per_bowler:maxBowlerOvers,
      competition_kind:'QUICK_MATCH'
    };

    const {data:tournament,error:tError}=await supabase.from('tournaments').insert(tournamentPayload).select('id').single();
    if(tError)throw tError;
    const tournamentId=tournament.id;

    const {error:teamsError}=await supabase.from('tournament_teams').insert([
      {tournament_id:tournamentId,team_id:homeTeamId,status:'CONFIRMED',accepted_at:nowIso,confirmed_at:nowIso,submitted_by:user.id,decision_by:user.id,application_note:'Quick Match'},
      {tournament_id:tournamentId,team_id:awayTeamId,status:'CONFIRMED',accepted_at:nowIso,confirmed_at:nowIso,submitted_by:user.id,decision_by:user.id,application_note:'Quick Match'}
    ]);
    if(teamsError)throw teamsError;

    const {data:squadRows,error:squadError}=await supabase.from('tournament_squads').insert([
      {tournament_id:tournamentId,team_id:homeTeamId,status:'DRAFT'},
      {tournament_id:tournamentId,team_id:awayTeamId,status:'DRAFT'}
    ]).select('id,team_id');
    if(squadError)throw squadError;

    const homeSquad=squadRows?.find((row:any)=>row.team_id===homeTeamId);
    const awaySquad=squadRows?.find((row:any)=>row.team_id===awayTeamId);
    if(!homeSquad||!awaySquad)throw new Error('Could not prepare Quick Match player pools.');

    const squadPlayers=[
      ...homeMembers.map((row:any)=>({squad_id:homeSquad.id,player_id:row.player_id,added_by:user.id})),
      ...awayMembers.map((row:any)=>({squad_id:awaySquad.id,player_id:row.player_id,added_by:user.id}))
    ];
    const {error:squadPlayersError}=await supabase.from('tournament_squad_players').insert(squadPlayers);
    if(squadPlayersError)throw squadPlayersError;

    const [homeLock,awayLock]=await Promise.all([
      supabase.rpc('ips_lock_squad',{p_squad_id:homeSquad.id}),
      supabase.rpc('ips_lock_squad',{p_squad_id:awaySquad.id})
    ]);
    if(homeLock.error)throw homeLock.error;
    if(awayLock.error)throw awayLock.error;

    const matchCode=normalizeCode(code+'-01').slice(0,40);
    const {data:match,error:matchError}=await supabase.from('matches').insert({
      tournament_id:tournamentId,
      match_code:matchCode,
      match_number:1,
      home_team_id:homeTeamId,
      away_team_id:awayTeamId,
      venue_id:venueId,
      scheduled_at:nowIso,
      scheduled_time_tbc:false,
      stage:'QUICK_MATCH',
      round_label:'Quick Match',
      status:'READY',
      format_free_hit_on_no_ball:freeHitOnNoBall,
      format_source:'MATCH_OVERRIDE',
      format_override_reason:'Quick Match setup'
    }).select('id').single();
    if(matchError)throw matchError;

    revalidatePath('/manage/tournaments');
    revalidatePath('/match-centre');
    go(`/manage/tournaments/${tournamentId}`,'ok','Quick Match created. Choose both playing sides, captain and wicketkeeper, then start scoring.');
  }catch(e:any){
    go(back,'error',friendlyError(e,'Could not create Quick Match.'));
  }
}

export async function updateTournament(form: FormData) {
  const supabase=await createClient(); const id=s(form,'tournament_id'); const back=returnPath(form,`/manage/tournaments/${id}`);
  try {
    const payload:any={
      name:s(form,'name'), format_label:s(form,'format_label'), status:s(form,'status'),
      starts_at:italyLocalToIso(s(form,'starts_at')), ends_at:italyLocalToIso(s(form,'ends_at')),
      registration_deadline:italyLocalToIso(s(form,'registration_deadline')), squad_deadline:italyLocalToIso(s(form,'squad_deadline')),
      squad_size:num(form,'squad_size'), max_teams:num(form,'max_teams'), registration_mode:s(form,'registration_mode')||'OPEN',
      default_venue_id:nullable(form,'default_venue_id'), short_description:nullable(form,'short_description'),
      players_per_side:num(form,'players_per_side'), overs_per_innings:num(form,'overs_per_innings'), balls_per_over:num(form,'balls_per_over'),
      wicket_limit:num(form,'wicket_limit'), tournament_max_overs_per_bowler:num(form,'tournament_max_overs_per_bowler'),
    };
    const {error}=await supabase.from('tournaments').update(payload).eq('id',id); if(error) throw error;
    revalidatePath(back); revalidatePath('/tournaments');
    go(back,'ok','Tournament defaults updated. Unstarted tournament-snapshot fixtures were synchronized automatically; overrides and started matches stayed frozen.');
  } catch(e:any){go(back,'error',friendlyError(e,'Could not update tournament.'));}
}

export async function deleteTournament(form: FormData) {
  const supabase=await createClient();
  const id=s(form,'tournament_id');
  const back=returnPath(form,id?'/manage/tournaments/'+id:'/manage/tournaments');
  try {
    if(!id) throw new Error('Tournament id is required.');
    const {data:t,error:readError}=await supabase.from('tournaments').select('name').eq('id',id).maybeSingle();
    if(readError) throw readError;
    if(!t) throw new Error('Tournament not found.');
    const {error}=await supabase.rpc('ips_delete_tournament',{p_tournament_id:id});
    if(error) throw error;
    revalidatePath('/manage/tournaments'); revalidatePath('/tournaments'); revalidatePath('/manage/teams');
    go('/manage/tournaments','ok',(t as any).name+' permanently deleted.');
  } catch(e:any){go(back,'error',friendlyError(e,'Could not delete tournament.'));}
}

export async function addTournamentTeam(form: FormData) {
  const supabase=await createClient(); const tid=s(form,'tournament_id'); const back=returnPath(form,`/manage/tournaments/${tid}`);
  try { const {error}=await supabase.from('tournament_teams').insert({tournament_id:tid,team_id:s(form,'team_id'),status:'APPLIED',application_note:nullable(form,'application_note')}); if(error) throw error; revalidatePath(back); go(back,'ok','Team application added.'); }
  catch(e:any){go(back,'error',friendlyError(e,'Could not add team.'));}
}

export async function decideTournamentTeam(form: FormData) {
  const supabase=await createClient(); const tid=s(form,'tournament_id'); const back=returnPath(form,`/manage/tournaments/${tid}`);
  try {
    const {data:{user}}=await supabase.auth.getUser(); if(!user) throw new Error('Not signed in.');
    const status=s(form,'status'); const patch:any={status,decision_by:user.id,decision_note:nullable(form,'decision_note')};
    if(status==='ACCEPTED') patch.accepted_at=new Date().toISOString(); if(status==='CONFIRMED') patch.confirmed_at=new Date().toISOString();
    const {error}=await supabase.from('tournament_teams').update(patch).eq('id',s(form,'tournament_team_id')); if(error) throw error;
    revalidatePath(back); go(back,'ok',`Team ${status.toLowerCase()}.`);
  } catch(e:any){go(back,'error',friendlyError(e,'Could not update application.'));}
}

export async function ensureSquad(form: FormData) {
  const supabase=await createClient(); const tid=s(form,'tournament_id'); const back=returnPath(form,`/manage/tournaments/${tid}`);
  try { const {error}=await supabase.from('tournament_squads').upsert({tournament_id:tid,team_id:s(form,'team_id')},{onConflict:'tournament_id,team_id',ignoreDuplicates:true}); if(error) throw error; revalidatePath(back); go(back,'ok','Squad workspace ready.'); }
  catch(e:any){go(back,'error',friendlyError(e,'Could not create squad.'));}
}

export async function addSquadPlayer(form: FormData) {
  const supabase=await createClient(); const back=returnPath(form);
  try { const {data:{user}}=await supabase.auth.getUser(); if(!user) throw new Error('Not signed in.'); const {error}=await supabase.from('tournament_squad_players').insert({squad_id:s(form,'squad_id'),player_id:s(form,'player_id'),added_by:user.id}); if(error) throw error; revalidatePath(back); go(back,'ok','Player added to squad.'); }
  catch(e:any){go(back,'error',friendlyError(e,'Could not add player.'));}
}

export async function removeSquadPlayer(form: FormData) {
  const supabase=await createClient(); const back=returnPath(form);
  try { const {error}=await supabase.from('tournament_squad_players').delete().eq('id',s(form,'squad_player_id')); if(error) throw error; revalidatePath(back); go(back,'ok','Player removed.'); }
  catch(e:any){go(back,'error',friendlyError(e,'Could not remove player.'));}
}

export async function submitSquad(form: FormData) {
  const supabase=await createClient(); const back=returnPath(form);
  try { const {error}=await supabase.rpc('ips_submit_squad',{p_squad_id:s(form,'squad_id')}); if(error) throw error; revalidatePath(back); go(back,'ok','Squad submitted.'); }
  catch(e:any){go(back,'error',friendlyError(e,'Could not submit squad.'));}
}

export async function lockSquad(form: FormData) {
  const supabase=await createClient(); const back=returnPath(form);
  try { const {error}=await supabase.rpc('ips_lock_squad',{p_squad_id:s(form,'squad_id')}); if(error) throw error; revalidatePath(back); go(back,'ok','Squad locked.'); }
  catch(e:any){go(back,'error',friendlyError(e,'Could not lock squad.'));}
}

export async function requestReplacement(form: FormData) {
  const supabase=await createClient(); const back=returnPath(form);
  try { const {data:{user}}=await supabase.auth.getUser(); if(!user) throw new Error('Not signed in.'); const {error}=await supabase.from('squad_change_requests').insert({squad_id:s(form,'squad_id'),outgoing_player_id:s(form,'outgoing_player_id'),incoming_player_id:s(form,'incoming_player_id'),reason:s(form,'reason'),requested_by:user.id}); if(error) throw error; revalidatePath(back); go(back,'ok','Emergency replacement requested.'); }
  catch(e:any){go(back,'error',friendlyError(e,'Could not request replacement.'));}
}

export async function reviewReplacement(form: FormData) {
  const supabase=await createClient(); const back=returnPath(form); const status=s(form,'status');
  try {
    if(status==='APPROVED') { const {error}=await supabase.rpc('ips_approve_emergency_replacement',{p_request_id:s(form,'request_id')}); if(error) throw error; }
    else { const {data:{user}}=await supabase.auth.getUser(); if(!user) throw new Error('Not signed in.'); const {error}=await supabase.from('squad_change_requests').update({status:'REJECTED',reviewed_by:user.id,reviewed_at:new Date().toISOString()}).eq('id',s(form,'request_id')); if(error) throw error; }
    revalidatePath(back); go(back,'ok',status==='APPROVED'?'Replacement approved.':'Replacement rejected.');
  } catch(e:any){go(back,'error',friendlyError(e,'Could not review replacement.'));}
}

export async function createFixture(form: FormData) {
  const supabase=await createClient(); const tid=s(form,'tournament_id'); const back=returnPath(form,`/manage/tournaments/${tid}`);
  try {
    const scheduledDate=s(form,'scheduled_date');
    const scheduledTime=s(form,'scheduled_time');
    if(!scheduledDate) throw new Error('Match date is required.');
    const scheduled=italyLocalToIso(`${scheduledDate}T${scheduledTime||'12:00'}`);
    if(!scheduled) throw new Error('Match date is invalid.');
    const home=s(form,'home_team_id'), away=s(form,'away_team_id'); if(home===away) throw new Error('Home and away teams must be different.');
    const payload:any={tournament_id:tid,match_code:normalizeCode(s(form,'match_code')),match_number:Number(s(form,'match_number')),home_team_id:home,away_team_id:away,venue_id:nullable(form,'venue_id'),scheduled_at:scheduled,scheduled_time_tbc:!scheduledTime,stage:s(form,'stage')||'LEAGUE',round_label:nullable(form,'round_label'),status:'SCHEDULED'};
    const {error}=await supabase.from('matches').insert(payload); if(error) throw error; revalidatePath(back); go(back,'ok','Fixture created. Tournament match settings were snapshotted automatically.');
  } catch(e:any){go(back,'error',friendlyError(e,'Could not create fixture.'));}
}

export async function updateMatchStatus(form: FormData) {
  const supabase=await createClient(); const back=returnPath(form);
  try { const {error}=await supabase.from('matches').update({status:s(form,'status')}).eq('id',s(form,'match_id')); if(error) throw error; revalidatePath(back); go(back,'ok','Match status updated.'); }
  catch(e:any){go(back,'error',friendlyError(e,'Could not update match.'));}
}

export async function assignOfficial(form: FormData) {
  const supabase=await createClient(); const back=returnPath(form);
  try { const {data:{user}}=await supabase.auth.getUser(); if(!user) throw new Error('Not signed in.'); const {error}=await supabase.from('match_official_assignments').insert({match_id:s(form,'match_id'),user_id:s(form,'user_id'),role:s(form,'role'),designation:s(form,'designation')||'STANDARD',assigned_by:user.id,note:nullable(form,'note')}); if(error) throw error; revalidatePath(back); go(back,'ok','Official assigned.'); }
  catch(e:any){go(back,'error',friendlyError(e,'Could not assign official.'));}
}

export async function removeOfficial(form: FormData) {
  const supabase=await createClient(); const back=returnPath(form);
  try { const {error}=await supabase.from('match_official_assignments').delete().eq('id',s(form,'assignment_id')); if(error) throw error; revalidatePath(back); go(back,'ok','Official removed.'); }
  catch(e:any){go(back,'error',friendlyError(e,'Could not remove official.'));}
}

export async function createCatalogCity(form: FormData) {
  const supabase=await createClient(); const back=returnPath(form,'/manage/tournaments');
  try {
    const name=s(form,'city_name'), code=s(form,'city_code').toUpperCase();
    if(!name||!code) throw new Error('City name and code are required.');
    const {error}=await supabase.from('cities').insert({name,code,region:nullable(form,'city_region'),country_code:'IT',status:'ACTIVE'}); if(error) throw error;
    revalidatePath('/manage/tournaments'); go(back,'ok',`${name} added to the city list.`);
  } catch(e:any){go(back,'error',friendlyError(e,'Could not add city.'));}
}

export async function createCatalogSeason(form: FormData) {
  const supabase=await createClient(); const back=returnPath(form,'/manage/tournaments');
  try {
    const name=s(form,'season_name'), code=s(form,'season_code').toUpperCase(), starts=s(form,'season_starts'), ends=s(form,'season_ends');
    if(!name||!code||!starts||!ends) throw new Error('Season name, code, start and end are required.');
    const {error}=await supabase.from('seasons').insert({name,code,starts_on:starts,ends_on:ends}); if(error) throw error;
    revalidatePath('/manage/tournaments'); go(back,'ok',`${name} added to the season list.`);
  } catch(e:any){go(back,'error',friendlyError(e,'Could not add season.'));}
}

export async function createCatalogRuleset(form: FormData) {
  const supabase=await createClient(); const back=returnPath(form,'/manage/tournaments');
  try {
    const name=s(form,'ruleset_name'); if(!name) throw new Error('Ruleset name is required.');
    const mode=s(form,'retirement_mode')||'NONE';
    const payload:any={
      name, version:Number(s(form,'ruleset_version')||1), description:nullable(form,'ruleset_description'),
      balls_per_over:Number(s(form,'balls_per_over')||6), max_overs:Number(s(form,'max_overs')||10),
      playing_xi_size:Number(s(form,'playing_xi_size')||7), innings_wicket_limit:Number(s(form,'innings_wicket_limit')||0)||null,
      free_hit_on_no_ball:s(form,'free_hit_on_no_ball')==='on', consecutive_overs_by_same_bowler_allowed:s(form,'consecutive_overs')==='on',
      max_overs_per_bowler:Number(s(form,'max_overs_per_bowler')||0)||null, retirement_runs:Number(s(form,'retirement_runs')||0)||null,
      retirement_mode:mode, points_win:Number(s(form,'points_win')||2), points_tie:Number(s(form,'points_tie')||1), points_no_result:Number(s(form,'points_no_result')||1), points_loss:Number(s(form,'points_loss')||0),
      extras_rules:{}, additional_rules:{}, is_active:true
    };
    const {error}=await supabase.from('competition_rulesets').insert(payload); if(error) throw error;
    revalidatePath('/manage/tournaments'); go(back,'ok',`${name} ruleset added.`);
  } catch(e:any){go(back,'error',friendlyError(e,'Could not add ruleset.'));}
}

export async function setPlayingXI(form: FormData) {
  const supabase=await createClient(); const back=returnPath(form); const ids=form.getAll('player_ids').map(String);
  try {
    const {error}=await supabase.rpc('ips_set_match_playing_xi',{p_match_id:s(form,'match_id'),p_team_id:s(form,'team_id'),p_player_ids:ids}); if(error) throw error;
    revalidatePath(back); go(back,'ok','Playing side saved from the locked squad.');
  } catch(e:any){go(back,'error',friendlyError(e,'Could not save playing side.'));}
}

export async function setMatchTeamRoles(form: FormData) {
  const supabase=await createClient(); const back=returnPath(form);
  try {
    const {error}=await supabase.rpc('ips_set_match_team_roles',{p_match_id:s(form,'match_id'),p_team_id:s(form,'team_id'),p_captain_id:s(form,'captain_id'),p_wicketkeeper_id:s(form,'wicketkeeper_id')}); if(error) throw error;
    revalidatePath(back); go(back,'ok','Captain and wicketkeeper saved.');
  } catch(e:any){go(back,'error',friendlyError(e,'Could not save team roles.'));}
}


export async function saveQuickMatchSetup(input:{
  tournamentId:string;
  matchId:string;
  homePlayerIds:string[];
  awayPlayerIds:string[];
  homeCaptainId:string;
  homeWicketkeeperId:string;
  awayCaptainId:string;
  awayWicketkeeperId:string;
}){
  const supabase=await createClient();
  try{
    if(!input.tournamentId||!input.matchId)throw new Error('Quick Match context is missing.');
    const {error}=await supabase.rpc('ips_setup_quick_match',{
      p_match_id:input.matchId,
      p_home_player_ids:input.homePlayerIds,
      p_away_player_ids:input.awayPlayerIds,
      p_home_captain_id:input.homeCaptainId,
      p_home_wicketkeeper_id:input.homeWicketkeeperId,
      p_away_captain_id:input.awayCaptainId,
      p_away_wicketkeeper_id:input.awayWicketkeeperId
    });
    if(error)throw error;
    revalidatePath(`/manage/tournaments/${input.tournamentId}`);
    return {ok:true,message:'Quick Match ready for scoring.'};
  }catch(error:any){
    return {ok:false,error:friendlyError(error,'Could not prepare Quick Match.')};
  }
}

export async function saveMatchPlayingSides(input:{
  tournamentId:string;
  matchId:string;
  homePlayerIds:string[]|null;
  awayPlayerIds:string[]|null;
}){
  const supabase=await createClient();
  try{
    const home=Array.isArray(input.homePlayerIds)?input.homePlayerIds.map(String):null;
    const away=Array.isArray(input.awayPlayerIds)?input.awayPlayerIds.map(String):null;
    if(!input.matchId||!input.tournamentId)throw new Error('Match context is missing.');
    if(home===null&&away===null)throw new Error('No editable playing side was supplied.');

    const {error}=await supabase.rpc('ips_set_match_playing_sides',{
      p_match_id:input.matchId,
      p_home_player_ids:home,
      p_away_player_ids:away
    });
    if(error)throw error;

    revalidatePath(`/manage/tournaments/${input.tournamentId}`);
    return {ok:true,message:home!==null&&away!==null?'Both playing sides saved.':'Playing side saved.'};
  }catch(error:any){
    return {ok:false,error:friendlyError(error,'Could not save playing sides.')};
  }
}
