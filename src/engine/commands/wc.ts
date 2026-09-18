import { strerror } from '../errors';
import type { ByteString } from '../util/bytes';
import { utf8Decode } from '../util/bytes';
import { parseOptions } from './args';
import { defineCommand } from './define';
import { readOperand } from './util';

interface Counts {
  lines: number;
  words: number;
  bytes: number;
  chars: number;
  maxLine: number;
}

function count(data: ByteString): Counts {
  let lines = 0;
  let words = 0;
  let inWord = false;
  let lineLength = 0;
  let maxLine = 0;
  for (let i = 0; i < data.length; i++) {
    const c = data.charCodeAt(i);
    if (c === 10) {
      lines += 1;
      if (lineLength > maxLine) maxLine = lineLength;
      lineLength = 0;
    } else {
      lineLength += c === 9 ? 8 - (lineLength % 8) : 1;
    }
    const space = c === 32 || c === 9 || c === 10 || c === 12 || c === 13 || c === 11;
    if (space) {
      inWord = false;
    } else if (!inWord) {
      inWord = true;
      words += 1;
    }
  }
  if (lineLength > maxLine) maxLine = lineLength;
  return { lines, words, bytes: data.length, chars: utf8Decode(data).length, maxLine };
}

export const wc = defineCommand({
  name: 'wc',
  kind: 'binary',
  description: 'print newline, word, and byte counts for each file',
  usage: ['[OPTION]... [FILE]...'],
  about:
    'Print newline, word, and byte counts for each FILE, and a total line if more\nthan one FILE is specified. With no FILE, or when FILE is -, read standard input.\nA word is a non-empty sequence of characters delimited by white space.',
  options: [
    ['-c, --bytes', 'print the byte counts'],
    ['-m, --chars', 'print the character counts'],
    ['-l, --lines', 'print the newline counts'],
    ['-w, --words', 'print the word counts'],
    ['-L, --max-line-length', 'print the maximum display width'],
  ],
  details:
    'With no options, wc prints three numbers: lines, words and bytes, in that order. A common use is counting matches: grep something file | wc -l.',
  examples: [
    ['wc -l auth.log', 'count the lines in a file'],
    ['grep Failed auth.log | wc -l', 'count matching lines'],
    ['ls | wc -l', 'count entries in a directory'],
  ],
  seeAlso: ['grep(1)', 'sort(1)', 'uniq(1)'],
  run: async (ctx) => {
    const outcome = parseOptions(ctx.name, ctx.args, [
      { short: 'c', long: 'bytes' },
      { short: 'm', long: 'chars' },
      { short: 'l', long: 'lines' },
      { short: 'w', long: 'words' },
      { short: 'L', long: 'max-line-length' },
    ]);
    if (!outcome.ok) {
      ctx.stderr(outcome.message);
      return 1;
    }
    const o = outcome.options;
    const selected = ['lines', 'words', 'bytes', 'chars', 'max-line-length'].filter((k) =>
      o.has(k),
    );
    const show = {
      lines: selected.length === 0 || o.has('lines'),
      words: selected.length === 0 || o.has('words'),
      bytes: selected.length === 0 || o.has('bytes'),
      chars: o.has('chars'),
      maxLine: o.has('max-line-length'),
    };
    const operands = o.operands.length > 0 ? o.operands : ['-'];
    const rows: { counts: Counts; label: string }[] = [];
    const total: Counts = { lines: 0, words: 0, bytes: 0, chars: 0, maxLine: 0 };
    let status = 0;
    for (const operand of operands) {
      const input = await readOperand(ctx, operand);
      if (input === null) return 130;
      if (!input.ok) {
        ctx.stderr(`wc: ${operand}: ${strerror(input.errno)}\n`);
        status = 1;
        continue;
      }
      const counts = count(input.data);
      rows.push({ counts, label: operand === '-' ? '' : operand });
      total.lines += counts.lines;
      total.words += counts.words;
      total.bytes += counts.bytes;
      total.chars += counts.chars;
      total.maxLine = Math.max(total.maxLine, counts.maxLine);
    }
    if (rows.length > 1) rows.push({ counts: total, label: 'total' });
    const shownKeys = (['lines', 'words', 'chars', 'bytes', 'maxLine'] as const).filter(
      (k) => show[k === 'maxLine' ? 'maxLine' : k],
    );
    // A single count for a single file is not padded; otherwise pad to the widest shown count.
    const pad =
      rows.length === 1 && shownKeys.length === 1
        ? 0
        : Math.max(1, ...rows.flatMap((row) => shownKeys.map((k) => String(row.counts[k]).length)));
    for (const row of rows) {
      const fields: string[] = [];
      if (show.lines) fields.push(String(row.counts.lines).padStart(pad));
      if (show.words) fields.push(String(row.counts.words).padStart(pad));
      if (show.chars) fields.push(String(row.counts.chars).padStart(pad));
      if (show.bytes) fields.push(String(row.counts.bytes).padStart(pad));
      if (show.maxLine) fields.push(String(row.counts.maxLine).padStart(pad));
      ctx.stdout(`${fields.join(' ')}${row.label ? ` ${row.label}` : ''}\n`);
    }
    return status;
  },
});
