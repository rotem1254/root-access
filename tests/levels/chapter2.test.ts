import { describe, expect, it } from 'vitest';
import { checkFlag } from '../../src/engine/game/flag';
import { isStub, type Level } from '../../src/engine/game/level';
import { LEVELS } from '../../src/levels';
import {
  FLAG as FLAG4,
  SHORTCUTS_THAT_FAIL as SHORTCUTS4,
  SOLUTION as SOLUTION4,
} from '../../src/levels/level04/solution';
import {
  FLAG as FLAG5,
  SHORTCUTS_THAT_FAIL as SHORTCUTS5,
  SOLUTION as SOLUTION5,
} from '../../src/levels/level05/solution';
import {
  DB_PASSWORD,
  FLAG as FLAG6,
  JUMP_PASSWORD,
  SHORTCUTS_THAT_FAIL as SHORTCUTS6,
  SOLUTION as SOLUTION6,
} from '../../src/levels/level06/solution';
import {
  BASIC_TOKEN,
  FLAG as FLAG7,
  PORTAL_PASSWORD,
  SHORTCUTS_THAT_FAIL as SHORTCUTS7,
  SOLUTION as SOLUTION7,
} from '../../src/levels/level07/solution';
import {
  FLAG as FLAG7B,
  SHORTCUTS_THAT_FAIL as SHORTCUTS7B,
  SOLUTION as SOLUTION7B,
  SSH_PASSWORD as PW7B,
} from '../../src/levels/level07b/solution';
import { createGame, type GameHarness, storageStartingAt } from '../helpers/game';

/**
 * Runs one solution line. `ssh` asks two questions in a row (host key, then password), so any
 * pending prompt is answered from `answers` in order.
 */
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

/** Boots the game straight onto `id`, with everything before it already completed. */
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

describe('Chapter 2 catalog', () => {
  it('replaces the Chapter 2 stubs with the playable levels', () => {
    const chapter2 = LEVELS.filter((entry) => entry.chapter === 2);
    expect(chapter2.map((entry) => entry.id)).toEqual([
      '04-first-contact',
      '05-open-ports',
      '06-hop-the-fence',
      '07-packet-trail',
      '07b-persistence',
    ]);
    expect(chapter2.some(isStub)).toBe(false);
    for (const entry of chapter2) {
      const level = entry as Level;
      expect(level.hints.length).toBeGreaterThanOrEqual(3);
      expect(level.skills.length).toBeGreaterThan(0);
      expect(level.flagHash).toMatch(/^[0-9a-f]{64}$/);
      expect(level.hosts?.length ?? 0).toBeGreaterThan(0);
      expect(level.net?.interfaces.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('matches each solution flag to its stored hash', () => {
    expect(checkFlag(FLAG4, playable('04-first-contact').flagHash)).toBe('match');
    expect(checkFlag(FLAG5, playable('05-open-ports').flagHash)).toBe('match');
    expect(checkFlag(FLAG6, playable('06-hop-the-fence').flagHash)).toBe('match');
    expect(checkFlag(FLAG7, playable('07-packet-trail').flagHash)).toBe('match');
    expect(checkFlag(FLAG7B, playable('07b-persistence').flagHash)).toBe('match');
  });

  it('never stores a Chapter 2 flag as plaintext in the level data', () => {
    const chapter2 = LEVELS.filter((entry) => entry.chapter === 2);
    const serialized = JSON.stringify(
      chapter2.map((entry) => ({ ...entry, onCommand: undefined })),
    );
    expect(serialized).not.toMatch(/FLAG\{[A-Za-z0-9_]+\}/);
  });
});

describe('Chapter 2 solvability', () => {
  it('level 4 is solved by discovering the HTTP host and reading its page', async () => {
    const h = await gameAt('04-first-contact');
    let sawHost = false;
    let captured = false;
    for (const line of SOLUTION4) {
      const out = await step(h, line);
      if (line.startsWith('nmap')) sawHost = out.stdout.includes('corp-intra (10.10.0.30)');
      if (line.startsWith('submit')) captured = out.stdout.includes('Level captured!');
    }
    expect(sawHost).toBe(true);
    expect(captured).toBe(true);
    expect(h.game.status().completed).toBe(true);
  });

  it('level 5 is solved by scanning the full port range', async () => {
    const h = await gameAt('05-open-ports');
    let foundPort = false;
    let captured = false;
    for (const line of SOLUTION5) {
      const out = await step(h, line);
      if (line.includes('-sV')) foundPort = out.stdout.includes('8686/tcp');
      if (line.startsWith('submit')) captured = out.stdout.includes('Level captured!');
    }
    expect(foundPort).toBe(true);
    expect(captured).toBe(true);
    expect(h.game.status().completed).toBe(true);
  });

  it('level 6 is solved by pivoting through the jump host', async () => {
    const h = await gameAt('06-hop-the-fence');
    let captured = false;
    let sawFlagFile = false;
    for (const line of SOLUTION6) {
      const answers = line.startsWith('ssh analyst@')
        ? ['yes', JUMP_PASSWORD]
        : line.startsWith('ssh dbadmin@')
          ? ['yes', DB_PASSWORD]
          : [];
      const out = await step(h, line, answers);
      if (line === 'ssh analyst@corp-jump01') {
        expect(h.game.shell.session.machine.hostname).toBe('corp-jump01');
      }
      if (line === 'ssh dbadmin@10.10.9.20') {
        expect(h.game.shell.session.machine.hostname).toBe('corp-db01');
        expect(h.game.shell.session.user.name).toBe('dbadmin');
      }
      if (line.startsWith('cat /opt/export')) sawFlagFile = out.stdout.includes(FLAG6);
      if (line.startsWith('submit')) captured = out.stdout.includes('Level captured!');
    }
    expect(sawFlagFile).toBe(true);
    expect(captured).toBe(true);
    expect(h.game.status().completed).toBe(true);
  });

  it('level 7 is solved by recovering the credential from the capture', async () => {
    const h = await gameAt('07-packet-trail');
    let sawHeader = false;
    let decoded = false;
    let captured = false;
    for (const line of SOLUTION7) {
      const out = await step(h, line);
      if (line.includes('grep -i authorization')) sawHeader = out.stdout.includes(BASIC_TOKEN);
      if (line.includes('base64 -d')) decoded = out.stdout.includes(PORTAL_PASSWORD);
      if (line.startsWith('curl -u')) expect(out.stdout).toContain(FLAG7);
      if (line.startsWith('submit')) captured = out.stdout.includes('Level captured!');
    }
    expect(sawHeader).toBe(true);
    expect(decoded).toBe(true);
    expect(captured).toBe(true);
    expect(h.game.status().completed).toBe(true);
  });

  it('level 7b is solved by ssh + ps/kill + env + file management on the host', async () => {
    const h = await gameAt('07b-persistence');
    let onHost = false;
    let sawBeacon = false;
    let recovered = false;
    let captured = false;
    for (const line of SOLUTION7B) {
      const answers = line.startsWith('ssh ') ? ['yes', PW7B] : [];
      const out = await step(h, line, answers);
      if (line.startsWith('ssh ')) onHost = h.game.shell.session.machine.hostname === 'corp-web-03';
      if (line === 'ps aux') sawBeacon = out.stdout.includes('exfil-agent');
      if (line.startsWith('mv ')) recovered = out.stdout.includes(FLAG7B);
      if (line.startsWith('submit')) captured = out.stdout.includes('Level captured!');
    }
    expect(onHost).toBe(true);
    expect(sawBeacon).toBe(true);
    expect(recovered).toBe(true);
    expect(captured).toBe(true);
    expect(h.game.status().completed).toBe(true);
  });
});

describe('Chapter 2 anti-shortcuts', () => {
  it('level 4: the flag is not on the workstation and cannot be guessed', async () => {
    const h = await gameAt('04-first-contact');
    const [ls, grep, self, offSegment] = SHORTCUTS4;
    expect((await step(h, ls!)).stdout).not.toContain('FLAG{');
    expect((await step(h, grep!)).stdout).not.toContain('FLAG{');
    // No HTTP service on the workstation itself, and the other segment is unreachable.
    expect((await step(h, self!)).stderr).toContain('Connection refused');
    expect((await step(h, offSegment!)).stderr).toMatch(
      /Could not resolve host|Connection refused/,
    );
    expect(h.game.status().completed).toBe(false);
  });

  it('level 5: a default scan misses the port and the usual ports serve nothing', async () => {
    const h = await gameAt('05-open-ports');
    const [defaultScan, port80, port8080] = SHORTCUTS5;
    const scan = await step(h, defaultScan!);
    expect(scan.stdout).toContain('22/tcp');
    expect(scan.stdout).not.toContain('8686');
    expect((await step(h, port80!)).stderr).toContain('Connection refused');
    expect((await step(h, port8080!)).stderr).toContain('Connection refused');
    expect(h.game.status().completed).toBe(false);
  });

  it('level 6: the database segment is unreachable without the pivot', async () => {
    const h = await gameAt('06-hop-the-fence');
    const [directSsh, directCurl, directPing] = SHORTCUTS6;
    expect((await step(h, directSsh!)).stderr).toContain('No route to host');
    expect(h.game.shell.session.machine.hostname).toBe('corp-ws-09');
    expect((await step(h, directCurl!)).stderr).toContain('Connection refused');
    expect((await step(h, directPing!)).stdout).toContain('Destination Host Unreachable');
    // The flag file is not readable from here at all.
    expect((await step(h, 'cat /opt/export/README')).stderr).toContain('No such file or directory');
    expect(h.game.status().completed).toBe(false);
  });

  it('level 7: the portal refuses guesses and the flag is not in the capture', async () => {
    const h = await gameAt('07-packet-trail');
    const [noAuth, wrongAuth, grepCapture] = SHORTCUTS7;
    expect((await step(h, noAuth!)).stdout).toContain('401 Authorization Required');
    expect((await step(h, wrongAuth!)).stdout).toContain('401 Authorization Required');
    const grepped = await step(h, grepCapture!);
    expect(grepped.stdout).not.toContain(FLAG7);
    expect(h.game.status().completed).toBe(false);
  });

  it('level 7b: the staged file is a decoy — only a correct recovery reveals the flag', async () => {
    const h = await gameAt('07b-persistence');
    await step(h, 'ssh webadmin@corp-web-03', ['yes', PW7B]);
    expect(h.game.shell.session.machine.hostname).toBe('corp-web-03');
    const out = await step(h, SHORTCUTS7B[0]!);
    expect(out.stdout).not.toContain(FLAG7B);
    expect(h.game.status().completed).toBe(false);
  });
});
