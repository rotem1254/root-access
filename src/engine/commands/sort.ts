import { strerror } from '../errors';
import { compareBytes } from '../shell/glob';

import { parseOptions } from './args';
import { defineCommand } from './define';
import { readOperand, splitLines } from './util';

interface SortOptions {
  numeric: boolean;
  reverse: boolean;
  unique: boolean;
  foldCase: boolean;
  ignoreBlanks: boolean;
  key: number | null;
  separator: string | null;
}

function fieldOf(line: string, options: SortOptions): string {
  let value = line;
  if (options.key !== null) {
    const parts =
      options.separator === null
        ? line.replace(/^\s+/, '').split(/\s+/)
        : line.split(options.separator);
    value = parts[options.key - 1] ?? '';
  }
  if (options.ignoreBlanks) value = value.replace(/^\s+/, '');
  if (options.foldCase) value = value.toUpperCase();
  return value;
}

/** Leading numeric value, GNU-sort style (blanks skipped, `-` and `.` understood). */
function numericValue(text: string): number {
  const match = /^\s*[+-]?(\d[\d,]*(\.\d*)?|\.\d+)/.exec(text);
  return match ? Number(match[0].replace(/,/g, '')) : 0;
}

export const sort = defineCommand({
  name: 'sort',
  kind: 'binary',
  description: 'sort lines of text files',
  usage: ['[OPTION]... [FILE]...'],
  about:
    'Write sorted concatenation of all FILE(s) to standard output. With no FILE,\nor when FILE is -, read standard input. The default is to sort by the whole\nline in dictionary (byte) order.',
  options: [
    ['-b, --ignore-leading-blanks', 'ignore leading blanks'],
    ['-f, --ignore-case', 'fold lower case to upper case characters'],
    ['-n, --numeric-sort', 'compare according to string numerical value'],
    ['-r, --reverse', 'reverse the result of comparisons'],
    ['-u, --unique', 'output only the first of an equal run'],
    ['-k, --key=KEYDEF', 'sort via a key; KEYDEF is a field number F'],
    ['-t, --field-separator=SEP', 'use SEP instead of runs of whitespace'],
    ['-c, --check', 'check for sorted input; do not sort'],
  ],
  details:
    'The classic idiom for finding the most frequent lines is:\n  sort file | uniq -c | sort -rn\nThe first sort groups equal lines together so uniq can count them, and the\nsecond sorts those counts from largest to smallest.',
  examples: [
    ['sort names.txt', 'sort lines alphabetically'],
    ['sort -n sizes.txt', 'sort numerically'],
    ['cut -d, -f2 data.csv | sort | uniq -c | sort -rn', 'count and rank values'],
  ],
  seeAlso: ['uniq(1)', 'cut(1)', 'grep(1)'],
  run: async (ctx) => {
    const outcome = parseOptions(
      ctx.name,
      ctx.args,
      [
        { short: 'b', long: 'ignore-leading-blanks' },
        { short: 'f', long: 'ignore-case' },
        { short: 'n', long: 'numeric-sort' },
        { short: 'r', long: 'reverse' },
        { short: 'u', long: 'unique' },
        { short: 'k', long: 'key', arg: 'required' },
        { short: 't', long: 'field-separator', arg: 'required' },
        { short: 'c', long: 'check' },
      ],
      {
        unsupported: [
          'g',
          'h',
          'M',
          'R',
          'V',
          'o',
          's',
          'z',
          'output',
          'random-sort',
          'version-sort',
          'human-numeric-sort',
        ],
      },
    );
    if (!outcome.ok) {
      ctx.stderr(outcome.message);
      return 2;
    }
    const o = outcome.options;
    const keyText = o.value('key');
    let key: number | null = null;
    let keyNumeric = false;
    let keyReverse = false;
    if (keyText !== undefined) {
      const field = /^(\d+)/.exec(keyText);
      if (!field || field[1] === '0') {
        ctx.stderr(`sort: invalid number at field start: invalid count at start of '${keyText}'\n`);
        return 2;
      }
      key = Number(field[1]);
      const modifiers = keyText.slice((field[1] ?? '').length);
      if (modifiers.includes('n')) keyNumeric = true;
      if (modifiers.includes('r')) keyReverse = true;
    }
    const options: SortOptions = {
      numeric: o.has('numeric-sort') || keyNumeric,
      reverse: o.has('reverse') || keyReverse,
      unique: o.has('unique'),
      foldCase: o.has('ignore-case'),
      ignoreBlanks: o.has('ignore-leading-blanks'),
      key,
      separator: o.value('field-separator') ?? null,
    };

    const lines: string[] = [];
    let status = 0;
    for (const operand of o.operands.length > 0 ? o.operands : ['-']) {
      const input = await readOperand(ctx, operand);
      if (input === null) return 130;
      if (!input.ok) {
        ctx.stderr(`sort: cannot read: ${operand}: ${strerror(input.errno)}\n`);
        status = 2;
        continue;
      }
      lines.push(...splitLines(input.data));
    }

    const compare = (a: string, b: string): number => {
      const fa = fieldOf(a, options);
      const fb = fieldOf(b, options);
      let result = options.numeric ? numericValue(fa) - numericValue(fb) : compareBytes(fa, fb);
      if (result === 0 && options.key !== null && !options.unique) result = compareBytes(a, b);
      return options.reverse ? -result : result;
    };

    if (o.has('check')) {
      for (let i = 1; i < lines.length; i++) {
        if (compare(lines[i - 1] ?? '', lines[i] ?? '') > 0) {
          ctx.stderr(`sort: -:${i + 1}: disorder: ${lines[i] ?? ''}\n`);
          return 1;
        }
      }
      return status;
    }

    const indexed = lines.map((line, index) => ({ line, index }));
    indexed.sort((a, b) => compare(a.line, b.line) || a.index - b.index);
    let previous: string | null = null;
    for (const { line } of indexed) {
      if (options.unique && previous !== null && compare(previous, line) === 0) continue;
      ctx.stdout(`${line}\n`);
      previous = line;
    }
    return status;
  },
});
