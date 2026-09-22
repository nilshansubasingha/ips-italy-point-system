import type { ScoringIntent } from '@ips/contracts';

export type MatchProjection = Readonly<{
  matchVersion: number;
  inningsNumber: number;
  runs: number;
  wickets: number;
  legalBalls: number;
}>;

export type TournamentRules = Readonly<{
  ballsPerOver: number;
  maxOvers: number;
  playingXiSize: number;
  wicketLimit: number;
  freeHitEnabled: boolean;
}>;

export type EngineResult = Readonly<{
  nextProjection: MatchProjection;
  derivedEffects: readonly string[];
  broadcastCues: readonly string[];
}>;

/**
 * Project 0 freezes the boundary only.
 * Cricket semantics are intentionally implemented in Project 6 after the
 * tournament rule model and event contract have been reviewed and tested.
 */
export function applyScoringIntent(
  _projection: MatchProjection,
  _intent: ScoringIntent,
  _rules: TournamentRules,
): EngineResult {
  throw new Error('IPS scoring engine semantics are not implemented in Project 0.');
}
