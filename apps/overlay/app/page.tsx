import {redirect} from 'next/navigation';

export default async function Overlay({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const sp=await searchParams;
  const match=typeof sp.match==='string'?sp.match:null;
  if(match)redirect('/program/'+encodeURIComponent(match));
  return <main className="program-stage"><div className="program-status"><b>IPS PRISM PROGRAM</b><span>Open a match-specific Program URL from Director or Controller.</span></div></main>;
}
