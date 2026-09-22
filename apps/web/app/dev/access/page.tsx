export const dynamic = 'force-dynamic';
export const revalidate = 0;

import Link from 'next/link';
import { requireAccount } from '@/lib/auth';

export default async function AccessDebugPage() {
  const account = await requireAccount();
  return <main style={{maxWidth:1000,margin:'40px auto',padding:'0 24px',fontFamily:'system-ui'}}>
    <p style={{fontWeight:800,color:'#087f5b'}}>IPS PROJECT 4 · ACCESS DIAGNOSTICS</p>
    <h1>Signed-in access check</h1>
    <p><b>Email:</b> {account.user.email}</p>
    <p><b>User ID:</b> {account.user.id}</p>
    <p><b>Direct grants visible:</b> {account.diagnostics.directGrantCount}</p>
    <p><b>RPC grants visible:</b> {account.diagnostics.rpcGrantCount}</p>
    <p><b>Direct query error:</b> {account.diagnostics.directQueryError ?? 'none'}</p>
    <p><b>RPC error:</b> {account.diagnostics.rpcError ?? 'none'}</p>
    <h2>Active grants</h2>
    <pre style={{whiteSpace:'pre-wrap',background:'#071c2c',color:'#fff',padding:18,borderRadius:14}}>{JSON.stringify(account.grants,null,2)}</pre>
    <p><Link href="/dashboard">← Back to dashboard</Link></p>
  </main>;
}
