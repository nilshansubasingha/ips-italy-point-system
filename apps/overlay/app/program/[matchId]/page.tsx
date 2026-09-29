import {BroadcastOverlay} from '@/components/broadcast-overlay';

export const dynamic='force-dynamic';
export const revalidate=0;

export default async function ProgramOutput({params}:{params:Promise<{matchId:string}>}){
  const {matchId}=await params;
  return <BroadcastOverlay matchId={matchId}/>;
}
