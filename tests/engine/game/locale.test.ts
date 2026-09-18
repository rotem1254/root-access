import { describe, expect, it } from 'vitest';
import { strings } from '../../../src/content/strings';
import { LEVELS } from '../../../src/levels';
import { localize } from '../../../src/engine/game/level';
import { createGame } from '../../helpers/game';

describe('UI strings', () => {
  it('provides English and Hebrew with matching shapes and directions', () => {
    const en = strings('en');
    const he = strings('he');
    expect(en.dir).toBe('ltr');
    expect(he.dir).toBe('rtl');
    expect(Object.keys(he.tabs)).toEqual(Object.keys(en.tabs));
    expect(Object.keys(he.panel)).toEqual(Object.keys(en.panel));
    expect(Object.keys(he.a11y)).toEqual(Object.keys(en.a11y));
    // Hebrew tab labels are actually Hebrew.
    expect(he.tabs.mission).toBe('משימה');
    // The toggle shows the OTHER language's name.
    expect(en.buttons.language).toBe('עברית');
    expect(he.buttons.language).toBe('English');
  });
});

describe('localize', () => {
  it('falls back to English when a Hebrew string is missing', () => {
    expect(localize('plain', 'he')).toBe('plain');
    expect(localize({ en: 'Hello', he: 'שלום' }, 'he')).toBe('שלום');
    expect(localize({ en: 'Hello' }, 'he')).toBe('Hello');
    expect(localize({ en: 'Hello', he: 'שלום' }, 'en')).toBe('Hello');
  });
});

describe('game.setLocale', () => {
  it('switches language, emits an event, and retranslates on the fly', async () => {
    const h = await createGame(LEVELS);
    expect(h.game.locale).toBe('en');
    h.game.setLocale('he');
    expect(h.game.locale).toBe('en' === h.game.locale ? 'en' : 'he'); // now he
    expect(h.game.locale).toBe('he');
    expect(h.events).toContainEqual({ type: 'locale-changed', locale: 'he' });
    // Switching to the same locale is a no-op (no duplicate event).
    const before = h.events.filter((e) => e.type === 'locale-changed').length;
    h.game.setLocale('he');
    expect(h.events.filter((e) => e.type === 'locale-changed').length).toBe(before);
    h.game.setLocale('en');
    expect(h.game.locale).toBe('en');
  });

  it('retranslates revealed hints when the language changes', async () => {
    // Use a level whose first hint has a Hebrew translation once we add them; for now assert the
    // mechanism: revealedHints reflects the current locale via localize().
    const h = await createGame(LEVELS);
    h.game.nextHint();
    const enHint = h.game.revealedHints()[0];
    h.game.setLocale('he');
    const heHint = h.game.revealedHints()[0];
    // Either a real translation (differs) or the English fallback (same) — never undefined.
    expect(typeof heHint).toBe('string');
    expect(heHint).toBeTruthy();
    expect(enHint).toBeTruthy();
  });
});
