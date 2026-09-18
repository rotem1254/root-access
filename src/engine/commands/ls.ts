import { isFsError, strerror } from '../errors';
import { formatModeString, type ModeFileType, S_ISGID, S_ISUID, S_ISVTX } from '../fs/mode';
import { ROOT_CREDENTIALS } from '../fs/permissions';
import type { Stat } from '../fs/types';
import { compareBytes } from '../shell/glob';
import { formatLsTime, humanSize } from '../util/format';
import { parseOptions } from './args';
import { defineCommand } from './define';
import type { CommandContext } from './types';
import { quoteAlways } from './util';

interface Entry {
  /** Name as listed: the operand, or the directory entry name. */
  name: string;
  /** Path used to reach it. */
  path: string;
  stat: Stat | null;
  /** Type known without permission (like readdir's d_type). */
  type: ModeFileType;
  target?: string;
  targetStat?: Stat | null;
}

interface Options {
  all: boolean;
  almostAll: boolean;
  long: boolean;
  human: boolean;
  directory: boolean;
  onePerLine: boolean;
  reverse: boolean;
  sortTime: boolean;
  sortSize: boolean;
  recursive: boolean;
  classify: boolean;
  numeric: boolean;
  color: boolean;
  tty: boolean;
}

const ARCHIVES = /\.(tar|tgz|gz|zip|bz2|xz|7z|rar|deb|jar|zst)$/;
const IMAGES = /\.(jpe?g|png|gif|bmp|svg|webp)$/;
const AUDIO = /\.(mp3|wav|flac|ogg|m4a)$/;
const SAFE_NAME = /^[A-Za-z0-9_.,:@%+=~^/-]+$/;

function fileType(stat: Stat): ModeFileType {
  if (stat.device) return 'chardev';
  return stat.type;
}

function colorCode(entry: Entry): string | null {
  const { stat } = entry;
  if (entry.type === 'symlink') return entry.targetStat === null ? '40;31;01' : '01;36';
  if (!stat) return entry.type === 'dir' ? '01;34' : null;
  if (stat.device) return '40;33;01';
  if (stat.type === 'dir') {
    const otherWritable = (stat.mode & 0o002) !== 0;
    const sticky = (stat.mode & S_ISVTX) !== 0;
    if (sticky && otherWritable) return '30;42';
    if (otherWritable) return '34;42';
    if (sticky) return '37;44';
    return '01;34';
  }
  if (stat.mode & S_ISUID) return '37;41';
  if (stat.mode & S_ISGID) return '30;43';
  if (stat.mode & 0o111) return '01;32';
  if (ARCHIVES.test(entry.name)) return '01;31';
  if (IMAGES.test(entry.name)) return '01;35';
  if (AUDIO.test(entry.name)) return '00;36';
  return null;
}

function indicator(entry: Entry): string {
  if (entry.type === 'symlink') return '@';
  if (entry.type === 'dir') return '/';
  if (entry.stat?.type === 'file' && !entry.stat.device && entry.stat.mode & 0o111) return '*';
  return '';
}

/** How a name is shown, and how many columns it takes. */
function display(
  entry: Entry,
  options: Options,
  name = entry.name,
): { text: string; width: number } {
  const quoted = options.tty && !SAFE_NAME.test(name) ? quoteAlways(name) : name;
  const suffix = options.classify && !options.long ? indicator(entry) : '';
  const code = options.color ? colorCode(entry) : null;
  const text = code ? `\x1b[${code}m${quoted}\x1b[0m${suffix}` : `${quoted}${suffix}`;
  return { text, width: quoted.length + suffix.length };
}

function blocks(stat: Stat | null): number {
  if (stat?.type === 'dir') return 4;
  if (stat?.type !== 'file' || stat.device) return 0;
  return Math.ceil(stat.size / 4096) * 4;
}

class Lister {
  status = 0;
  private readonly ctx: CommandContext;
  private readonly options: Options;

  constructor(ctx: CommandContext, options: Options) {
    this.ctx = ctx;
    this.options = options;
  }

  private fail(message: string, serious: boolean): void {
    this.ctx.stderr(`ls: ${message}\n`);
    this.status = Math.max(this.status, serious ? 2 : 1);
  }

  /**
   * Builds an entry. Operands that cannot be reached are errors. Entries inside a listable but
   * unsearchable directory (r without x) are shown with unknown details, as real ls does.
   */
  entry(
    name: string,
    path: string,
    follow: boolean,
    needStat: boolean,
    operand: boolean,
  ): Entry | null {
    const { fs } = this.ctx;
    let lstat: Stat;
    try {
      lstat = fs.lstat(path);
    } catch (error) {
      if (!isFsError(error)) throw error;
      const message = `cannot access ${quoteAlways(path)}: ${strerror(error.code)}`;
      if (operand || error.code !== 'EACCES') {
        this.fail(message, operand);
        return null;
      }
      if (needStat) this.fail(message, false);
      let type: ModeFileType;
      try {
        type = fileType(this.ctx.machine.fs.lstat(fs.absolute(path), ROOT_CREDENTIALS));
      } catch {
        type = 'file';
      }
      return { name, path, stat: null, type };
    }
    if (lstat.type === 'symlink') {
      let targetStat: Stat | null;
      try {
        targetStat = fs.stat(path);
      } catch {
        targetStat = null;
      }
      if (follow && targetStat) return { name, path, stat: targetStat, type: fileType(targetStat) };
      return { name, path, stat: lstat, type: 'symlink', target: lstat.target ?? '', targetStat };
    }
    return { name, path, stat: lstat, type: fileType(lstat) };
  }

  sort(entries: Entry[]): Entry[] {
    const { options } = this;
    const sorted = [...entries].sort((a, b) => {
      if (options.sortSize) {
        const diff = (b.stat?.size ?? 0) - (a.stat?.size ?? 0);
        if (diff !== 0) return diff;
      } else if (options.sortTime) {
        const diff = (b.stat?.mtime ?? 0) - (a.stat?.mtime ?? 0);
        if (diff !== 0) return diff;
      }
      return compareBytes(a.name, b.name);
    });
    return options.reverse ? sorted.reverse() : sorted;
  }

  print(entries: Entry[]): void {
    if (entries.length === 0) return;
    if (this.options.long) this.printLong(entries);
    else if (this.options.onePerLine || !this.options.tty) {
      for (const entry of entries) this.ctx.stdout(`${display(entry, this.options).text}\n`);
    } else {
      this.printColumns(entries);
    }
  }

  private printColumns(entries: Entry[]): void {
    const cells = entries.map((entry) => display(entry, this.options));
    const lineWidth = Math.max(1, this.ctx.tty.columns);
    let columns = Math.min(cells.length, Math.max(1, Math.floor(lineWidth / 3)));
    for (; columns > 1; columns--) {
      const rows = Math.ceil(cells.length / columns);
      if (Math.ceil(cells.length / rows) < columns) continue;
      let total = 0;
      for (let column = 0; column < columns; column++) {
        let widest = 0;
        for (let row = 0; row < rows; row++)
          widest = Math.max(widest, cells[column * rows + row]?.width ?? 0);
        total += widest + (column < columns - 1 ? 2 : 0);
      }
      if (total <= lineWidth) break;
    }
    const rows = Math.ceil(cells.length / columns);
    const widths: number[] = [];
    for (let column = 0; column < columns; column++) {
      let widest = 0;
      for (let row = 0; row < rows; row++)
        widest = Math.max(widest, cells[column * rows + row]?.width ?? 0);
      widths.push(widest);
    }
    for (let row = 0; row < rows; row++) {
      let line = '';
      for (let column = 0; column < columns; column++) {
        const cell = cells[column * rows + row];
        if (!cell) continue;
        const isLast = column === columns - 1 || !cells[(column + 1) * rows + row];
        line += isLast
          ? cell.text
          : `${cell.text}${' '.repeat((widths[column] ?? 0) - cell.width + 2)}`;
      }
      this.ctx.stdout(`${line}\n`);
    }
  }

  private printLong(entries: Entry[]): void {
    const { machine } = this.ctx;
    const now = machine.fs.now();
    const rows = entries.map((entry) => {
      const { stat } = entry;
      if (!stat) {
        const typeChar = formatModeString(entry.type, 0).charAt(0);
        return {
          mode: `${typeChar}?????????`,
          links: '?',
          owner: '?',
          group: '?',
          size: '?',
          date: '           ?',
          entry,
        };
      }
      const owner = this.options.numeric ? String(stat.uid) : machine.users.userLabel(stat.uid);
      const group = this.options.numeric ? String(stat.gid) : machine.users.groupLabel(stat.gid);
      const size = stat.device
        ? '1, 3'
        : this.options.human
          ? humanSize(stat.size)
          : String(stat.size);
      return {
        mode: formatModeString(fileType(stat), stat.mode),
        links: String(stat.nlink),
        owner,
        group,
        size,
        date: formatLsTime(stat.mtime, now),
        entry,
      };
    });
    const width = (key: 'links' | 'owner' | 'group' | 'size'): number =>
      Math.max(...rows.map((row) => row[key].length));
    const [links, owner, group, size] = [
      width('links'),
      width('owner'),
      width('group'),
      width('size'),
    ];
    for (const row of rows) {
      let name = display(row.entry, this.options).text;
      if (row.entry.target !== undefined) {
        const target = row.entry.targetStat
          ? display(
              { ...row.entry, stat: row.entry.targetStat, type: fileType(row.entry.targetStat) },
              this.options,
              row.entry.target,
            ).text
          : row.entry.target;
        name += ` -> ${target}`;
      }
      this.ctx.stdout(
        `${row.mode} ${row.links.padStart(links)} ${row.owner.padEnd(owner)} ${row.group.padEnd(group)} ${row.size.padStart(size)} ${row.date} ${name}\n`,
      );
    }
  }

  /** Lists a directory's contents; returns subdirectories for -R. */
  listDirectory(path: string, serious: boolean): string[] {
    const { fs } = this.ctx;
    const { options } = this;
    let names: string[];
    try {
      names = fs.readdir(path);
    } catch (error) {
      if (!isFsError(error)) throw error;
      this.fail(`cannot open directory ${quoteAlways(path)}: ${strerror(error.code)}`, serious);
      return [];
    }
    const visible = names.filter(
      (name) => options.all || options.almostAll || !name.startsWith('.'),
    );
    const needStat =
      options.long || options.color || options.classify || options.sortTime || options.sortSize;
    const join = (name: string): string =>
      path.endsWith('/') ? `${path}${name}` : `${path}/${name}`;
    const entries: Entry[] = [];
    if (options.all) {
      for (const dot of ['.', '..']) {
        const entry = this.entry(dot, join(dot), false, needStat, false);
        if (entry) entries.push(entry);
      }
    }
    for (const name of visible) {
      const entry = this.entry(name, join(name), false, needStat, false);
      if (entry) entries.push(entry);
    }
    const sorted = this.sort(entries);
    if (options.long) {
      const total = sorted.reduce((sum, entry) => sum + blocks(entry.stat), 0);
      this.ctx.stdout(`total ${options.human ? humanSize(total * 1024) : total}\n`);
    }
    this.print(sorted);
    return sorted
      .filter(
        (entry) => entry.type === 'dir' && entry.name !== '.' && entry.name !== '..' && entry.stat,
      )
      .map((entry) => entry.path);
  }
}

const UNSUPPORTED = [
  'i',
  's',
  'g',
  'o',
  'X',
  'v',
  'U',
  'c',
  'u',
  'k',
  'm',
  'Q',
  'N',
  'b',
  'B',
  'C',
  'x',
  'G',
  'L',
  'H',
  'p',
  'Z',
  'T',
  'w',
  'I',
  'full-time',
  'time-style',
  'group-directories-first',
  'sort',
  'format',
  'width',
  'ignore',
  'hide',
  'indicator-style',
  'quoting-style',
  'author',
  'block-size',
  'dereference',
  'context',
  'si',
  'tabsize',
  'literal',
  'escape',
  'hyperlink',
  'inode',
  'size',
];

export const ls = defineCommand({
  name: 'ls',
  kind: 'binary',
  description: 'list directory contents',
  usage: ['[OPTION]... [FILE]...'],
  about:
    'List information about the FILEs (the current directory by default).\nSort entries alphabetically unless -t or -S is given.',
  options: [
    ['-a, --all', 'do not ignore entries starting with .'],
    ['-A, --almost-all', 'do not list implied . and ..'],
    ['    --color[=WHEN]', "color the output WHEN: 'always', 'auto' (default) or 'never'"],
    ['-d, --directory', 'list directories themselves, not their contents'],
    ['-F, --classify', 'append indicator (one of */@) to entries'],
    ['-h, --human-readable', 'with -l, print sizes like 1K 234M 2G'],
    ['-l', 'use a long listing format'],
    ['-n, --numeric-uid-gid', 'like -l, but list numeric user and group IDs'],
    ['-r, --reverse', 'reverse order while sorting'],
    ['-R, --recursive', 'list subdirectories recursively'],
    ['-S', 'sort by file size, largest first'],
    ['-t', 'sort by modification time, newest first'],
    ['-1', 'list one file per line'],
  ],
  details:
    'Hidden files are names starting with a dot, such as .bashrc. They only appear with -a or -A.\n\nIn the long format (-l) each line shows: file type and permissions, link count, owner, group, size in bytes, modification time, and name. For example:\n  -rw-r----- 1 root adm 51234 Mar 14 03:12 auth.log\nThe first character is the type (- file, d directory, l symbolic link, c character device). The next nine are read/write/execute permissions for the owner, the group, and everyone else. An s in place of x is the setuid bit.',
  examples: [
    ['ls -la', 'long listing of all files, including hidden ones'],
    ['ls -lh /var/log', 'long listing with human-readable sizes'],
    ['ls -lt', 'newest files first'],
  ],
  seeAlso: ['stat(1)', 'chmod(1)', 'find(1)'],
  run: async (ctx) => {
    const outcome = parseOptions(
      ctx.name,
      ctx.args,
      [
        { short: 'a', long: 'all' },
        { short: 'A', long: 'almost-all' },
        { short: 'l' },
        { short: 'h', long: 'human-readable' },
        { short: 'd', long: 'directory' },
        { short: '1' },
        { short: 'r', long: 'reverse' },
        { short: 't' },
        { short: 'S' },
        { short: 'R', long: 'recursive' },
        { short: 'F', long: 'classify' },
        { short: 'n', long: 'numeric-uid-gid' },
        { long: 'color', arg: 'optional' },
      ],
      { unsupported: UNSUPPORTED },
    );
    if (!outcome.ok) {
      ctx.stderr(outcome.message);
      return 2;
    }
    const opts = outcome.options;
    const when = opts.value('color') ?? (opts.has('color') ? 'always' : 'auto');
    if (
      !['always', 'yes', 'force', 'auto', 'tty', 'if-tty', 'never', 'no', 'none'].includes(when)
    ) {
      ctx.stderr(
        `ls: invalid argument '${when}' for '--color'\nValid arguments are:\n  - 'always', 'yes', 'force'\n  - 'never', 'no', 'none'\n  - 'auto', 'tty', 'if-tty'\nTry 'ls --help' for more information.\n`,
      );
      return 2;
    }
    const tty = ctx.tty.stdoutIsTTY;
    const color =
      ['always', 'yes', 'force'].includes(when) ||
      (['auto', 'tty', 'if-tty'].includes(when) && tty);
    const sortFlags = opts.entries.filter((e) => e.key === 't' || e.key === 'S').map((e) => e.key);
    const options: Options = {
      all:
        opts.has('all') &&
        !(
          opts.entries.findLastIndex((e) => e.key === 'almost-all') >
          opts.entries.findLastIndex((e) => e.key === 'all')
        ),
      almostAll: opts.has('almost-all'),
      long: opts.has('l') || opts.has('numeric-uid-gid'),
      human: opts.has('human-readable'),
      directory: opts.has('directory'),
      onePerLine: opts.has('1'),
      reverse: opts.has('reverse'),
      sortTime: sortFlags[sortFlags.length - 1] === 't',
      sortSize: sortFlags[sortFlags.length - 1] === 'S',
      recursive: opts.has('recursive') && !opts.has('directory'),
      classify: opts.has('classify'),
      numeric: opts.has('numeric-uid-gid'),
      color,
      tty,
    };

    const lister = new Lister(ctx, options);
    const operands = opts.operands.length > 0 ? [...opts.operands] : ['.'];
    const files: Entry[] = [];
    const directories: Entry[] = [];
    const followOperands = !options.long && !options.directory && !options.classify;
    for (const operand of operands) {
      const entry = lister.entry(
        operand,
        operand,
        followOperands || operand.endsWith('/'),
        true,
        true,
      );
      if (!entry) continue;
      if (entry.type === 'dir' && !options.directory) directories.push(entry);
      else files.push(entry);
    }

    lister.print(lister.sort(files));
    const showHeaders = operands.length > 1 || options.recursive;
    let first = files.length === 0;
    const queue = lister.sort(directories).map((entry) => entry.path);
    const visit = (path: string, serious: boolean): void => {
      if (!first) ctx.stdout('\n');
      first = false;
      if (showHeaders) ctx.stdout(`${path}:\n`);
      const children = lister.listDirectory(path, serious);
      if (options.recursive) for (const child of children) visit(child, false);
    };
    for (const path of queue) visit(path, true);
    return lister.status;
  },
});
