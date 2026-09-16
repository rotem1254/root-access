import { strerror } from '../errors';
import { parseOptions } from './args';
import { defineCommand } from './define';
import { readOperand, splitLines } from './util';

export const uniq = defineCommand({
  name: 'uniq',
  kind: 'binary',
  description: 'report or omit repeated lines',
  usage: ['[OPTION]... [INPUT [OUTPUT]]'],
  about:
    'Filter adjacent matching lines from INPUT, writing to standard output.\nUniq does not detect repeated lines unless they are adjacent, so the input is\nusually sorted first.',
  options: [
    ['-c, --count', 'prefix lines by the number of occurrences'],
    ['-d, --repeated', 'only print duplicate lines, one for each group'],
    ['-u, --unique', 'only print unique lines'],
    ['-i, --ignore-case', 'ignore differences in case when comparing'],
  ],
  details:
    'Because uniq only compares neighbouring lines, sort first:\n  sort file | uniq -c\ncounts how many times each distinct line appears.',
  examples: [
    ['sort ips.txt | uniq', 'remove adjacent duplicate lines'],
    ['sort ips.txt | uniq -c', 'count occurrences of each line'],
    ['sort ips.txt | uniq -c | sort -rn', 'rank lines by frequency'],
  ],
  seeAlso: ['sort(1)', 'wc(1)', 'cut(1)'],
  run: async (ctx) => {
    const outcome = parseOptions(
      ctx.name,
      ctx.args,
      [
        { short: 'c', long: 'count' },
        { short: 'd', long: 'repeated' },
        { short: 'u', long: 'unique' },
        { short: 'i', long: 'ignore-case' },
      ],
      {
        unsupported: [
          'f',
          's',
          'w',
          'D',
          'z',
          'skip-fields',
          'skip-chars',
          'check-chars',
          'all-repeated',
          'group',
        ],
      },
    );
    if (!outcome.ok) {
      ctx.stderr(outcome.message);
      return 1;
    }
    const o = outcome.options;
    const [inputName = '-', outputName] = o.operands;
    const input = await readOperand(ctx, inputName);
    if (input === null) return 130;
    if (!input.ok) {
      ctx.stderr(`uniq: ${inputName}: ${strerror(input.errno)}\n`);
      return 1;
    }
    const same = (a: string, b: string): boolean =>
      o.has('ignore-case') ? a.toUpperCase() === b.toUpperCase() : a === b;
    const lines = splitLines(input.data);
    let output = '';
    let index = 0;
    while (index < lines.length) {
      const line = lines[index] ?? '';
      let run = 1;
      while (index + run < lines.length && same(lines[index + run] ?? '', line)) run += 1;
      index += run;
      const isDuplicate = run > 1;
      if (o.has('repeated') && !isDuplicate) continue;
      if (o.has('unique') && isDuplicate) continue;
      output += o.has('count') ? `${String(run).padStart(7)} ${line}\n` : `${line}\n`;
    }
    if (outputName !== undefined && outputName !== '-') {
      try {
        ctx.fs.writeFile(outputName, output);
      } catch (error) {
        ctx.stderr(
          `uniq: ${outputName}: ${error instanceof Error ? error.message : 'write error'}\n`,
        );
        return 1;
      }
      return 0;
    }
    ctx.stdout(output);
    return 0;
  },
});
