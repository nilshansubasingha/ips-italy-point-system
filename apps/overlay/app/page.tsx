import {BroadcastOverlay} from '@/components/broadcast-overlay';
export default async function Overlay({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const sp=await searchParams;
  const match=typeof sp.match==='string'?sp.match:undefined;
  return <BroadcastOverlay matchId={match}/>;
}
