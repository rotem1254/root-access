import { describe, expect, it } from 'vitest';
import { ROOT_CREDENTIALS } from '../../src/engine/fs/permissions';
import { checkFlag } from '../../src/engine/game/flag';
import { isStub, type Level } from '../../src/engine/game/level';
import { LEVELS } from '../../src/levels';
import {
  FLAG as FLAG1,
  SHORTCUTS_THAT_FAIL as SHORTCUTS1,
  SOLUTION as SOLUTION1,
} from '../../src/levels/level01/solution';
import {
  FLAG as FLAG2,
  SHORTCUTS_THAT_FAIL as SHORTCUTS2,
  SOLUTION as SOLUTION2,
} from '../../src/levels/level02/solution';
import {
  ADMIN_PASSWORD,
  FLAG as FLAG3,
  SHORTCUTS_THAT_FAIL as SHORTCUTS3,
  SOLUTION as SOLUTION3,
} from '../../src/levels/level03/solution';
import { createGame, type GameHarness, storageStartingAt } from '../helpers/game';

/** Runs one solution line, answering an interactive prompt (e.g. su) with `password`. */
async function step(
  h: GameHarness,
  line: string,
  password?: string,
): Promise<{ stdout: string; stderr: string }> {
  h.take();
  await h.game.shell.submit(line);
  while (h.game.shell.inputRequest.kind === 'read') {
    await h.game.shell.submit(password ?? '');
    await h.game.shell.whenReady();
  }
  await h.game.shell.whenReady();
  return h.take();
}

async function gameAt(id: string): Promise<GameHarness> {
  const h = await createGame(LEVELS, { storage: await storageStartingAt(LEVELS, id) });
  expect(h.game.level.id).toBe(id);
  return h;
}

describe('Chapter 1 catalog', () => {
  it('has three playable Chapter 1 levels, and every playable level is consistent', () => {
    const playable = LEVELS.filter((entry): entry is Level => !isStub(entry) && !entry.practice);
    expect(playable.filter((level) => level.chapter === 1).map((level) => level.id)).toEqual([
      '01-hidden-in-plain-sight',
      '02-needle-in-the-logs',
      '03-permission-denied',
    ]);
    for (const level of playable) {
      expect(level.hints.length).toBeGreaterThanOrEqual(3);
      expect(level.parTimeSec).toBeGreaterThan(0);
      expect(level.skills.length).toBeGreaterThan(0);
      expect(level.flagHash).toMatch(/^[0-9a-f]{64}$/);
    }
    // Playable levels come first; only later chapters are still stubs.
    expect(LEVELS.filter(isStub).every((stub) => stub.chapter >= 3)).toBe(true);
    // Level ids are unique.
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(LEVELS.length);
  });

  it('never stores a plaintext flag in the level data', () => {
    const serialized = JSON.stringify(
      LEVELS.map((level) => (isStub(level) ? level : { ...level, onCommand: undefined })),
    );
    expect(serialized).not.toMatch(/FLAG\{[A-Za-z0-9_]+\}/);
  });

  it('matches each solution flag to its stored hash', () => {
    const byId = Object.fromEntries(
      LEVELS.filter((l): l is Level => !isStub(l)).map((l) => [l.id, l]),
    );
    expect(checkFlag(FLAG1, byId['01-hidden-in-plain-sight']!.flagHash)).toBe('match');
    expect(checkFlag(FLAG2, byId['02-needle-in-the-logs']!.flagHash)).toBe('match');
    expect(checkFlag(FLAG3, byId['03-permission-denied']!.flagHash)).toBe('match');
  });
});

describe('Chapter 1 solvability', () => {
  it('level 1 is solved end-to-end by its canonical solution', async () => {
    const h = await gameAt('01-hidden-in-plain-sight');
    let captured = false;
    for (const line of SOLUTION1) {
      const out = await step(h, line);
      if (line.startsWith('submit')) captured = out.stdout.includes('Level captured!');
    }
    expect(captured).toBe(true);
    expect(h.game.status().completed).toBe(true);
  });

  it('level 2 is solved end-to-end by its canonical solution', async () => {
    const h = await gameAt('02-needle-in-the-logs');
    let captured = false;
    for (const line of SOLUTION2) {
      const out = await step(h, line);
      if (line.startsWith('submit')) captured = out.stdout.includes('Level captured!');
    }
    expect(captured).toBe(true);
    expect(h.game.status().completed).toBe(true);
  });

  it('level 3 is solved end-to-end, including su with the recovered password', async () => {
    const h = await gameAt('03-permission-denied');
    let captured = false;
    let sawFlagInFile = false;
    for (const line of SOLUTION3) {
      const out = await step(h, line, ADMIN_PASSWORD);
      if (line.startsWith('cat /home/admin/flag.txt')) sawFlagInFile = out.stdout.includes(FLAG3);
      if (line.startsWith('submit')) captured = out.stdout.includes('Level captured!');
    }
    expect(sawFlagInFile).toBe(true);
    expect(captured).toBe(true);
    expect(h.game.status().completed).toBe(true);
  });
});

describe('Chapter 1 anti-shortcuts', () => {
  it('level 1: a plain ls hides the note and a half flag is rejected', async () => {
    const h = await gameAt('01-hidden-in-plain-sight');
    expect((await step(h, SHORTCUTS1[0]!)).stdout).not.toContain('.handover');
    const half = await step(h, SHORTCUTS1[1]!);
    expect(half.stdout).toContain('Incorrect flag');
    expect(h.game.status().completed).toBe(false);
  });

  it('level 2: staff homes cannot be listed or searched with wildcards', async () => {
    const h = await gameAt('02-needle-in-the-logs');
    expect((await step(h, SHORTCUTS2[0]!)).stderr).toContain('Permission denied');
    expect((await step(h, SHORTCUTS2[1]!)).stdout).not.toContain(FLAG2);
    const find = await step(h, SHORTCUTS2[2]!);
    expect(find.stdout).not.toContain('.q3-review.csv');
  });

  it('level 3: guest is denied the flag, and a wrong su password fails', async () => {
    const h = await gameAt('03-permission-denied');
    const denied = await step(h, SHORTCUTS3[0]!);
    expect(denied.stderr).toContain('Permission denied');
    expect(denied.stdout).not.toContain(FLAG3);
    const badSu = await step(h, SHORTCUTS3[1]!, 'wrongpassword');
    expect(badSu.stderr).toContain('Authentication failure');
    expect(h.game.shell.session.user.name).toBe('guest');
  });

  it('level 3: chmod on the protected flag is refused for guest', async () => {
    const h = await gameAt('03-permission-denied');
    const chmod = await step(h, 'chmod 644 /home/admin/flag.txt');
    expect(chmod.stderr).toContain('Operation not permitted');
    expect((await step(h, 'cat /home/admin/flag.txt')).stderr).toContain('Permission denied');
    // The base system genuinely enforces this: even reading as root shows the file exists but guest cannot.
    expect(h.game.machine.fs.stat('/home/admin/flag.txt', ROOT_CREDENTIALS).mode).toBe(0o400);
  });
});
