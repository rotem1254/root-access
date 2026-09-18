import { describe, expect, it } from 'vitest';
import { checkFlag } from '../../src/engine/game/flag';
import { isStub, type Level } from '../../src/engine/game/level';
import { LEVELS } from '../../src/levels';
import { FLAG, SHORTCUTS_THAT_FAIL, SOLUTION } from '../../src/levels/level00/solution';
import { createGame, type GameHarness } from '../helpers/game';

async function step(h: GameHarness, line: string): Promise<{ stdout: string; stderr: string }> {
  h.take();
  await h.game.shell.submit(line);
  await h.game.shell.whenReady();
  return h.take();
}

describe('Chapter 0 — the tutorial', () => {
  it('is the first level a new player lands on', () => {
    expect(LEVELS[0]?.id).toBe('00-first-lesson');
    const level = LEVELS[0] as Level;
    expect(level.chapter).toBe(0);
    expect(isStub(level)).toBe(false);
    expect(checkFlag(FLAG, level.flagHash)).toBe('match');
  });

  it('does not store the flag as plaintext', () => {
    const serialized = JSON.stringify({ ...(LEVELS[0] as Level), onCommand: undefined });
    expect(serialized).not.toMatch(/FLAG\{[A-Za-z0-9_]+\}/);
  });

  it('is solved by the gentle ls -> cat -> submit path', async () => {
    const h = await createGame(LEVELS);
    expect(h.game.level.id).toBe('00-first-lesson');
    let captured = false;
    for (const line of SOLUTION) {
      const out = await step(h, line);
      if (line === 'cat badge.txt') expect(out.stdout).toContain(FLAG);
      if (line.startsWith('submit')) captured = out.stdout.includes('Level captured!');
    }
    expect(captured).toBe(true);
    expect(h.game.status().completed).toBe(true);
  });

  it('coaches the beginner after each step (English)', async () => {
    const h = await createGame(LEVELS);
    expect((await step(h, 'ls')).stdout).toContain('cat welcome.txt');
    expect((await step(h, 'cat welcome.txt')).stdout).toContain('cat badge.txt');
    expect((await step(h, 'cat badge.txt')).stdout).toContain('submit FLAG{...}');
  });

  it('coaches in Hebrew when the locale is Hebrew', async () => {
    const h = await createGame(LEVELS);
    h.game.setLocale('he');
    expect((await step(h, 'ls')).stdout).toContain('cat welcome.txt');
    // The coaching line is Hebrew, and points at the next command in Latin.
    expect((await step(h, 'pwd')).stdout).toContain('ls');
    const welcome = await step(h, 'cat welcome.txt');
    expect(welcome.stdout).toContain('cat badge.txt');
  });

  it('nudges a lost beginner who types something unknown', async () => {
    const h = await createGame(LEVELS);
    const out = await step(h, 'halp');
    expect(out.stdout).toContain('ls');
  });

  it('rejects the shortcuts that should not win', async () => {
    const h = await createGame(LEVELS);
    expect((await step(h, SHORTCUTS_THAT_FAIL[0]!)).stdout).not.toContain('Level captured!');
    expect((await step(h, SHORTCUTS_THAT_FAIL[2]!)).stdout).toContain('Incorrect');
    expect(h.game.status().completed).toBe(false);
  });
});
