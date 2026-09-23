import {redirect} from 'next/navigation';
export default async function LegacyClubDetail({params}:{params:Promise<{id:string}>}){const {id}=await params;redirect(`/manage/teams/${id}`);}
