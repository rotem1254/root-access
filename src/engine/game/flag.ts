import { sha256Hex } from '../util/sha256';

const FLAG_PATTERN = /^FLAG\{[A-Za-z0-9_]+\}$/;

export type FlagCheck = 'match' | 'invalid-format' | 'incorrect';

/** Trims surrounding whitespace and a wrapping pair of quotes from a submitted flag. */
export function normalizeFlag(candidate: string): string {
  let text = candidate.trim();
  if (
    text.length >= 2 &&
    ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))
  ) {
    text = text.slice(1, -1).trim();
  }
  return text;
}

export function isFlagFormat(candidate: string): boolean {
  return FLAG_PATTERN.test(candidate);
}

/** Compares a submitted flag against the stored hash (case-sensitive). No hash never matches. */
export function checkFlag(candidate: string, flagHash: string | undefined): FlagCheck {
  const normalized = normalizeFlag(candidate);
  if (!isFlagFormat(normalized)) return 'invalid-format';
  return flagHash !== undefined && sha256Hex(normalized) === flagHash ? 'match' : 'incorrect';
}

export function hashFlag(flag: string): string {
  return sha256Hex(flag);
}
