/**
 * Accessibility display preferences: pure logic with no DOM types, so it can be unit-tested under
 * the Node tsconfig. Browser globals are reached through `globalThis` behind tiny shims and every
 * access is guarded, so this module also runs safely where there is no document or storage.
 */

/** Accessibility display preferences, persisted per viewer. */
export interface A11yPrefs {
  /** Font scale relative to the 14px default. */
  fontScale: number;
  contrast: 'normal' | 'high';
}

export interface FontSizeOption {
  id: 'sm' | 'md' | 'lg' | 'xl';
  scale: number;
}

export const FONT_SIZES: readonly FontSizeOption[] = [
  { id: 'sm', scale: 0.9 },
  { id: 'md', scale: 1 },
  { id: 'lg', scale: 1.2 },
  { id: 'xl', scale: 1.45 },
];

export const DEFAULT_PREFS: A11yPrefs = { fontScale: 1, contrast: 'normal' };

const KEY = 'root-access:a11y';

/** What the settings dialog needs from the terminal, kept minimal for testability. */
export interface SettingsTarget {
  setFontScale(scale: number): void;
  setHighContrast(on: boolean): void;
  refit(): void;
}

/** Clamps a stored value into a known font scale (defends against corrupt storage). */
export function normalizePrefs(raw: unknown): A11yPrefs {
  const value = (raw ?? {}) as Partial<A11yPrefs>;
  const match = FONT_SIZES.find((f) => f.scale === value.fontScale);
  const scale = match ? match.scale : DEFAULT_PREFS.fontScale;
  const contrast = value.contrast === 'high' ? 'high' : 'normal';
  return { fontScale: scale, contrast };
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface DocumentLike {
  documentElement: {
    style: { setProperty(property: string, value: string): void };
    setAttribute(name: string, value: string): void;
  };
}

function getStorage(): StorageLike | null {
  return (globalThis as { localStorage?: StorageLike }).localStorage ?? null;
}

function getDocument(): DocumentLike | null {
  return (globalThis as { document?: DocumentLike }).document ?? null;
}

export function loadPrefs(): A11yPrefs {
  try {
    const raw = getStorage()?.getItem(KEY) ?? null;
    return normalizePrefs(raw ? (JSON.parse(raw) as unknown) : null);
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs: A11yPrefs): void {
  try {
    getStorage()?.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

/** Applies preferences to the document and the terminal. Safe to call repeatedly. */
export function applyPrefs(prefs: A11yPrefs, target: SettingsTarget): void {
  const doc = getDocument();
  if (doc) {
    try {
      doc.documentElement.style.setProperty('--ui-scale', String(prefs.fontScale));
      doc.documentElement.setAttribute('data-contrast', prefs.contrast);
    } catch {
      /* ignore */
    }
  }
  target.setFontScale(prefs.fontScale);
  target.setHighContrast(prefs.contrast === 'high');
}
