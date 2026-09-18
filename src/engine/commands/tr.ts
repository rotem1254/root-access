import type { ByteString } from '../util/bytes';
import { parseOptions } from './args';
import { defineCommand } from './define';

/**
 * Expands a SET the way tr does: ranges (a-z), escapes (\n, \t, \\) and the common character
 * classes. Returns the set as a list of single characters.
 */
/** Pushes each code unit of `text`; byte strings are one code unit per byte. */
function pushChars(out: string[], text: string): void {
  for (let i = 0; i < text.length; i++) out.push(text.charAt(i));
}

export function expandSet(set: string): string[] {
  const out: string[] = [];
  const classes: Record<string, string> = {
    alpha: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
    lower: 'abcdefghijklmnopqrstuvwxyz',
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    digit: '0123456789',
    alnum: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
    space: ' \t\n\v\f\r',
    blank: ' \t',
    punct: '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~',
  };
  for (let i = 0; i < set.length;) {
    // [:class:]
    if (set.startsWith('[:', i)) {
      const end = set.indexOf(':]', i);
      if (end > 0) {
        const name = set.slice(i + 2, end);
        const chars = classes[name];
        if (chars !== undefined) {
          pushChars(out, chars);
          i = end + 2;
          continue;
        }
      }
    }
    let char = set[i] ?? '';
    let width = 1;
    if (char === '\\' && i + 1 < set.length) {
      const next = set[i + 1] ?? '';
      const escapes: Record<string, string> = {
        n: '\n',
        t: '\t',
        r: '\r',
        f: '\f',
        v: '\v',
        '\\': '\\',
        '0': '\0',
      };
      char = escapes[next] ?? next;
      width = 2;
    }
    // range a-z
    const dash = i + width;
    if (set[dash] === '-' && dash + 1 < set.length) {
      const endChar = set[dash + 1] ?? '';
      const from = char.charCodeAt(0);
      const to = endChar.charCodeAt(0);
      if (to >= from) {
        for (let c = from; c <= to; c++) out.push(String.fromCharCode(c));
        i = dash + 2;
        continue;
      }
    }
    out.push(char);
    i += width;
  }
  return out;
}

export const tr = defineCommand({
  name: 'tr',
  kind: 'binary',
  description: 'translate or delete characters',
  usage: ['[OPTION]... SET1 [SET2]'],
  about:
    'Translate, squeeze or delete characters read from standard input. tr maps each\ncharacter of SET1 to the character in the same position of SET2. It is the\nquickest way to apply a substitution cipher such as ROT13.',
  options: [
    ['-d, --delete', 'delete characters in SET1'],
    ['-s, --squeeze-repeats', 'replace each sequence of a repeated character with one'],
    ['-c, -C, --complement', 'use the complement of SET1'],
  ],
  details:
    "SET1 and SET2 may use ranges (a-z), escapes (\\n, \\t) and classes like\n[:alpha:] or [:digit:].\n\nROT13 rotates each letter 13 places, so applying it twice gives the original:\n  tr 'A-Za-z' 'N-ZA-Mn-za-m' < message.txt\n\nOther common uses:\n  tr 'a-z' 'A-Z'      upper-case everything\n  tr -d '\\n'          strip newlines\n  tr -s ' '           collapse runs of spaces",
  examples: [
    ["tr 'A-Za-z' 'N-ZA-Mn-za-m' < note.txt", 'decode ROT13'],
    ["cat f | tr 'a-z' 'A-Z'", 'upper-case the input'],
    ["tr -d '\\r' < dos.txt", 'strip carriage returns'],
  ],
  seeAlso: ['base64(1)', 'sed(1)', 'cut(1)'],
  run: async (ctx) => {
    const outcome = parseOptions(
      ctx.name,
      ctx.args,
      [
        { short: 'd', long: 'delete' },
        { short: 's', long: 'squeeze-repeats' },
        { short: 'c', long: 'complement' },
        { short: 'C', key: 'complement' },
      ],
      { unsupported: ['t', 'truncate-set1'] },
    );
    if (!outcome.ok) {
      ctx.stderr(outcome.message);
      return 1;
    }
    const o = outcome.options;
    const [set1Raw, set2Raw] = o.operands;
    if (set1Raw === undefined) {
      ctx.stderr(`tr: missing operand\nTry 'tr --help' for more information.\n`);
      return 1;
    }
    const deleting = o.has('delete');
    if (!deleting && set2Raw === undefined && !o.has('squeeze-repeats')) {
      ctx.stderr(
        `tr: missing operand after '${set1Raw}'\nTwo strings must be given when translating.\nTry 'tr --help' for more information.\n`,
      );
      return 1;
    }
    const set1 = expandSet(set1Raw);
    const set2 = set2Raw === undefined ? [] : expandSet(set2Raw);
    const complement = o.has('complement');
    const inSet1 = (char: string): boolean =>
      complement ? !set1.includes(char) : set1.includes(char);

    const data = await ctx.stdin.readAll();
    if (data === null) return 130;

    let out: ByteString = '';
    let previous: string | null = null;
    // Iterate code units: the engine's data is a byte string, one code unit per byte.
    for (let index = 0; index < data.length; index++) {
      const char = data.charAt(index);
      let mapped: string | null = char;
      if (deleting && inSet1(char)) {
        mapped = null;
      } else if (!deleting && set2.length > 0 && inSet1(char)) {
        const index = complement ? set2.length - 1 : set1.indexOf(char);
        mapped = set2[Math.min(index, set2.length - 1)] ?? char;
      }
      if (mapped === null) continue;
      // -s squeezes runs of characters that are in the squeeze set (SET2 when translating).
      if (o.has('squeeze-repeats')) {
        const squeezeSet = !deleting && set2.length > 0 ? set2 : set1;
        if (mapped === previous && squeezeSet.includes(mapped)) continue;
      }
      out += mapped;
      previous = mapped;
    }
    ctx.stdout(out);
    return 0;
  },
});
