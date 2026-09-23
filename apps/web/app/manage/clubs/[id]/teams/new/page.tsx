import {redirect} from 'next/navigation';
export default async function LegacyClubTeamCreate({params}:{params:Promise<{id:string}>}){const {id}=await params;redirect(`/manage/teams/${id}`);}
