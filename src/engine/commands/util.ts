import { type Errno, isFsError, strerror } from '../errors';
import { type ByteString, utf8Encode } from '../util/bytes';
import type { CommandContext } from './types';

/** Characters coreutils' shell-escape quoting leaves unquoted. */
const SAFE = /^[A-Za-z0-9_./:@%^+=,~-]+$/;

/** `'name'`, escaping embedded quotes the way a shell would read them back. */
export function quoteAlways(name: string): string {
  return `'${name.replace(/'/g, "'\\''")}'`;
}

/** coreutils `quotef`: quote only names that need it (`cat: 'my file': …`). */
export function quoteIfNeeded(name: string): string {
  return SAFE.test(name) ? name : quoteAlways(name);
}

/** coreutils `quote()` in a UTF-8 locale: ‘name’ (as UTF-8 bytes). */
export function localeQuote(name: string): ByteString {
  return `\xe2\x80\x98${name}\xe2\x80\x99`;
}

export function errnoOf(error: unknown): Errno | null {
  return isFsError(error) ? error.code : null;
}

/** strerror text for a filesystem error; rethrows anything else. */
export function errorText(error: unknown): string {
  if (isFsError(error)) return strerror(error.code);
  throw error;
}

/** Writes text (UTF-8 encoded) to stdout. */
export function print(ctx: CommandContext, text: string): void {
  ctx.stdout(utf8Encode(text));
}

export function printError(ctx: CommandContext, text: string): void {
  ctx.stderr(utf8Encode(text));
}

/** Splits data into lines without their newlines; a final newline does not add an empty line. */
export function splitLines(data: ByteString): string[] {
  if (data === '') return [];
  const lines = data.split('\n');
  if (data.endsWith('\n')) lines.pop();
  return lines;
}

export type InputResult = { ok: true; data: ByteString } | { ok: false; errno: Errno };

/** Reads a file operand, or stdin for `-`. Null data means the read was interrupted. */
export async function readOperand(
  ctx: CommandContext,
  operand: string,
): Promise<InputResult | null> {
  if (operand === '-') {
    const data = await ctx.stdin.readAll();
    return data === null ? null : { ok: true, data };
  }
  try {
    return { ok: true, data: ctx.fs.readFile(operand) };
  } catch (error) {
    const errno = errnoOf(error);
    if (errno === null) throw error;
    return { ok: false, errno };
  }
}

/**
 * Bash builtin option parsing: letters from `allowed`, `--` ends options, and errors in bash's
 * format (`bash: cd: -x: invalid option` then `cd: usage: …`).
 */
export function parseBuiltinOptions(
  ctx: CommandContext,
  allowed: string,
  usage: string,
): { flags: Set<string>; operands: string[] } | null {
  const flags = new Set<string>();
  const args = [...ctx.args];
  while (args.length > 0) {
    const arg = args[0] ?? '';
    if (arg === '--') {
      args.shift();
      break;
    }
    if (!arg.startsWith('-') || arg === '-') break;
    for (const letter of arg.slice(1)) {
      if (!allowed.includes(letter)) {
        ctx.stderr(`bash: ${ctx.name}: -${letter}: invalid option\n${ctx.name}: usage: ${usage}\n`);
        return null;
      }
      flags.add(letter);
    }
    args.shift();
  }
  return { flags, operands: args };
}

export const isIdentifier = (name: string): boolean => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);

/** Looks a command up in a PATH string, as `env`, `sudo` and `which` do. */
export function findInPath(ctx: CommandContext, name: string, path: string): string | null {
  if (name.includes('/')) return ctx.fs.exists(name, true) ? name : null;
  for (const directory of path.split(':')) {
    const candidate = `${directory === '' ? '.' : directory.replace(/\/+$/, '')}/${name}`;
    try {
      if (ctx.fs.stat(candidate).type === 'file' && ctx.fs.access(candidate, 'x')) return candidate;
    } catch {
      // not here
    }
  }
  return null;
}

/** Wraps text to `width` columns on spaces. */
export function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraphLine of text.split('\n')) {
    let line = '';
    for (const word of paragraphLine.split(/ +/)) {
      if (word === '') continue;
      if (line !== '' && line.length + 1 + word.length > width) {
        lines.push(line);
        line = word;
      } else {
        line = line === '' ? word : `${line} ${word}`;
      }
    }
    lines.push(line);
  }
  return lines;
}
