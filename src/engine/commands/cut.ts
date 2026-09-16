import { strerror } from '../errors';
import { parseOptions } from './args';
import { defineCommand } from './define';
import { readOperand, splitLines } from './util';

interface Range {
  start: number;
  end: number;
}

/** Parses a list like `1,3-5,7-` into ranges (1-based; end Infinity for open ranges). */
function parseList(text: string): Range[] | null {
  const ranges: Range[] = [];
  for (const part of text.split(',')) {
    if (part === '') continue;
    let match = /^(\d+)$/.exec(part);
    if (match) {
      const n = Number(match[1]);
      if (n === 0) return null;
      ranges.push({ start: n, end: n });
      continue;
    }
    match = /^(\d*)-(\d*)$/.exec(part);
    if (!match || (match[1] === '' && match[2] === '')) return null;
    const start = match[1] === '' ? 1 : Number(match[1]);
    const end = match[2] === '' ? Infinity : Number(match[2]);
    if (start === 0 || end === 0 || start > end) return null;
    ranges.push({ start, end });
  }
  return ranges.length > 0 ? ranges.sort((a, b) => a.start - b.start) : null;
}

function inRanges(index: number, ranges: Range[]): boolean {
  return ranges.some((range) => index >= range.start && index <= range.end);
}

export const cut = defineCommand({
  name: 'cut',
  kind: 'binary',
  description: 'remove sections from each line of files',
  usage: ['OPTION... [FILE]...'],
  about:
    'Print selected parts of lines from each FILE to standard output. Use -f to\nselect fields separated by a delimiter (-d), or -c to select character\npositions. LIST is made of ranges like 1, 1-3, 3- or 1,4,7.',
  options: [
    ['-c, --characters=LIST', 'select only these characters'],
    ['-f, --fields=LIST', 'select only these fields; also print lines with no delimiter'],
    ['-d, --delimiter=DELIM', 'use DELIM instead of TAB for the field delimiter'],
    ['-s, --only-delimited', 'do not print lines not containing delimiters'],
    ['    --complement', 'complement the set of selected bytes, characters or fields'],
    ['    --output-delimiter=STRING', 'use STRING as the output delimiter'],
  ],
  details:
    'cut is ideal for pulling one column out of structured text such as CSV files\nor /etc/passwd:\n  cut -d: -f1 /etc/passwd    lists user names\n  cut -d, -f2 data.csv       takes the second comma-separated field',
  examples: [
    ['cut -d: -f1 /etc/passwd', 'list all user names'],
    ['cut -d, -f2,4 data.csv', 'take the 2nd and 4th CSV columns'],
    ['grep Accepted auth.log | cut -d" " -f11', 'pull a field out of matching log lines'],
  ],
  seeAlso: ['grep(1)', 'sort(1)', 'awk(1)'],
  run: async (ctx) => {
    const outcome = parseOptions(ctx.name, ctx.args, [
      { short: 'c', long: 'characters', arg: 'required' },
      { short: 'f', long: 'fields', arg: 'required' },
      { short: 'd', long: 'delimiter', arg: 'required' },
      { short: 's', long: 'only-delimited' },
      { long: 'complement' },
      { long: 'output-delimiter', arg: 'required' },
      { short: 'b', long: 'bytes', arg: 'required' },
    ]);
    if (!outcome.ok) {
      ctx.stderr(outcome.message);
      return 1;
    }
    const o = outcome.options;
    const byChars = o.has('characters') || o.has('bytes');
    const listText = o.value('fields') ?? o.value('characters') ?? o.value('bytes');
    const modes = [o.has('fields'), o.has('characters'), o.has('bytes')].filter(Boolean).length;
    if (modes === 0) {
      ctx.stderr(
        "cut: you must specify a list of bytes, characters, or fields\nTry 'cut --help' for more information.\n",
      );
      return 1;
    }
    if (modes > 1) {
      ctx.stderr(
        "cut: only one type of list may be specified\nTry 'cut --help' for more information.\n",
      );
      return 1;
    }
    const ranges = parseList(listText ?? '');
    if (!ranges) {
      ctx.stderr(
        `cut: invalid field value after parsing\n`
          .replace('field value after parsing', `${byChars ? 'byte/character' : 'field'} value`)
          .replace(' after parsing', ` '${listText ?? ''}'`),
      );
      return 1;
    }
    const delimiterText = o.value('delimiter');
    if (delimiterText !== undefined && delimiterText.length > 1) {
      ctx.stderr(
        "cut: the delimiter must be a single character\nTry 'cut --help' for more information.\n",
      );
      return 1;
    }
    const delimiter = delimiterText ?? '\t';
    const outputDelimiter = o.value('output-delimiter') ?? delimiter;
    const complement = o.has('complement');
    const selected = (index: number): boolean => inRanges(index, ranges) !== complement;

    const process = (line: string): string | null => {
      if (byChars) {
        let out = '';
        for (let i = 0; i < line.length; i++) if (selected(i + 1)) out += line.charAt(i);
        return out;
      }
      if (!line.includes(delimiter)) return o.has('only-delimited') ? null : line;
      const fields = line.split(delimiter);
      return fields.filter((_, i) => selected(i + 1)).join(outputDelimiter);
    };

    let status = 0;
    for (const operand of o.operands.length > 0 ? o.operands : ['-']) {
      const input = await readOperand(ctx, operand);
      if (input === null) return 130;
      if (!input.ok) {
        ctx.stderr(`cut: ${operand}: ${strerror(input.errno)}\n`);
        status = 1;
        continue;
      }
      for (const line of splitLines(input.data)) {
        const result = process(line);
        if (result !== null) ctx.stdout(`${result}\n`);
      }
    }
    return status;
  },
});
