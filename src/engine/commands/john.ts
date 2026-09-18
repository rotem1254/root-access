import { type DigestName, digestHex, identifyHash } from '../crypto/digest';
import { strerror } from '../errors';
import { parseOptions } from './args';
import { defineCommand } from './define';
import type { CommandContext } from './types';
import { readOperand, splitLines } from './util';

/** One line of a hash file: either `user:hash` or a bare hash. */
interface HashEntry {
  user: string | null;
  hash: string;
}

function parseHashFile(text: string): HashEntry[] {
  const entries: HashEntry[] = [];
  for (const line of splitLines(text)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const colon = trimmed.indexOf(':');
    if (colon > 0) {
      const hash = trimmed.slice(colon + 1).split(':')[0] ?? '';
      if (identifyHash(hash).looksLikeHash) {
        entries.push({ user: trimmed.slice(0, colon), hash: hash.toLowerCase() });
        continue;
      }
    }
    if (identifyHash(trimmed).looksLikeHash)
      entries.push({ user: null, hash: trimmed.toLowerCase() });
  }
  return entries;
}

/** john appends cracked hashes to ~/.john/john.pot, so `--show` can reprint them. */
function potPath(ctx: CommandContext): string {
  const home = ctx.env.get('HOME') ?? '/';
  return `${home}/.john/john.pot`;
}

function readPot(ctx: CommandContext): Map<string, string> {
  const cracked = new Map<string, string>();
  try {
    for (const line of splitLines(ctx.fs.readFile(potPath(ctx)))) {
      const colon = line.indexOf(':');
      if (colon > 0) cracked.set(line.slice(0, colon).toLowerCase(), line.slice(colon + 1));
    }
  } catch {
    // no pot file yet
  }
  return cracked;
}

function writePot(ctx: CommandContext, cracked: Map<string, string>): void {
  const home = ctx.env.get('HOME') ?? '/';
  try {
    if (!ctx.fs.exists(`${home}/.john`)) ctx.fs.mkdir(`${home}/.john`);
    const body = [...cracked].map(([hash, password]) => `${hash}:${password}`).join('\n');
    ctx.fs.writeFile(potPath(ctx), body === '' ? '' : `${body}\n`);
  } catch {
    // a read-only home just means results are not remembered
  }
}

export const john = defineCommand({
  name: 'john',
  kind: 'binary',
  description: 'John the Ripper password cracker',
  usage: ['[--wordlist=FILE] [--format=NAME] HASHFILE', '--show HASHFILE'],
  about:
    'Recover passwords from their hashes by trying candidates from a wordlist.\nA hash cannot be reversed — cracking means hashing guesses and comparing. That\nis why a long, unusual password is safe and a common one is not.',
  options: [
    ['--wordlist=FILE', 'try the passwords in FILE (one per line)'],
    ['--format=NAME', 'the hash format: raw-md5, raw-sha1, raw-sha256'],
    ['--show', 'show the passwords cracked earlier for this file'],
  ],
  details:
    'A typical run:\n  john --wordlist=rockyou.txt --format=raw-md5 hashes.txt\n  john --show hashes.txt\n\nThe hash file may be bare hashes, one per line, or `user:hash` lines. If you do\nnot pass --format, john guesses from the hash length — 32 hex characters is MD5,\n40 is SHA-1, 64 is SHA-256.\n\nCracked results are remembered in ~/.john/john.pot, which is what --show reads.',
  examples: [
    ['john --wordlist=words.txt hashes.txt', 'crack hashes with a wordlist'],
    ['john --show hashes.txt', 'print what was already cracked'],
  ],
  seeAlso: ['md5sum(1)', 'sha256sum(1)', 'openssl(1)'],
  run: async (ctx) => {
    const outcome = parseOptions(
      ctx.name,
      ctx.args,
      [
        { long: 'wordlist', arg: 'required' },
        { long: 'format', arg: 'required' },
        { long: 'show' },
      ],
      { unsupported: ['incremental', 'rules', 'fork', 'single'] },
    );
    if (!outcome.ok) {
      ctx.stderr(outcome.message);
      return 1;
    }
    const o = outcome.options;
    const target = o.operands[0];
    if (target === undefined) {
      ctx.stderr('Usage: john [OPTIONS] [PASSWORD-FILES]\n');
      return 1;
    }
    const hashFile = await readOperand(ctx, target);
    if (hashFile === null) return 130;
    if (!hashFile.ok) {
      ctx.stderr(`Error: file ${target} ${strerror(hashFile.errno)}\n`);
      return 1;
    }
    const entries = parseHashFile(hashFile.data);
    if (entries.length === 0) {
      ctx.stderr(`No password hashes loaded (see FAQ)\n`);
      return 1;
    }
    const pot = readPot(ctx);

    if (o.has('show')) {
      let shown = 0;
      for (const entry of entries) {
        const password = pot.get(entry.hash);
        if (password === undefined) continue;
        shown += 1;
        ctx.stdout(`${entry.user ?? '?'}:${password}\n`);
      }
      ctx.stdout(
        `\n${shown} password hash${shown === 1 ? '' : 'es'} cracked, ${entries.length - shown} left\n`,
      );
      return 0;
    }

    // Decide the hash format: --format wins, otherwise guess from the digest length.
    const formatArg = o.value('format');
    let format: DigestName | null;
    if (formatArg !== undefined) {
      const name = formatArg.replace(/^raw-/, '').toLowerCase();
      const known: Record<string, DigestName> = {
        md5: 'md5',
        sha1: 'sha1',
        sha256: 'sha256',
        sha512: 'sha512',
      };
      format = known[name] ?? null;
      if (format === null) {
        ctx.stderr(`Unknown ciphertext format name requested: ${formatArg}\n`);
        return 1;
      }
    } else {
      const first = entries[0];
      format = first ? (identifyHash(first.hash).candidates[0] ?? null) : null;
      if (format === null) {
        ctx.stderr('No password hashes loaded (see FAQ)\n');
        return 1;
      }
    }

    const wordlistPath = o.value('wordlist');
    if (wordlistPath === undefined) {
      ctx.stderr('Incremental mode is not available in this simulation; pass --wordlist=FILE\n');
      return 1;
    }
    const wordlist = await readOperand(ctx, wordlistPath);
    if (wordlist === null) return 130;
    if (!wordlist.ok) {
      ctx.stderr(`Error: file ${wordlistPath} ${strerror(wordlist.errno)}\n`);
      return 1;
    }

    ctx.stdout(`Using default input encoding: UTF-8\n`);
    ctx.stdout(
      `Loaded ${entries.length} password hash${entries.length === 1 ? '' : 'es'} (raw-${format} [${format.toUpperCase()} 128/128])\n`,
    );
    ctx.stdout("Press 'q' or Ctrl-C to abort, almost any other key for status\n");

    const words = splitLines(wordlist.data);
    const remaining = new Map<string, HashEntry>();
    for (const entry of entries) if (!pot.has(entry.hash)) remaining.set(entry.hash, entry);
    let crackedNow = 0;
    for (const word of words) {
      if (remaining.size === 0) break;
      if (ctx.tty.interrupted) return 130;
      const candidate = word.trim();
      if (candidate === '') continue;
      const digest = digestHex(format, candidate);
      const entry = remaining.get(digest);
      if (entry) {
        ctx.stdout(`${candidate.padEnd(16)} (${entry.user ?? '?'})\n`);
        pot.set(digest, candidate);
        remaining.delete(digest);
        crackedNow += 1;
      }
    }
    writePot(ctx, pot);
    ctx.stdout(
      `${crackedNow}g 0:00:00:01 DONE (2026-03-14 09:00) ${crackedNow}g/s ${words.length}p/s\n`,
    );
    ctx.stdout(`Use the "--show" option to display all of the cracked passwords reliably\n`);
    ctx.stdout('Session completed.\n');
    return 0;
  },
});
