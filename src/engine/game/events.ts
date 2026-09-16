import type { ScoreBreakdown } from './scoring';

/** Notifications the engine sends the UI (HUD, panels, capture banner). */
export type GameEvent =
  | { type: 'level-started'; levelId: string; number: number }
  | { type: 'prompt-changed' }
  | { type: 'hint-revealed'; levelId: string; index: number; total: number }
  | { type: 'skills-unlocked'; skills: string[] }
  | {
      type: 'flag-captured';
      levelId: string;
      score: ScoreBreakdown;
      newSkills: string[];
      nextLevelId: string | null;
    }
  | { type: 'level-reset'; levelId: string };

export type GameListener = (event: GameEvent) => void;
