import { describe, expect, it } from 'vitest';
import { isStub, type Level } from '../../src/engine/game/level';
import { LEVELS } from '../../src/levels';
import { createGame, type GameHarness } from '../helpers/game';

const sandboxLevel = (): Level => {
  const s = LEVELS.find((e) => !isStub(e) && e.practice) as Level | undefined;
  if (!s) throw new Error('no practice level');
  return s;
};

async function step(h: GameHarness, line: string): Promise<{ stdout: string; stderr: string }> {
  h.take();
  await h.game.shell.submit(line);
  await h.game.shell.whenReady();
  return h.take();
}

describe('practice sandbox', () => {
  it('exists, has no flag, and is not where a new player starts', () => {
    const s = sandboxLevel();
    expect(s.id).toBe('sandbox');
    expect(s.flagHash).toBeUndefined();
    expect(s.practice).toBe(true);
    // A fresh game starts in the tutorial, not the sandbox.
    // (checked via createGame below)
  });

  it('is excluded from the run total and never blocks progression', async () => {
    const h = await createGame(LEVELS);
    expect(h.game.level.id).toBe('00-first-lesson');
    const summary = h.game.runSummary();
    // The sandbox is not counted among the levels of the run.
    expect(summary.rows.some((r) => r.id === 'sandbox')).toBe(false);
    expect(summary.levelsTotal).toBe(LEVELS.filter((e) => !isStub(e) && !e.practice).length);
  });

  it('is always reachable via goToLevel, even from the first level', async () => {
    const h = await createGame(LEVELS);
    expect(h.game.goToLevel('sandbox')).toBe('ok');
    expect(h.game.level.id).toBe('sandbox');
    // And back to a mission.
    expect(h.game.goToLevel('00-first-lesson')).toBe('ok');
    expect(h.game.level.id).toBe('00-first-lesson');
  });

  it('lets you explore freely, and submit explains there is no flag', async () => {
    const h = await createGame(LEVELS);
    h.game.goToLevel('sandbox');
    expect((await step(h, 'ls')).stdout).toContain('README.txt');
    expect((await step(h, 'cat logbook.txt | grep WARN')).stdout).toContain('WARN');
    expect((await step(h, 'nmap 10.9.9.0/24')).stdout).toContain('practice-web');
    expect((await step(h, 'curl http://practice-web/')).stdout).toContain(
      'Hello from practice-web',
    );
    expect(
      (await step(h, 'openssl enc -d -aes-256-cbc -in archive.enc -k sandbox')).stdout,
    ).toContain('AES-encrypted archive');
    const submit = await step(h, 'submit FLAG{anything}');
    expect(submit.stdout).toContain('practice sandbox');
    expect(h.game.status().completed).toBe(false);
  });
});
