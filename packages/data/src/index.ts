import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type DatabaseHealth = {
  configured: boolean;
  connected: boolean;
  message: string;
  counts: Record<string, number>;
  fixture?: FixtureContextRow | null;
};

export type CityRow = {
  id: string;
  code: string;
  name: string;
  alternate_name?: string | null;
  region: string | null;
  region_code?: string | null;
  province_name?: string | null;
  province_code?: string | null;
  province_abbr?: string | null;
  istat_code?: string | null;
  country_code: string;
  status: string;
};

export type ActiveCityRow = CityRow & {
  team_count: number;
  player_count: number;
  tournament_count: number;
  fixture_count: number;
  activity_score: number;
};

export type ClubRow = {
  id: string;
  city_id: string;
  name: string;
  short_name: string | null;
  slug: string;
  logo_url: string | null;
  founded_year: number | null;
  verified: boolean;
  status: string;
  description?: string | null;
  website_url?: string | null;
  logo_path?: string | null;
};

export type TeamRow = {
  id: string;
  club_id: string;
  name: string;
  short_name: string | null;
  slug: string;
  logo_url: string | null;
  status: string;
  side_label: string | null;
  side_order: number | null;
};

export type PlayerRow = {
  id: string;
  ips_code: string;
  display_name: string;
  given_name: string | null;
  family_name: string | null;
  slug: string;
  profile_image_url: string | null;
  primary_role: string | null;
  batting_style: string | null;
  bowling_style: string | null;
  status: string;
};

export type MembershipRow = {
  id: string;
  player_id: string;
  team_id: string;
  start_on: string;
  end_on: string | null;
  is_primary: boolean;
  shirt_number: number | null;
  team_role?: string | null;
  status: string;
};

export type TournamentRow = {
  id: string;
  season_id: string;
  city_id: string;
  ruleset_id: string;
  code: string;
  name: string;
  slug: string;
  format_label: string;
  starts_at: string;
  ends_at: string | null;
  registration_deadline: string | null;
  squad_deadline: string | null;
  squad_size: number | null;
  players_per_side: number;
  overs_per_innings: number;
  balls_per_over: number;
  wicket_limit: number | null;
  tournament_max_overs_per_bowler: number | null;
  registration_mode: string;
  max_teams: number | null;
  default_venue_id: string | null;
  short_description: string | null;
  status: string;
};

export type TournamentTeamRow = {
  id: string;
  tournament_id: string;
  team_id: string;
  status: string;
  seed: number | null;
};

export type RulesetRow = {
  id: string;
  name: string;
  version: number;
  description: string | null;
  balls_per_over: number;
  max_overs: number;
  playing_xi_size: number;
  innings_wicket_limit: number | null;
  free_hit_on_no_ball: boolean;
  max_overs_per_bowler: number | null;
  consecutive_overs_by_same_bowler_allowed: boolean;
  retirement_runs: number | null;
  retirement_mode: string;
  points_win: number;
  points_tie: number;
  points_no_result: number;
  points_loss: number;
};

export type FixtureContextRow = {
  match_id: string;
  match_code: string;
  match_number: number;
  match_status: string;
  scheduled_at: string;
  stage: string;
  round_label: string | null;
  tournament_id: string;
  tournament_code: string;
  tournament_name: string;
  tournament_status: string;
  city_id: string;
  city_name: string;
  venue_id: string | null;
  venue_name: string | null;
  home_team_id: string;
  home_team_name: string;
  away_team_id: string;
  away_team_name: string;
  ruleset_id: string;
  ruleset_name: string;
  ruleset_version: number;
  balls_per_over: number;
  overs_per_innings: number;
  players_per_side: number;
  wicket_limit: number | null;
  free_hit_on_no_ball: boolean;
  max_overs_per_bowler: number | null;
  retirement_runs: number | null;
  retirement_mode: string;
};

export type ClubDirectoryItem = ClubRow & {
  city: CityRow | null;
  teams: TeamRow[];
  activePlayerCount: number;
};

export type TeamIdentityDirectoryItem = ClubDirectoryItem;
export type TeamIdentityDetail = ClubDetail;

export type PlayerDirectoryItem = PlayerRow & {
  currentTeam: TeamRow | null;
  currentClub: ClubRow | null;
  city: CityRow | null;
  shirtNumber: number | null;
};

export type TournamentDirectoryItem = TournamentRow & {
  city: CityRow | null;
  teamCount: number;
  fixtureCount: number;
};

export type ClubDetail = ClubDirectoryItem & {
  players: PlayerDirectoryItem[];
};

export type PlayerMembershipDetail = MembershipRow & {
  team: TeamRow | null;
  club: ClubRow | null;
  city: CityRow | null;
};

export type PlayerDetail = PlayerDirectoryItem & {
  memberships: PlayerMembershipDetail[];
};

export type TournamentDetail = TournamentDirectoryItem & {
  ruleset: RulesetRow | null;
  teams: Array<TeamRow & { club: ClubRow | null }>;
  fixtures: FixtureContextRow[];
};

export type CityDetail = CityRow & {
  clubs: ClubDirectoryItem[];
  players: PlayerDirectoryItem[];
  tournaments: TournamentDirectoryItem[];
  fixtures: FixtureContextRow[];
};

function env(name: string): string | undefined {
  return typeof process !== 'undefined' ? process.env[name] : undefined;
}

export function getPublicSupabaseClient(): SupabaseClient | null {
  const url = env('NEXT_PUBLIC_SUPABASE_URL');
  const key = env('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') ?? env('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function byId<T extends { id: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((row) => [row.id, row]));
}

async function selectAll<T>(client: SupabaseClient, table: string, orderColumn?: string): Promise<T[]> {
  let query = client.from(table).select('*');
  if (orderColumn) query = query.order(orderColumn, { ascending: true });
  const { data, error } = await query;
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data ?? []) as T[];
}

async function selectByIds<T extends { id: string }>(client: SupabaseClient, table: string, ids: string[], orderColumn?: string): Promise<T[]> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return [];
  const result: T[] = [];
  for (let i = 0; i < unique.length; i += 200) {
    let query = client.from(table).select('*').in('id', unique.slice(i, i + 200));
    if (orderColumn) query = query.order(orderColumn, { ascending: true });
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    result.push(...((data ?? []) as T[]));
  }
  return result;
}

const countTables = [
  'cities',
  'clubs',
  'teams',
  'players',
  'team_memberships',
  'seasons',
  'venues',
  'competition_rulesets',
  'tournaments',
  'tournament_teams',
  'matches',
] as const;

export async function getDatabaseHealth(): Promise<DatabaseHealth> {
  const client = getPublicSupabaseClient();
  if (!client) {
    return {
      configured: false,
      connected: false,
      message: 'Supabase environment variables are not configured yet.',
      counts: {},
    };
  }

  try {
    const counts: Record<string, number> = {};

    for (const table of countTables) {
      const { count, error } = await client
        .from(table)
        .select('*', { count: 'exact', head: true });
      if (error) throw new Error(`${table}: ${error.message}`);
      counts[table] = count ?? 0;
    }

    const fixtures = await getFixtureContextsFromBaseTables(client);

    return {
      configured: true,
      connected: true,
      message: 'Connected to the IPS central database.',
      counts,
      fixture: fixtures[0] ?? null,
    };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      message: error instanceof Error ? error.message : 'Unknown database connection error.',
      counts: {},
    };
  }
}

export async function getCities(): Promise<CityRow[]> {
  const client = getPublicSupabaseClient();
  if (!client) return [];
  const { data, error } = await client.from('cities').select('*').eq('status', 'ACTIVE').order('name');
  if (error) throw new Error(`cities: ${error.message}`);
  return (data ?? []) as CityRow[];
}

export async function getActiveCities(limit = 50): Promise<ActiveCityRow[]> {
  const client = getPublicSupabaseClient();
  if (!client) return [];
  const { data, error } = await client.rpc('ips_active_cities', { p_limit: limit });
  if (error) throw new Error(`active cities: ${error.message}`);
  return (data ?? []) as ActiveCityRow[];
}

async function getFixtureContextsFromBaseTables(client: SupabaseClient): Promise<FixtureContextRow[]> {
  const [matches, tournaments, venues, teams, rulesets] = await Promise.all([
    selectAll<any>(client, 'matches', 'scheduled_at'),
    selectAll<TournamentRow>(client, 'tournaments', 'starts_at'),
    selectAll<any>(client, 'venues', 'name'),
    selectAll<TeamRow>(client, 'teams', 'name'),
    selectAll<RulesetRow>(client, 'competition_rulesets', 'name'),
  ]);
  const cities = await selectByIds<CityRow>(client, 'cities', tournaments.map((row) => row.city_id), 'name');

  const tournamentMap = byId(tournaments);
  const cityMap = byId(cities);
  const venueMap = byId(venues);
  const teamMap = byId(teams);
  const rulesetMap = byId(rulesets);

  return matches.map((match) => {
    const tournament = tournamentMap.get(match.tournament_id) ?? null;
    const city = tournament ? cityMap.get(tournament.city_id) ?? null : null;
    const venue = match.venue_id ? venueMap.get(match.venue_id) ?? null : null;
    const homeTeam = teamMap.get(match.home_team_id) ?? null;
    const awayTeam = teamMap.get(match.away_team_id) ?? null;
    const ruleset = tournament ? rulesetMap.get(tournament.ruleset_id) ?? null : null;

    return {
      match_id: match.id,
      match_code: match.match_code,
      match_number: match.match_number,
      match_status: match.status,
      scheduled_at: match.scheduled_at,
      stage: match.stage,
      round_label: match.round_label ?? null,
      tournament_id: tournament?.id ?? match.tournament_id,
      tournament_code: tournament?.code ?? '',
      tournament_name: tournament?.name ?? 'Unknown tournament',
      tournament_status: tournament?.status ?? 'DRAFT',
      city_id: city?.id ?? tournament?.city_id ?? '',
      city_name: city?.name ?? 'Unknown city',
      venue_id: venue?.id ?? match.venue_id ?? null,
      venue_name: venue?.name ?? null,
      home_team_id: homeTeam?.id ?? match.home_team_id,
      home_team_name: homeTeam?.name ?? 'Home team',
      away_team_id: awayTeam?.id ?? match.away_team_id,
      away_team_name: awayTeam?.name ?? 'Away team',
      ruleset_id: ruleset?.id ?? tournament?.ruleset_id ?? '',
      ruleset_name: ruleset?.name ?? 'Ruleset unavailable',
      ruleset_version: ruleset?.version ?? 0,
      balls_per_over: match.format_balls_per_over ?? tournament?.balls_per_over ?? ruleset?.balls_per_over ?? 6,
      overs_per_innings: match.format_overs_per_innings ?? tournament?.overs_per_innings ?? ruleset?.max_overs ?? 0,
      players_per_side: match.format_players_per_side ?? tournament?.players_per_side ?? ruleset?.playing_xi_size ?? 0,
      wicket_limit: match.format_wicket_limit ?? tournament?.wicket_limit ?? ruleset?.innings_wicket_limit ?? null,
      free_hit_on_no_ball: ruleset?.free_hit_on_no_ball ?? false,
      max_overs_per_bowler: match.format_max_overs_per_bowler ?? tournament?.tournament_max_overs_per_bowler ?? ruleset?.max_overs_per_bowler ?? null,
      retirement_runs: ruleset?.retirement_runs ?? null,
      retirement_mode: ruleset?.retirement_mode ?? 'NONE',
    } satisfies FixtureContextRow;
  });
}

export async function getFixtureContexts(): Promise<FixtureContextRow[]> {
  const client = getPublicSupabaseClient();
  if (!client) return [];

  // Prefer the normalized public tables for Project 2. This avoids making the
  // public website dependent on the optional PostgREST view endpoint.
  return getFixtureContextsFromBaseTables(client);
}

export async function getClubDirectory(): Promise<ClubDirectoryItem[]> {
  const client = getPublicSupabaseClient();
  if (!client) return [];

  const [clubs, teams, memberships] = await Promise.all([
    selectAll<ClubRow>(client, 'clubs', 'name'),
    selectAll<TeamRow>(client, 'teams', 'name'),
    selectAll<MembershipRow>(client, 'team_memberships', 'start_on'),
  ]);
  const cities = await selectByIds<CityRow>(client, 'cities', clubs.map((row) => row.city_id), 'name');

  const cityMap = byId(cities);
  const activeMemberships = memberships.filter((row) => row.status === 'ACTIVE' && !row.end_on);

  return clubs
    .filter((club) => club.status === 'ACTIVE')
    .map((club) => {
      const clubTeams = teams.filter((team) => team.club_id === club.id && team.status === 'ACTIVE');
      const teamIds = new Set(clubTeams.map((team) => team.id));
      const activePlayerCount = new Set(activeMemberships.filter((m) => teamIds.has(m.team_id)).map((m) => m.player_id)).size;
      return { ...club, city: cityMap.get(club.city_id) ?? null, teams: clubTeams, activePlayerCount };
    });
}

export async function getClubBySlug(slug: string): Promise<ClubDetail | null> {
  const [clubs, players] = await Promise.all([getClubDirectory(), getPlayerDirectory()]);
  const club = clubs.find((item) => item.slug === slug);
  if (!club) return null;
  return { ...club, players: players.filter((player) => player.currentClub?.id === club.id) };
}

export async function getTeamDirectory(): Promise<TeamIdentityDirectoryItem[]> {
  return getClubDirectory();
}

export async function getTeamBySlug(slug: string): Promise<TeamIdentityDetail | null> {
  return getClubBySlug(slug);
}

export function getTeamIdentityDisplayName(team: TeamIdentityDirectoryItem | TeamIdentityDetail): string {
  const activeSides = team.teams.filter((side) => side.status === 'ACTIVE');
  if (activeSides.length === 1 && (activeSides[0].side_label ?? 'MAIN') === 'MAIN') {
    return activeSides[0].name;
  }
  return team.name.replace(/\s+Cricket Club$/i, '');
}

export async function getPlayerDirectory(): Promise<PlayerDirectoryItem[]> {
  const client = getPublicSupabaseClient();
  if (!client) return [];

  const [players, memberships, teams, clubs] = await Promise.all([
    selectAll<PlayerRow>(client, 'players', 'display_name'),
    selectAll<MembershipRow>(client, 'team_memberships', 'start_on'),
    selectAll<TeamRow>(client, 'teams', 'name'),
    selectAll<ClubRow>(client, 'clubs', 'name'),
  ]);
  const cities = await selectByIds<CityRow>(client, 'cities', clubs.map((row) => row.city_id), 'name');

  const teamMap = byId(teams);
  const clubMap = byId(clubs);
  const cityMap = byId(cities);

  return players
    .filter((player) => player.status === 'ACTIVE')
    .map((player) => {
      const currentMembership = memberships
        .filter((m) => m.player_id === player.id && m.status === 'ACTIVE' && !m.end_on)
        .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))[0] ?? null;
      const currentTeam = currentMembership ? teamMap.get(currentMembership.team_id) ?? null : null;
      const currentClub = currentTeam ? clubMap.get(currentTeam.club_id) ?? null : null;
      const city = currentClub ? cityMap.get(currentClub.city_id) ?? null : null;
      return { ...player, currentTeam, currentClub, city, shirtNumber: currentMembership?.shirt_number ?? null };
    });
}

export async function getPlayerBySlug(slug: string): Promise<PlayerDetail | null> {
  const client = getPublicSupabaseClient();
  if (!client) return null;

  const [directory, memberships, teams, clubs] = await Promise.all([
    getPlayerDirectory(),
    selectAll<MembershipRow>(client, 'team_memberships', 'start_on'),
    selectAll<TeamRow>(client, 'teams', 'name'),
    selectAll<ClubRow>(client, 'clubs', 'name'),
  ]);

  const player = directory.find((item) => item.slug === slug);
  if (!player) return null;
  const cities = await selectByIds<CityRow>(client, 'cities', clubs.map((row) => row.city_id), 'name');
  const teamMap = byId(teams);
  const clubMap = byId(clubs);
  const cityMap = byId(cities);
  const history: PlayerMembershipDetail[] = memberships
    .filter((m) => m.player_id === player.id)
    .sort((a, b) => b.start_on.localeCompare(a.start_on))
    .map((membership) => {
      const team = teamMap.get(membership.team_id) ?? null;
      const club = team ? clubMap.get(team.club_id) ?? null : null;
      const city = club ? cityMap.get(club.city_id) ?? null : null;
      return { ...membership, team, club, city };
    });

  return { ...player, memberships: history };
}

export async function getTournamentDirectory(): Promise<TournamentDirectoryItem[]> {
  const client = getPublicSupabaseClient();
  if (!client) return [];

  const [tournaments, tournamentTeams, fixtures] = await Promise.all([
    selectAll<TournamentRow>(client, 'tournaments', 'starts_at'),
    selectAll<TournamentTeamRow>(client, 'tournament_teams'),
    getFixtureContexts(),
  ]);
  const cities = await selectByIds<CityRow>(client, 'cities', tournaments.map((row) => row.city_id), 'name');
  const cityMap = byId(cities);

  return tournaments.map((tournament) => ({
    ...tournament,
    city: cityMap.get(tournament.city_id) ?? null,
    teamCount: tournamentTeams.filter((row) => row.tournament_id === tournament.id && row.status !== 'WITHDRAWN' && row.status !== 'REJECTED').length,
    fixtureCount: fixtures.filter((row) => row.tournament_id === tournament.id).length,
  }));
}

export async function getTournamentBySlug(slug: string): Promise<TournamentDetail | null> {
  const client = getPublicSupabaseClient();
  if (!client) return null;

  const [directory, rulesets, tournamentTeams, teams, clubs, fixtures] = await Promise.all([
    getTournamentDirectory(),
    selectAll<RulesetRow>(client, 'competition_rulesets', 'name'),
    selectAll<TournamentTeamRow>(client, 'tournament_teams'),
    selectAll<TeamRow>(client, 'teams', 'name'),
    selectAll<ClubRow>(client, 'clubs', 'name'),
    getFixtureContexts(),
  ]);

  const tournament = directory.find((item) => item.slug === slug);
  if (!tournament) return null;
  const teamMap = byId(teams);
  const clubMap = byId(clubs);
  const tournamentTeamRows = tournamentTeams.filter((row) => row.tournament_id === tournament.id && row.status !== 'WITHDRAWN' && row.status !== 'REJECTED');
  const joinedTeams = tournamentTeamRows
    .map((row) => teamMap.get(row.team_id))
    .filter((team): team is TeamRow => Boolean(team))
    .map((team) => ({ ...team, club: clubMap.get(team.club_id) ?? null }));

  return {
    ...tournament,
    ruleset: rulesets.find((row) => row.id === tournament.ruleset_id) ?? null,
    teams: joinedTeams,
    fixtures: fixtures.filter((row) => row.tournament_id === tournament.id),
  };
}

export async function getCityByCode(code: string): Promise<CityDetail | null> {
  const client = getPublicSupabaseClient();
  if (!client) return null;
  const { data: city, error } = await client
    .from('cities')
    .select('*')
    .eq('status', 'ACTIVE')
    .ilike('code', code)
    .maybeSingle();
  if (error) throw new Error(`city: ${error.message}`);
  if (!city) return null;

  const [clubs, players, tournaments, fixtures] = await Promise.all([
    getClubDirectory(),
    getPlayerDirectory(),
    getTournamentDirectory(),
    getFixtureContexts(),
  ]);
  return {
    ...(city as CityRow),
    clubs: clubs.filter((row) => row.city_id === city.id),
    players: players.filter((row) => row.city?.id === city.id),
    tournaments: tournaments.filter((row) => row.city_id === city.id),
    fixtures: fixtures.filter((row) => row.city_id === city.id),
  };
}
