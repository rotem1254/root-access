import type { SerializedNode } from '../fs/serialize';
import type { ScoreBreakdown } from './scoring';

export const SAVE_SCHEMA_VERSION = 1;

export interface LevelProgress {
  hintsUsed: number;
  /** Active time spent, milliseconds (paused while the tab is hidden). */
  activeMs: number;
  wrongSubmissions: number;
  completedAt?: string;
  score?: ScoreBreakdown;
}

export interface SessionSnapshot {
  levelId: string;
  /** Content hash of the level when saved; if it changed, the FS snapshot is dropped. */
  contentHash: string;
  fs: SerializedNode;
  shells: {
    host: string;
    user: string;
    login: boolean;
    cwd: string;
    lastStatus: number;
    vars: [string, string, boolean][];
  }[];
  history: string[];
  hintsUsed: number;
  activeMs: number;
  wrongSubmissions: number;
}

export interface SaveData {
  schemaVersion: typeof SAVE_SCHEMA_VERSION;
  currentLevelId: string;
  progress: Record<string, LevelProgress>;
  unlockedSkills: string[];
  settings: { bootSeen: boolean; locale: 'en' | 'he' };
  session: SessionSnapshot | null;
}

/** Persistence behind an async interface, so Supabase can replace localStorage later. */
export interface GameStorage {
  load(): Promise<SaveData | null>;
  save(data: SaveData): Promise<void>;
  clear(): Promise<void>;
}

export function emptySave(firstLevelId: string): SaveData {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    currentLevelId: firstLevelId,
    progress: {},
    unlockedSkills: [],
    settings: { bootSeen: false, locale: 'en' },
    session: null,
  };
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** In-memory storage for tests and for a first run before anything is persisted. */
export class MemoryStorage implements GameStorage {
  private data: SaveData | null;

  constructor(initial: SaveData | null = null) {
    this.data = initial ? clone(initial) : null;
  }

  load(): Promise<SaveData | null> {
    return Promise.resolve(this.data ? clone(this.data) : null);
  }

  save(data: SaveData): Promise<void> {
    this.data = clone(data);
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.data = null;
    return Promise.resolve();
  }
}

/** Minimal subset of the DOM Storage interface, so this file needs no DOM types. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Validates loaded data enough to avoid crashing on a corrupt or outdated save. */
function isSaveData(value: unknown): value is SaveData {
  if (typeof value !== 'object' || value === null) return false;
  const data = value as Record<string, unknown>;
  return (
    data.schemaVersion === SAVE_SCHEMA_VERSION &&
    typeof data.currentLevelId === 'string' &&
    typeof data.progress === 'object' &&
    data.progress !== null &&
    Array.isArray(data.unlockedSkills) &&
    typeof data.settings === 'object' &&
    data.settings !== null
  );
}

/** localStorage-backed storage. Every access is wrapped: storage can be unavailable or throw. */
export class KeyValueStorage implements GameStorage {
  private readonly store: KeyValueStore;
  private readonly key: string;

  constructor(store: KeyValueStore, key = 'root-access:save') {
    this.store = store;
    this.key = key;
  }

  load(): Promise<SaveData | null> {
    try {
      const raw = this.store.getItem(this.key);
      if (raw === null) return Promise.resolve(null);
      const parsed: unknown = JSON.parse(raw);
      return Promise.resolve(isSaveData(parsed) ? parsed : null);
    } catch {
      return Promise.resolve(null);
    }
  }

  save(data: SaveData): Promise<void> {
    try {
      this.store.setItem(this.key, JSON.stringify(data));
    } catch {
      // Full or unavailable storage: progress simply is not persisted this time.
    }
    return Promise.resolve();
  }

  clear(): Promise<void> {
    try {
      this.store.removeItem(this.key);
    } catch {
      // ignore
    }
    return Promise.resolve();
  }
}
