import { describe, expect, it } from 'vitest';
import { base64Decode } from '../../src/engine/util/base64';
import { opensslDecrypt } from '../../src/engine/crypto/openssl';
import { checkFlag } from '../../src/engine/game/flag';
import { isStub, type Level } from '../../src/engine/game/level';
import { LEVELS } from '../../src/levels';
import {
  FLAG as FLAG12,
  SHORTCUTS_THAT_FAIL as SHORTCUTS12,
  SOLUTION as SOLUTION12,
} from '../../src/levels/level12/solution';
import {
  FLAG as FLAG13,
  SHORTCUTS_THAT_FAIL as SHORTCUTS13,
  SOLUTION as SOLUTION13,
} from '../../src/levels/level13/solution';
import {
  FLAG as FLAG14,
  SHORTCUTS_THAT_FAIL as SHORTCUTS14,
  SOLUTION as SOLUTION14,
} from '../../src/levels/level14/solution';
import {
  DEPLOY_PASSWORD,
  FLAG as FLAG15,
  SHORTCUTS_THAT_FAIL as SHORTCUTS15,
  VAULT_PASSPHRASE,
} from '../../src/levels/level15/solution';
import { createGame, type GameHarness, storageStartingAt } from '../helpers/game';

async function step(
  h: GameHarness,
  line: string,
  answers: readonly string[] = [],
): Promise<{ stdout: string; stderr: string }> {
  h.take();
  const queue = [...answers];
  await h.game.shell.submit(line);
  while (h.game.shell.inputRequest.kind === 'read') {
    await h.game.shell.submit(queue.shift() ?? '');
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

const playable = (id: string): Level => {
  const found = LEVELS.find((entry) => entry.id === id);
  if (!found || isStub(found)) throw new Error(`no playable level ${id}`);
  return found;
};

describe('Chapter 4 & 5 catalog', () => {
  it('completes the catalog with the web and finale levels', () => {
    const missions = LEVELS.filter((e) => !isStub(e) && !e.practice);
    expect(missions.map((entry) => entry.id).slice(-4)).toEqual([
      '12-robots-and-secrets',
      '13-broken-access',
      '14-injection',
      '15-the-last-door',
    ]);
    expect(LEVELS.some((e) => !isStub(e) && e.practice)).toBe(true);
    expect(LEVELS.some(isStub)).toBe(false);
    expect(playable('15-the-last-door').chapter).toBe(5);
    for (const id of [
      '12-robots-and-secrets',
      '13-broken-access',
      '14-injection',
      '15-the-last-door',
    ]) {
      const level = playable(id);
      expect(level.hints.length).toBeGreaterThanOrEqual(3);
      expect(level.flagHash).toMatch(/^[0-9a-f]{64}$/);
      expect(level.debrief).toBeTruthy();
    }
  });

  it('matches each flag to its stored hash', () => {
    expect(checkFlag(FLAG12, playable('12-robots-and-secrets').flagHash)).toBe('match');
    expect(checkFlag(FLAG13, playable('13-broken-access').flagHash)).toBe('match');
    expect(checkFlag(FLAG14, playable('14-injection').flagHash)).toBe('match');
    expect(checkFlag(FLAG15, playable('15-the-last-door').flagHash)).toBe('match');
  });

  it('never stores a flag as plaintext in the level data', () => {
    const chapters = LEVELS.filter((entry) => entry.chapter >= 4);
    const serialized = JSON.stringify(
      chapters.map((entry) => ({ ...entry, onCommand: undefined })),
    );
    expect(serialized).not.toMatch(/FLAG\{[A-Za-z0-9_]+\}/);
  });
});

describe('Chapter 4 solvability', () => {
  it('level 12 follows robots.txt to the backup note', async () => {
    const h = await gameAt('12-robots-and-secrets');
    let sawRobots = false;
    let captured = false;
    for (const line of SOLUTION12) {
      const out = await step(h, line);
      if (line.endsWith('robots.txt')) sawRobots = out.stdout.includes('Disallow: /internal/');
      if (line.startsWith('submit')) captured = out.stdout.includes('Level captured!');
    }
    expect(sawRobots).toBe(true);
    expect(captured).toBe(true);
    expect(h.game.status().completed).toBe(true);
  });

  it('level 13 reads ticket #1 by changing the id', async () => {
    const h = await gameAt('13-broken-access');
    let ownTicket = false;
    let captured = false;
    for (const line of SOLUTION13) {
      const out = await step(h, line);
      if (line.includes('id=4187')) ownTicket = out.stdout.includes('Ticket #4187');
      if (line.includes('id=1"')) expect(out.stdout).toContain(FLAG13);
      if (line.startsWith('submit')) captured = out.stdout.includes('Level captured!');
    }
    expect(ownTicket).toBe(true);
    expect(captured).toBe(true);
    expect(h.game.status().completed).toBe(true);
  });

  it('level 14 injects a UNION to read the staff secret', async () => {
    const h = await gameAt('14-injection');
    let sawError = false;
    let captured = false;
    for (const line of SOLUTION14) {
      const out = await step(h, line);
      if (line.endsWith(`q='"`))
        sawError = out.stdout.includes('You have an error in your SQL syntax');
      if (line.includes('UNION SELECT')) expect(out.stdout).toContain(FLAG14);
      if (line.startsWith('submit')) captured = out.stdout.includes('Level captured!');
    }
    expect(sawError).toBe(true);
    expect(captured).toBe(true);
    expect(h.game.status().completed).toBe(true);
  });
});

describe('Chapter 5 finale', () => {
  it('level 15 chains recon, injection, decryption and ssh', async () => {
    const h = await gameAt('15-the-last-door');

    // 1. recon
    expect((await step(h, 'nmap corp-core.novacorp.internal')).stdout).toContain('80/tcp');
    // 2. robots + injection to read the vault
    expect((await step(h, 'curl http://corp-core.novacorp.internal/robots.txt')).stdout).toContain(
      '/api/search',
    );
    const injected = await step(
      h,
      `curl "http://corp-core.novacorp.internal/api/search?q=' UNION SELECT label, value, note FROM vault -- "`,
    );
    expect(injected.stdout).toContain('deploy.cred.enc');
    expect(injected.stdout).toContain(VAULT_PASSPHRASE);

    // 3. pull the base64 blob out of the response and decrypt it, exactly as the player would
    const blob = injected.stdout
      .split('\n')
      .find((l) => l.startsWith('deploy.cred.enc'))!
      .split('  |  ')[1]!;
    const decoded = base64Decode(blob);
    expect(decoded.ok).toBe(true);
    const cred = opensslDecrypt(decoded.ok ? decoded.bytes : '', VAULT_PASSPHRASE);
    expect(cred.ok && cred.plaintext.trim()).toBe(DEPLOY_PASSWORD);

    // and prove the in-terminal openssl pipeline recovers the same password
    const viaCommand = await step(
      h,
      `echo '${blob}' | openssl enc -d -a -aes-256-cbc -k ${VAULT_PASSPHRASE}`,
    );
    expect(viaCommand.stdout.trim()).toBe(DEPLOY_PASSWORD);

    // 4. ssh in with it and read the flag
    await step(h, 'ssh deploy@corp-core.novacorp.internal', ['yes', DEPLOY_PASSWORD]);
    expect(h.game.shell.session.machine.hostname).toBe('corp-core');
    expect(h.game.shell.session.user.name).toBe('deploy');
    expect((await step(h, 'cat root-access.txt')).stdout).toContain(FLAG15);

    const captured = await step(h, `submit ${FLAG15}`);
    expect(captured.stdout).toContain('Level captured!');
    // Completing the last level finishes the run.
    expect(captured.stdout).toContain('RUN SUMMARY');
    expect(h.game.runSummary().complete).toBe(true);
  });
});

describe('Chapter 4 & 5 anti-shortcuts', () => {
  it('level 12: the obvious paths give nothing away', async () => {
    const h = await gameAt('12-robots-and-secrets');
    const [home, admin, indexOnly] = SHORTCUTS12;
    expect((await step(h, home!)).stdout).not.toContain('FLAG{');
    expect((await step(h, admin!)).stdout).not.toContain('FLAG{');
    expect((await step(h, indexOnly!)).stdout).not.toContain('FLAG{');
    expect(h.game.status().completed).toBe(false);
  });

  it('level 13: your own ticket and /admin do not contain the flag', async () => {
    const h = await gameAt('13-broken-access');
    const [ownTicket, admin, missing] = SHORTCUTS13;
    expect((await step(h, ownTicket!)).stdout).not.toContain('FLAG{');
    expect((await step(h, admin!)).stdout).toContain('403 Forbidden');
    expect((await step(h, missing!)).stdout).toContain('not found');
    expect(h.game.status().completed).toBe(false);
  });

  it('level 14: a normal search and a wrong column count fail', async () => {
    const h = await gameAt('14-injection');
    const [normal, staffPath, wrongColumns] = SHORTCUTS14;
    expect((await step(h, normal!)).stdout).not.toContain('FLAG{');
    expect((await step(h, staffPath!)).stdout).toContain('403 Forbidden');
    // A UNION with the wrong number of columns errors instead of leaking the secret.
    const bad = await step(h, wrongColumns!);
    expect(bad.stdout).toContain('different number of columns');
    expect(bad.stdout).not.toContain('FLAG{');
    expect(h.game.status().completed).toBe(false);
  });

  it('level 15: you cannot ssh in or reach the vault without the chain', async () => {
    const h = await gameAt('15-the-last-door');
    const [sshNoCred, plainSearch, vaultPath] = SHORTCUTS15;
    const ssh = await step(h, sshNoCred!, ['yes', 'guess', 'guess', 'guess']);
    expect(ssh.stderr).toContain('Permission denied');
    expect(h.game.shell.session.machine.hostname).toBe('corp-audit');
    expect((await step(h, plainSearch!)).stdout).not.toContain('deploy.cred');
    expect((await step(h, vaultPath!)).stdout).toContain('403 Forbidden');
    expect(h.game.status().completed).toBe(false);
  });
});
