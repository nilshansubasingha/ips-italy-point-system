import {NextRequest,NextResponse} from 'next/server';
import {AccessToken} from 'livekit-server-sdk';
import {createClient} from '@/lib/supabase/server';

export const dynamic='force-dynamic';

function env(){
  const url=process.env.LIVEKIT_URL;
  const apiKey=process.env.LIVEKIT_API_KEY;
  const apiSecret=process.env.LIVEKIT_API_SECRET;
  if(!url||!apiKey||!apiSecret)throw new Error('LiveKit is not configured.');
  return {url,apiKey,apiSecret};
}

function roomName(matchId:string){
  return 'ips-match-'+matchId;
}

export async function POST(req:NextRequest){
  try{
    const body=await req.json().catch(()=>({}));
    const role=String(body?.role||'');
    const supabase=await createClient();
    const {url,apiKey,apiSecret}=env();

    if(role==='publisher'){
      const pin=String(body?.pin||'').replace(/\D/g,'').slice(0,6);
      const channelNo=Number(body?.channelNo);
      const label=String(body?.label||('CAM '+channelNo)).slice(0,64);
      if(pin.length!==6||channelNo<1||channelNo>4){
        return NextResponse.json({error:'Invalid camera PIN or channel.'},{status:400});
      }

      const {data,error}=await supabase.rpc('ips_camera_join',{
        p_pin:pin,
        p_channel_no:channelNo,
        p_label:label
      });
      if(error||!data?.match_id){
        return NextResponse.json({error:error?.message||'Invalid or expired camera PIN.'},{status:403});
      }

      const connectionId=String(data.connection_id);
      const identity='cam-'+channelNo+'-'+connectionId;
      const metadata=JSON.stringify({
        role:'camera',
        matchId:data.match_id,
        channelNo,
        label:data.label||label,
        connectionId
      });

      const token=new AccessToken(apiKey,apiSecret,{
        identity,
        name:data.label||label,
        metadata,
        ttl:'12h'
      });
      token.addGrant({
        roomJoin:true,
        room:roomName(data.match_id),
        canPublish:true,
        canSubscribe:false,
        canPublishData:false
      });

      return NextResponse.json({
        token:await token.toJwt(),
        url,
        room:roomName(data.match_id),
        join:data
      });
    }

    if(role==='viewer'){
      const matchId=String(body?.matchId||'');
      if(!matchId)return NextResponse.json({error:'Missing match.'},{status:400});

      const {data:{user}}=await supabase.auth.getUser();
      if(!user)return NextResponse.json({error:'Authentication required.'},{status:401});

      const {data:session,error}=await supabase.rpc('ips_camera_session_get_or_create',{
        p_match_id:matchId,
        p_rotate:false
      });
      if(error||!session?.id){
        return NextResponse.json({error:error?.message||'Not authorized for this match.'},{status:403});
      }

      const identity='replay-'+user.id+'-'+crypto.randomUUID();
      const token=new AccessToken(apiKey,apiSecret,{
        identity,
        name:'IPS Replay Control',
        metadata:JSON.stringify({role:'replay',matchId}),
        ttl:'12h'
      });
      token.addGrant({
        roomJoin:true,
        room:roomName(matchId),
        canPublish:false,
        canSubscribe:true,
        canPublishData:false
      });

      return NextResponse.json({
        token:await token.toJwt(),
        url,
        room:roomName(matchId),
        session
      });
    }

    return NextResponse.json({error:'Unsupported role.'},{status:400});
  }catch(e:any){
    return NextResponse.json({error:e?.message||'LiveKit token error.'},{status:500});
  }
}
