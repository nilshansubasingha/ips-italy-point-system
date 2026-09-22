import { z } from 'zod';

export const ids = {
  uuid: z.string().uuid(),
  publicPlayerCode: z.string().regex(/^ITA-\d{7}$/),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
};

export const entityStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']);
export const tournamentStatusSchema = z.enum(['DRAFT', 'REGISTRATION_OPEN', 'READY', 'LIVE', 'COMPLETED', 'LOCKED']);
export const matchLifecycleSchema = z.enum([
  'SCHEDULED', 'READY', 'LIVE', 'COMPLETED', 'AWAITING_CERTIFICATION',
  'OFFICIAL', 'LOCKED', 'REOPENED_FOR_CORRECTION', 'CANCELLED', 'ABANDONED'
]);

export const citySchema = z.object({
  id: ids.uuid,
  code: z.string().regex(/^[A-Z0-9]{2,8}$/),
  name: z.string().min(1),
  region: z.string().nullable(),
  country_code: z.string().length(2),
  status: entityStatusSchema,
});

export const clubSchema = z.object({
  id: ids.uuid,
  city_id: ids.uuid,
  name: z.string().min(1),
  short_name: z.string().nullable(),
  slug: ids.slug,
  logo_url: z.string().nullable(),
  verified: z.boolean(),
  status: entityStatusSchema,
});

export const teamSchema = z.object({
  id: ids.uuid,
  club_id: ids.uuid,
  name: z.string().min(1),
  short_name: z.string().nullable(),
  slug: ids.slug,
  logo_url: z.string().nullable(),
  status: entityStatusSchema,
});

export const playerSchema = z.object({
  id: ids.uuid,
  ips_code: ids.publicPlayerCode,
  slug: ids.slug,
  display_name: z.string().min(1),
  profile_image_url: z.string().nullable(),
  batting_style: z.string().nullable(),
  bowling_style: z.string().nullable(),
  primary_role: z.string().nullable(),
  status: entityStatusSchema,
});

export const rulesetSchema = z.object({
  id: ids.uuid,
  name: z.string().min(1),
  version: z.number().int().positive(),
  balls_per_over: z.number().int().min(1).max(12),
  max_overs: z.number().int().min(1).max(100),
  playing_xi_size: z.number().int().min(2).max(20),
  innings_wicket_limit: z.number().int().positive().nullable(),
  free_hit_on_no_ball: z.boolean(),
  consecutive_overs_by_same_bowler_allowed: z.boolean(),
  max_overs_per_bowler: z.number().int().positive().nullable(),
  retirement_runs: z.number().int().positive().nullable(),
  retirement_mode: z.enum(['NONE', 'RETIRE_OUT', 'RETIRE_NOT_OUT', 'CUSTOM']),
});

export const fixtureContextPreviewSchema = z.object({
  match_id: ids.uuid,
  match_code: z.string().min(1),
  match_number: z.number().int().positive(),
  match_status: matchLifecycleSchema,
  scheduled_at: z.string(),
  stage: z.string(),
  round_label: z.string().nullable(),
  tournament_id: ids.uuid,
  tournament_code: z.string(),
  tournament_name: z.string(),
  tournament_status: tournamentStatusSchema,
  city_id: ids.uuid,
  city_name: z.string(),
  venue_id: ids.uuid.nullable(),
  venue_name: z.string().nullable(),
  home_team_id: ids.uuid,
  home_team_name: z.string(),
  away_team_id: ids.uuid,
  away_team_name: z.string(),
  ruleset_id: ids.uuid,
  ruleset_name: z.string(),
  ruleset_version: z.number().int().positive(),
  balls_per_over: z.number().int().positive(),
  overs_per_innings: z.number().int().positive(),
  players_per_side: z.number().int().positive(),
  wicket_limit: z.number().int().positive().nullable(),
  free_hit_on_no_ball: z.boolean(),
  max_overs_per_bowler: z.number().int().positive().nullable(),
  retirement_runs: z.number().int().positive().nullable(),
  retirement_mode: z.enum(['NONE', 'RETIRE_OUT', 'RETIRE_NOT_OUT', 'CUSTOM']),
});

export type FixtureContextPreview = z.infer<typeof fixtureContextPreviewSchema>;

// Future Project 5 contract. Fields that depend on squads/scorers are deliberately kept as a draft.
export const fixtureLaunchContextSchema = z.object({
  tournamentId: ids.uuid,
  matchId: ids.uuid,
  cityId: ids.uuid,
  venueId: ids.uuid.nullable(),
  rulesetVersion: z.string().min(1),
  ballsPerOver: z.number().int().positive(),
  oversPerInnings: z.number().int().positive(),
  playersPerSide: z.number().int().min(2).max(20),
  homeTeamId: ids.uuid,
  awayTeamId: ids.uuid,
  lockedSquadSnapshotId: ids.uuid,
  scorerAssignmentId: ids.uuid,
});

export type FixtureLaunchContext = z.infer<typeof fixtureLaunchContextSchema>;

export const scoringIntentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('DELIVERY'), clientEventId: z.string().uuid(), expectedMatchVersion: z.number().int().nonnegative(), payload: z.record(z.unknown()) }),
  z.object({ kind: z.literal('CORRECTION'), clientEventId: z.string().uuid(), expectedMatchVersion: z.number().int().nonnegative(), targetEventId: z.string().uuid(), reason: z.string().min(1), replacement: z.record(z.unknown()).optional() }),
  z.object({ kind: z.literal('MATCH_TRANSITION'), clientEventId: z.string().uuid(), expectedMatchVersion: z.number().int().nonnegative(), transition: z.string().min(1) })
]);

export type ScoringIntent = z.infer<typeof scoringIntentSchema>;
