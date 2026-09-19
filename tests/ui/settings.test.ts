import { describe, expect, it, vi } from 'vitest';
import {
  applyPrefs,
  DEFAULT_PREFS,
  FONT_SIZES,
  normalizePrefs,
  type A11yPrefs,
  type SettingsTarget,
} from '../../src/ui/a11yPrefs';

function stubTarget(): SettingsTarget & {
  scale: number;
  contrast: boolean;
  refits: number;
} {
  return {
    scale: 1,
    contrast: false,
    refits: 0,
    setFontScale(scale) {
      this.scale = scale;
    },
    setHighContrast(on) {
      this.contrast = on;
    },
    refit() {
      this.refits += 1;
    },
  };
}

describe('normalizePrefs', () => {
  it('returns defaults for null / garbage input', () => {
    expect(normalizePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(normalizePrefs('not an object')).toEqual(DEFAULT_PREFS);
    expect(normalizePrefs({})).toEqual(DEFAULT_PREFS);
  });

  it('accepts every known font scale', () => {
    for (const option of FONT_SIZES) {
      expect(normalizePrefs({ fontScale: option.scale }).fontScale).toBe(option.scale);
    }
  });

  it('clamps an unknown font scale back to the default', () => {
    expect(normalizePrefs({ fontScale: 99 }).fontScale).toBe(DEFAULT_PREFS.fontScale);
    expect(normalizePrefs({ fontScale: 'big' as unknown as number }).fontScale).toBe(
      DEFAULT_PREFS.fontScale,
    );
  });

  it('accepts high contrast and rejects anything else', () => {
    expect(normalizePrefs({ contrast: 'high' }).contrast).toBe('high');
    expect(normalizePrefs({ contrast: 'weird' as unknown as 'high' }).contrast).toBe('normal');
  });
});

describe('applyPrefs', () => {
  it('pushes font scale and contrast into the target', () => {
    const target = stubTarget();
    const prefs: A11yPrefs = { fontScale: 1.45, contrast: 'high' };
    applyPrefs(prefs, target);
    expect(target.scale).toBe(1.45);
    expect(target.contrast).toBe(true);
  });

  it('turns high contrast off for normal prefs', () => {
    const target = stubTarget();
    applyPrefs({ fontScale: 1, contrast: 'normal' }, target);
    expect(target.contrast).toBe(false);
  });

  it('survives a missing document (node environment)', () => {
    const target = stubTarget();
    expect(() => applyPrefs(DEFAULT_PREFS, target)).not.toThrow();
    expect(target.scale).toBe(DEFAULT_PREFS.fontScale);
  });

  it('writes the CSS variable and attribute when a document exists', () => {
    const setProperty = vi.fn();
    const setAttribute = vi.fn();
    const original = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: unknown }).document = {
      documentElement: { style: { setProperty }, setAttribute },
    };
    try {
      applyPrefs({ fontScale: 1.2, contrast: 'high' }, stubTarget());
      expect(setProperty).toHaveBeenCalledWith('--ui-scale', '1.2');
      expect(setAttribute).toHaveBeenCalledWith('data-contrast', 'high');
    } finally {
      if (original === undefined) delete (globalThis as { document?: unknown }).document;
      else (globalThis as { document?: unknown }).document = original;
    }
  });
});
