import { isFsError, strerror } from '../errors';
import { type RegexDialect, RegexError, translateRegex } from './regex';
import type { ByteString } from '../util/bytes';
import { parseOptions } from './args';
import { defineCommand } from './define';
import type { CommandContext } from './types';
import { splitLines } from './util';

interface GrepOptions {
  ignoreCase: boolean;
  invert: boolean;
  number: boolean;
  count: boolean;
  filesWithMatches: boolean;
  filesWithout: boolean;
  wordRegexp: boolean;
  lineRegexp: boolean;
  onlyMatching: boolean;
  quiet: boolean;
  withName: boolean;
  noName: boolean;
  fixed: boolean;
  extended: boolean;
  color: boolean;
  maxCount: number | null;
}

const MATCH = '\x1b[01;31m';
const RESET = '\x1b[0m';
const FILE_COLOR = '\x1b[35m';
const LINE_COLOR = '\x1b[32m';
const SEP_COLOR = '\x1b[36m';

interface Source {
  label: string;
  data: ByteString;
}

class Grep {
  status = 1;
  private readonly ctx: CommandContext;
  private readonly options: GrepOptions;
  private readonly patterns: RegExp[];
  private readonly showName: boolean;

  constructor(ctx: CommandContext, options: GrepOptions, patterns: RegExp[], showName: boolean) {
    this.ctx = ctx;
    this.options = options;
    this.patterns = patterns;
    this.showName = showName;
  }

  private matches(line: string): { matched: boolean; ranges: [number, number][] } {
    const ranges: [number, number][] = [];
    for (const pattern of this.patterns) {
      pattern.lastIndex = 0;
      if (pattern.global) {
        for (let m = pattern.exec(line); m; m = pattern.exec(line)) {
          ranges.push([m.index, m.index + m[0].length]);
          if (m[0].length === 0) pattern.lastIndex += 1;
        }
      } else if (pattern.test(line)) {
        return { matched: true, ranges };
      }
    }
    return { matched: ranges.length > 0, ranges };
  }

  private highlight(line: string, ranges: [number, number][]): string {
    if (!this.options.color || ranges.length === 0) return line;
    const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
    let out = '';
    let cursor = 0;
    for (const [start, end] of sorted) {
      if (start < cursor) continue;
      out += line.slice(cursor, start) + MATCH + line.slice(start, end) + RESET;
      cursor = end;
    }
    return out + line.slice(cursor);
  }

  private prefix(label: string, lineNo: number | null): string {
    const o = this.options;
    const c = o.color;
    let out = '';
    if (this.showName)
      out += (c ? FILE_COLOR + label + RESET : label) + (c ? SEP_COLOR + ':' + RESET : ':');
    if (o.number && lineNo !== null)
      out +=
        (c ? LINE_COLOR + String(lineNo) + RESET : String(lineNo)) +
        (c ? SEP_COLOR + ':' + RESET : ':');
    return out;
  }

  search(source: Source): boolean {
    const o = this.options;
    const lines = splitLines(source.data);
    let count = 0;
    const output: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      const result = this.matches(line);
      const hit = result.matched !== o.invert;
      if (!hit) continue;
      count += 1;
      this.status = 0;
      if (o.quiet || o.count || o.filesWithMatches || o.filesWithout) {
        if (o.quiet || o.filesWithMatches) break;
        if (o.maxCount !== null && count >= o.maxCount) break;
        continue;
      }
      if (o.onlyMatching && !o.invert) {
        for (const [start, end] of result.ranges) {
          output.push(
            `${this.prefix(source.label, i + 1)}${this.highlight(line.slice(start, end), [[0, end - start]])}`,
          );
        }
      } else {
        output.push(
          `${this.prefix(source.label, i + 1)}${o.invert ? line : this.highlight(line, result.ranges)}`,
        );
      }
      if (o.maxCount !== null && count >= o.maxCount) break;
    }
    const matched = count > 0;
    if (o.quiet) return matched;
    if (o.count) {
      this.ctx.stdout(`${this.showName ? this.prefix(source.label, null) : ''}${count}\n`);
    } else if (o.filesWithMatches) {
      if (matched) this.ctx.stdout(`${source.label}\n`);
    } else if (o.filesWithout) {
      if (!matched) this.ctx.stdout(`${source.label}\n`);
    } else {
      for (const line of output) this.ctx.stdout(`${line}\n`);
    }
    return matched;
  }
}

export const grep = defineCommand({
  name: 'grep',
  kind: 'binary',
  description: 'print lines that match patterns',
  usage: ['[OPTION]... PATTERNS [FILE]...'],
  about:
    'Search each FILE for lines matching a PATTERN (a basic regular expression by\ndefault). With no FILE, or when FILE is -, read standard input. grep is the\nworkhorse for finding things in logs and configuration files.',
  options: [
    ['-i, --ignore-case', 'ignore case distinctions'],
    ['-v, --invert-match', 'select non-matching lines'],
    ['-n, --line-number', 'print line number with output lines'],
    ['-c, --count', 'print only a count of matching lines per FILE'],
    ['-r, --recursive', 'search directories recursively'],
    ['-l, --files-with-matches', 'print only names of FILEs with selected lines'],
    ['-L, --files-without-match', 'print only names of FILEs with no selected lines'],
    ['-o, --only-matching', 'show only the part of a line matching PATTERN'],
    ['-w, --word-regexp', 'match only whole words'],
    ['-x, --line-regexp', 'match only whole lines'],
    ['-E, --extended-regexp', 'PATTERNS are extended regular expressions'],
    ['-F, --fixed-strings', 'PATTERNS are strings, not regular expressions'],
    ['-e, --regexp=PATTERNS', 'use PATTERNS for matching'],
    ['-H, --with-filename', 'print the file name for each match'],
    ['-h, --no-filename', 'suppress the file name prefix on output'],
    ['-m, --max-count=NUM', 'stop after NUM selected lines'],
    ['-q, --quiet, --silent', 'suppress all normal output'],
    ['    --color[=WHEN]', 'highlight matches; WHEN is always, never or auto'],
  ],
  details:
    'Combine grep with pipes to filter other commands, for example:\n  cat /var/log/auth.log | grep "Failed password"\n  grep -rn TODO .\nA basic regular expression treats . as any character, ^ and $ as line anchors,\nand [...] as a character class. With -E you also get +, ?, | and ().',
  examples: [
    ['grep "Failed password" auth.log', 'find failed login attempts'],
    ['grep -i error *.log', 'search several files, ignoring case'],
    ['grep -rn TODO src', 'search a directory tree, showing line numbers'],
    ['ps aux | grep ssh', 'filter another command’s output'],
  ],
  seeAlso: ['egrep(1)', 'sed(1)', 'find(1)', 'cut(1)'],
  run: async (ctx) => {
    const outcome = parseOptions(
      ctx.name,
      ctx.args,
      [
        { short: 'i', long: 'ignore-case' },
        { short: 'v', long: 'invert-match' },
        { short: 'n', long: 'line-number' },
        { short: 'c', long: 'count' },
        { short: 'r', long: 'recursive' },
        { short: 'R', key: 'recursive' },
        { short: 'l', long: 'files-with-matches' },
        { short: 'L', long: 'files-without-match' },
        { short: 'o', long: 'only-matching' },
        { short: 'w', long: 'word-regexp' },
        { short: 'x', long: 'line-regexp' },
        { short: 'E', long: 'extended-regexp' },
        { short: 'F', long: 'fixed-strings' },
        { short: 'e', long: 'regexp', arg: 'required' },
        { short: 'H', long: 'with-filename' },
        { short: 'h', long: 'no-filename' },
        { short: 'm', long: 'max-count', arg: 'required' },
        { short: 'q', long: 'quiet' },
        { long: 'silent', key: 'quiet' },
        { long: 'color', arg: 'optional' },
        { long: 'colour', arg: 'optional', key: 'color' },
      ],
      {
        unsupported: [
          'A',
          'B',
          'C',
          'f',
          'P',
          'G',
          'a',
          'I',
          'z',
          's',
          'context',
          'perl-regexp',
          'include',
          'exclude',
          'binary-files',
        ],
      },
    );
    if (!outcome.ok) {
      ctx.stderr(outcome.message);
      return 2;
    }
    const o = outcome.options;
    const patternStrings: string[] = o.values('regexp');
    const operands = [...o.operands];
    if (patternStrings.length === 0) {
      const first = operands.shift();
      if (first === undefined) {
        ctx.stderr(
          `Usage: grep [OPTION]... PATTERNS [FILE]...\nTry 'grep --help' for more information.\n`,
        );
        return 2;
      }
      patternStrings.push(first);
    }

    const maxText = o.value('max-count');
    const maxCount = maxText === undefined ? null : Number(maxText);
    if (maxText !== undefined && (!/^-?\d+$/.test(maxText) || maxCount === null || maxCount < 0)) {
      ctx.stderr(`grep: ${maxText}: invalid max count\n`);
      return 2;
    }
    const when = o.value('color') ?? (o.has('color') ? 'always' : 'never');
    const color =
      ['always', 'yes', 'force'].includes(when) ||
      (['auto', 'tty'].includes(when) && ctx.tty.stdoutIsTTY);

    const options: GrepOptions = {
      ignoreCase: o.has('ignore-case'),
      invert: o.has('invert-match'),
      number: o.has('line-number'),
      count: o.has('count'),
      filesWithMatches: o.has('files-with-matches'),
      filesWithout: o.has('files-without-match'),
      wordRegexp: o.has('word-regexp'),
      lineRegexp: o.has('line-regexp'),
      onlyMatching: o.has('only-matching') && !o.has('invert-match'),
      quiet: o.has('quiet'),
      withName: o.has('with-filename'),
      noName: o.has('no-filename'),
      fixed: o.has('fixed-strings'),
      extended: o.has('extended-regexp'),
      color: color && !o.has('count') && !o.has('files-with-matches'),
      maxCount: maxCount !== null && maxCount >= 0 ? maxCount : null,
    };

    const global = options.onlyMatching || options.color;
    const flags = `s${options.ignoreCase ? 'i' : ''}${global ? 'g' : ''}`;
    const dialect: RegexDialect = options.fixed ? 'fixed' : options.extended ? 'extended' : 'basic';
    const patterns: RegExp[] = [];
    for (const raw of patternStrings.flatMap((p) => p.split('\n'))) {
      let source: string;
      try {
        source = translateRegex(raw, dialect);
      } catch (error) {
        ctx.stderr(
          `grep: ${error instanceof RegexError ? error.message : 'Invalid regular expression'}\n`,
        );
        return 2;
      }
      if (options.wordRegexp) source = `(?<![A-Za-z0-9_])(?:${source})(?![A-Za-z0-9_])`;
      if (options.lineRegexp) source = `^(?:${source})$`;
      try {
        patterns.push(new RegExp(source, flags));
      } catch {
        ctx.stderr(`grep: ${raw}: Invalid regular expression\n`);
        return 2;
      }
    }

    const recursive = o.has('recursive');
    const sources: Source[] = [];
    const fileErrors = { any: false };
    if (operands.length === 0) {
      if (recursive) operands.push('.');
      else {
        const data = await ctx.stdin.readAll();
        if (data === null) return 130;
        sources.push({ label: '(standard input)', data });
      }
    }
    for (const name of operands) {
      if (name === '-') {
        const data = await ctx.stdin.readAll();
        if (data === null) return 130;
        sources.push({ label: '(standard input)', data });
      } else {
        collect(ctx, name, recursive, sources, () => {
          fileErrors.any = true;
        });
      }
    }
    if (ctx.tty.interrupted) return 130;

    const showName = options.withName || (!options.noName && (sources.length > 1 || recursive));
    const grepper = new Grep(ctx, options, patterns, showName);
    for (const source of sources) {
      if (grepper.search(source) && options.quiet) return 0;
    }
    if (fileErrors.any) return 2;
    return grepper.status;
  },
});

function collect(
  ctx: CommandContext,
  name: string,
  recursive: boolean,
  sources: Source[],
  onError: () => void,
): void {
  try {
    const stat = ctx.fs.stat(name);
    if (stat.type === 'dir') {
      if (!recursive) {
        ctx.stderr(`grep: ${name}: Is a directory\n`);
        onError();
        return;
      }
      for (const child of ctx.fs.readdir(name).sort()) {
        collect(
          ctx,
          name.endsWith('/') ? `${name}${child}` : `${name}/${child}`,
          recursive,
          sources,
          onError,
        );
      }
      return;
    }
    sources.push({ label: name, data: ctx.fs.readFile(name) });
  } catch (error) {
    if (!isFsError(error)) throw error;
    ctx.stderr(`grep: ${name}: ${strerror(error.code)}\n`);
    onError();
  }
}
