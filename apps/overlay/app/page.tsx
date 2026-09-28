import {BroadcastOverlay} from '@/components/broadcast-overlay';

export const dynamic='force-dynamic';
export const revalidate=0;

export default async function OverlayPage({
  searchParams
}:{
  searchParams:Promise<Record<string,string|string[]|undefined>>
}){
  const sp=await searchParams;
  const matchId=typeof sp.match==='string'?sp.match:'';
  const output=sp.output==='preview'?'PREVIEW':'PROGRAM';
  const debug=sp.debug==='1';
  return <BroadcastOverlay matchId={matchId} output={output} debug={debug}/>;
}
