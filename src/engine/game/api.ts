/** What commands may ask of the game. The engine's Game implements it; tests use NULL_GAME. */

import type { ScoreBreakdown } from './scoring';

export type { ScoreBreakdown };

export interface MissionInfo {
  levelId: string;
  number: number;
  chapter: number;
  title: string;
  objective: string;
  briefing: string;
  skills: readonly string[];
  hintsUsed: number;
  hintsTotal: number;
  completed: boolean;
}

export type SubmitResult =
  | { status: 'captured'; levelId: string; score: ScoreBreakdown; nextLevelId: string | null }
  | { status: 'already-captured' }
  | { status: 'invalid-format' }
  | { status: 'incorrect' }
  | { status: 'practice' }
  | { status: 'no-level' };

export type HintResult =
  | { status: 'hint'; index: number; total: number; text: string }
  | { status: 'exhausted'; total: number }
  | { status: 'no-level' };

export interface StatusInfo {
  levelId: string;
  number: number;
  title: string;
  chapter: number;
  hintsUsed: number;
  hintsTotal: number;
  elapsedMs: number;
  wrongSubmissions: number;
  completed: boolean;
  score: ScoreBreakdown | null;
  totalScore: number;
  levelsCompleted: number;
  levelsTotal: number;
}

export type LevelState = 'completed' | 'current' | 'unlocked' | 'locked' | 'coming-soon';

export interface LevelSummary {
  id: string;
  number: number;
  chapter: number;
  title: string;
  state: LevelState;
}

export type StartLevelResult = 'ok' | 'locked' | 'unknown' | 'coming-soon';

/** One row of the end-of-run scoring screen. */
export interface RunRow {
  id: string;
  number: number;
  chapter: number;
  title: string;
  completed: boolean;
  hintsUsed: number;
  elapsedMs: number;
  score: number;
}

/** The whole run, for the scoring screen shown once every level is captured. */
export interface RunSummary {
  rows: readonly RunRow[];
  levelsCompleted: number;
  levelsTotal: number;
  totalScore: number;
  maxScore: number;
  totalHints: number;
  totalMs: number;
  /** True when every playable level has been captured. */
  complete: boolean;
}

export interface GameAPI {
  mission(): MissionInfo | null;
  submitFlag(candidate: string): Promise<SubmitResult>;
  nextHint(): HintResult;
  revealedHints(): readonly string[];
  status(): StatusInfo | null;
  /** Restores the level's filesystem after the current command line finishes. */
  resetLevel(): void;
  levels(): readonly LevelSummary[];
  /** Switches level after the current command line finishes. */
  startLevel(idOrNumber: string): StartLevelResult;
  /** The end-of-run scoring screen data. */
  runSummary(): RunSummary;
}

/** A game with no level loaded. */
export const NULL_GAME: GameAPI = {
  mission: () => null,
  submitFlag: async () => ({ status: 'no-level' }),
  nextHint: () => ({ status: 'no-level' }),
  revealedHints: () => [],
  status: () => null,
  resetLevel: () => undefined,
  levels: () => [],
  startLevel: () => 'unknown',
  runSummary: () => ({
    rows: [],
    levelsCompleted: 0,
    levelsTotal: 0,
    totalScore: 0,
    maxScore: 0,
    totalHints: 0,
    totalMs: 0,
    complete: false,
  }),
};
