export const dynamic='force-dynamic'; export const revalidate=0;

import Link from 'next/link';
import {notFound} from 'next/navigation';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {ConfirmSubmitButton} from '@/components/manage/confirm-submit-button';
import {ManagementNav} from '@/components/manage/manage-nav';
import {requireAccount,hasManagementRole} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {formatItalyDate,formatItalyDateTime,toItalyInput} from '@/lib/project4';
import {MatchPlayingSidesEditor} from '@/components/manage/match-playing-sides-editor';
import {addTournamentTeam,decideTournamentTeam,ensureSquad,addSquadPlayer,removeSquadPlayer,submitSquad,lockSquad,requestReplacement,reviewReplacement,createFixture,updateMatchStatus,assignOfficial,removeOfficial,updateTournament,deleteTournament} from '../actions';

function statusLabel(v:string){return v.replaceAll('_',' ')}

export default async function TournamentOpsDetail({params,searchParams}:{params:Promise<{id:string}>,searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const account=await requireAccount(); if(!hasManagementRole(account)) return null;
  const {id}=await params; const sp=await searchParams; const error=typeof sp.error==='string'?sp.error:null; const ok=typeof sp.ok==='string'?sp.ok:null;
  const supabase=await createClient();
  const {data:t}=await supabase.from('tournaments').select('*').eq('id',id).maybeSingle(); if(!t)notFound();
  const [{data:city},{data:ruleset},{data:teams},{data:tournamentTeams},{data:venues},{data:matches},{data:squads},{data:memberships},{data:players},{data:squadPlayers},{data:requests},{data:assignments},{data:playingXI},{data:teamRoles},{data:accountDirectory},canTournamentRes]=await Promise.all([
    supabase.from('cities').select('id,name,code').eq('id',t.city_id).maybeSingle(),
    supabase.from('competition_rulesets').select('*').eq('id',t.ruleset_id).maybeSingle(),
    supabase.from('teams').select('id,club_id,name,short_name,slug,logo_url').order('name'),
    supabase.from('tournament_teams').select('*').eq('tournament_id',id).order('applied_at'),
    supabase.from('venues').select('*').eq('city_id',t.city_id).order('name'),
    supabase.from('matches').select('*').eq('tournament_id',id).order('scheduled_at'),
    supabase.from('tournament_squads').select('*').eq('tournament_id',id).order('created_at'),
    supabase.from('team_memberships').select('*').eq('status','ACTIVE').is('end_on',null),
    supabase.from('players').select('id,ips_code,display_name,slug,primary_role').eq('status','ACTIVE').order('display_name'),
    supabase.from('tournament_squad_players').select('*'),
    supabase.from('squad_change_requests').select('*').order('requested_at',{ascending:false}),
    supabase.from('match_official_assignments').select('*').order('assigned_at'),
    supabase.from('match_playing_xi').select('*').order('lineup_order'),
    supabase.from('match_team_roles').select('*').order('selected_at'),
    supabase.rpc('ips_management_account_directory'),
    supabase.rpc('ips_can_manage_tournament',{p_tournament_id:id}),
  ]);
  const canTournament=!!canTournamentRes.data;
  const canGlobalDelete=account.grants.some(g=>(g.role==='OWNER'&&g.scope_type==='GLOBAL')||(g.role==='ADMIN'&&g.scope_type==='GLOBAL'));
  const teamMap=new Map((teams??[]).map((x:any)=>[x.id,x])); const playerMap=new Map((players??[]).map((x:any)=>[x.id,x])); const accountMap=new Map(((accountDirectory as any[])??[]).map((x:any)=>[x.id,x]));
  const tt=(tournamentTeams??[]) as any[]; const confirmed=tt.filter(x=>x.status==='CONFIRMED'); const registeredIds=new Set(tt.map(x=>x.team_id)); const availableTeams=(teams??[]).filter((x:any)=>!registeredIds.has(x.id));
  const squadByTeam=new Map((squads??[]).map((x:any)=>[x.team_id,x]));
  const activeSquadById=new Map<string,any[]>(); for(const spx of squadPlayers??[]){if(!spx.removed_at){const a=activeSquadById.get(spx.squad_id)||[];a.push(spx);activeSquadById.set(spx.squad_id,a)}}
  const membersByTeam=new Map<string,any[]>(); for(const m of memberships??[]){const a=membersByTeam.get(m.team_id)||[];a.push(m);membersByTeam.set(m.team_id,a)}
  const canTeam=new Map<string,boolean>(); await Promise.all((teams??[]).map(async (x:any)=>{const r=await supabase.rpc('ips_can_manage_team',{p_team_id:x.id});canTeam.set(x.id,!!r.data)}));
  const applicationTeams=canTournament?availableTeams:availableTeams.filter((x:any)=>canTeam.get(x.id));
  const matchMap=new Map((matches??[]).map((x:any)=>[x.id,x]));
  const xiByMatchTeam=new Map<string,any[]>(); for(const x of playingXI??[]){const k=`${x.match_id}:${x.team_id}`;const a=xiByMatchTeam.get(k)||[];a.push(x);xiByMatchTeam.set(k,a)}
  const rolesByMatchTeam=new Map<string,any[]>(); for(const x of teamRoles??[]){const k=`${x.match_id}:${x.team_id}`;const a=rolesByMatchTeam.get(k)||[];a.push(x);rolesByMatchTeam.set(k,a)}
  const controllerUrl=process.env.NEXT_PUBLIC_CONTROLLER_URL??'https://ips-controller-p6-4-preview-production.up.railway.app/controller';
  const returnTo=`/manage/tournaments/${id}`;

  return <main className="shell sports-shell"><SiteHeader/><ManagementNav account={account} active="tournaments"/>
    <section className="ops-detail-hero"><div><Link className="back-link" href="/manage/tournaments">← Tournament operations</Link><span className="eyebrow">{city?.name??'ITALY'} · {t.code}</span><h1>{t.name}</h1><p>{t.format_label} · {ruleset?.name??'Ruleset'} · starts {formatItalyDateTime(t.starts_at)}</p></div><div className="ops-status-card"><span>TOURNAMENT STATUS</span><strong>{statusLabel(t.status)}</strong><small>{confirmed.length} confirmed teams · {(matches??[]).length} fixtures</small></div></section>
    <div className="tournament-detail-actions">
      {canTournament&&<a href="#overview" className="button-secondary">Edit tournament</a>}
      {canGlobalDelete&&<form action={deleteTournament}>
        <input type="hidden" name="tournament_id" value={id}/>
        <input type="hidden" name="return_to" value={returnTo}/>
        <ConfirmSubmitButton className="registry-delete-button prominent-delete" message={'Delete '+t.name+'? This removes tournament registrations, squads, scheduled/ready fixtures and setup data. Started, completed or official match history is protected.'}>Delete tournament</ConfirmSubmitButton>
      </form>}
    </div>
    {(error||ok)&&<div className={`ops-message ${error?'error':'success'}`}>{error||ok}</div>}

    <nav className="ops-anchor-nav"><a href="#overview">Overview</a><a href="#teams">Teams</a><a href="#squads">Squads</a><a href="#fixtures">Fixtures</a><a href="#lineups">Playing Side</a><a href="#officials">Officials</a><a href="#replacements">Replacements</a></nav>

    <section id="overview" className="sports-section no-top"><div className="sports-section-head"><div><span className="eyebrow">01 · OVERVIEW</span><h2>Competition controls.</h2></div><Link href={`/tournaments/${t.slug}`}>Public tournament →</Link></div>
      <div className="ops-overview-grid"><div className="ops-info-panel"><div><span>Registration deadline</span><strong>{formatItalyDateTime(t.registration_deadline)}</strong></div><div><span>Squad deadline</span><strong>{formatItalyDateTime(t.squad_deadline)}</strong></div><div><span>Squad size</span><strong>{t.squad_size??'Not set'}</strong></div><div><span>Match default</span><strong>{t.players_per_side} players · {t.overs_per_innings} overs · {t.balls_per_over} balls/over</strong></div><div><span>Wickets</span><strong>{t.wicket_limit??'Derived by tournament'}</strong></div><div><span>Bowler max</span><strong>{t.tournament_max_overs_per_bowler??'Ruleset'}</strong></div></div>
      {canTournament?<form action={updateTournament} className="ops-edit-card"><input type="hidden" name="tournament_id" value={id}/><input type="hidden" name="return_to" value={returnTo}/><div className="form-split"><label><span>Name</span><input name="name" defaultValue={t.name}/></label><label><span>Status</span><select name="status" defaultValue={t.status}><option>DRAFT</option><option>REGISTRATION_OPEN</option><option>READY</option><option>LIVE</option><option>COMPLETED</option><option>LOCKED</option></select></label></div><div className="form-split"><label><span>Format label</span><input name="format_label" defaultValue={t.format_label}/></label><label><span>Registration</span><select name="registration_mode" defaultValue={t.registration_mode??'OPEN'}><option value="OPEN">Open registration</option><option value="INVITE_ONLY">Invite only</option></select></label></div><div className="form-split"><label><span>Players per side</span><input name="players_per_side" type="number" min="2" max="20" defaultValue={t.players_per_side}/></label><label><span>Overs per innings</span><input name="overs_per_innings" type="number" min="1" max="100" defaultValue={t.overs_per_innings}/></label></div><div className="form-split"><label><span>Balls per over</span><input name="balls_per_over" type="number" min="1" max="12" defaultValue={t.balls_per_over}/></label><label><span>Wicket limit</span><input name="wicket_limit" type="number" min="1" max="19" defaultValue={t.wicket_limit??''}/></label></div><div className="form-split"><label><span>Max overs / bowler</span><input name="tournament_max_overs_per_bowler" type="number" min="1" defaultValue={t.tournament_max_overs_per_bowler??''}/></label><label><span>Tournament squad size</span><input name="squad_size" type="number" min="2" max="50" defaultValue={t.squad_size??''}/></label></div><div className="form-split"><label><span>Maximum teams</span><input name="max_teams" type="number" min="2" max="100" defaultValue={t.max_teams??''}/></label><label><span>Default venue</span><select name="default_venue_id" defaultValue={t.default_venue_id??''}><option value="">No default venue</option>{(venues??[]).map((v:any)=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label></div><label><span>Short description</span><input name="short_description" defaultValue={t.short_description??''}/></label><div className="form-split"><label><span>Starts</span><input name="starts_at" type="datetime-local" defaultValue={toItalyInput(t.starts_at)}/></label><label><span>Ends</span><input name="ends_at" type="datetime-local" defaultValue={toItalyInput(t.ends_at)}/></label></div><div className="form-split"><label><span>Registration deadline</span><input name="registration_deadline" type="datetime-local" defaultValue={toItalyInput(t.registration_deadline)}/></label><label><span>Squad deadline</span><input name="squad_deadline" type="datetime-local" defaultValue={toItalyInput(t.squad_deadline)}/></label></div><p className="snapshot-note">Unstarted fixtures using tournament defaults update automatically when these values change. Match-specific overrides and started/official match history remain frozen.</p><button className="button-primary">Save tournament defaults</button></form>:<div className="ops-readonly-card"><strong>Read-only tournament context</strong><p>Your role can manage an assigned team, but tournament-wide settings require an Owner/Admin context.</p></div>}</div>
    </section>

    <section id="teams" className="sports-section"><div className="sports-section-head"><div><span className="eyebrow">02 · APPLICATIONS</span><h2>Teams & registration.</h2></div><span className="section-note">Leaders can apply their own team. Tournament admins accept and confirm.</span></div>
      <div className="ops-two-col"><div className="ops-list">{tt.map((x:any)=>{const team=teamMap.get(x.team_id);return <article key={x.id}><div><span>{statusLabel(x.status)}</span><strong>{team?.name??'Team'}</strong><small>{x.application_note||'No application note'} · applied {formatItalyDateTime(x.applied_at)}</small></div>{canTournament?<form action={decideTournamentTeam} className="inline-actions"><input type="hidden" name="tournament_id" value={id}/><input type="hidden" name="tournament_team_id" value={x.id}/><input type="hidden" name="return_to" value={returnTo}/>{x.status==='APPLIED'&&<button name="status" value="ACCEPTED">Accept</button>}{['APPLIED','ACCEPTED'].includes(x.status)&&<button className="positive" name="status" value="CONFIRMED">Confirm</button>}{!['REJECTED','WITHDRAWN'].includes(x.status)&&<button className="danger" name="status" value="REJECTED">Reject</button>}</form>:<b>{statusLabel(x.status)}</b>}</article>})}</div>
        <aside className="ops-mini-form"><span className="eyebrow">ADD APPLICATION</span><form action={addTournamentTeam} className="ops-form"><input type="hidden" name="tournament_id" value={id}/><input type="hidden" name="return_to" value={returnTo}/><label><span>Team</span><select name="team_id" required>{applicationTeams.map((x:any)=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label><span>Application note</span><input name="application_note" placeholder="Optional note"/></label><button disabled={!applicationTeams.length} className="button-secondary">Add as applied</button></form></aside>
      </div>
    </section>

    <section id="squads" className="sports-section"><div className="sports-section-head"><div><span className="eyebrow">03 · SQUADS</span><h2>Deadline-controlled rosters.</h2></div><span className="section-note">After the squad deadline, direct roster edits are blocked automatically.</span></div>
      <div className="squad-grid">{confirmed.map((entry:any)=>{const team=teamMap.get(entry.team_id);const squad=squadByTeam.get(entry.team_id);const canManage=canTournament||!!canTeam.get(entry.team_id);const roster=squad?activeSquadById.get(squad.id)||[]:[];const members=membersByTeam.get(entry.team_id)||[];const rosterIds=new Set(roster.map(r=>r.player_id));const available=members.filter(m=>!rosterIds.has(m.player_id));const deadlinePassed=!!t.squad_deadline&&Date.now()>=new Date(t.squad_deadline).getTime();const locked=!!squad&&(squad.status==='LOCKED'||deadlinePassed);return <article className="squad-card" key={entry.id}><header><div><span>{team?.short_name||team?.name}</span><h3>{team?.name}</h3></div><b className={`ops-status ${(locked?'locked':squad?.status||'draft').toLowerCase()}`}>{locked?'LOCKED':squad?.status||'NOT STARTED'}</b></header>{!squad?<div className="squad-empty"><p>Create the official tournament squad workspace for this team.</p>{canManage&&<form action={ensureSquad}><input type="hidden" name="tournament_id" value={id}/><input type="hidden" name="team_id" value={entry.team_id}/><input type="hidden" name="return_to" value={returnTo}/><button>Create squad</button></form>}</div>:<><div className="squad-roster">{roster.map((r:any)=><div key={r.id}><span>{playerMap.get(r.player_id)?.ips_code}</span><strong>{playerMap.get(r.player_id)?.display_name??'Player'}</strong>{canManage&&!locked&&<form action={removeSquadPlayer}><input type="hidden" name="squad_player_id" value={r.id}/><input type="hidden" name="return_to" value={returnTo}/><button>×</button></form>}</div>)}</div>{canManage&&!locked&&<form action={addSquadPlayer} className="squad-add"><input type="hidden" name="squad_id" value={squad.id}/><input type="hidden" name="return_to" value={returnTo}/><select name="player_id">{available.map((m:any)=><option key={m.player_id} value={m.player_id}>{playerMap.get(m.player_id)?.display_name} · {playerMap.get(m.player_id)?.ips_code}</option>)}</select><button disabled={!available.length}>Add</button></form>}<footer><span>{roster.length}/{t.squad_size??'—'} players</span><div>{canManage&&!locked&&squad.status==='DRAFT'&&<form action={submitSquad}><input type="hidden" name="squad_id" value={squad.id}/><input type="hidden" name="return_to" value={returnTo}/><button>Submit squad</button></form>}{canTournament&&!locked&&<form action={lockSquad}><input type="hidden" name="squad_id" value={squad.id}/><input type="hidden" name="return_to" value={returnTo}/><button className="dark">Lock</button></form>}</div></footer></>}</article>})}</div>
    </section>

    <section id="fixtures" className="sports-section"><div className="sports-section-head"><div><span className="eyebrow">04 · FIXTURES</span><h2>Manual-first match schedule.</h2></div><Link href="/manage/venues">Manage venues →</Link></div>
      <div className="ops-two-col fixture-ops"><div className="ops-fixture-list">{(matches??[]).map((m:any)=><article key={m.id}><div className="fixture-num">#{m.match_number}</div><div><span>{m.match_code} · {statusLabel(m.status)}</span><strong>{teamMap.get(m.home_team_id)?.name} <i>vs</i> {teamMap.get(m.away_team_id)?.name}</strong><small>{m.scheduled_time_tbc?formatItalyDate(m.scheduled_at):formatItalyDateTime(m.scheduled_at)} · {(venues??[]).find((v:any)=>v.id===m.venue_id)?.name??'Venue TBC'} · {m.round_label||m.stage}</small><small className="fixture-format-meta">{m.format_players_per_side} players · {m.format_overs_per_innings} overs · {m.format_balls_per_over} balls/over · {m.format_source==='MATCH_OVERRIDE'?'match override':'tournament snapshot'}</small></div>{canTournament&&<form action={updateMatchStatus}><input type="hidden" name="match_id" value={m.id}/><input type="hidden" name="return_to" value={returnTo}/><select name="status" defaultValue={m.status}><option>SCHEDULED</option><option>READY</option><option>LIVE</option><option>COMPLETED</option><option>AWAITING_CERTIFICATION</option><option>OFFICIAL</option><option>LOCKED</option><option>CANCELLED</option><option>ABANDONED</option></select><button>Save</button></form>}</article>)}</div>
      {canTournament&&<aside className="ops-mini-form"><span className="eyebrow">NEW FIXTURE</span><form action={createFixture} className="ops-form"><input type="hidden" name="tournament_id" value={id}/><input type="hidden" name="return_to" value={returnTo}/><div className="form-split"><label><span>Match #</span><input name="match_number" type="number" min="1" required defaultValue={(matches?.length??0)+1}/></label><label><span>Match code</span><input name="match_code" required defaultValue={`${t.code}-${String((matches?.length??0)+1).padStart(2,'0')}`}/></label></div><div className="form-split"><label><span>Home</span><select name="home_team_id">{confirmed.map((x:any)=><option key={x.team_id} value={x.team_id}>{teamMap.get(x.team_id)?.name}</option>)}</select></label><label><span>Away</span><select name="away_team_id">{confirmed.map((x:any)=><option key={x.team_id} value={x.team_id}>{teamMap.get(x.team_id)?.name}</option>)}</select></label></div><div className="form-split"><label><span>Date · Italy</span><input name="scheduled_date" type="date" required/></label><label><span>Time · optional</span><input name="scheduled_time" type="time"/><small className="field-hint">Leave blank when the start time is not confirmed.</small></label></div><label><span>Venue</span><select name="venue_id" defaultValue={t.default_venue_id??''}><option value="">TBC</option>{(venues??[]).map((v:any)=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label><div className="form-split"><label><span>Stage</span><input name="stage" defaultValue="LEAGUE"/></label><label><span>Round label</span><input name="round_label" placeholder="Round 1"/></label></div><button className="button-primary" disabled={confirmed.length<2}>Create fixture</button></form></aside>}
      </div>
    </section>

    <section id="lineups" className="sports-section"><div className="sports-section-head"><div><span className="eyebrow">05 · CONTROLLER READINESS</span><h2>Playing Side & team roles.</h2></div><span className="section-note">Select both teams before saving. Side size follows the fixture snapshot, and tournament-default fixtures update automatically before the match starts.</span></div>
      <div className="controller-ready-grid">{(matches??[]).map((m:any)=>{
        const required=Number(m.format_players_per_side||t.players_per_side||0);
        const makeSide=(teamId:string)=>{
          const team=teamMap.get(teamId);
          const squad=squadByTeam.get(teamId);
          const rosterRows=squad?activeSquadById.get(squad.id)||[]:[];
          const locked=!!squad&&(squad.status==='LOCKED'||(!!t.squad_deadline&&Date.now()>=new Date(t.squad_deadline).getTime()));
          const xi=xiByMatchTeam.get(`${m.id}:${teamId}`)||[];
          const roles=rolesByMatchTeam.get(`${m.id}:${teamId}`)||[];
          const captain=roles.find((role:any)=>role.role==='CAPTAIN');
          const keeper=roles.find((role:any)=>role.role==='WICKETKEEPER');
          return {
            teamId,
            teamName:team?.name??'Team',
            shortName:team?.short_name||team?.name||'TEAM',
            roster:rosterRows.map((row:any)=>{
              const player=playerMap.get(row.player_id);
              return {id:row.player_id,displayName:player?.display_name??'Player',ipsCode:player?.ips_code??''};
            }),
            selectedIds:xi.map((row:any)=>row.player_id),
            captainId:captain?.player_id??null,
            captainName:captain?playerMap.get(captain.player_id)?.display_name??null:null,
            keeperId:keeper?.player_id??null,
            keeperName:keeper?playerMap.get(keeper.player_id)?.display_name??null:null,
            canManage:canTournament||!!canTeam.get(teamId),
            locked
          };
        };
        return <article className="controller-ready-match" key={m.id}>
          <header><div><span>{m.match_code}</span><strong>{teamMap.get(m.home_team_id)?.name} <i>vs</i> {teamMap.get(m.away_team_id)?.name}</strong></div><a href={`${controllerUrl}/matches/${m.id}`} target="_blank" rel="noreferrer">Open Controller →</a></header>
          <MatchPlayingSidesEditor
            tournamentId={id}
            matchId={m.id}
            required={required}
            returnPath={returnTo}
            home={makeSide(m.home_team_id)}
            away={makeSide(m.away_team_id)}
          />
        </article>;
      })}</div>
    </section>

    <section id="officials" className="sports-section"><div className="sports-section-head"><div><span className="eyebrow">06 · OFFICIALS</span><h2>Scorers & match officials.</h2></div><span className="section-note">Assigned scorers receive match-scoped Controller access automatically.</span></div>
      <div className="official-grid">{(matches??[]).map((m:any)=>{const assigned=(assignments??[]).filter((a:any)=>a.match_id===m.id);return <article className="official-card" key={m.id}><header><span>{m.match_code}</span><strong>{teamMap.get(m.home_team_id)?.short_name||teamMap.get(m.home_team_id)?.name} vs {teamMap.get(m.away_team_id)?.short_name||teamMap.get(m.away_team_id)?.name}</strong></header><div className="official-list">{assigned.map((a:any)=><div key={a.id}><span>{a.role} · {a.designation}</span><strong>{accountMap.get(a.user_id)?.display_name??'IPS account'}</strong>{canTournament&&<form action={removeOfficial}><input type="hidden" name="assignment_id" value={a.id}/><input type="hidden" name="return_to" value={returnTo}/><button>Remove</button></form>}</div>)}</div>{canTournament&&<form action={assignOfficial} className="official-add"><input type="hidden" name="match_id" value={m.id}/><input type="hidden" name="return_to" value={returnTo}/><select name="user_id">{((accountDirectory as any[])??[]).map((u:any)=><option key={u.id} value={u.id}>{u.display_name}</option>)}</select><select name="role"><option>SCORER</option><option>UMPIRE</option><option>MATCH_MANAGER</option></select><select name="designation"><option>STANDARD</option><option>PRIMARY</option><option>BACKUP</option></select><button>Assign</button></form>}</article>})}</div>
    </section>

    <section id="replacements" className="sports-section"><div className="sports-section-head"><div><span className="eyebrow">07 · EMERGENCY CHANGES</span><h2>One approved replacement.</h2></div><span className="section-note">Locked squads stay immutable except through this audited workflow.</span></div>
      <div className="replacement-grid">{confirmed.map((entry:any)=>{const squad=squadByTeam.get(entry.team_id);if(!squad)return null;const team=teamMap.get(entry.team_id);const roster=activeSquadById.get(squad.id)||[];const rosterIds=new Set(roster.map(r=>r.player_id));const candidates=(membersByTeam.get(entry.team_id)||[]).filter(m=>!rosterIds.has(m.player_id));const locked=squad.status==='LOCKED'||(!!t.squad_deadline&&Date.now()>=new Date(t.squad_deadline).getTime());const canManage=canTournament||!!canTeam.get(entry.team_id);const reqs=(requests??[]).filter((r:any)=>r.squad_id===squad.id);return <article className="replacement-card" key={entry.id}><header><span>{team?.name}</span><b>{locked?'LOCKED':'OPEN'}</b></header>{reqs.map((r:any)=><div className="replacement-request" key={r.id}><div><span>{r.status}</span><strong>{playerMap.get(r.outgoing_player_id)?.display_name} → {playerMap.get(r.incoming_player_id)?.display_name}</strong><small>{r.reason}</small></div>{canTournament&&r.status==='REQUESTED'&&<form action={reviewReplacement}><input type="hidden" name="request_id" value={r.id}/><input type="hidden" name="return_to" value={returnTo}/><button className="positive" name="status" value="APPROVED">Approve</button><button className="danger" name="status" value="REJECTED">Reject</button></form>}</div>)}{locked&&canManage&&!reqs.some((r:any)=>r.status==='APPROVED')&&<form action={requestReplacement} className="replacement-form"><input type="hidden" name="squad_id" value={squad.id}/><input type="hidden" name="return_to" value={returnTo}/><label><span>Outgoing</span><select name="outgoing_player_id">{roster.map((r:any)=><option key={r.player_id} value={r.player_id}>{playerMap.get(r.player_id)?.display_name}</option>)}</select></label><label><span>Incoming</span><select name="incoming_player_id">{candidates.map((m:any)=><option key={m.player_id} value={m.player_id}>{playerMap.get(m.player_id)?.display_name}</option>)}</select></label><label><span>Reason</span><input name="reason" required placeholder="Injury / approved exception"/></label><button disabled={!roster.length||!candidates.length}>Request replacement</button></form>}</article>})}</div>
    </section>
    <SiteFooter/></main>
}
