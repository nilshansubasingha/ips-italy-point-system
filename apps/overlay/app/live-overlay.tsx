'use client';

import {useEffect,useMemo,useState} from 'react';

type Ball={id:string;label:string;legal:boolean;is_wicket:boolean};
type Person={id:string|null;name:string|null;runs:number;balls?:number;wickets?:number;legal_balls?:number};
type Team={id:string|null;name:string|null;short_name:string|null};
type OverlayContext={
  match_id:string;
  match_code:string;
  tournament_name:string;
  status:string;
  started:boolean;
  innings_no:number|null;
  batting_team:Team;
  bowling_team:Team;
  runs:number;
  wickets:number;
  legal_balls:number;
  balls_per_over:number;
  overs:string;
  target_runs:number|null;
  runs_required:number|null;
  balls_remaining:number|null;
  free_hit:boolean;
  striker:Person;
  non_striker:Person;
  bowler:Person;
  current_over:Ball[];
  updated_at:string|null;
};

const API_URL=process.env.NEXT_PUBLIC_SUPABASE_URL;
const API_KEY=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

function bowlerOvers(legalBalls:number|undefined,ballsPerOver:number){
  const balls=Math.max(Number(legalBalls||0),0);
  const bpo=Math.max(Number(ballsPerOver||6),1);
  return Math.floor(balls/bpo)+'.'+(balls%bpo);
}

function ballClass(ball:Ball){
  if(ball.is_wicket)return 'wicket';
  if(ball.label.includes('6'))return 'six';
  if(ball.label.includes('4'))return 'four';
  if(/WD|NB|B|LB/.test(ball.label))return 'extra';
  return '';
}

async function readOverlay(matchId:string,signal:AbortSignal){
  if(!API_URL||!API_KEY)throw new Error('Overlay Supabase configuration is missing.');
  const response=await fetch(API_URL+'/rest/v1/rpc/ips_public_overlay_context',{
    method:'POST',
    headers:{
      apikey:API_KEY,
      'Content-Type':'application/json'
    },
    body:JSON.stringify({p_match_id:matchId}),
    cache:'no-store',
    signal
  });
  if(!response.ok){
    const body=await response.text();
    throw new Error('Live score request failed ('+response.status+'): '+body.slice(0,180));
  }
  return await response.json() as OverlayContext|null;
}

export function LiveOverlay({matchId}:{matchId:string|null}){
  const [data,setData]=useState<OverlayContext|null>(null);
  const [error,setError]=useState<string|null>(null);

  useEffect(()=>{
    if(!matchId)return;
    let stopped=false;
    let timer:ReturnType<typeof setTimeout>|null=null;
    let controller:AbortController|null=null;

    const tick=async()=>{
      controller?.abort();
      controller=new AbortController();
      try{
        const next=await readOverlay(matchId,controller.signal);
        if(!stopped){
          setData(next);
          setError(next?null:'No broadcast state is available for this match.');
        }
      }catch(reason:any){
        if(!stopped&&reason?.name!=='AbortError'){
          setError(reason?.message??'Could not load live score.');
        }
      }finally{
        if(!stopped)timer=setTimeout(tick,650);
      }
    };

    void tick();
    return ()=>{
      stopped=true;
      if(timer)clearTimeout(timer);
      controller?.abort();
    };
  },[matchId]);

  const crr=useMemo(()=>{
    if(!data||!data.legal_balls)return '0.00';
    return ((data.runs*Math.max(data.balls_per_over,1))/data.legal_balls).toFixed(2);
  },[data]);

  if(!matchId){
    return <main className="stage live-stage">
      <div className="overlay-status"><b>IPS LIVE OVERLAY</b><span>Add <code>?match=&lt;match-id&gt;</code> to this browser-source URL.</span></div>
    </main>;
  }

  if(!data){
    return <main className="stage live-stage">
      <div className={'overlay-status '+(error?'error':'')}>
        <b>{error?'OVERLAY WAITING':'CONNECTING LIVE SCORE…'}</b>
        <span>{error??'Reading the server-authoritative IPS score.'}</span>
      </div>
    </main>;
  }

  const batting=data.batting_team?.short_name||data.batting_team?.name||'—';
  const currentBalls=data.current_over??[];
  const bowlerLegal=Number(data.bowler?.legal_balls||0);

  return <main className="stage live-stage">
    <section className="broadcast-scorebar live">
      <div className="broadcast-brand"><b>IPS</b><span>{data.match_code}</span><i/></div>
      <div className="broadcast-team"><small>BATTING</small><span>{batting}</span><strong>{data.runs}/{data.wickets}</strong></div>
      <div className="broadcast-over"><strong>{data.overs}</strong><span>OVERS</span></div>
      <div className="broadcast-batters">
        <div><b>{data.striker?.name||'—'} *</b><span>{data.striker?.runs??0} <small>{data.striker?.balls??0}</small></span></div>
        <div><b>{data.non_striker?.name||'—'}</b><span>{data.non_striker?.runs??0} <small>{data.non_striker?.balls??0}</small></span></div>
      </div>
      <div className="broadcast-bowler">
        <small>BOWLER</small>
        <b>{data.bowler?.name||'—'}</b>
        <span>{data.bowler?.wickets??0}/{data.bowler?.runs??0} <i>({bowlerOvers(bowlerLegal,data.balls_per_over)})</i></span>
      </div>
      <div className="broadcast-balls">
        <span>{data.free_hit?'FREE HIT':'THIS OVER'}</span>
        <div>
          {currentBalls.length
            ?currentBalls.map(ball=><i key={ball.id} className={ballClass(ball)}>{ball.label}</i>)
            :<em>—</em>}
        </div>
      </div>
      <div className="broadcast-ticker">
        <span>CRR <b>{crr}</b></span>
        {data.target_runs!=null&&<span>TARGET <b>{data.target_runs}</b></span>}
        {data.runs_required!=null&&data.balls_remaining!=null&&<span>NEED <b>{data.runs_required} FROM {data.balls_remaining}</b></span>}
        <em>{data.tournament_name}</em>
      </div>
    </section>
  </main>;
}
