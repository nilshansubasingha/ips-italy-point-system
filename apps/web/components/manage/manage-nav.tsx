import Link from 'next/link';
import type { AccountContext } from '@/lib/auth';

export function ManagementNav({account, active}:{account:AccountContext;active?:string}) {
  const owner = account.grants.some(g=>g.role==='OWNER'&&g.scope_type==='GLOBAL');
  const items = [
    ['overview','Command Centre','/manage'],
    ['tournaments','Tournaments','/manage/tournaments'],
    ['clubs','Clubs','/manage/clubs'],
    ['teams','Teams','/manage/teams'],
    ['players','Players','/manage/players'],
    ['venues','Venues','/manage/venues'],
  ];
  return <nav className="management-subnav" aria-label="IPS management">
    <div className="management-subnav-scroll">
      {items.map(([key,label,href])=><Link key={key} href={href} className={active===key?'active':''}>{label}</Link>)}
      {owner&&<Link href="/manage/roles" className={active==='roles'?'active':''}>Accounts & Roles</Link>}
    </div>
  </nav>;
}
