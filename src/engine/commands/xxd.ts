import { strerror } from '../errors';
import type { ByteString } from '../util/bytes';
import { parseOptions } from './args';
import { defineCommand } from './define';
import { readOperand } from './util';

const hex = (n: number): string => n.toString(16).padStart(2, '0');

/** The canonical xxd line: offset, 8 groups of 2 bytes, then the printable gutter. */
function dumpLine(offset: number, chunk: ByteString, columns: number, groupSize: number): string {
  const bytes: string[] = [];
  for (let i = 0; i < chunk.length; i++) bytes.push(hex(chunk.charCodeAt(i) & 0xff));
  const groups: string[] = [];
  for (let i = 0; i < bytes.length; i += groupSize) {
    groups.push(bytes.slice(i, i + groupSize).join(''));
  }
  const groupCount = Math.ceil(columns / groupSize);
  const hexWidth = groupCount * (groupSize * 2 + 1) - 1;
  const hexPart = groups.join(' ').padEnd(hexWidth, ' ');
  let gutter = '';
  for (let i = 0; i < chunk.length; i++) {
    const code = chunk.charCodeAt(i) & 0xff;
    gutter += code >= 0x20 && code <= 0x7e ? (chunk[i] ?? '.') : '.';
  }
  return `${offset.toString(16).padStart(8, '0')}: ${hexPart}  ${gutter}\n`;
}

/** `xxd -r -p`: turn a stream of hex digits back into bytes, ignoring whitespace. */
function unhex(text: string): ByteString | null {
  const digits = text.replace(/[\s\n]/g, '');
  if (digits.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(digits)) return null;
  let out = '';
  for (let i = 0; i < digits.length; i += 2) {
    out += String.fromCharCode(Number.parseInt(digits.slice(i, i + 2), 16));
  }
  return out;
}

export const xxd = defineCommand({
  name: 'xxd',
  kind: 'binary',
  description: 'make a hexdump or do the reverse',
  usage: ['[-p] [-r] [-l len] [-s off] [-c cols] [file]'],
  about:
    'Show a file byte by byte. The left column is the offset, the middle is the\nhex, and the right is the printable text (non-printable bytes show as a dot).\nThis is how you look at a file that is not plain text — a header, a key, an\nencrypted blob — and see what it actually is.',
  options: [
    ['-c cols', 'format <cols> octets per line (default 16)'],
    ['-g bytes', 'number of octets per group (default 2)'],
    ['-l len', 'stop after <len> octets'],
    ['-p', 'plain hexdump: just the hex digits, no offsets or gutter'],
    ['-r', 'reverse: turn a hexdump back into binary (use with -p)'],
    ['-s off', 'start at <off> bytes into the file'],
  ],
  details:
    "The first bytes of a file usually identify it. 'Salted__' means an openssl\nencrypted container; 7f 45 4c 46 is an ELF binary; d4 c3 b2 a1 is a pcap.\n\n  xxd secret.bin | head        look at the start of a file\n  xxd -p key.bin               just the hex, for pasting elsewhere\n  echo 4e6f7661 | xxd -r -p    turn hex back into text",
  examples: [
    ['xxd archive.enc | head -2', 'identify a file from its first bytes'],
    ['xxd -p -l 8 archive.enc', 'the first 8 bytes as plain hex'],
    ['echo 464c4147 | xxd -r -p', 'decode hex back to text'],
  ],
  seeAlso: ['file(1)', 'strings(1)', 'base64(1)', 'od(1)'],
  run: async (ctx) => {
    const outcome = parseOptions(
      ctx.name,
      ctx.args,
      [
        { short: 'c', arg: 'required' },
        { short: 'g', arg: 'required' },
        { short: 'l', arg: 'required' },
        { short: 's', arg: 'required' },
        { short: 'p' },
        { short: 'r' },
        { short: 'u' },
      ],
      { unsupported: ['b', 'i', 'e'] },
    );
    if (!outcome.ok) {
      ctx.stderr(outcome.message);
      return 1;
    }
    const o = outcome.options;
    const operand = o.operands[0] ?? '-';
    const input = await readOperand(ctx, operand);
    if (input === null) return 130;
    if (!input.ok) {
      ctx.stderr(`${ctx.name}: ${operand}: ${strerror(input.errno)}\n`);
      return 1;
    }

    if (o.has('r')) {
      const bytes = unhex(input.data);
      if (bytes === null) {
        ctx.stderr(`${ctx.name}: sorry, cannot revert this type of hexdump\n`);
        return 1;
      }
      ctx.stdout(bytes);
      return 0;
    }

    const start = Number(o.value('s') ?? '0') || 0;
    const limit = o.value('l') !== undefined ? Number(o.value('l')) : Infinity;
    const data = input.data.slice(start, limit === Infinity ? undefined : start + limit);

    if (o.has('p')) {
      const columns = Number(o.value('c') ?? '30') || 30;
      let line = '';
      for (let i = 0; i < data.length; i++) {
        line += hex(data.charCodeAt(i) & 0xff);
        if ((i + 1) % columns === 0) {
          ctx.stdout(`${line}\n`);
          line = '';
        }
      }
      if (line !== '') ctx.stdout(`${line}\n`);
      return 0;
    }

    const columns = Number(o.value('c') ?? '16') || 16;
    const groupSize = Number(o.value('g') ?? '2') || 2;
    for (let i = 0; i < data.length; i += columns) {
      ctx.stdout(dumpLine(start + i, data.slice(i, i + columns), columns, groupSize));
    }
    return 0;
  },
});
