'use client';

import { useMemo, useState } from 'react';
import {CitySearchSelect,type CitySearchOption} from '@/components/location/city-search-select';

type Season={id:string;name:string};
type Venue={id:string;city_id:string;name:string};
type Ruleset={id:string;name:string;version:number;max_overs:number;balls_per_over:number;playing_xi_size:number;innings_wicket_limit:number|null;max_overs_per_bowler:number|null};

function slugify(value:string){return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').replace(/-+/g,'-');}
function codeFrom(name:string,seasonName:string){
  const words=name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase().match(/[A-Z0-9]+/g)??[];
  let stem='';
  if(words.length>=4)stem=words.map(word=>word[0]).join('').slice(0,12);
  else stem=words.map(word=>word.slice(0,3)).join('-');
  if(stem.length<3&&words[0])stem=words[0].slice(0,6);
  const year=(seasonName.match(/\b(20\d{2})\b/)?.[1]??'').slice(-2);
  return [stem||'TOU',year].filter(Boolean).join('-').slice(0,32);
}

export function TournamentCreatorFields({allowedCities,seasons,rulesets,venues}:{allowedCities?:CitySearchOption[];seasons:Season[];rulesets:Ruleset[];venues:Venue[]}){
  const first=rulesets[0];
  const [name,setName]=useState('');
  const [slug,setSlug]=useState('');
  const [slugTouched,setSlugTouched]=useState(false);
  const [cityId,setCityId]=useState(allowedCities?.[0]?.id??'');
  const [seasonId,setSeasonId]=useState(seasons[0]?.id??'');
  const [rulesetId,setRulesetId]=useState(first?.id??'');
  const [players,setPlayers]=useState(first?.playing_xi_size??6);
  const [overs,setOvers]=useState(first?.max_overs??5);
  const [balls,setBalls]=useState(first?.balls_per_over??6);
  const [wickets,setWickets]=useState(first?.innings_wicket_limit??Math.max((first?.playing_xi_size??6)-1,1));
  const [bowlerMax,setBowlerMax]=useState(first?.max_overs_per_bowler??1);
  const [formatLabel,setFormatLabel]=useState((first?.max_overs??5)===10?'T10':`${first?.max_overs??5} overs`);
  const [squadSize,setSquadSize]=useState(Math.max((first?.playing_xi_size??6)+2,first?.playing_xi_size??6));
  const cityVenues=useMemo(()=>venues.filter(v=>v.city_id===cityId),[venues,cityId]);
  const selectedRuleset=rulesets.find(r=>r.id===rulesetId)??first;
  const selectedSeason=seasons.find(s=>s.id===seasonId)??seasons[0];
  const generatedCode=useMemo(()=>codeFrom(name,selectedSeason?.name??''),[name,selectedSeason]);

  function changeName(value:string){setName(value); if(!slugTouched)setSlug(slugify(value));}
  function changeRuleset(value:string){
    setRulesetId(value); const r=rulesets.find(x=>x.id===value); if(!r)return;
    setPlayers(r.playing_xi_size); setOvers(r.max_overs); setBalls(r.balls_per_over);
    setWickets(r.innings_wicket_limit??Math.max(r.playing_xi_size-1,1)); setBowlerMax(r.max_overs_per_bowler??1);
    setFormatLabel(r.max_overs===10?'T10':`${r.max_overs} overs`); setSquadSize(Math.max(r.playing_xi_size+2,r.playing_xi_size));
  }
  function changePlayers(value:number){setPlayers(value); if(wickets===Math.max(players-1,1))setWickets(Math.max(value-1,1)); if(squadSize<value)setSquadSize(value);}

  return <>
    <section className="creator-section">
      <div className="creator-section-head"><span>01</span><div><strong>Competition identity</strong><small>Name, URL and national catalogue context.</small></div></div>
      <label className="creator-span-2"><span>Name</span><input name="name" required value={name} onChange={e=>changeName(e.target.value)} placeholder="Napoli Summer Cup 2027"/></label>
      <div className="form-split">
        <label><span>Code</span><input value={generatedCode} readOnly aria-readonly="true"/><input type="hidden" name="code" value={generatedCode}/><small className="field-hint">Generated automatically from the tournament name and season.</small></label>
        <label><span>URL slug</span><input name="slug" value={slug} onChange={e=>{setSlugTouched(true);setSlug(slugify(e.target.value))}} placeholder="generated-from-name"/><small className="field-hint">Auto-generated; editable.</small></label>
      </div>
      <div className="form-split"><CitySearchSelect name="city_id" value={cityId} required label="City" allowedCities={allowedCities} onChange={(id)=>setCityId(id)}/><label><span>Season</span><select name="season_id" required value={seasonId} onChange={e=>setSeasonId(e.target.value)}>{seasons.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label></div>
      <label className="creator-span-2"><span>Short description</span><input name="short_description" placeholder="Optional public description"/></label>
    </section>

    <section className="creator-section creator-format-section">
      <div className="creator-section-head"><span>02</span><div><strong>Match format defaults</strong><small>Copied into every fixture. The Controller can make an audited match override if necessary.</small></div></div>
      <label className="creator-span-2"><span>Ruleset template</span><select name="ruleset_id" required value={rulesetId} onChange={e=>changeRuleset(e.target.value)}>{rulesets.map(x=><option key={x.id} value={x.id}>{x.name} · v{x.version}</option>)}</select></label>
      <div className="ruleset-inherit-note creator-span-2"><b>Template loaded</b><span>{selectedRuleset ? `${selectedRuleset.max_overs} overs · ${selectedRuleset.balls_per_over} balls/over · ${selectedRuleset.playing_xi_size} players/side` : 'Choose a ruleset'}</span><small>You may change the tournament defaults below without changing the reusable ruleset.</small></div>
      <div className="form-split"><label><span>Players per side</span><input name="players_per_side" type="number" min="2" max="20" value={players} onChange={e=>changePlayers(Number(e.target.value))}/></label><label><span>Overs per innings</span><input name="overs_per_innings" type="number" min="1" max="100" value={overs} onChange={e=>setOvers(Number(e.target.value))}/></label></div>
      <div className="form-split"><label><span>Balls per over</span><input name="balls_per_over" type="number" min="1" max="12" value={balls} onChange={e=>setBalls(Number(e.target.value))}/></label><label><span>Wicket limit</span><input name="wicket_limit" type="number" min="1" max="19" value={wickets} onChange={e=>setWickets(Number(e.target.value))}/></label></div>
      <div className="form-split"><label><span>Max overs / bowler</span><input name="tournament_max_overs_per_bowler" type="number" min="1" max="100" value={bowlerMax} onChange={e=>setBowlerMax(Number(e.target.value))}/></label><label><span>Format label</span><input name="format_label" value={formatLabel} onChange={e=>setFormatLabel(e.target.value)} placeholder="T5 / T10 / Super Six"/></label></div>
    </section>

    <section className="creator-section">
      <div className="creator-section-head"><span>03</span><div><strong>Registration & squad</strong><small>Control access and the difference between registered squad and playing side.</small></div></div>
      <div className="form-split"><label><span>Registration</span><select name="registration_mode" defaultValue="OPEN"><option value="OPEN">Open registration</option><option value="INVITE_ONLY">Invite only</option></select></label><label><span>Maximum teams</span><input name="max_teams" type="number" min="2" max="100" placeholder="Optional"/></label></div>
      <div className="form-split"><label><span>Tournament squad size</span><input name="squad_size" type="number" min="2" max="50" value={squadSize} onChange={e=>setSquadSize(Number(e.target.value))}/><small className="field-hint">Can be larger than the playing side.</small></label><label><span>Default venue</span><select name="default_venue_id" defaultValue=""><option value="">No default venue</option>{cityVenues.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label></div>
      <div className="form-split"><label><span>Registration deadline</span><input name="registration_deadline" type="datetime-local"/></label><label><span>Squad deadline / automatic lock</span><input name="squad_deadline" type="datetime-local"/></label></div>
    </section>

    <section className="creator-section">
      <div className="creator-section-head"><span>04</span><div><strong>Schedule</strong><small>Italy local time. Fixtures inherit tournament match settings automatically.</small></div></div>
      <div className="form-split"><label><span>Starts · Italy time</span><input name="starts_at" type="datetime-local" required/></label><label><span>Ends · Italy time</span><input name="ends_at" type="datetime-local"/></label></div>
      <div className="creator-summary creator-span-2"><div><span>Playing side</span><b>{players}</b></div><div><span>Match</span><b>{overs} × {balls}</b></div><div><span>Wickets</span><b>{wickets}</b></div><div><span>Bowler max</span><b>{bowlerMax}</b></div></div>
    </section>
  </>;
}
