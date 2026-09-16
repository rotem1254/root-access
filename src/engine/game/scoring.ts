/** Scoring rules. All the numbers live here so they are easy to tune. */
export const SCORING = {
  base: 100,
  /** Cost of the 1st, 2nd, 3rd hint; the 4th and beyond each cost the last value. */
  hintCosts: [10, 20, 30] as const,
  maxSpeedBonus: 50,
  /** No speed bonus once you pass this multiple of par time. */
  speedZeroAtParMultiple: 3,
  /** A completed level never scores below this. */
  floor: 25,
} as const;

export interface ScoreBreakdown {
  base: number;
  hintPenalty: number;
  speedBonus: number;
  total: number;
}

export function hintPenalty(hintsUsed: number): number {
  let penalty = 0;
  const last = SCORING.hintCosts[SCORING.hintCosts.length - 1] ?? 0;
  for (let i = 0; i < hintsUsed; i++) penalty += SCORING.hintCosts[i] ?? last;
  return penalty;
}

/** Full speed bonus at or under par, shrinking linearly to zero at the zero point. */
export function speedBonus(activeMs: number, parTimeSec: number): number {
  if (parTimeSec <= 0) return 0;
  const seconds = activeMs / 1000;
  const zeroAt = parTimeSec * SCORING.speedZeroAtParMultiple;
  if (seconds <= parTimeSec) return SCORING.maxSpeedBonus;
  if (seconds >= zeroAt) return 0;
  const fraction = (zeroAt - seconds) / (zeroAt - parTimeSec);
  return Math.round(SCORING.maxSpeedBonus * fraction);
}

export function computeScore(
  hintsUsed: number,
  activeMs: number,
  parTimeSec: number,
): ScoreBreakdown {
  const penalty = hintPenalty(hintsUsed);
  const bonus = speedBonus(activeMs, parTimeSec);
  const total = Math.max(SCORING.floor, SCORING.base - penalty + bonus);
  return { base: SCORING.base, hintPenalty: penalty, speedBonus: bonus, total };
}
