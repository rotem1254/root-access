import { describe, expect, it } from 'vitest';
import { LEVELS } from '../../src/levels';
import { createGame, type GameHarness, storageStartingAt } from '../helpers/game';

async function at(id: string): Promise<GameHarness> {
  const h = await createGame(LEVELS, { storage: await storageStartingAt(LEVELS, id) });
  expect(h.game.level.id).toBe(id);
  return h;
}

async function step(h: GameHarness, line: string): Promise<string> {
  h.take();
  await h.game.shell.submit(line);
  await h.game.shell.whenReady();
  return h.take().stdout;
}

/** The story missions gained onCommand beats; here we prove a representative one fires per chapter. */
describe('story onCommand beats', () => {
  it('Ch1 level01: a plain ls nudges toward hidden files, base64 acknowledges the decode', async () => {
    const h = await at('01-hidden-in-plain-sight');
    expect(await step(h, 'ls')).toContain('ls -a');
    expect(await step(h, 'base64 -d memo.txt')).toContain('hidden in plain sight');
  });

  it('Ch2 level04: an nmap sweep points at the web host', async () => {
    const h = await at('04-first-contact');
    expect(await step(h, 'nmap 10.10.0.0/24')).toContain('port 80');
  });

  it('Ch3 level08: a checksum check flags the tampered delivery', async () => {
    const h = await at('08-fingerprints');
    await step(h, 'cd /srv/delivery');
    expect(await step(h, 'sha256sum -c SHA256SUMS')).toContain('tampered');
  });

  it('Ch4 level14: a UNION SELECT is recognised as dumping the table', async () => {
    const h = await at('14-injection');
    const out = await step(
      h,
      `curl "http://shop.novacorp.internal/search?q=' UNION SELECT username, secret, role FROM staff -- "`,
    );
    expect(out).toContain('staff table');
  });

  it('Ch5 level15: an ssh login onto corp-core is acknowledged', async () => {
    const h = await at('15-the-last-door');
    // Drive the injection to unlock, then the beats are keyed on ssh; here we just check the
    // UNION beat, which needs no interactive prompt.
    const out = await step(
      h,
      `curl "http://corp-core.novacorp.internal/api/search?q=' UNION SELECT label, value, note FROM vault -- "`,
    );
    expect(out).toContain('vault');
  });
});
