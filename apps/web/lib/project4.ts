import type { AccountContext, RoleGrant } from '@/lib/auth';

export const ITALY_TZ = 'Europe/Rome';

export function canCreateTournament(account: AccountContext) {
  return account.grants.some(g =>
    (g.role === 'OWNER' && g.scope_type === 'GLOBAL') ||
    (g.role === 'ADMIN' && (g.scope_type === 'GLOBAL' || g.scope_type === 'CITY'))
  );
}

export function canCreateVenue(account: AccountContext) {
  return canCreateTournament(account);
}

export function isTournamentAdminGrant(g: RoleGrant) {
  return g.role === 'OWNER' || (g.role === 'ADMIN' && ['GLOBAL','CITY','TOURNAMENT'].includes(g.scope_type));
}

export function formatItalyDate(value: string | null | undefined) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: ITALY_TZ,
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(new Date(value));
}

export function formatItalyDateTime(value: string | null | undefined) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: ITALY_TZ,
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}

export function toItalyInput(value: string | null | undefined) {
  if (!value) return '';
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: ITALY_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(value));
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export function italyLocalToIso(value: string) {
  if (!value) return null;
  const [datePart,timePart='00:00'] = value.split('T');
  const [y,m,d] = datePart.split('-').map(Number);
  const [hh,mm] = timePart.split(':').map(Number);
  let guess = Date.UTC(y,m-1,d,hh,mm,0);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: ITALY_TZ, year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false,
  });
  for (let i=0;i<2;i++) {
    const parts = formatter.formatToParts(new Date(guess));
    const p = Object.fromEntries(parts.map(x => [x.type,x.value]));
    const localAsUtc = Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute),Number(p.second));
    const desiredAsUtc = Date.UTC(y,m-1,d,hh,mm,0);
    guess -= (localAsUtc - desiredAsUtc);
  }
  return new Date(guess).toISOString();
}

export function queryMessage(searchParams: Record<string,string|string[]|undefined>) {
  const error = typeof searchParams.error === 'string' ? searchParams.error : null;
  const ok = typeof searchParams.ok === 'string' ? searchParams.ok : null;
  return { error, ok };
}
