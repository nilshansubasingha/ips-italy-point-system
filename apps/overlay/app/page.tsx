import {BroadcastOverlay} from '@/components/broadcast-overlay';

export default async function Overlay({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const sp=await searchParams;
  const match=typeof sp.match==='string'?sp.match:undefined;
  const preview=sp.preview==='1'||!match;
  return <BroadcastOverlay matchId={match} preview={preview}/>;
}
