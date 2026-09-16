import { strerror } from '../errors';
import type { ByteString } from '../util/bytes';
import { parseOptions } from './args';
import { defineCommand } from './define';
import { readOperand } from './util';

/** Parses a size like `5`, `10k`, `2M`, `1G`, or `-5`. */
function parseCount(text: string): number | null {
  const match = /^([+-]?\d+)([bkKmMgG]?)$/.exec(text);
  if (!match) return null;
  const units: Record<string, number> = {
    '': 1,
    b: 512,
    k: 1024,
    K: 1024,
    m: 1048576,
    M: 1048576,
    g: 1073741824,
    G: 1073741824,
  };
  return Number(match[1]) * (units[match[2] ?? ''] ?? 1);
}

function headBytes(data: ByteString, count: number): ByteString {
  return count >= 0 ? data.slice(0, count) : data.slice(0, Math.max(0, data.length + count));
}

function headLines(data: ByteString, count: number): ByteString {
  if (data === '') return '';
  const starts = [0];
  for (let i = 0; i < data.length; i++)
    if (data.charAt(i) === '\n' && i + 1 < data.length) starts.push(i + 1);
  const lineCount = starts.length;
  if (count >= 0) {
    if (count >= lineCount) return data;
    return data.slice(0, starts[count] ?? 0);
  }
  const keep = lineCount + count;
  if (keep <= 0) return '';
  return data.slice(0, starts[keep] ?? data.length);
}

export const head = defineCommand({
  name: 'head',
  kind: 'binary',
  description: 'output the first part of files',
  usage: ['[OPTION]... [FILE]...'],
  about:
    'Print the first 10 lines of each FILE to standard output. With more than\none FILE, precede each with a header giving the file name. With no FILE, or\nwhen FILE is -, read standard input.',
  options: [
    ['-c, --bytes=[-]NUM', 'print the first NUM bytes; with -, all but the last NUM'],
    ['-n, --lines=[-]NUM', 'print the first NUM lines; with -, all but the last NUM'],
    ['-q, --quiet, --silent', 'never print headers giving file names'],
    ['-v, --verbose', 'always print headers giving file names'],
  ],
  details: 'A NUM may carry a suffix: b (512), k (1024) or K, m or M (1048576), g or G.',
  examples: [
    ['head auth.log', 'show the first 10 lines'],
    ['head -n 20 /etc/passwd', 'show the first 20 lines'],
    ['grep Failed auth.log | head', 'show the first matches'],
  ],
  seeAlso: ['tail(1)', 'cat(1)', 'sed(1)'],
  run: async (ctx) => {
    const outcome = parseOptions(
      ctx.name,
      ctx.args,
      [
        { short: 'c', long: 'bytes', arg: 'required' },
        { short: 'n', long: 'lines', arg: 'required' },
        { short: 'q', long: 'quiet' },
        { long: 'silent', key: 'quiet' },
        { short: 'v', long: 'verbose' },
      ],
      { numericKey: 'lines' },
    );
    if (!outcome.ok) {
      ctx.stderr(outcome.message);
      return 1;
    }
    const o = outcome.options;
    const byBytes = o.has('bytes');
    const countText = byBytes ? o.value('bytes') : (o.value('lines') ?? '10');
    const count = parseCount(countText ?? '10');
    if (count === null) {
      ctx.stderr(`head: invalid number of ${byBytes ? 'bytes' : 'lines'}: '${countText ?? ''}'\n`);
      return 1;
    }
    const operands = o.operands.length > 0 ? o.operands : ['-'];
    const showHeaders = o.has('verbose') || (operands.length > 1 && !o.has('quiet'));
    let status = 0;
    let first = true;
    for (const operand of operands) {
      const input = await readOperand(ctx, operand);
      if (input === null) return 130;
      if (!input.ok) {
        ctx.stderr(`head: cannot open '${operand}' for reading: ${strerror(input.errno)}\n`);
        status = 1;
        continue;
      }
      if (showHeaders) {
        ctx.stdout(`${first ? '' : '\n'}==> ${operand === '-' ? 'standard input' : operand} <==\n`);
      }
      first = false;
      ctx.stdout(byBytes ? headBytes(input.data, count) : headLines(input.data, count));
    }
    return status;
  },
});
