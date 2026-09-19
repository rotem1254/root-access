import { describe, expect, it } from 'vitest';
import { COMMAND_GUIDE, searchGuide } from '../../src/content/commandGuide';
import { LINUX_COMMANDS } from '../../src/engine/commands';

describe('command guide', () => {
  it('every entry names a real command with both languages and an example', () => {
    const known = new Set([
      ...LINUX_COMMANDS.map((c) => c.name),
      'mission',
      'hint',
      'submit',
      'status',
      'summary',
      'levels',
      'reset',
    ]);
    for (const category of COMMAND_GUIDE) {
      expect(category.label.en).toBeTruthy();
      expect(category.label.he).toBeTruthy();
      for (const entry of category.entries) {
        expect(known.has(entry.name)).toBe(true);
        expect(entry.en).toBeTruthy();
        expect(entry.he).toBeTruthy();
        expect(entry.example).toContain(entry.name);
      }
    }
  });

  it('search matches by name, description and example, in the right language', () => {
    expect(searchGuide('grep', 'en').map((e) => e.name)).toContain('grep');
    // English description "permissions" -> chmod; the Hebrew word matches only in Hebrew.
    expect(searchGuide('permission', 'en').map((e) => e.name)).toContain('chmod');
    expect(searchGuide('הרשאות', 'he').map((e) => e.name)).toContain('chmod');
    expect(searchGuide('permission', 'he').map((e) => e.name)).not.toContain('chmod');
    // Empty query returns everything.
    const all = COMMAND_GUIDE.reduce((n, c) => n + c.entries.length, 0);
    expect(searchGuide('', 'en')).toHaveLength(all);
    expect(searchGuide('definitely-no-such-command', 'en')).toEqual([]);
    // Results carry their category label.
    expect(searchGuide('ls', 'he')[0]?.category).toBe('יסודות');
  });
});
