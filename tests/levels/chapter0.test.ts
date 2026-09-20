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

import { FLAG as FLAGB, SOLUTION as SOLB } from '../../src/levels/level00b/solution';
import { FLAG as FLAGC, SOLUTION as SOLC } from '../../src/levels/level00c/solution';
import { FLAG as FLAGD, SOLUTION as SOLD } from '../../src/levels/level00d/solution';
import { FLAG as FLAGE, SOLUTION as SOLE } from '../../src/levels/level00e/solution';
import {
  FLAG as FLAGF,
  PASSWORD as PWF,
  SHORTCUTS_THAT_FAIL as SHORTF,
} from '../../src/levels/level00f/solution';
import { FLAG as FLAGG, SOLUTION as SOLG } from '../../src/levels/level00g/solution';
import {
  FLAG as FLAGH,
  SHORTCUTS_THAT_FAIL as SHORTH,
  SOLUTION as SOLH,
} from '../../src/levels/level00h/solution';
import {
  FLAG as FLAGI,
  SHORTCUTS_THAT_FAIL as SHORTI,
  SOLUTION as SOLI,
} from '../../src/levels/level00i/solution';
import {
  FLAG as FLAGJ,
  SHORTCUTS_THAT_FAIL as SHORTJ,
  SOLUTION as SOLJ,
} from '../../src/levels/level00j/solution';
import {
  FLAG as FLAGK,
  SHORTCUTS_THAT_FAIL as SHORTK,
  SOLUTION as SOLK,
} from '../../src/levels/level00k/solution';
import { storageStartingAt } from '../helpers/game';

async function tutorialAt(id: string): Promise<GameHarness> {
  const h = await createGame(LEVELS, { storage: await storageStartingAt(LEVELS, id) });
  expect(h.game.level.id).toBe(id);
  return h;
}

describe('Chapter 0 — the extra guided lessons', () => {
  it('are all chapter 0 and come right after the first lesson', () => {
    const ids = LEVELS.slice(0, 4).map((l) => l.id);
    expect(ids).toEqual(['00-first-lesson', '00b-moving-around', '00c-finding-text', '00d-pipes']);
    for (const l of LEVELS.slice(0, 4)) expect((l as Level).chapter).toBe(0);
  });

  it('never store their flags as plaintext', () => {
    const serialized = JSON.stringify(
      LEVELS.slice(1, 4).map((l) => ({ ...(l as Level), onCommand: undefined })),
    );
    expect(serialized).not.toMatch(/FLAG\{[A-Za-z0-9_]+\}/);
  });

  it('lesson 2 (cd): enter the folder and read the file', async () => {
    const h = await tutorialAt('00b-moving-around');
    let captured = false;
    for (const cmd of SOLB) {
      const out = await step(h, cmd);
      if (cmd === 'cd projects') expect(h.game.shell.session.env.cwd).toBe('/home/guest/projects');
      if (cmd === 'cat secret.txt') expect(out.stdout).toContain(FLAGB);
      if (cmd.startsWith('submit')) captured = out.stdout.includes('Level captured!');
    }
    expect(captured).toBe(true);
    expect(h.game.status().completed).toBe(true);
  });

  it('lesson 2 coaches: ls at home points into the folder, ls inside points at the file', async () => {
    const h = await tutorialAt('00b-moving-around');
    expect((await step(h, 'ls')).stdout).toContain('cd projects');
    await step(h, 'cd projects');
    expect((await step(h, 'ls')).stdout).toContain('cat secret.txt');
  });

  it('lesson 3 (grep): search instead of reading everything', async () => {
    const h = await tutorialAt('00c-finding-text');
    let captured = false;
    for (const cmd of SOLC) {
      const out = await step(h, cmd);
      if (cmd.startsWith('grep')) expect(out.stdout).toContain(FLAGC);
      if (cmd.startsWith('submit')) captured = out.stdout.includes('Level captured!');
    }
    expect(captured).toBe(true);
  });

  it('lesson 3 coaches toward grep after a long cat', async () => {
    const h = await tutorialAt('00c-finding-text');
    expect((await step(h, 'cat logbook.txt')).stdout).toContain('grep token logbook.txt');
  });

  it('lesson 4 (pipes): ls | grep finds the key file', async () => {
    const h = await tutorialAt('00d-pipes');
    let captured = false;
    for (const cmd of SOLD) {
      const out = await step(h, cmd);
      if (cmd === 'ls | grep key') expect(out.stdout).toContain('keycard.txt');
      if (cmd === 'cat keycard.txt') expect(out.stdout).toContain(FLAGD);
      if (cmd.startsWith('submit')) captured = out.stdout.includes('Level captured!');
    }
    expect(captured).toBe(true);
  });

  it('lesson 4 coaches: plain ls suggests a pipe, the pipe points at the file', async () => {
    const h = await tutorialAt('00d-pipes');
    expect((await step(h, 'ls')).stdout).toContain('ls | grep key');
    expect((await step(h, 'ls | grep key')).stdout).toContain('cat keycard.txt');
  });

  it('lesson 5 (permissions): chmod then read', async () => {
    const h = await tutorialAt('00e-permissions');
    // Before chmod, the file cannot be read.
    expect((await step(h, 'cat locked.txt')).stderr).toContain('Permission denied');
    let captured = false;
    for (const cmd of SOLE) {
      const out = await step(h, cmd);
      if (cmd === 'cat locked.txt') expect(out.stdout).toContain(FLAGE);
      if (cmd.startsWith('submit')) captured = out.stdout.includes('Level captured!');
    }
    expect(captured).toBe(true);
    expect(h.game.status().completed).toBe(true);
  });

  it('lesson 5 coaches: cat is denied until chmod, then points at the file', async () => {
    const h = await tutorialAt('00e-permissions');
    expect((await step(h, 'cat locked.txt')).stdout).toContain('chmod +r locked.txt');
    expect((await step(h, 'chmod +r locked.txt')).stdout).toContain('cat locked.txt');
  });

  it('lesson 6 (sudo): read a root-only file by borrowing root with sudo', async () => {
    const h = await tutorialAt('00f-becoming-root');
    // Reading the root-owned file directly is refused.
    expect((await step(h, 'cat /root/flag.txt')).stderr).toContain('Permission denied');
    await step(h, 'whoami');
    await step(h, 'id');
    // sudo prompts for the player's own password; answer it, then the flag appears.
    h.take();
    await h.game.shell.submit('sudo cat /root/flag.txt');
    expect(h.game.shell.inputRequest.kind).toBe('read');
    await h.game.shell.submit(PWF);
    await h.game.shell.whenReady();
    expect(h.take().stdout).toContain(FLAGF);
    const submitOut = await step(h, `submit ${FLAGF}`);
    expect(submitOut.stdout).toContain('Level captured!');
    expect(h.game.status().completed).toBe(true);
  });

  it('lesson 6 coaches: a denied cat points at sudo', async () => {
    const h = await tutorialAt('00f-becoming-root');
    expect((await step(h, 'cat /root/flag.txt')).stdout).toContain('sudo cat /root/flag.txt');
  });

  it('coaching keeps non-ASCII intact (Hebrew, em dashes) through the UTF-8 byte pipe', async () => {
    const h = await tutorialAt('00f-becoming-root');
    h.game.setLocale('he');
    // The Hebrew coaching must survive the encode-in / decode-out round trip verbatim.
    expect((await step(h, 'whoami')).stdout).toContain('בדקו את הקבוצות');
  });

  it('lesson 6 rejects reading the root file without sudo', async () => {
    const h = await tutorialAt('00f-becoming-root');
    const denied = await step(h, SHORTF[0]!);
    expect(denied.stderr).toContain('Permission denied');
    expect(h.game.status().completed).toBe(false);
  });

  it('lesson 7 (find): locate a buried file by name and read it', async () => {
    const h = await tutorialAt('00g-finding-files');
    let captured = false;
    for (const cmd of SOLG) {
      const out = await step(h, cmd);
      if (cmd.startsWith('find')) expect(out.stdout).toContain('archive/2023/backups/vault.bak');
      if (cmd.startsWith('cat')) expect(out.stdout).toContain(FLAGG);
      if (cmd.startsWith('submit')) captured = out.stdout.includes('Level captured!');
    }
    expect(captured).toBe(true);
    expect(h.game.status().completed).toBe(true);
  });

  it('lesson 7 coaches: hunting by hand steers to find, then to cat', async () => {
    const h = await tutorialAt('00g-finding-files');
    expect((await step(h, 'ls')).stdout).toContain('find . -name vault.bak');
    expect((await step(h, 'find . -name vault.bak')).stdout).toContain(
      'cat ./archive/2023/backups/vault.bak',
    );
  });

  it('lesson 7: the target is not sitting in the home directory', async () => {
    const h = await tutorialAt('00g-finding-files');
    // A naive cat in the home dir fails — the file really is buried.
    const out = await step(h, 'cat vault.bak');
    expect(out.stderr).toContain('No such file or directory');
    expect(h.game.status().completed).toBe(false);
  });

  it('lesson 8 (file management): mkdir, cp, mv and rm restore the backup', async () => {
    const h = await tutorialAt('00h-making-files');
    let captured = false;
    for (const cmd of SOLH) {
      const out = await step(h, cmd);
      // The safe opens (and prints the flag) on the rename to vault/flag.txt.
      if (cmd.startsWith('mv')) expect(out.stdout).toContain(FLAGH);
      if (cmd.startsWith('submit')) captured = out.stdout.includes('Level captured!');
    }
    expect(captured).toBe(true);
    expect(h.game.status().completed).toBe(true);
  });

  it('lesson 8 coaches each step: mkdir -> cp -> mv', async () => {
    const h = await tutorialAt('00h-making-files');
    expect((await step(h, 'mkdir vault')).stdout).toContain('cp data.dat vault/');
    expect((await step(h, 'cp data.dat vault/')).stdout).toContain(
      'mv vault/data.dat vault/flag.txt',
    );
  });

  it('lesson 8 cannot be shortcut: the flag lives in no file to cat', async () => {
    const h = await tutorialAt('00h-making-files');
    const out = await step(h, SHORTH[0]!);
    expect(out.stdout).not.toContain(FLAGH);
    expect(h.game.status().completed).toBe(false);
  });

  it('lesson 9 (text processing): sort | uniq collapses the log and unlocks the flag', async () => {
    const h = await tutorialAt('00i-text-processing');
    let captured = false;
    for (const cmd of SOLI) {
      const out = await step(h, cmd);
      // The console reveals the flag when the duplicates are collapsed with uniq.
      if (cmd.includes('uniq')) expect(out.stdout).toContain(FLAGI);
      if (cmd.startsWith('submit')) captured = out.stdout.includes('Level captured!');
    }
    expect(captured).toBe(true);
    expect(h.game.status().completed).toBe(true);
  });

  it('lesson 9 coaches: wc points to the pipeline, a bare sort points at uniq', async () => {
    const h = await tutorialAt('00i-text-processing');
    expect((await step(h, 'wc -l sessions.log')).stdout).toContain('uniq');
    expect((await step(h, 'sort sessions.log')).stdout).toContain('uniq');
  });

  it('lesson 9 cannot be shortcut: cat floods but shows no flag', async () => {
    const h = await tutorialAt('00i-text-processing');
    const out = await step(h, SHORTI[0]!);
    expect(out.stdout).not.toContain(FLAGI);
    expect(h.game.status().completed).toBe(false);
  });

  it('lesson 10 (processes): ps finds the miner, kill -9 ends it and reveals the flag', async () => {
    const h = await tutorialAt('00j-processes');
    let captured = false;
    for (const cmd of SOLJ) {
      const out = await step(h, cmd);
      if (cmd === 'ps aux') expect(out.stdout).toContain('kdevtmpfsi');
      // A polite kill leaves the stubborn miner running: no flag yet.
      if (cmd === 'kill 1337') expect(out.stdout).not.toContain(FLAGJ);
      // SIGKILL ends it and the console prints the flag.
      if (cmd === 'kill -9 1337') expect(out.stdout).toContain(FLAGJ);
      if (cmd.startsWith('submit')) captured = out.stdout.includes('Level captured!');
    }
    expect(captured).toBe(true);
    expect(h.game.status().completed).toBe(true);
  });

  it('lesson 10 coaches: ps aux points at the miner, a polite kill points at kill -9', async () => {
    const h = await tutorialAt('00j-processes');
    expect((await step(h, 'ps aux')).stdout).toContain('kill 1337');
    expect((await step(h, 'kill 1337')).stdout).toContain('kill -9 1337');
    // And the miner really is still running after the polite kill.
    expect((await step(h, 'ps aux')).stdout).toContain('kdevtmpfsi');
  });

  it('lesson 10 cannot be shortcut: ps shows the miner but never the flag', async () => {
    const h = await tutorialAt('00j-processes');
    const out = await step(h, SHORTJ[0]!);
    expect(out.stdout).not.toContain(FLAGJ);
    expect(h.game.status().completed).toBe(false);
  });

  it('lesson 11 (environment): export the required variable to run the tool', async () => {
    const h = await tutorialAt('00k-environment');
    let captured = false;
    for (const cmd of SOLK) {
      const out = await step(h, cmd);
      if (cmd === 'cat config.txt') expect(out.stdout).toContain('unlock-2026');
      // Exporting the correct variable unlocks the tool and prints the flag.
      if (cmd.startsWith('export')) expect(out.stdout).toContain(FLAGK);
      if (cmd.startsWith('submit')) captured = out.stdout.includes('Level captured!');
    }
    expect(captured).toBe(true);
    expect(h.game.status().completed).toBe(true);
  });

  it('lesson 11: the exported variable is readable with echo $VAR', async () => {
    const h = await tutorialAt('00k-environment');
    await step(h, 'export BACKUP_KEY=unlock-2026');
    expect((await step(h, 'echo $BACKUP_KEY')).stdout).toContain('unlock-2026');
  });

  it('lesson 11 coaches: env points at config, the wrong value is corrected', async () => {
    const h = await tutorialAt('00k-environment');
    expect((await step(h, 'env')).stdout).toContain('BACKUP_KEY');
    const wrong = await step(h, 'export BACKUP_KEY=guess');
    expect(wrong.stdout).toContain('config.txt');
    expect(wrong.stdout).not.toContain(FLAGK);
  });

  it('lesson 11 cannot be shortcut: config holds the key value, not the flag', async () => {
    const h = await tutorialAt('00k-environment');
    const out = await step(h, SHORTK[0]!);
    expect(out.stdout).not.toContain(FLAGK);
    expect(h.game.status().completed).toBe(false);
  });
});
