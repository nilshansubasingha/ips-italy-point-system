import {LiveOverlay} from '../../live-overlay';

export default async function ProgramOutput({
  params,searchParams
}:{
  params:Promise<{matchId:string}>;
  searchParams:Promise<Record<string,string|string[]|undefined>>
}){
  const {matchId}=await params;
  const sp=await searchParams;
  const valid=/^[0-9a-f-]{36}$/i.test(matchId)?matchId:null;
  return <LiveOverlay matchId={valid} debug={sp.debug==='1'}/>;
}
