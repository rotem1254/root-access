import { strerror } from '../errors';
import type { ByteString } from '../util/bytes';
import { parseOptions } from './args';
import { defineCommand } from './define';
import { quoteIfNeeded, readOperand } from './util';

interface CatOptions {
  numberAll: boolean;
  numberNonBlank: boolean;
  squeeze: boolean;
  showEnds: boolean;
  showTabs: boolean;
  showNonPrinting: boolean;
}

/** `cat -v` notation: ^X for control characters, M- for bytes >= 128. */
function visible(byte: number, showTabs: boolean): string {
  if (byte === 9) return showTabs ? '^I' : '\t';
  let prefix = '';
  let b = byte;
  if (b >= 128) {
    prefix = 'M-';
    b -= 128;
  }
  if (b < 32) return `${prefix}^${String.fromCharCode(b + 64)}`;
  if (b === 127) return `${prefix}^?`;
  return `${prefix}${String.fromCharCode(b)}`;
}

/** Line state carried across files, as GNU cat numbers lines continuously. */
class Formatter {
  private lineNumber = 0;
  private atLineStart = true;
  private blankRun = 0;
  private readonly options: CatOptions;

  constructor(options: CatOptions) {
    this.options = options;
  }

  get plain(): boolean {
    const o = this.options;
    return !(
      o.numberAll ||
      o.numberNonBlank ||
      o.squeeze ||
      o.showEnds ||
      o.showTabs ||
      o.showNonPrinting
    );
  }

  format(data: ByteString): ByteString {
    if (this.plain) return data;
    const o = this.options;
    let out = '';
    let i = 0;
    while (i < data.length) {
      const newline = data.indexOf('\n', i);
      const end = newline < 0 ? data.length : newline;
      const content = data.slice(i, end);
      const complete = newline >= 0;
      const blank = this.atLineStart && content === '' && complete;
      if (blank) {
        this.blankRun += 1;
        if (o.squeeze && this.blankRun > 1) {
          i = end + 1;
          continue;
        }
      } else if (content !== '') {
        this.blankRun = 0;
      }
      if (this.atLineStart && (o.numberAll || (o.numberNonBlank && !blank))) {
        this.lineNumber += 1;
        out += `${String(this.lineNumber).padStart(6)}\t`;
      }
      if (o.showNonPrinting || o.showTabs) {
        for (let k = 0; k < content.length; k++) {
          const byte = content.charCodeAt(k);
          out += o.showNonPrinting || byte === 9 ? visible(byte, o.showTabs) : content.charAt(k);
        }
      } else {
        out += content;
      }
      if (complete) {
        out += o.showEnds ? '$\n' : '\n';
        this.atLineStart = true;
        i = end + 1;
      } else {
        this.atLineStart = content === '' ? this.atLineStart : false;
        i = end;
      }
    }
    return out;
  }
}

export const cat = defineCommand({
  name: 'cat',
  kind: 'binary',
  description: 'concatenate files and print on the standard output',
  usage: ['[OPTION]... [FILE]...'],
  about:
    'Concatenate FILE(s) to standard output.\n\nWith no FILE, or when FILE is -, read standard input.',
  options: [
    ['-A, --show-all', 'equivalent to -vET'],
    ['-b, --number-nonblank', 'number nonempty output lines, overrides -n'],
    ['-e', 'equivalent to -vE'],
    ['-E, --show-ends', 'display $ at end of each line'],
    ['-n, --number', 'number all output lines'],
    ['-s, --squeeze-blank', 'suppress repeated empty output lines'],
    ['-t', 'equivalent to -vT'],
    ['-T, --show-tabs', 'display TAB characters as ^I'],
    ['-u', '(ignored)'],
    ['-v, --show-nonprinting', 'use ^ and M- notation, except for LFD and TAB'],
  ],
  details:
    'Reading a file needs read (r) permission on it, and execute (x) permission on every directory in its path. Run `cat` with no arguments to type input yourself; press Ctrl+D to finish or Ctrl+C to cancel.',
  examples: [
    ['cat notes.txt', 'print a file'],
    ['cat -n /etc/passwd', 'print a file with line numbers'],
    ['cat part1 part2 > whole', 'join files into a new one'],
  ],
  seeAlso: ['head(1)', 'tail(1)', 'less(1)'],
  run: async (ctx) => {
    const outcome = parseOptions(ctx.name, ctx.args, [
      { short: 'A', long: 'show-all' },
      { short: 'b', long: 'number-nonblank' },
      { short: 'e' },
      { short: 'E', long: 'show-ends' },
      { short: 'n', long: 'number' },
      { short: 's', long: 'squeeze-blank' },
      { short: 't' },
      { short: 'T', long: 'show-tabs' },
      { short: 'u' },
      { short: 'v', long: 'show-nonprinting' },
    ]);
    if (!outcome.ok) {
      ctx.stderr(outcome.message);
      return 1;
    }
    const o = outcome.options;
    const formatter = new Formatter({
      numberNonBlank: o.has('number-nonblank'),
      numberAll: o.has('number') && !o.has('number-nonblank'),
      squeeze: o.has('squeeze-blank'),
      showEnds: o.has('show-all') || o.has('e') || o.has('show-ends'),
      showTabs: o.has('show-all') || o.has('t') || o.has('show-tabs'),
      showNonPrinting: o.has('show-all') || o.has('e') || o.has('t') || o.has('show-nonprinting'),
    });
    const operands = o.operands.length > 0 ? o.operands : ['-'];
    let status = 0;
    for (const operand of operands) {
      if (operand === '-' && ctx.stdin.isTTY) {
        for (;;) {
          const line = await ctx.stdin.readLine();
          if (line === null) break;
          ctx.stdout(formatter.format(line));
        }
        if (ctx.tty.interrupted) return 130;
        continue;
      }
      if (operand !== '-') {
        try {
          if (ctx.fs.stat(operand).type === 'dir') {
            ctx.stderr(`cat: ${quoteIfNeeded(operand)}: Is a directory\n`);
            status = 1;
            continue;
          }
        } catch {
          // reported by the read below
        }
      }
      const input = await readOperand(ctx, operand);
      if (input === null) return 130;
      if (!input.ok) {
        ctx.stderr(`cat: ${quoteIfNeeded(operand)}: ${strerror(input.errno)}\n`);
        status = 1;
        continue;
      }
      ctx.stdout(formatter.format(input.data));
    }
    return status;
  },
});
