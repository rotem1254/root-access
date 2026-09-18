import { strerror } from '../errors';
import type { ByteString } from '../util/bytes';
import { parseOptions } from './args';
import { defineCommand } from './define';
import { readOperand } from './util';

function parseCount(text: string): { count: number; fromStart: boolean } | null {
  const fromStart = text.startsWith('+');
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
  return { count: Math.abs(Number(match[1])) * (units[match[2] ?? ''] ?? 1), fromStart };
}

function tailLines(data: ByteString, count: number, fromStart: boolean): ByteString {
  if (data === '') return '';
  const starts = [0];
  for (let i = 0; i < data.length; i++)
    if (data.charAt(i) === '\n' && i + 1 < data.length) starts.push(i + 1);
  if (fromStart) {
    const idx = Math.max(0, count - 1);
    return idx >= starts.length ? '' : data.slice(starts[idx]);
  }
  const idx = Math.max(0, starts.length - count);
  return data.slice(starts[idx]);
}

function tailBytes(data: ByteString, count: number, fromStart: boolean): ByteString {
  if (fromStart) return data.slice(Math.max(0, count - 1));
  return data.slice(Math.max(0, data.length - count));
}

export const tail = defineCommand({
  name: 'tail',
  kind: 'binary',
  description: 'output the last part of files',
  usage: ['[OPTION]... [FILE]...'],
  about:
    'Print the last 10 lines of each FILE to standard output. With more than one\nFILE, precede each with a header giving the file name. With no FILE, or when\nFILE is -, read standard input.',
  options: [
    ['-c, --bytes=[+]NUM', 'output the last NUM bytes; or use +NUM to start at byte NUM'],
    ['-n, --lines=[+]NUM', 'output the last NUM lines; or use +NUM to start at line NUM'],
    ['-q, --quiet, --silent', 'never print headers giving file names'],
    ['-v, --verbose', 'always print headers giving file names'],
  ],
  details:
    'tail is handy for reading the end of a log file, where the newest events are:\n  tail -n 20 /var/log/auth.log\nUse +NUM to skip forward instead: tail -n +500 shows from line 500 onward.',
  examples: [
    ['tail auth.log', 'show the last 10 lines'],
    ['tail -n 50 /var/log/auth.log', 'show the last 50 lines'],
    ['tail -n +2 data.csv', 'skip a header line'],
  ],
  seeAlso: ['head(1)', 'cat(1)', 'grep(1)'],
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
        { short: 'f' },
        { short: 'F' },
      ],
      {
        numericKey: 'lines',
        unsupported: ['follow', 'pid', 'retry', 'max-unchanged-stats', 'sleep-interval'],
      },
    );
    if (!outcome.ok) {
      ctx.stderr(outcome.message);
      return 1;
    }
    const o = outcome.options;
    if (o.has('f') || o.has('F')) {
      ctx.stderr('tail: following files (-f) is not supported in this simulation\n');
      return 1;
    }
    const byBytes = o.has('bytes');
    const countText = byBytes ? (o.value('bytes') ?? '') : (o.value('lines') ?? '10');
    const parsed = parseCount(countText);
    if (!parsed) {
      ctx.stderr(`tail: invalid number of ${byBytes ? 'bytes' : 'lines'}: '${countText}'\n`);
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
        ctx.stderr(`tail: cannot open '${operand}' for reading: ${strerror(input.errno)}\n`);
        status = 1;
        continue;
      }
      if (showHeaders) {
        ctx.stdout(`${first ? '' : '\n'}==> ${operand === '-' ? 'standard input' : operand} <==\n`);
      }
      first = false;
      ctx.stdout(
        byBytes
          ? tailBytes(input.data, parsed.count, parsed.fromStart)
          : tailLines(input.data, parsed.count, parsed.fromStart),
      );
    }
    return status;
  },
});
