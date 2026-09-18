import { isFsError, strerror } from '../errors';
import { applySymbolicMode, parseOctalMode, PERMISSION_BITS } from '../fs/mode';
import { basename } from '../fs/path';
import type { Stat } from '../fs/types';
import { matchGlob } from '../shell/glob';
import { defineCommand } from './define';
import type { CommandContext } from './types';

/** A node reached during the walk. */
interface Entry {
  path: string;
  name: string;
  depth: number;
  stat: Stat;
}

type Predicate = (entry: Entry) => boolean;

const TYPE_LETTERS: Readonly<Record<string, Stat['type'] | 'chardev'>> = {
  f: 'file',
  d: 'dir',
  l: 'symlink',
  c: 'chardev',
};

class ParseError extends Error {}

/** Parses and evaluates a find expression (the classic recursive-descent over -a/-o/!/()). */
class ExpressionParser {
  private pos = 0;
  hasAction = false;
  private readonly ctx: CommandContext;
  private readonly tokens: string[];

  constructor(ctx: CommandContext, tokens: string[]) {
    this.ctx = ctx;
    this.tokens = tokens;
  }

  parse(): Predicate {
    if (this.tokens.length === 0) return () => true;
    const predicate = this.parseOr();
    if (this.pos < this.tokens.length) {
      throw new ParseError(`paths must precede expression: \`${this.tokens[this.pos] ?? ''}'`);
    }
    return predicate;
  }

  private peek(): string | undefined {
    return this.tokens[this.pos];
  }

  private parseOr(): Predicate {
    let left = this.parseAnd();
    while (this.peek() === '-o' || this.peek() === '-or') {
      this.pos += 1;
      const right = this.parseAnd();
      const l = left;
      left = (entry) => l(entry) || right(entry);
    }
    return left;
  }

  private parseAnd(): Predicate {
    let left = this.parseFactor();
    for (;;) {
      const token = this.peek();
      if (token === undefined || token === '-o' || token === '-or' || token === ')') break;
      if (token === '-a' || token === '-and') this.pos += 1;
      const right = this.parseFactor();
      const l = left;
      left = (entry) => l(entry) && right(entry);
    }
    return left;
  }

  private parseFactor(): Predicate {
    const token = this.peek();
    if (token === '!' || token === '-not') {
      this.pos += 1;
      const operand = this.parseFactor();
      return (entry) => !operand(entry);
    }
    if (token === '(') {
      this.pos += 1;
      const inner = this.parseOr();
      if (this.peek() !== ')') throw new ParseError("expected expression after `('");
      this.pos += 1;
      return inner;
    }
    return this.parsePrimary();
  }

  private nextArg(name: string): string {
    const arg = this.tokens[this.pos + 1];
    if (arg === undefined) throw new ParseError(`missing argument to \`${name}'`);
    this.pos += 2;
    return arg;
  }

  private parsePrimary(): Predicate {
    const token = this.peek();
    if (token === undefined) throw new ParseError('expected expression');
    switch (token) {
      case '-name':
      case '-iname': {
        const pattern = this.nextArg(token);
        const ci = token === '-iname';
        return (entry) =>
          matchGlob(pattern, entry.name, { dotMatchesWildcard: true, caseInsensitive: ci });
      }
      case '-path':
      case '-ipath':
      case '-wholename': {
        const pattern = this.nextArg(token);
        const ci = token === '-ipath';
        return (entry) =>
          matchGlob(pattern, entry.path, { dotMatchesWildcard: true, caseInsensitive: ci });
      }
      case '-type': {
        const letter = this.nextArg(token);
        const wanted = TYPE_LETTERS[letter];
        if (!wanted) throw new ParseError(`Unknown argument to -type: ${letter}`);
        return (entry) =>
          wanted === 'chardev'
            ? entry.stat.device !== undefined
            : entry.stat.type === wanted && !entry.stat.device;
      }
      case '-perm':
        return this.parsePerm(this.nextArg(token));
      case '-user': {
        const who = this.nextArg(token);
        const uid = /^\d+$/.test(who) ? Number(who) : this.ctx.machine.users.byName(who)?.uid;
        if (uid === undefined) throw new ParseError(`\`${who}' is not the name of a known user`);
        return (entry) => entry.stat.uid === uid;
      }
      case '-group': {
        const who = this.nextArg(token);
        const gid = /^\d+$/.test(who) ? Number(who) : this.ctx.machine.users.groupByName(who)?.gid;
        if (gid === undefined)
          throw new ParseError(`\`${who}' is not the name of an existing group`);
        return (entry) => entry.stat.gid === gid;
      }
      case '-size':
        return this.parseSize(this.nextArg(token));
      case '-empty':
        this.pos += 1;
        return (entry) => {
          if (entry.stat.type !== 'dir') return entry.stat.size === 0;
          try {
            return this.ctx.fs.readdir(entry.path).length === 0;
          } catch {
            return false;
          }
        };
      case '-newer': {
        const reference = this.nextArg(token);
        let refTime = 0;
        try {
          refTime = this.ctx.fs.stat(reference).mtime;
        } catch {
          throw new ParseError(`\`${reference}': No such file or directory`);
        }
        return (entry) => entry.stat.mtime > refTime;
      }
      case '-print':
        this.pos += 1;
        this.hasAction = true;
        return (entry) => {
          this.ctx.stdout(`${entry.path}\n`);
          return true;
        };
      case '-print0':
        this.pos += 1;
        this.hasAction = true;
        return (entry) => {
          this.ctx.stdout(`${entry.path}\x00`);
          return true;
        };
      case '-delete':
        this.pos += 1;
        this.hasAction = true;
        return () => {
          throw new ParseError('-delete is not supported in this simulation');
        };
      case '-prune':
        this.pos += 1;
        return () => true;
      default:
        if (token.startsWith('-')) throw new ParseError(`unknown predicate \`${token}'`);
        throw new ParseError(`paths must precede expression: \`${token}'`);
    }
  }

  private parsePerm(spec: string): Predicate {
    let match: 'exact' | 'all' | 'any' = 'exact';
    let body = spec;
    if (body.startsWith('-')) {
      match = 'all';
      body = body.slice(1);
    } else if (body.startsWith('/')) {
      match = 'any';
      body = body.slice(1);
    }
    let bits = parseOctalMode(body);
    if (bits === null) {
      const symbolic = applySymbolicMode(body, 0, { isDirectory: false, umask: 0 });
      if (symbolic === null) throw new ParseError(`invalid mode \`${spec}'`);
      bits = symbolic;
    }
    const wanted = bits;
    return (entry) => {
      const mode = entry.stat.mode & PERMISSION_BITS;
      if (match === 'exact') return mode === wanted;
      if (match === 'all') return (mode & wanted) === wanted;
      return wanted === 0 || (mode & wanted) !== 0;
    };
  }

  private parseSize(spec: string): Predicate {
    const match = /^([+-]?)(\d+)([bckwMG]?)$/.exec(spec);
    if (!match) throw new ParseError(`invalid -size type \`${spec.slice(-1)}'`);
    const sign = match[1];
    const units: Record<string, number> = {
      b: 512,
      c: 1,
      k: 1024,
      w: 2,
      M: 1048576,
      G: 1073741824,
      '': 512,
    };
    const unit = units[match[3] ?? ''] ?? 512;
    const value = Number(match[2]) * unit;
    return (entry) => {
      const size = entry.stat.size;
      if (sign === '+') return size > value;
      if (sign === '-') return size < value;
      const blocks = Math.ceil(size / unit) * unit;
      return blocks === value || (unit === 1 && size === value);
    };
  }
}

export const find = defineCommand({
  name: 'find',
  kind: 'binary',
  description: 'search for files in a directory hierarchy',
  usage: ['[PATH...] [EXPRESSION]'],
  about:
    'Search the directory tree rooted at each PATH for files matching EXPRESSION.\nWith no PATH, search the current directory. With no test, print every file.\nfind walks into subdirectories, so it needs execute permission on each one.',
  options: [
    ['-name PATTERN', 'file name (not the path) matches the shell PATTERN'],
    ['-iname PATTERN', 'like -name, but the match is case insensitive'],
    ['-path PATTERN', 'the whole path matches PATTERN'],
    ['-type [f|d|l|c]', 'file is of the given type (regular, directory, symlink, char device)'],
    ['-perm MODE', 'permission bits; -MODE means all of them set, /MODE means any of them'],
    ['-user NAME', 'file is owned by NAME'],
    ['-group NAME', 'file belongs to group NAME'],
    ['-size N[ckMG]', 'file uses N units of space (c bytes, k KiB, M MiB, G GiB)'],
    ['-empty', 'file is empty and is a regular file or directory'],
    ['-newer FILE', 'file was modified more recently than FILE'],
    ['-maxdepth N', 'descend at most N levels below the starting points'],
    ['-mindepth N', 'do not apply tests at levels less than N'],
    ['-print', 'print the full file name (the default action)'],
    ['! EXPR, EXPR -a EXPR, EXPR -o EXPR, ( EXPR )', 'negation, and, or, grouping'],
  ],
  details:
    'find prints an error for each directory it cannot enter, which is normal when\nsearching / as an ordinary user. Redirect those away with 2>/dev/null:\n  find / -perm -o=r -name "*.bak" 2>/dev/null\nfinds every world-readable file whose name ends in .bak. The -perm test with a\nleading - means "at least these bits": -o=r is the other-read bit.',
  examples: [
    ['find . -name "*.log"', 'find log files in and below the current directory'],
    ['find / -perm -4000 -type f 2>/dev/null', 'find setuid programs'],
    ['find /home -user admin 2>/dev/null', "find admin's files"],
  ],
  seeAlso: ['grep(1)', 'ls(1)', 'chmod(1)', 'stat(1)'],
  run: async (ctx) => {
    const args = [...ctx.args];
    const starts: string[] = [];
    let i = 0;
    while (
      i < args.length &&
      !((args[i] ?? '').startsWith('-') || ['(', ')', '!'].includes(args[i] ?? ''))
    ) {
      starts.push(args[i] ?? '');
      i += 1;
    }
    const expressionTokens = args.slice(i);

    let maxDepth = Infinity;
    let minDepth = 0;
    const filtered: string[] = [];
    for (let j = 0; j < expressionTokens.length; j++) {
      const token = expressionTokens[j];
      if (token === '-maxdepth' || token === '-mindepth') {
        const value = expressionTokens[j + 1];
        if (value === undefined || !/^\d+$/.test(value)) {
          ctx.stderr(`find: expected a positive decimal integer argument to ${token}\n`);
          return 2;
        }
        if (token === '-maxdepth') maxDepth = Number(value);
        else minDepth = Number(value);
        j += 1;
      } else {
        filtered.push(token ?? '');
      }
    }

    let predicate: Predicate;
    let parser: ExpressionParser;
    try {
      parser = new ExpressionParser(ctx, filtered);
      predicate = parser.parse();
    } catch (error) {
      ctx.stderr(`find: ${error instanceof ParseError ? error.message : String(error)}\n`);
      return 2;
    }
    const printByDefault = !parser.hasAction;

    if (starts.length === 0) starts.push('.');
    let status = 0;

    const visit = (path: string, depth: number, stat: Stat): void => {
      if (ctx.tty.interrupted) return;
      const entry: Entry = { path, name: basename(path) || path, depth, stat };
      if (depth >= minDepth && depth <= maxDepth) {
        let keep: boolean;
        try {
          keep = predicate(entry);
        } catch (error) {
          ctx.stderr(`find: ${error instanceof ParseError ? error.message : 'error'}\n`);
          status = 1;
          return;
        }
        if (keep && printByDefault) ctx.stdout(`${path}\n`);
      }
      if (stat.type !== 'dir' || depth >= maxDepth) return;
      let names: string[];
      try {
        names = ctx.fs.readdir(path);
      } catch (error) {
        if (!isFsError(error)) throw error;
        ctx.stderr(`find: '${path}': ${strerror(error.code)}\n`);
        status = 1;
        return;
      }
      for (const name of names.sort()) {
        const childPath = path === '/' ? `/${name}` : `${path}/${name}`;
        let childStat: Stat;
        try {
          childStat = ctx.fs.lstat(childPath);
        } catch {
          continue;
        }
        visit(childPath, depth + 1, childStat);
      }
    };

    for (const start of starts) {
      let stat: Stat;
      try {
        stat = ctx.fs.lstat(start);
      } catch (error) {
        if (!isFsError(error)) throw error;
        ctx.stderr(`find: '${start}': ${strerror(error.code)}\n`);
        status = 1;
        continue;
      }
      visit(start, 0, stat);
    }
    if (ctx.tty.interrupted) return 130;
    return status;
  },
});
