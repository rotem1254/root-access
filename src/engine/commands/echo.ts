import { defineCommand } from './define';

const ESCAPES: Readonly<Record<string, string>> = {
  '\\': '\\',
  a: '\x07',
  b: '\b',
  e: '\x1b',
  E: '\x1b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
  v: '\v',
};

/** Backslash escapes for `echo -e`. `stop` is set by `\c`, which ends all output. */
function interpret(text: string): { text: string; stop: boolean } {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text.charAt(i);
    const e = text.charAt(i + 1);
    if (c !== '\\' || e === '') {
      out += c;
      continue;
    }
    if (e === 'c') return { text: out, stop: true };
    const simple = ESCAPES[e];
    if (simple !== undefined) {
      out += simple;
      i += 1;
    } else if (e === '0') {
      const oct = /^[0-7]{0,3}/.exec(text.slice(i + 2))?.[0] ?? '';
      out += String.fromCharCode(Number.parseInt(oct === '' ? '0' : oct, 8) & 0xff);
      i += 1 + oct.length;
    } else if (e === 'x' && /^[0-9A-Fa-f]/.test(text.slice(i + 2))) {
      const hex = /^[0-9A-Fa-f]{1,2}/.exec(text.slice(i + 2))?.[0] ?? '0';
      out += String.fromCharCode(Number.parseInt(hex, 16));
      i += 1 + hex.length;
    } else {
      out += c;
    }
  }
  return { text: out, stop: false };
}

export const echo = defineCommand({
  name: 'echo',
  kind: 'builtin',
  handlesHelp: false,
  description: 'Write arguments to the standard output.',
  usage: ['[-neE] [arg ...]'],
  about:
    'Display the ARGs, separated by a single space character and followed by a\nnewline, on the standard output.',
  options: [
    ['-n', 'do not append a newline'],
    ['-e', 'enable interpretation of backslash escapes (\\n, \\t, \\\\, \\xHH, \\0nnn, \\c)'],
    ['-E', 'explicitly suppress interpretation of backslash escapes'],
  ],
  details:
    'Like the bash builtin, echo treats --help as an ordinary argument. Use `help echo` or `man echo`.',
  examples: [
    ['echo "Hello, $USER"', 'print a greeting; the shell expands $USER first'],
    ["echo -e 'one\\ttwo\\nthree'", 'print a tab and a newline'],
    ['echo "note" >> notes.txt', 'append a line to a file'],
  ],
  seeAlso: ['printf(1)'],
  run: async (ctx) => {
    const args = [...ctx.args];
    let newline = true;
    let escapes = false;
    while (args.length > 0 && /^-[neE]+$/.test(args[0] ?? '')) {
      for (const flag of (args.shift() ?? '').slice(1)) {
        if (flag === 'n') newline = false;
        else escapes = flag === 'e';
      }
    }
    let output = '';
    for (const [index, arg] of args.entries()) {
      if (index > 0) output += ' ';
      if (!escapes) {
        output += arg;
        continue;
      }
      const result = interpret(arg);
      output += result.text;
      if (result.stop) {
        ctx.stdout(output);
        return 0;
      }
    }
    ctx.stdout(newline ? `${output}\n` : output);
    return 0;
  },
});
