export type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type CityId = Brand<string, 'CityId'>;
export type ClubId = Brand<string, 'ClubId'>;
export type TeamId = Brand<string, 'TeamId'>;
export type PlayerId = Brand<string, 'PlayerId'>;
export type TeamMembershipId = Brand<string, 'TeamMembershipId'>;
export type SeasonId = Brand<string, 'SeasonId'>;
export type VenueId = Brand<string, 'VenueId'>;
export type RulesetId = Brand<string, 'RulesetId'>;
export type TournamentId = Brand<string, 'TournamentId'>;
export type TournamentTeamId = Brand<string, 'TournamentTeamId'>;
export type MatchId = Brand<string, 'MatchId'>;
export type InningsId = Brand<string, 'InningsId'>;
export type MatchEventId = Brand<string, 'MatchEventId'>;
export type ScoringSessionId = Brand<string, 'ScoringSessionId'>;

export type EntityStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
export type MembershipStatus = 'ACTIVE' | 'FORMER' | 'SUSPENDED';
export type TournamentStatus = 'DRAFT' | 'REGISTRATION_OPEN' | 'READY' | 'LIVE' | 'COMPLETED' | 'LOCKED';
export type TournamentTeamStatus = 'APPLIED' | 'ACCEPTED' | 'CONFIRMED' | 'WITHDRAWN' | 'REJECTED';

export type MatchLifecycle =
  | 'SCHEDULED'
  | 'READY'
  | 'LIVE'
  | 'COMPLETED'
  | 'AWAITING_CERTIFICATION'
  | 'OFFICIAL'
  | 'LOCKED'
  | 'REOPENED_FOR_CORRECTION'
  | 'CANCELLED'
  | 'ABANDONED';

export type RetirementMode = 'NONE' | 'RETIRE_OUT' | 'RETIRE_NOT_OUT' | 'CUSTOM';

export type ScopeType = 'GLOBAL' | 'CITY' | 'CLUB' | 'TEAM' | 'TOURNAMENT' | 'MATCH' | 'PERSONAL';
export type IpsRole = 'OWNER' | 'ADMIN' | 'LEADER' | 'SCORER' | 'PLAYER';

export interface City {
  id: CityId;
  code: string;
  name: string;
  region: string | null;
  countryCode: string;
  status: EntityStatus;
}

export interface Club {
  id: ClubId;
  cityId: CityId;
  name: string;
  shortName: string | null;
  slug: string;
  logoUrl: string | null;
  verified: boolean;
  status: EntityStatus;
}

export interface Team {
  id: TeamId;
  clubId: ClubId;
  name: string;
  shortName: string | null;
  slug: string;
  logoUrl: string | null;
  status: EntityStatus;
}

export interface Player {
  id: PlayerId;
  ipsCode: string;
  slug: string;
  displayName: string;
  profileImageUrl: string | null;
  battingStyle: string | null;
  bowlingStyle: string | null;
  primaryRole: string | null;
  status: EntityStatus;
}

export interface TeamMembership {
  id: TeamMembershipId;
  playerId: PlayerId;
  teamId: TeamId;
  startOn: string;
  endOn: string | null;
  shirtNumber: number | null;
  status: MembershipStatus;
  isPrimary: boolean;
}

export interface Season {
  id: SeasonId;
  code: string;
  name: string;
  startsOn: string;
  endsOn: string;
}

export interface Venue {
  id: VenueId;
  cityId: CityId;
  name: string;
  slug: string;
  addressText: string | null;
  status: EntityStatus;
}

export interface CompetitionRuleset {
  id: RulesetId;
  name: string;
  version: number;
  ballsPerOver: number;
  maxOvers: number;
  playingXiSize: number;
  inningsWicketLimit: number | null;
  freeHitOnNoBall: boolean;
  consecutiveOversBySameBowlerAllowed: boolean;
  maxOversPerBowler: number | null;
  retirementRuns: number | null;
  retirementMode: RetirementMode;
}

export interface Tournament {
  id: TournamentId;
  seasonId: SeasonId;
  cityId: CityId;
  rulesetId: RulesetId;
  code: string;
  name: string;
  slug: string;
  formatLabel: string;
  status: TournamentStatus;
  startsAt: string;
  endsAt: string | null;
}

export interface Match {
  id: MatchId;
  tournamentId: TournamentId;
  matchCode: string;
  matchNumber: number;
  homeTeamId: TeamId;
  awayTeamId: TeamId;
  venueId: VenueId | null;
  scheduledAt: string;
  stage: string;
  roundLabel: string | null;
  status: MatchLifecycle;
}
