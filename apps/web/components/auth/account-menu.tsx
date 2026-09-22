'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { RoleGrant } from '@/lib/auth';

export function AccountMenu({ name, email, grants }: { name: string; email?: string; grants: RoleGrant[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const initials = name.split(/\s+/).map(x => x[0]).join('').slice(0,2).toUpperCase();

  async function logout() {
    await createClient().auth.signOut();
    router.push('/'); router.refresh();
  }

  return <div className="account-menu-wrap">
    <button className="account-trigger" onClick={() => setOpen(v => !v)} aria-expanded={open}><span>{initials}</span><strong>{name}</strong><i>⌄</i></button>
    {open && <div className="account-popover">
      <div className="account-popover-head"><b>{name}</b><span>{email}</span></div>
      <div className="account-role-strip">{grants.length ? grants.slice(0,4).map(g => <em key={g.id}>{g.role}</em>) : <em>USER</em>}</div>
      <Link href="/dashboard" onClick={() => setOpen(false)}>Dashboard <span>→</span></Link>
      {grants.some(g => ['OWNER','ADMIN','LEADER','SCORER'].includes(g.role)) && <Link href="/manage" onClick={() => setOpen(false)}>Management <span>→</span></Link>}
      <button className="account-logout" onClick={logout}>Sign out</button>
    </div>}
  </div>;
}
