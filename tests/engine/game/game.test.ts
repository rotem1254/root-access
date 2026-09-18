import { beforeEach, describe, expect, it } from 'vitest';
import { hashFlag } from '../../../src/engine/game/flag';
import type { Level, LevelCatalog, LevelStub } from '../../../src/engine/game/level';
import { computeScore, hintPenalty, speedBonus } from '../../../src/engine/game/scoring';
import { MemoryStorage } from '../../../src/engine/game/storage';
import { createGame } from '../../helpers/game';

const FLAG1 = 'FLAG{level_one}';
const FLAG2 = 'FLAG{level_two}';

const level1: Level = {
  id: '01-intro',
  chapter: 1,
  title: 'Intro',
  briefing: 'The story begins here with a long briefing that explains the mission in detail.',
  objective: 'Read the flag from notes.txt and submit it.',
  skills: ['ls', 'cat'],
  startUser: 'guest',
  startHost: 'corp-web01',
  startCwd: '/home/guest',
  users: [{ name: 'guest', uid: 1000 }],
  fs: { '/home/guest/notes.txt': { content: `the flag is ${FLAG1}\n`, owner: 'guest' } },
  flagHash: hashFlag(FLAG1),
  hints: [
    'Look at the files in your home directory.',
    'Try `cat notes.txt`.',
    `The flag is ${FLAG1}.`,
  ],
  parTimeSec: 60,
};

const level2: Level = {
  id: '02-second',
  chapter: 1,
  title: 'Second',
  briefing: 'A second challenge.',
  objective: 'Find the second flag.',
  skills: ['grep'],
  startUser: 'guest',
  startHost: 'corp-web01',
  startCwd: '/home/guest',
  users: [{ name: 'guest', uid: 1000 }],
  fs: { '/home/guest/log.txt': { content: `noise\n${FLAG2}\nmore\n`, owner: 'guest' } },
  flagHash: hashFlag(FLAG2),
  hints: ['grep the log.'],
  parTimeSec: 120,
};

const stub: LevelStub = {
  id: '03-coming',
  chapter: 2,
  title: 'Networking',
  briefing: 'Coming soon.',
  objective: 'TBD',
  comingSoon: true,
};

const CATALOG: LevelCatalog = [level1, level2, stub];
const ROOT = { uid: 0, gid: 0, groups: [0] };

describe('scoring', () => {
  it('accumulates hint penalties', () => {
    expect(hintPenalty(0)).toBe(0);
    expect(hintPenalty(1)).toBe(10);
    expect(hintPenalty(2)).toBe(30);
    expect(hintPenalty(3)).toBe(60);
    expect(hintPenalty(5)).toBe(120);
  });

  it('scales the speed bonus with time', () => {
    expect(speedBonus(30_000, 60)).toBe(50);
    expect(speedBonus(60_000, 60)).toBe(50);
    expect(speedBonus(120_000, 60)).toBe(25);
    expect(speedBonus(180_000, 60)).toBe(0);
    expect(speedBonus(1000, 0)).toBe(0);
  });

  it('never scores below the floor', () => {
    expect(computeScore(0, 30_000, 60)).toEqual({
      base: 100,
      hintPenalty: 0,
      speedBonus: 50,
      total: 150,
    });
    expect(computeScore(3, 300_000, 60)).toEqual({
      base: 100,
      hintPenalty: 60,
      speedBonus: 0,
      total: 40,
    });
    expect(computeScore(10, 300_000, 60).total).toBe(25);
  });
});

describe('Game', () => {
  let h: Awaited<ReturnType<typeof createGame>>;

  beforeEach(async () => {
    h = await createGame(CATALOG);
  });

  it('starts on the first level with a working shell', async () => {
    expect(h.game.level.id).toBe('01-intro');
    expect((await h.run('whoami')).stdout).toBe('guest\n');
    expect((await h.run('cat notes.txt')).stdout).toBe(`the flag is ${FLAG1}\n`);
    // Capturing level 1 loads level 2, which emits a level-started event we can observe.
    await h.run(`submit ${FLAG1}`);
    await h.run('levels 2');
    expect(h.events).toContainEqual({ type: 'level-started', levelId: '02-second', number: 2 });
  });

  it('shows the mission, hints and status through game commands', async () => {
    expect((await h.run('mission')).stdout).toContain('Level 1 — Intro');
    expect((await h.run('mission -b')).stdout).toContain('The story begins here');
    const hint1 = await h.run('hint');
    expect(hint1.stdout).toContain('Hint 1/3');
    expect(hint1.stdout).toContain('Look at the files');
    expect((await h.run('hint')).stdout).toContain('Hint 2/3');
    expect((await h.run('hint -l')).stdout).toContain('Hint 1:');
    expect((await h.run('status')).stdout).toContain('Hints used:      2/3');
  });

  it('captures the flag, scores it and unlocks the next level', async () => {
    h.clock.advance(30_000);
    const result = await h.run(`submit ${FLAG1}`);
    expect(result.stdout).toContain('Level captured!');
    expect(result.stdout).toContain('Score: 150');
    const captured = h.events.find((e) => e.type === 'flag-captured');
    expect(captured).toMatchObject({
      levelId: '01-intro',
      score: { total: 150 },
      newSkills: ['ls', 'cat'],
      nextLevelId: '02-second',
    });
    expect(h.game.unlockedSkills).toEqual(['ls', 'cat']);
    expect((await h.run('status')).stdout).toContain('Total score:     150');
  });

  it('penalizes hints in the score', async () => {
    await h.run('hint');
    await h.run('hint');
    h.clock.advance(30_000);
    expect((await h.run(`submit ${FLAG1}`)).stdout).toContain('Score: 120');
  });

  it('rejects wrong and malformed flags and counts wrong attempts', async () => {
    expect((await h.run('submit FLAG{wrong}')).stdout).toContain('Incorrect flag');
    expect((await h.run('submit notaflag')).stderr).toContain('does not look like a flag');
    expect((await h.run('submit')).stderr).toContain('usage: submit');
    expect((await h.run('status')).stdout).toContain('Wrong flags:     1');
    expect(h.game.status().completed).toBe(false);
  });

  it('lists levels with their state and switches between unlocked ones', async () => {
    const before = await h.run('levels');
    expect(before.stdout).toContain('▶ current');
    expect(before.stdout).toContain('🔒 locked');
    expect(before.stdout).toContain('coming soon');
    expect((await h.run('levels 2')).stderr).toContain('locked');
    await h.run(`submit ${FLAG1}`);
    expect((await h.run('levels 2')).stdout).toContain('Loading level');
    expect(h.game.level.id).toBe('02-second');
    expect((await h.run('grep FLAG log.txt')).stdout).toContain(FLAG2);
    expect((await h.run('levels 1')).stdout).toContain('Loading level');
    expect(h.game.level.id).toBe('01-intro');
    expect((await h.run('levels 99')).stderr).toContain('no such level');
    expect((await h.run('levels 3')).stderr).toContain('not available yet');
  });

  it('resets the level filesystem on demand', async () => {
    await h.run('rm notes.txt');
    expect((await h.run('cat notes.txt')).stderr).toContain('No such file or directory');
    await h.run('reset -y');
    expect(h.events.some((e) => e.type === 'level-reset')).toBe(true);
    expect((await h.run('cat notes.txt')).stdout).toBe(`the flag is ${FLAG1}\n`);
  });

  it('does not reset without confirmation', async () => {
    await h.run('rm notes.txt');
    h.take();
    await h.game.shell.submit('reset');
    await h.game.shell.submit('n');
    await h.game.shell.whenReady();
    expect(h.take().stdout).toContain('Reset cancelled');
    expect(h.game.machine.fs.exists('/home/guest/notes.txt', ROOT)).toBe(false);
  });

  it('tracks active time only while resumed', () => {
    h.game.pause();
    h.clock.advance(10_000);
    expect(h.game.activeMs()).toBe(0);
    h.game.resume();
    h.clock.advance(5_000);
    expect(h.game.activeMs()).toBe(5_000);
  });
});

describe('Game persistence', () => {
  it('saves and restores a session, including the modified filesystem', async () => {
    const storage = new MemoryStorage();
    const first = await createGame(CATALOG, { storage });
    await first.run('echo "my work" > progress.txt');
    await first.run('hint');
    first.clock.advance(45_000);
    await first.game.persist();

    const second = await createGame(CATALOG, { storage });
    expect(second.game.level.id).toBe('01-intro');
    expect((await second.run('cat progress.txt')).stdout).toBe('my work\n');
    expect(second.game.revealedHints()).toHaveLength(1);
    expect(second.game.status().wrongSubmissions).toBe(0);
    expect((await second.run('history')).stdout).toContain('hint');
  });

  it('keeps progress but drops the stale filesystem when a level changes', async () => {
    const storage = new MemoryStorage();
    const first = await createGame(CATALOG, { storage });
    await first.run('echo changed > extra.txt');
    await first.game.persist();

    const changedLevel1: Level = {
      ...level1,
      fs: { '/home/guest/notes.txt': { content: 'different\n', owner: 'guest' } },
    };
    const second = await createGame([changedLevel1, level2, stub], { storage });
    expect((await second.run('cat extra.txt')).stderr).toContain('No such file or directory');
    expect((await second.run('cat notes.txt')).stdout).toBe('different\n');
  });

  it('resets all progress', async () => {
    const storage = new MemoryStorage();
    const h = await createGame(CATALOG, { storage });
    await h.run(`submit ${FLAG1}`);
    expect(h.game.status().levelsCompleted).toBe(1);
    await h.game.resetAll();
    expect(h.game.status().levelsCompleted).toBe(0);
    expect(h.game.unlockedSkills).toEqual([]);
    expect(h.game.level.id).toBe('01-intro');
  });

  it('marks a completed level and blocks re-submission', async () => {
    const h = await createGame(CATALOG);
    await h.run(`submit ${FLAG1}`);
    expect((await h.run(`submit ${FLAG1}`)).stdout).toContain('already captured');
    expect(h.game.status().completed).toBe(true);
  });
});
