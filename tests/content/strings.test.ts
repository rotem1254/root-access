import { describe, expect, it } from 'vitest';
import { strings } from '../../src/content/strings';

/** Recursively collects the dotted key paths of an object (leaves only). */
function keyPaths(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object') return [prefix];
  if (Array.isArray(value)) return [prefix]; // arrays are leaves for parity purposes
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
    keyPaths(v, prefix ? `${prefix}.${k}` : k),
  );
}

describe('UI strings', () => {
  it('English and Hebrew have exactly the same keys', () => {
    const en = keyPaths(strings('en')).sort();
    const he = keyPaths(strings('he')).sort();
    expect(he).toEqual(en);
  });

  it('exposes the journey-map labels in both locales', () => {
    for (const locale of ['en', 'he'] as const) {
      const ui = strings(locale);
      expect(ui.tabs.map.length).toBeGreaterThan(0);
      expect(ui.map.title.length).toBeGreaterThan(0);
      expect(ui.map.capturedLabel.length).toBeGreaterThan(0);
    }
  });

  it('sets the writing direction per locale', () => {
    expect(strings('en').dir).toBe('ltr');
    expect(strings('he').dir).toBe('rtl');
  });
});
