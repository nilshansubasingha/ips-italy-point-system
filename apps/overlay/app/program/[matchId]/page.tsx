import {ProgramRenderer} from '../../program-renderer';

export default async function ProgramOutput({params}:{params:Promise<{matchId:string}>}){
  const {matchId}=await params;
  const valid=/^[0-9a-f-]{36}$/i.test(matchId)?matchId:null;
  return <ProgramRenderer matchId={valid}/>;
}
