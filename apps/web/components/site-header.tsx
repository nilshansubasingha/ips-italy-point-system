import Link from 'next/link';
import { BrandMark } from '@ips/ui';
import { getAccountContext } from '@/lib/auth';
import { AccountMenu } from '@/components/auth/account-menu';

export async function SiteHeader() {
  const account = await getAccountContext();
  const name = account?.profile?.display_name ?? account?.user.email ?? 'IPS User';

  return (
    <header className="site-header">
      <Link href="/" className="brand-link" aria-label="IPS home"><BrandMark /></Link>
      <nav className="main-nav" aria-label="Primary navigation">
        <Link href="/match-centre"><span className="live-dot"/>Match Centre</Link>
        <Link href="/tournaments">Tournaments</Link>
        <Link href="/clubs">Clubs</Link>
        <Link href="/players">Players</Link>
        <Link href="/rankings">Rankings</Link>
      </nav>
      <div className="header-actions">
        {account ? <AccountMenu name={name} email={account.user.email} grants={account.grants} /> : <>
          <Link href="/auth/login" className="header-signin">Sign in</Link>
          <Link href="/auth/sign-up" className="header-join">Join IPS</Link>
        </>}
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <BrandMark compact />
      <div>
        <strong>IPS — Italy Point System</strong>
        <span>One connected ecosystem for softball cricket in Italy.</span>
      </div>
      <div className="footer-rule">Score once. Update everywhere.</div>
    </footer>
  );
}
