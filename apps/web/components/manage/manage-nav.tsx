import Link from 'next/link';
import {canManageRoles,isOwner,type AccountContext} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';

export async function ManagementNav({account, active}:{account:AccountContext;active?:string}) {
  const canManageAccess=canManageRoles(account);
  const owner=isOwner(account);
  const canManageRankingCatalogue=account.grants.some(g=>(g.role==='OWNER'&&g.scope_type==='GLOBAL')||(g.role==='ADMIN'&&g.scope_type==='GLOBAL'));
  const controllerUrl=process.env.NEXT_PUBLIC_CONTROLLER_URL??'http://localhost:3001';
  const canReviewRegistrations=account.grants.some(g=>['OWNER','ADMIN','LEADER'].includes(g.role));
  let registrationCount=0;
  if(canReviewRegistrations){
    const supabase=await createClient();
    const {data}=await supabase.rpc('ips_registration_queue_counts');
    registrationCount=Number(data?.players??0)+Number(data?.teams??0)+Number(data?.transfers??0);
  }
  const items = [
    ['overview','Command Centre','/manage'],
    ['tournaments','Tournaments','/manage/tournaments'],
    ['matches','Match History','/manage/matches'],
    ['teams','Teams','/manage/teams'],
    ['players','Players','/manage/players'],
    ['venues','Venues','/manage/venues'],
  ];
  return <nav className="management-subnav" aria-label="IPS management">
    <div className="management-subnav-scroll">
      {items.map(([key,label,href])=><Link key={key} href={href} className={active===key?'active':''}>{label}</Link>)}
      {canManageRankingCatalogue&&<Link href="/manage/rankings" className={active==='rankings'?'active':''}>Rankings</Link>}
      {owner&&<Link href="/manage/heroes" className={active==='heroes'?'active':''}>Hero Backgrounds</Link>}
      {canReviewRegistrations&&<Link href="/manage/registrations" className={active==='registrations'?'active':''}>Registration Requests{registrationCount>0&&<b className="nav-count-badge">{registrationCount}</b>}</Link>}
      {canManageAccess&&<Link href="/manage/roles" className={active==='roles'?'active':''}>Accounts & Roles</Link>}
      <a href={controllerUrl} target="_blank" rel="noreferrer">Match Controller ↗</a>
    </div>
  </nav>;
}
