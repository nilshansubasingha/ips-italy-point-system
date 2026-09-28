import {ReplayProgram} from '@/components/replay-program';
export const dynamic='force-dynamic';export const revalidate=0;
export default async function ReplayProgramPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <ReplayProgram matchId={id}/>;}
