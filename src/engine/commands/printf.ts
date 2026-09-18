import { defineCommand } from './define';
import type { CommandContext } from './types';

/** Interprets backslash escapes in a format string (printf's rules). */
function unescape(text: string): { out: string; stop: boolean } {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text.charAt(i);
    if (c !== '\\') {
      out += c;
      continue;
    }
    const e = text.charAt(i + 1);
    const simple: Record<string, string> = {
      '\\': '\\',
      a: '\x07',
      b: '\b',
      e: '\x1b',
      f: '\f',
      n: '\n',
      r: '\r',
      t: '\t',
      v: '\v',
      '"': '"',
    };
    if (simple[e] !== undefined) {
      out += simple[e];
      i += 1;
    } else if (e === 'c') {
      return { out, stop: true };
    } else if (e === 'x' && /[0-9A-Fa-f]/.test(text.charAt(i + 2))) {
      const hex = /^[0-9A-Fa-f]{1,2}/.exec(text.slice(i + 2))?.[0] ?? '';
      out += String.fromCharCode(Number.parseInt(hex, 16));
      i += 1 + hex.length;
    } else if (e === '0' || (e >= '1' && e <= '9')) {
      const oct = /^[0-7]{1,3}/.exec(text.slice(i + (e === '0' ? 2 : 1)))?.[0] ?? '';
      out += String.fromCharCode(Number.parseInt(oct || '0', 8) & 0xff);
      i += (e === '0' ? 1 : 0) + oct.length;
    } else {
      out += c;
    }
  }
  return { out, stop: false };
}

function toInt(value: string, ctx: CommandContext): number {
  if (value.startsWith("'") || value.startsWith('"')) return value.charCodeAt(1) || 0;
  const n = Number.parseInt(value, value.startsWith('0x') || value.startsWith('0X') ? 16 : 10);
  if (Number.isNaN(n)) {
    if (value !== '') ctx.stderr(`printf: ${value}: expected a numeric value\n`);
    return 0;
  }
  return n;
}

/** Formats one directive; returns the text and whether an argument was consumed. */
function formatOne(
  spec: string,
  conversion: string,
  arg: string | undefined,
  ctx: CommandContext,
): string {
  const flagMatch = /^%([-+ 0#]*)(\d+|\*)?(?:\.(\d+|\*))?/.exec(spec);
  const flags = flagMatch?.[1] ?? '';
  const width = flagMatch?.[2] ? Number(flagMatch[2]) : 0;
  const precisionText = flagMatch?.[3];
  const value = arg ?? '';
  let text: string;
  switch (conversion) {
    case 's':
      text = precisionText !== undefined ? value.slice(0, Number(precisionText)) : value;
      break;
    case 'd':
    case 'i': {
      const n = toInt(value, ctx);
      text = Math.abs(n).toString();
      if (precisionText) text = text.padStart(Number(precisionText), '0');
      if (n < 0) text = `-${text}`;
      else if (flags.includes('+')) text = `+${text}`;
      else if (flags.includes(' ')) text = ` ${text}`;
      break;
    }
    case 'x':
    case 'X': {
      const n = toInt(value, ctx);
      text = (n >>> 0).toString(16);
      if (conversion === 'X') text = text.toUpperCase();
      if (precisionText) text = text.padStart(Number(precisionText), '0');
      if (flags.includes('#') && n !== 0) text = `0${conversion}${text}`;
      break;
    }
    case 'o': {
      const n = toInt(value, ctx);
      text = (n >>> 0).toString(8);
      break;
    }
    case 'c':
      text = value.charAt(0);
      break;
    case '%':
      return '%';
    default:
      ctx.stderr(`printf: %${conversion}: invalid conversion specification\n`);
      return '';
  }
  if (width > text.length) {
    text = flags.includes('-')
      ? text.padEnd(width)
      : text.padStart(width, flags.includes('0') && 'dioxX'.includes(conversion) ? '0' : ' ');
  }
  return text;
}

export const printf = defineCommand({
  name: 'printf',
  kind: 'builtin',
  handlesHelp: false,
  description: 'Formats and prints ARGUMENTS under control of the FORMAT.',
  usage: ['FORMAT [ARGUMENT]...'],
  about:
    'Write the formatted ARGUMENTs to standard output under the control of FORMAT.\nFORMAT controls the output as in C printf. Interpreted sequences include\n%s (string), %d (integer), %x (hex), %c (character), %% and escapes like \\n \\t.',
  details:
    'Unlike echo, printf does not add a trailing newline unless the format contains\none. It reuses the format if there are more arguments than directives:\n  printf "%s\\n" a b c    prints a, b and c on separate lines.',
  examples: [
    ['printf "%s\\n" hello', 'print a string with a newline'],
    ['printf "%-8s %d\\n" name 42', 'pad a field and print a number'],
  ],
  seeAlso: ['echo(1)'],
  run: async (ctx) => {
    const [format, ...args] = ctx.args;
    if (format === undefined) {
      ctx.stderr('printf: usage: printf [-v var] format [arguments]\n');
      return 2;
    }
    const directive = /%[-+ 0#]*(?:\d+|\*)?(?:\.(?:\d+|\*))?[diouxXcsq%]/g;
    let out = '';
    let argIndex = 0;
    do {
      let last = 0;
      directive.lastIndex = 0;
      const startArg = argIndex;
      for (let m = directive.exec(format); m; m = directive.exec(format)) {
        out += unescape(format.slice(last, m.index)).out;
        last = m.index + m[0].length;
        const conversion = m[0].charAt(m[0].length - 1);
        if (conversion === '%') {
          out += '%';
          continue;
        }
        if (conversion === 'q') {
          out += args[argIndex] ?? '';
          argIndex += 1;
          continue;
        }
        out += formatOne(m[0], conversion, args[argIndex], ctx);
        argIndex += 1;
      }
      const tail = unescape(format.slice(last));
      out += tail.out;
      if (tail.stop) {
        ctx.stdout(out);
        return 0;
      }
      if (argIndex === startArg) break;
    } while (argIndex < args.length);
    ctx.stdout(out);
    return 0;
  },
});
