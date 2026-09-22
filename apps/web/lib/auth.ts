import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type IpsRole = 'OWNER' | 'ADMIN' | 'LEADER' | 'SCORER' | 'PLAYER';
export type IpsScopeType = 'GLOBAL' | 'CITY' | 'CLUB' | 'TEAM' | 'TOURNAMENT' | 'MATCH' | 'PLAYER';

export type RoleGrant = {
  id: string;
  role: IpsRole;
  scope_type: IpsScopeType;
  city_id: string | null;
  club_id: string | null;
  team_id: string | null;
  tournament_id: string | null;
  match_id: string | null;
  player_id: string | null;
  starts_at: string;
  ends_at: string | null;
  revoked_at: string | null;
  note: string | null;
};

export type AccessDiagnostics = {
  directQueryError: string | null;
  rpcError: string | null;
  directGrantCount: number;
  rpcGrantCount: number;
};

export type AccountContext = {
  user: { id: string; email?: string };
  profile: { id: string; email: string | null; display_name: string | null; avatar_url: string | null; linked_player_id: string | null; status: string } | null;
  grants: RoleGrant[];
  diagnostics: AccessDiagnostics;
};

type AccessRpcPayload = {
  user_id?: string | null;
  is_owner?: boolean;
  grants?: Array<Partial<RoleGrant> & { id: string; role: IpsRole; scope_type: IpsScopeType }>;
};

export function grantScopeId(grant: RoleGrant) {
  if (grant.scope_type === 'GLOBAL') return null;
  const map = {
    CITY: grant.city_id,
    CLUB: grant.club_id,
    TEAM: grant.team_id,
    TOURNAMENT: grant.tournament_id,
    MATCH: grant.match_id,
    PLAYER: grant.player_id,
  } as const;
  return map[grant.scope_type as keyof typeof map] ?? null;
}

function normalizeGrant(raw: Partial<RoleGrant> & { id: string; role: IpsRole; scope_type: IpsScopeType }): RoleGrant {
  return {
    id: raw.id,
    role: raw.role,
    scope_type: raw.scope_type,
    city_id: raw.city_id ?? null,
    club_id: raw.club_id ?? null,
    team_id: raw.team_id ?? null,
    tournament_id: raw.tournament_id ?? null,
    match_id: raw.match_id ?? null,
    player_id: raw.player_id ?? null,
    starts_at: raw.starts_at ?? new Date(0).toISOString(),
    ends_at: raw.ends_at ?? null,
    revoked_at: raw.revoked_at ?? null,
    note: raw.note ?? null,
  };
}

function onlyActive(grants: RoleGrant[]) {
  const now = Date.now();
  return grants.filter((g) => {
    if (g.revoked_at) return false;
    const startsAt = new Date(g.starts_at).getTime();
    if (Number.isFinite(startsAt) && startsAt > now) return false;
    return !g.ends_at || new Date(g.ends_at).getTime() > now;
  });
}

export async function getAccountContext(): Promise<AccountContext | null> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return null;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id,email,display_name,avatar_url,linked_player_id,status')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) console.error('[IPS AUTH] Profile lookup failed:', profileError.message);

  // Project 3.2: direct self-query is the primary source because RLS explicitly permits
  // every signed-in user to read their own role grants. This also makes failures visible.
  const { data: directGrants, error: directError } = await supabase
    .from('role_grants')
    .select('id,role,scope_type,city_id,club_id,team_id,tournament_id,match_id,player_id,starts_at,ends_at,revoked_at,note')
    .eq('user_id', user.id)
    .order('created_at');

  const direct = ((directGrants ?? []) as RoleGrant[]).map(normalizeGrant);

  // RPC remains a second independent path. If either source sees grants, we use them.
  const { data: accessData, error: rpcError } = await supabase.rpc('ips_my_access_context');
  let rpc: RoleGrant[] = [];
  if (!rpcError && accessData && typeof accessData === 'object') {
    const payload = accessData as AccessRpcPayload;
    rpc = (payload.grants ?? []).map(normalizeGrant);
  }

  if (directError) console.error('[IPS AUTH] Direct role query failed:', directError.message);
  if (rpcError) console.error('[IPS AUTH] Access RPC failed:', rpcError.message);

  // Merge by grant ID. Do not silently label an account public if one path can see its grant.
  const merged = new Map<string, RoleGrant>();
  [...direct, ...rpc].forEach((grant) => merged.set(grant.id, grant));
  const activeGrants = onlyActive([...merged.values()]);

  return {
    user: { id: user.id, email: user.email },
    profile: profile ?? null,
    grants: activeGrants,
    diagnostics: {
      directQueryError: directError?.message ?? null,
      rpcError: rpcError?.message ?? null,
      directGrantCount: direct.length,
      rpcGrantCount: rpc.length,
    },
  };
}

export async function requireAccount() {
  const context = await getAccountContext();
  if (!context) redirect('/auth/login?next=/dashboard');
  return context;
}

export function isOwner(context: AccountContext | null) {
  return !!context?.grants.some((g) => g.role === 'OWNER' && g.scope_type === 'GLOBAL');
}

export function hasManagementRole(context: AccountContext | null) {
  return !!context?.grants.some((g) => ['OWNER', 'ADMIN', 'LEADER', 'SCORER'].includes(g.role));
}
