import {ProgramRenderer} from './program-renderer';

export default async function Overlay({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const sp=await searchParams;
  const match=typeof sp.match==='string'?sp.match:null;
  return <ProgramRenderer matchId={match}/>;
}
