import { isFsError, strerror } from '../errors';
import type { ByteString } from '../util/bytes';
import { parseOptions } from './args';
import { defineCommand } from './define';

function printable(byte: number): boolean {
  return (byte >= 0x20 && byte <= 0x7e) || byte === 0x09;
}

export const strings = defineCommand({
  name: 'strings',
  kind: 'binary',
  description: 'print the sequences of printable characters in files',
  usage: ['[-n MIN] [-t {o,d,x}] [FILE]...'],
  about:
    'For each FILE, print the printable character sequences that are at least 4\ncharacters long (or the number given with -n) and are followed by an unprintable\ncharacter. Useful for finding text, such as passwords or paths, inside binaries.',
  options: [
    ['-a, --all', 'scan the entire file (default)'],
    ['-f, --print-file-name', 'print the name of the file before each string'],
    ['-n, --bytes=MIN', 'locate and print any sequence with at least MIN characters'],
    ['-t, --radix={o,d,x}', 'print the location of the string in base 8, 10 or 16'],
  ],
  examples: [
    ['strings /usr/bin/su', 'see the text embedded in a program'],
    ['strings -n 8 data.bin | grep -i pass', 'look for password-like strings'],
  ],
  seeAlso: ['file(1)', 'xxd(1)', 'grep(1)'],
  run: async (ctx) => {
    const outcome = parseOptions(
      ctx.name,
      ctx.args,
      [
        { short: 'a', long: 'all' },
        { short: 'f', long: 'print-file-name' },
        { short: 'n', long: 'bytes', arg: 'required' },
        { short: 't', long: 'radix', arg: 'required' },
      ],
      {
        numericKey: 'bytes',
        unsupported: ['e', 'encoding', 'd', 'data', 'o', 'w', 's', 'U', 'unicode'],
      },
    );
    if (!outcome.ok) {
      ctx.stderr(outcome.message);
      return 1;
    }
    const o = outcome.options;
    const minText = o.value('bytes') ?? '4';
    const min = /^\d+$/.test(minText) ? Number(minText) : Number.NaN;
    if (!(min >= 1)) {
      ctx.stderr(`strings: invalid minimum string length ${minText}\n`);
      return 1;
    }
    const radix = o.value('radix');
    if (radix !== undefined && !['o', 'd', 'x'].includes(radix)) {
      ctx.stderr(`strings: invalid radix '${radix}'\n`);
      return 1;
    }
    const scan = (data: ByteString, label: string): void => {
      let start = -1;
      const emit = (end: number): void => {
        if (start >= 0 && end - start >= min) {
          let prefix = o.has('print-file-name') ? `${label}: ` : '';
          if (radix !== undefined) {
            const base = radix === 'o' ? 8 : radix === 'd' ? 10 : 16;
            prefix += `${start.toString(base).padStart(7)} `;
          }
          ctx.stdout(`${prefix}${data.slice(start, end)}\n`);
        }
        start = -1;
      };
      for (let i = 0; i < data.length; i++) {
        if (printable(data.charCodeAt(i))) {
          if (start < 0) start = i;
        } else {
          emit(i);
        }
      }
      emit(data.length);
    };

    if (o.operands.length === 0) {
      const data = await ctx.stdin.readAll();
      if (data === null) return 130;
      scan(data, '{standard input}');
      return 0;
    }
    let status = 0;
    for (const name of o.operands) {
      try {
        if (ctx.fs.stat(name).type === 'dir') {
          ctx.stderr(`strings: Warning: '${name}' is a directory\n`);
          status = 1;
          continue;
        }
        scan(ctx.fs.readFile(name), name);
      } catch (error) {
        if (!isFsError(error)) throw error;
        ctx.stderr(
          error.code === 'ENOENT'
            ? `strings: '${name}': No such file\n`
            : `strings: ${name}: ${strerror(error.code)}\n`,
        );
        status = 1;
      }
    }
    return status;
  },
});
