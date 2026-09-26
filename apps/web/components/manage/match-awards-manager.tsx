import {addMatchPlayerAward,removeMatchPlayerAward} from '@/app/manage/tournaments/actions';
import {ConfirmSubmitButton} from './confirm-submit-button';

type MatchRow={
  id:string;
  match_code:string;
  status:string;
  home_team_id:string;
  away_team_id:string;
};

type PlayerRow={
  id:string;
  display_name:string;
  ips_code:string;
};

type PlayingRow={
  match_id:string;
  team_id:string;
  player_id:string;
  lineup_order:number;
};

type AwardRow={
  id:string;
  match_id:string;
  player_id:string;
  award_name:string;
  created_at:string;
};

const eligibleStatuses=new Set(['COMPLETED','AWAITING_CERTIFICATION','OFFICIAL','LOCKED']);

export function MatchAwardsManager({
  matches,
  players,
  playingXI,
  awards,
  canManage,
  returnTo
}:{
  matches:MatchRow[];
  players:PlayerRow[];
  playingXI:PlayingRow[];
  awards:AwardRow[];
  canManage:boolean;
  returnTo:string;
}){
  const playerMap=new Map(players.map(player=>[player.id,player]));
  const eligibleMatches=matches.filter(match=>eligibleStatuses.has(match.status));

  if(!eligibleMatches.length){
    return <div className="sports-empty"><strong>No completed matches yet.</strong><span>Awards can be added after a match is completed.</span></div>;
  }

  return <div className="match-awards-grid">
    {eligibleMatches.map(match=>{
      const matchPlayers=playingXI
        .filter(row=>row.match_id===match.id)
        .sort((a,b)=>a.lineup_order-b.lineup_order)
        .map(row=>playerMap.get(row.player_id))
        .filter(Boolean) as PlayerRow[];
      const matchAwards=awards.filter(award=>award.match_id===match.id);

      return <article className="match-awards-card" key={match.id}>
        <header>
          <div><span>{match.status.replaceAll('_',' ')}</span><strong>{match.match_code}</strong></div>
          <b>{matchAwards.length} award{matchAwards.length===1?'':'s'}</b>
        </header>

        <div className="match-award-list">
          {matchAwards.map(award=>{
            const player=playerMap.get(award.player_id);
            return <div key={award.id}>
              <span><strong>{award.award_name}</strong><small>{player?.display_name??'Player'} · {player?.ips_code??''}</small></span>
              {canManage&&<form action={removeMatchPlayerAward}>
                <input type="hidden" name="award_id" value={award.id}/>
                <input type="hidden" name="return_to" value={returnTo}/>
                <ConfirmSubmitButton className="award-remove" message={'Remove '+award.award_name+' from '+(player?.display_name??'this player')+'?'}>×</ConfirmSubmitButton>
              </form>}
            </div>;
          })}
          {!matchAwards.length&&<p>No awards added yet.</p>}
        </div>

        {canManage&&<form action={addMatchPlayerAward} className="match-award-add">
          <input type="hidden" name="match_id" value={match.id}/>
          <input type="hidden" name="return_to" value={returnTo}/>
          <label>
            <span>Player</span>
            <select name="player_id" required defaultValue="">
              <option value="" disabled>Select player</option>
              {matchPlayers.map(player=><option key={player.id} value={player.id}>{player.display_name} · {player.ips_code}</option>)}
            </select>
          </label>
          <label>
            <span>Award</span>
            <input name="award_name" required maxLength={80} placeholder="Player of the Match"/>
          </label>
          <button disabled={!matchPlayers.length}>Add award</button>
        </form>}
      </article>;
    })}
  </div>;
}
