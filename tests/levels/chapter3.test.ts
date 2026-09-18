import { describe, expect, it } from 'vitest';
import { checkFlag } from '../../src/engine/game/flag';
import { isStub, type Level } from '../../src/engine/game/level';
import { LEVELS } from '../../src/levels';
import {
  FLAG as FLAG8,
  SHORTCUTS_THAT_FAIL as SHORTCUTS8,
  SOLUTION as SOLUTION8,
} from '../../src/levels/level08/solution';
import {
  FLAG as FLAG9,
  MREYES_PASSWORD,
  SHORTCUTS_THAT_FAIL as SHORTCUTS9,
  SOLUTION as SOLUTION9,
} from '../../src/levels/level09/solution';
import {
  FLAG as FLAG10,
  PASSPHRASE as PASS10,
  SHORTCUTS_THAT_FAIL as SHORTCUTS10,
  SOLUTION as SOLUTION10,
} from '../../src/levels/level10/solution';
import {
  FLAG as FLAG11,
  PASSPHRASE as PASS11,
  SHORTCUTS_THAT_FAIL as SHORTCUTS11,
  SOLUTION as SOLUTION11,
} from '../../src/levels/level11/solution';
import { createGame, type GameHarness, storageStartingAt } from '../helpers/game';

/** Runs one solution line, answering any interactive prompt from `answers` in order. */
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

describe('Chapter 3 catalog', () => {
  it('has four playable levels and no stubs left', () => {
    const chapter3 = LEVELS.filter((entry) => entry.chapter === 3);
    expect(chapter3.map((entry) => entry.id)).toEqual([
      '08-fingerprints',
      '09-the-wordlist',
      '10-sealed-archive',
      '11-signed-and-sealed',
    ]);
    expect(LEVELS.some(isStub)).toBe(false);
    for (const entry of chapter3) {
      const level = entry as Level;
      expect(level.hints.length).toBeGreaterThanOrEqual(3);
      expect(level.skills.length).toBeGreaterThan(0);
      expect(level.flagHash).toMatch(/^[0-9a-f]{64}$/);
      expect(level.debrief).toBeTruthy();
    }
  });

  it('matches each solution flag to its stored hash', () => {
    expect(checkFlag(FLAG8, playable('08-fingerprints').flagHash)).toBe('match');
    expect(checkFlag(FLAG9, playable('09-the-wordlist').flagHash)).toBe('match');
    expect(checkFlag(FLAG10, playable('10-sealed-archive').flagHash)).toBe('match');
    expect(checkFlag(FLAG11, playable('11-signed-and-sealed').flagHash)).toBe('match');
  });

  it('never stores a Chapter 3 flag as plaintext in the level data', () => {
    const chapter3 = LEVELS.filter((entry) => entry.chapter === 3);
    const serialized = JSON.stringify(
      chapter3.map((entry) => ({ ...entry, onCommand: undefined })),
    );
    expect(serialized).not.toMatch(/FLAG\{[A-Za-z0-9_]+\}/);
  });
});

describe('Chapter 3 solvability', () => {
  it('level 8 finds the tampered file by its checksum', async () => {
    const h = await gameAt('08-fingerprints');
    let sawFailure = false;
    let captured = false;
    for (const line of SOLUTION8) {
      const out = await step(h, line);
      if (line.startsWith('sha256sum -c')) {
        sawFailure = out.stdout.includes('q3-renewals.csv: FAILED');
        // Every other file still verifies.
        expect(out.stdout).toContain('q1-renewals.csv: OK');
        expect(out.stderr).toContain('WARNING: 1 computed checksum did NOT match');
      }
      if (line.startsWith('submit')) captured = out.stdout.includes('Level captured!');
    }
    expect(sawFailure).toBe(true);
    expect(captured).toBe(true);
    expect(h.game.status().completed).toBe(true);
  });

  it('level 9 cracks the hash and reuses the password', async () => {
    const h = await gameAt('09-the-wordlist');
    let cracked = false;
    let captured = false;
    for (const line of SOLUTION9) {
      const out = await step(h, line, line.startsWith('su ') ? [MREYES_PASSWORD] : []);
      if (line.startsWith('john --wordlist')) {
        cracked = out.stdout.includes(MREYES_PASSWORD) && out.stdout.includes('(mreyes)');
        // The two strong passwords are not in the wordlist.
        expect(out.stdout).not.toContain('(jhoskins)');
        expect(out.stdout).not.toContain('(svc-build)');
      }
      if (line === 'su mreyes') expect(h.game.shell.session.user.name).toBe('mreyes');
      if (line.startsWith('submit')) captured = out.stdout.includes('Level captured!');
    }
    expect(cracked).toBe(true);
    expect(captured).toBe(true);
    expect(h.game.status().completed).toBe(true);
  });

  it('level 10 identifies, decodes ROT13 and decrypts the archive', async () => {
    const h = await gameAt('10-sealed-archive');
    let identified = false;
    let decoded = false;
    let captured = false;
    for (const line of SOLUTION10) {
      const out = await step(h, line);
      if (line.startsWith('file ')) identified = out.stdout.includes("openssl enc'd data");
      if (line.startsWith('xxd')) expect(out.stdout).toContain('5361 6c74 6564 5f5f');
      if (line.startsWith('tr ')) decoded = out.stdout.includes(PASS10);
      if (line.startsWith('openssl')) expect(out.stdout).toContain(FLAG10);
      if (line.startsWith('submit')) captured = out.stdout.includes('Level captured!');
    }
    expect(identified).toBe(true);
    expect(decoded).toBe(true);
    expect(captured).toBe(true);
    expect(h.game.status().completed).toBe(true);
  });

  it('level 11 imports the key then decrypts the message', async () => {
    const h = await gameAt('11-signed-and-sealed');
    let refusedFirst = false;
    let captured = false;
    for (const line of SOLUTION11) {
      const out = await step(h, line, [PASS11]);
      if (line === 'gpg -d message.asc') refusedFirst = out.stderr.includes('No secret key');
      if (line === 'gpg --import alex-private.asc') {
        expect(out.stderr).toContain('secret key imported');
      }
      if (line === 'gpg --list-secret-keys') expect(out.stdout).toContain('Alex Mercer');
      if (line.startsWith('gpg --passphrase')) expect(out.stdout).toContain(FLAG11);
      if (line.startsWith('submit')) captured = out.stdout.includes('Level captured!');
    }
    expect(refusedFirst).toBe(true);
    expect(captured).toBe(true);
    expect(h.game.status().completed).toBe(true);
  });
});

describe('Chapter 3 anti-shortcuts', () => {
  it('level 8: the tampered file is not obvious without checking the manifest', async () => {
    const h = await gameAt('08-fingerprints');
    const [listing, oneSum, cleanFile] = SHORTCUTS8;
    // A listing shows six ordinary files and gives nothing away.
    const ls = await step(h, listing!);
    expect(ls.stdout).not.toContain('FLAG{');
    expect(ls.stdout).toContain('q3-renewals.csv');
    // Checksumming one file on its own proves nothing without the manifest to compare to.
    expect((await step(h, oneSum!)).stdout).toMatch(/^[0-9a-f]{64}/);
    expect((await step(h, cleanFile!)).stdout).not.toContain('FLAG{');
    expect(h.game.status().completed).toBe(false);
  });

  it('level 9: the notes are unreadable and the wrong format cracks nothing', async () => {
    const h = await gameAt('09-the-wordlist');
    const [readDirect, wrongFormat, suNoPassword] = SHORTCUTS9;
    expect((await step(h, readDirect!)).stderr).toContain('Permission denied');
    const wrong = await step(h, wrongFormat!);
    expect(wrong.stdout).not.toContain(MREYES_PASSWORD);
    // su without the cracked password fails.
    const su = await step(h, suNoPassword!, ['guessing']);
    expect(su.stderr).toContain('Authentication failure');
    expect(h.game.shell.session.user.name).toBe('analyst');
    expect(h.game.status().completed).toBe(false);
  });

  it('level 10: the ciphertext reveals nothing and the ROT13 text is not the passphrase', async () => {
    const h = await gameAt('10-sealed-archive');
    const [catFile, stringsFile, rotPassphrase] = SHORTCUTS10;
    expect((await step(h, catFile!)).stdout).not.toContain('FLAG{');
    expect((await step(h, stringsFile!)).stdout).not.toContain('FLAG{');
    // Using the note verbatim, without decoding it, fails the padding check.
    const bad = await step(h, rotPassphrase!);
    expect(bad.stderr).toBe('bad decrypt\n');
    expect(bad.stdout).not.toContain('FLAG{');
    expect(h.game.status().completed).toBe(false);
  });

  it('level 11: the message is useless without importing the key', async () => {
    const h = await gameAt('11-signed-and-sealed');
    const [catFile, stringsFile, decryptNoKey] = SHORTCUTS11;
    expect((await step(h, catFile!)).stdout).not.toContain('FLAG{');
    expect((await step(h, stringsFile!)).stdout).not.toContain('FLAG{');
    // Even with the right passphrase, there is no key in the keyring yet.
    const noKey = await step(h, decryptNoKey!, [PASS11]);
    expect(noKey.stderr).toContain('No secret key');
    expect(noKey.stdout).not.toContain('FLAG{');
    expect(h.game.status().completed).toBe(false);
  });
});
