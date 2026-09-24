import {ProgramRenderer} from './program-renderer';

export default async function Overlay({
  searchParams
}:{
  searchParams:Promise<Record<string,string|string[]|undefined>>
}){
  const sp=await searchParams;
  const raw=typeof sp.match==='string'?sp.match:typeof sp.matchId==='string'?sp.matchId:null;
  const matchId=raw&&/^[0-9a-f-]{36}$/i.test(raw)?raw:null;
  return <ProgramRenderer matchId={matchId}/>;
}
