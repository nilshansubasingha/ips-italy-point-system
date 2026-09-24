import Link from 'next/link';
import {canManageRoles,type AccountContext} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';

export async function ManagementNav({account, active}:{account:AccountContext;active?:string}) {
  const canManageAccess=canManageRoles(account);
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
    ['teams','Teams','/manage/teams'],
    ['players','Players','/manage/players'],
    ['venues','Venues','/manage/venues'],
  ];
  return <nav className="management-subnav" aria-label="IPS management">
    <div className="management-subnav-scroll">
      {items.map(([key,label,href])=><Link key={key} href={href} className={active===key?'active':''}>{label}</Link>)}
      {canReviewRegistrations&&<Link href="/manage/registrations" className={active==='registrations'?'active':''}>Registration Requests{registrationCount>0&&<b className="nav-count-badge">{registrationCount}</b>}</Link>}
      {canManageAccess&&<Link href="/manage/roles" className={active==='roles'?'active':''}>Accounts & Roles</Link>}
    </div>
  </nav>;
}
