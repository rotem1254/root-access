import { strerror } from '../errors';
import { base64Decode, base64Encode, wrapBase64 } from '../util/base64';
import { parseOptions } from './args';
import { defineCommand } from './define';
import { readOperand } from './util';

export const base64 = defineCommand({
  name: 'base64',
  kind: 'binary',
  description: 'base64 encode or decode FILE, or standard input, to standard output',
  usage: ['[OPTION]... [FILE]'],
  about:
    'Base64 encode or decode FILE, or standard input, to standard output.\nWith no FILE, or when FILE is -, read standard input. Base64 turns arbitrary\nbytes into printable ASCII, so hidden data is often stored this way.',
  options: [
    ['-d, --decode', 'decode data'],
    ['-i, --ignore-garbage', 'when decoding, ignore non-alphabet characters'],
    ['-w, --wrap=COLS', 'wrap encoded lines after COLS characters (default 76, 0 disables)'],
  ],
  details:
    'To reveal a Base64-encoded message, pipe or redirect it into base64 -d:\n  echo "ZmxhZ3toaWRkZW59" | base64 -d\n  base64 -d secret.b64\nData that fails to decode cleanly usually means it was not really Base64.',
  examples: [
    ['base64 secret.txt', 'encode a file'],
    ['base64 -d message.b64', 'decode a Base64 file'],
    ['echo "ZmxhZw==" | base64 -d', 'decode text from a pipe'],
  ],
  seeAlso: ['xxd(1)', 'cat(1)', 'strings(1)'],
  run: async (ctx) => {
    const outcome = parseOptions(ctx.name, ctx.args, [
      { short: 'd', long: 'decode' },
      { short: 'i', long: 'ignore-garbage' },
      { short: 'w', long: 'wrap', arg: 'required' },
    ]);
    if (!outcome.ok) {
      ctx.stderr(outcome.message);
      return 1;
    }
    const o = outcome.options;
    if (o.operands.length > 1) {
      ctx.stderr(
        `base64: extra operand '${o.operands[1] ?? ''}'\nTry 'base64 --help' for more information.\n`,
      );
      return 1;
    }
    const wrapText = o.value('wrap') ?? '76';
    if (!/^\d+$/.test(wrapText)) {
      ctx.stderr(`base64: invalid wrap size: '${wrapText}'\n`);
      return 1;
    }
    const operand = o.operands[0] ?? '-';
    const input = await readOperand(ctx, operand);
    if (input === null) return 130;
    if (!input.ok) {
      ctx.stderr(`base64: ${operand}: ${strerror(input.errno)}\n`);
      return 1;
    }
    if (o.has('decode')) {
      const result = base64Decode(input.data, { ignoreGarbage: o.has('ignore-garbage') });
      ctx.stdout(result.bytes);
      if (!result.ok) {
        ctx.stderr('base64: invalid input\n');
        return 1;
      }
      return 0;
    }
    ctx.stdout(wrapBase64(base64Encode(input.data), Number(wrapText)));
    return 0;
  },
});
