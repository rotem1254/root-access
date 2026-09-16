/** What commands may ask of the game. The engine's Game implements it; tests use NULL_GAME. */

export interface ScoreBreakdown {
  base: number;
  hintPenalty: number;
  speedBonus: number;
  total: number;
}

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
};
