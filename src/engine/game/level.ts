import type { FSDefinition } from '../fs/definition';
import type { NetworkDefinition, HostNetwork } from '../network/types';
import type { GroupDefinition, HostDefinition, UserDefinition } from '../system/host';
import type { SudoRule } from '../system/sudoers';

/** Player-facing text, ready for a Hebrew translation of the side panel later. */
export type Localized = string | { en: string; he?: string };

export function localize(text: Localized, locale: 'en' | 'he'): string {
  if (typeof text === 'string') return text;
  return (locale === 'he' ? text.he : undefined) ?? text.en;
}

/** A playable level: story, environment, flag and hints. Pure data plus an optional hook. */
export interface Level {
  id: string;
  chapter: number;
  title: Localized;
  briefing: Localized;
  objective: Localized;
  /** Shown after the flag is captured. */
  debrief?: Localized;
  /** Commands or techniques this level teaches, unlocked on completion. */
  skills: readonly string[];
  startUser: string;
  startHost: string;
  startCwd: string;
  users?: readonly UserDefinition[];
  groups?: readonly GroupDefinition[];
  sudoers?: readonly SudoRule[];
  fs: FSDefinition;
  motd?: string;
  homeMode?: string;
  /** Network interfaces and services of the start host (Phase 2+). */
  net?: HostNetwork;
  /** Additional machines on the network (Phase 2+). */
  hosts?: readonly HostDefinition[];
  /** Network-wide configuration: DNS, latency (Phase 2+). */
  network?: NetworkDefinition;
  /** SHA-256 hex digest of the plaintext flag (never the flag itself). Omitted for practice. */
  flagHash?: string;
  /** A free-practice sandbox: always unlocked, no flag, excluded from progression and scoring. */
  practice?: boolean;
  hints: readonly Localized[];
  /** Reference completion time in seconds, for the speed bonus. */
  parTimeSec: number;
  /** Runs after each command line finishes, for story triggers. */
  onCommand?: (event: LevelCommandEvent, api: LevelHookAPI) => void;
}

/** A placeholder for a level that is not built yet. */
export interface LevelStub {
  id: string;
  chapter: number;
  title: Localized;
  briefing: Localized;
  objective: Localized;
  comingSoon: true;
}

export type LevelEntry = Level | LevelStub;

export function isStub(entry: LevelEntry): entry is LevelStub {
  return 'comingSoon' in entry;
}

export interface LevelCommandEvent {
  name: string;
  args: readonly string[];
  exitCode: number;
  user: string;
  cwd: string;
}

/** What an onCommand hook may do (kept deliberately small). */
export interface LevelHookAPI {
  /** Prints a line to the terminal, e.g. a story beat. */
  echo(text: string): void;
  /** Marks a one-shot flag so a trigger fires once; returns true the first time. */
  once(key: string): boolean;
  /** The player's UI language, so a guided tutorial can speak it. */
  locale: 'en' | 'he';
}

/** The ordered catalog the game plays through. */
export type LevelCatalog = readonly LevelEntry[];
