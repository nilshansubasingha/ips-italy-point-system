'use client';
import Link from 'next/link';
import { BrandMark } from '@ips/ui';
import { overrideMatchFormat } from '@/app/matches/[id]/actions';

type Player={player_id:string;ips_code:string;name:string;primary_role?:string|null;order?:number};
type Side={team:{id:string;name:string;short_name?:string|null;logo_url?:string|null};squad_locked:boolean;squad:Player[];playing_side:Player[];roles:Record<string,{player_id:string;ips_code:string;name:string}>};
type MatchFormat={players_per_side:number;overs_per_innings:number;balls_per_over:number;wicket_limit:number|null;max_overs_per_bowler:number|null;source:'TOURNAMENT'|'MATCH_OVERRIDE';override_reason?:string|null;overridden_at?:string|null};
type Context={match:any;tournament:any;venue:any;rules:any;match_format:MatchFormat;home:Side;away:Side;officials:any[]};

function sideReady(side:Side,n:number){return !!side.squad_locked&&side.playing_side.length===n&&!!side.roles?.CAPTAIN&&!!side.roles?.WICKETKEEPER}
function SidePanel({side,label,required}:{side:Side;label:string;required:number}){
 const ready=sideReady(side,required);
 return <article className="import-side"><header><div><span>{label}</span><h3>{side.team.name}</h3></div><b className={ready?'ready':'waiting'}>{ready?'READY':'SETUP'}</b></header>
  <div className="import-metrics"><span>Squad <b>{side.squad.length}</b></span><span>Side <b>{side.playing_side.length}/{required}</b></span><span>Captain <b>{side.roles?.CAPTAIN?.name??'—'}</b></span><span>Keeper <b>{side.roles?.WICKETKEEPER?.name??'—'}</b></span></div>
  <div className="xi-list">{side.playing_side.map(p=><div key={p.player_id}><i>{p.order}</i><strong>{p.name}</strong><span>{p.ips_code}</span></div>)}</div>
 </article>
}

export function ControllerMatch({context,webUrl,message,errorMessage}:{context:Context;webUrl:string;message?:string|null;errorMessage?:string|null}){
 const format=context.match_format;
 const required=Number(format.players_per_side||0);
 const homeReady=sideReady(context.home,required),awayReady=sideReady(context.away,required);
 const ready=homeReady&&awayReady;
 const blockers:string[]=[];
 if(!context.home.squad_locked)blockers.push(`${context.home.team.name}: locked squad missing`);
 if(!context.away.squad_locked)blockers.push(`${context.away.team.name}: locked squad missing`);
 if(context.home.playing_side.length!==required)blockers.push(`${context.home.team.name}: playing side ${context.home.playing_side.length}/${required}`);
 if(context.away.playing_side.length!==required)blockers.push(`${context.away.team.name}: playing side ${context.away.playing_side.length}/${required}`);
 if(!context.home.roles?.CAPTAIN||!context.home.roles?.WICKETKEEPER)blockers.push(`${context.home.team.name}: captain / wicketkeeper incomplete`);
 if(!context.away.roles?.CAPTAIN||!context.away.roles?.WICKETKEEPER)blockers.push(`${context.away.team.name}: captain / wicketkeeper incomplete`);
 const live=context.match.status==='LIVE';
 return <main className="controller-shell project5-shell">
  <header className="controller-header"><div className="controller-brand"><BrandMark compact/><div className="match-id"><span>IPS MATCH CONTROLLER</span><b>{context.match.code}</b></div></div><Link className="header-menu back-control" href="/">←</Link></header>
  <section className={`import-status ${ready?'ok':'blocked'}`}><div><span className="status-dot"/><strong>{ready?'OFFICIAL CONTEXT READY':'PRE-MATCH SETUP REQUIRED'}</strong></div><span>PROJECT 5.1 · tournament snapshot → controller</span></section>
  {message&&<div className="controller-flash ok">{message}</div>}{errorMessage&&<div className="controller-flash error">{errorMessage}</div>}
  <section className="controller-scoreboard imported"><div className="scoreboard-topline"><span>{context.tournament.name}</span><b>{context.match.status}</b></div><div className="fixture-versus"><div><small>HOME</small><strong>{context.home.team.short_name||context.home.team.name}</strong></div><i>VS</i><div><small>AWAY</small><strong>{context.away.team.short_name||context.away.team.name}</strong></div></div><div className="scoreboard-chase"><span>FORMAT <b>{context.tournament.format_label}</b></span><span>OVERS <b>{format.overs_per_innings}</b></span><span>VENUE <b>{context.venue?.name??'TBC'}</b></span></div></section>
  {!ready&&<section className="controller-blockers"><div><span>!</span><strong>Scoring remains locked in Project 5.</strong></div><p>The controller imported the fixture, but the official pre-match context is incomplete.</p><ul>{blockers.map(x=><li key={x}>{x}</li>)}</ul><a href={`${webUrl}/manage/tournaments/${context.tournament.id}#lineups`}>Complete match setup on IPS →</a></section>}
  {ready&&<section className="controller-ready-card"><span>✓</span><div><strong>No duplicate entry required.</strong><p>Teams, playing sides, permanent IPS IDs, match format and officials came directly from the central database.</p></div></section>}
  <section className="import-grid"><SidePanel side={context.home} label="HOME TEAM" required={required}/><SidePanel side={context.away} label="AWAY TEAM" required={required}/></section>

  <section className="rules-import match-format-card"><header><div><span className="micro">MATCH FORMAT SNAPSHOT</span><h2>{format.source==='MATCH_OVERRIDE'?'Match-specific override':'Tournament defaults'}</h2></div><b>{format.overs_per_innings} overs</b></header><div><span>Players / side <strong>{format.players_per_side}</strong></span><span>Balls / over <strong>{format.balls_per_over}</strong></span><span>Wickets <strong>{format.wicket_limit??'Derived'}</strong></span><span>Bowler max <strong>{format.max_overs_per_bowler??'—'}</strong></span></div>{format.source==='MATCH_OVERRIDE'&&<p className="override-history">Override: {format.override_reason||'No reason recorded'}{format.overridden_at?` · ${new Date(format.overridden_at).toLocaleString('en-IT',{timeZone:'Europe/Rome'})}`:''}</p>}
    <details className="match-settings-editor"><summary>⚙ Override match settings</summary><form action={overrideMatchFormat}><input type="hidden" name="match_id" value={context.match.id}/><div className="match-settings-grid"><label><span>Players / side</span><input name="players_per_side" type="number" min="2" max="20" defaultValue={format.players_per_side}/></label><label><span>Overs / innings</span><input name="overs_per_innings" type="number" min="1" max="100" defaultValue={format.overs_per_innings}/></label><label><span>Balls / over</span><input name="balls_per_over" type="number" min="1" max="12" defaultValue={format.balls_per_over}/></label><label><span>Wicket limit</span><input name="wicket_limit" type="number" min="1" max="19" defaultValue={format.wicket_limit??''}/></label><label><span>Bowler max</span><input name="max_overs_per_bowler" type="number" min="1" max="100" defaultValue={format.max_overs_per_bowler??''}/></label></div><label className="override-reason"><span>{live?'Reason · required while LIVE':'Reason / note'}</span><input name="reason" required={live} placeholder={live?'Why is this live match format changing?':'Optional pre-match note'}/></label>{live&&<div className="live-format-warning"><b>LIVE MATCH</b><p>Changing balls per over, overs or side size can affect over completion and later scoring calculations. Tournament-admin permission is required.</p></div>}<button>Save audited match override</button></form></details>
  </section>

  <section className="rules-import"><header><div><span className="micro">RULESET TEMPLATE</span><h2>{context.rules.name} · v{context.rules.version}</h2></div><b>law settings</b></header><div><span>Free hit <strong>{context.rules.free_hit_on_no_ball?'Yes':'No'}</strong></span><span>Consecutive bowler <strong>{context.rules.consecutive_overs_by_same_bowler_allowed?'Allowed':'Blocked'}</strong></span><span>Retirement <strong>{context.rules.retirement_mode??'NONE'}</strong></span><span>Rule source <strong>Versioned</strong></span></div></section>
  <section className="official-import"><span className="micro">ASSIGNED OFFICIALS</span>{context.officials.length?context.officials.map((o:any,i:number)=><div key={`${o.user_id}-${i}`}><strong>{o.display_name??'IPS account'}</strong><span>{o.role} · {o.designation}</span></div>):<p>No officials recorded.</p>}</section>
  <section className="controller-action-zone project5-actions"><div className="action-label"><span>SCORING ENGINE</span><small>Project 6 will activate event writes. Project 5.1 freezes the correct match format first.</small></div><div className="run-grid">{['0','1','2','3','4','6'].map(v=><button disabled key={v}><span>{v}</span><small>{v==='0'?'DOT':'RUNS'}</small></button>)}</div><button disabled className="wicket-action"><span>W</span><div><strong>WICKET</strong><small>Activates in Project 6</small></div></button><div className="extras-grid"><button disabled><strong>WD</strong><span>Wide</span></button><button disabled><strong>NB</strong><span>No-ball</span></button><button disabled><strong>B</strong><span>Bye</span></button><button disabled><strong>LB</strong><span>Leg bye</span></button></div></section>
 </main>
}
