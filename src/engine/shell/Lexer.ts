import type { Word, WordPart } from './ast';
import { UNSUPPORTED } from './messages';

export type Operator =
  | '|'
  | '||'
  | '|&'
  | '&'
  | '&&'
  | ';'
  | ';;'
  | '<'
  | '>'
  | '>>'
  | '>|'
  | '<<'
  | '<<<'
  | '<&'
  | '>&'
  | '&>'
  | '&>>'
  | '('
  | ')'
  | '\n';

export type Token =
  | { type: 'word'; word: Word }
  /** A file descriptor number written right before a redirection: the `2` in `2>`. */
  | { type: 'io'; fd: number; raw: string }
  | { type: 'op'; op: Operator };

export type LexResult =
  | { ok: true; tokens: Token[] }
  | { ok: false; incomplete: true }
  | { ok: false; incomplete: false; error: string };

/** Longest first, so `&>>` wins over `&>` and `&`. */
const OPERATORS: readonly Operator[] = [
  '&>>',
  '<<<',
  ';;',
  '&&',
  '||',
  '|&',
  '>>',
  '<<',
  '>&',
  '<&',
  '&>',
  '>|',
  '|',
  '&',
  ';',
  '<',
  '>',
  '(',
  ')',
];

const METACHARACTERS = new Set([' ', '\t', '\n', '|', '&', ';', '(', ')', '<', '>']);
const NAME = /^[A-Za-z_][A-Za-z0-9_]*/;
const USER_CHARS = /^[A-Za-z0-9._-]*/;
const ANSI_C_ESCAPES: Readonly<Record<string, string>> = {
  a: '\x07',
  b: '\b',
  e: '\x1b',
  E: '\x1b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
  v: '\v',
  '\\': '\\',
  "'": "'",
  '"': '"',
  '?': '?',
};

class Stop extends Error {
  readonly result: LexResult;
  constructor(result: LexResult) {
    super('shell input stopped');
    this.result = result;
  }
}

const INCOMPLETE = new Stop({ ok: false, incomplete: true });
const fail = (error: string): Stop => new Stop({ ok: false, incomplete: false, error });

class WordReader {
  private readonly parts: WordPart[] = [];
  private i: number;
  private readonly start: number;
  private readonly input: string;

  constructor(input: string, start: number) {
    this.input = input;
    this.start = start;
    this.i = start;
  }

  read(): { word: Word; end: number } {
    const { input } = this;
    while (this.i < input.length) {
      const c = input.charAt(this.i);
      if (METACHARACTERS.has(c)) break;
      if (c === '\\') this.readEscape();
      else if (c === "'") this.readSingleQuoted();
      else if (c === '"') this.readDoubleQuoted();
      else if (c === '$') this.readDollar(false);
      else if (c === '`') throw fail(UNSUPPORTED.backticks);
      else if (c === '~' && this.atTildePosition()) this.readTilde();
      else {
        this.pushText(c, false);
        this.i += 1;
      }
    }
    return { word: { parts: this.parts, raw: input.slice(this.start, this.i) }, end: this.i };
  }

  private pushText(value: string, quoted: boolean): void {
    const last = this.parts[this.parts.length - 1];
    if (last?.kind === 'text' && last.quoted === quoted) last.value += value;
    else this.parts.push({ kind: 'text', value, quoted });
  }

  private atTildePosition(): boolean {
    if (this.parts.length === 0) return true;
    const only = this.parts[0];
    return (
      this.parts.length === 1 &&
      only?.kind === 'text' &&
      !only.quoted &&
      /^[A-Za-z_][A-Za-z0-9_]*=$/.test(only.value)
    );
  }

  private readTilde(): void {
    const rest = this.input.slice(this.i + 1);
    const user = USER_CHARS.exec(rest)?.[0] ?? '';
    const after = rest.charAt(user.length);
    if (after === '' || after === '/' || METACHARACTERS.has(after)) {
      this.parts.push({ kind: 'tilde', user });
      this.i += 1 + user.length;
    } else {
      this.pushText('~', false);
      this.i += 1;
    }
  }

  private readEscape(): void {
    const next = this.input.charAt(this.i + 1);
    if (next === '') throw INCOMPLETE;
    if (next !== '\n') this.pushText(next, true);
    this.i += 2;
  }

  private readSingleQuoted(): void {
    const close = this.input.indexOf("'", this.i + 1);
    if (close < 0) throw INCOMPLETE;
    this.pushText(this.input.slice(this.i + 1, close), true);
    this.i = close + 1;
  }

  private readDoubleQuoted(): void {
    const { input } = this;
    this.i += 1;
    this.pushText('', true);
    for (;;) {
      if (this.i >= input.length) throw INCOMPLETE;
      const c = input.charAt(this.i);
      if (c === '"') {
        this.i += 1;
        return;
      }
      if (c === '\\') {
        const next = input.charAt(this.i + 1);
        if (next === '') throw INCOMPLETE;
        if (next === '\n') {
          this.i += 2;
        } else if ('$`"\\'.includes(next)) {
          this.pushText(next, true);
          this.i += 2;
        } else {
          this.pushText('\\', true);
          this.i += 1;
        }
        continue;
      }
      if (c === '`') throw fail(UNSUPPORTED.backticks);
      if (c === '$') {
        this.readDollar(true);
        continue;
      }
      this.pushText(c, true);
      this.i += 1;
    }
  }

  private readDollar(quoted: boolean): void {
    const { input } = this;
    const next = input.charAt(this.i + 1);
    if (next === '(') {
      throw fail(
        input.charAt(this.i + 2) === '(' ? UNSUPPORTED.arithmetic : UNSUPPORTED.commandSubstitution,
      );
    }
    if (next === '{') {
      const close = input.indexOf('}', this.i + 2);
      if (close < 0) throw INCOMPLETE;
      const body = input.slice(this.i + 2, close);
      if (/^(?:[A-Za-z_][A-Za-z0-9_]*|[0-9]+|[?$#@*!-])$/.test(body)) {
        this.parts.push({ kind: 'param', name: body, quoted });
      } else if (/^#[A-Za-z_][A-Za-z0-9_]*$/.test(body)) {
        throw fail(UNSUPPORTED.stringLength);
      } else if (/^[A-Za-z_][A-Za-z0-9_]*(?::?[-=+?]|[#%/^,:])/.test(body)) {
        throw fail(UNSUPPORTED.parameterOperators);
      } else {
        throw fail(`bash: ${input.slice(this.i, close + 1)}: bad substitution`);
      }
      this.i = close + 1;
      return;
    }
    const name = NAME.exec(input.slice(this.i + 1))?.[0];
    if (name !== undefined) {
      this.parts.push({ kind: 'param', name, quoted });
      this.i += 1 + name.length;
      return;
    }
    if (next !== '' && '?$#@*!-0123456789'.includes(next)) {
      this.parts.push({ kind: 'param', name: next, quoted });
      this.i += 2;
      return;
    }
    if (!quoted && next === "'") {
      this.readAnsiCQuoted();
      return;
    }
    if (!quoted && next === '"') {
      this.i += 1;
      return;
    }
    this.pushText('$', quoted);
    this.i += 1;
  }

  /** `$'...'`: single quotes with C escapes such as `\n`, `\t` and `\x41`. */
  private readAnsiCQuoted(): void {
    const { input } = this;
    let i = this.i + 2;
    let value = '';
    for (;;) {
      if (i >= input.length) throw INCOMPLETE;
      const c = input.charAt(i);
      if (c === "'") break;
      if (c !== '\\') {
        value += c;
        i += 1;
        continue;
      }
      const e = input.charAt(i + 1);
      if (e === '') throw INCOMPLETE;
      const simple = ANSI_C_ESCAPES[e];
      if (simple !== undefined) {
        value += simple;
        i += 2;
      } else if (e === 'x' && /^[0-9A-Fa-f]{1,2}/.test(input.slice(i + 2))) {
        const hex = /^[0-9A-Fa-f]{1,2}/.exec(input.slice(i + 2))?.[0] ?? '0';
        value += String.fromCharCode(Number.parseInt(hex, 16));
        i += 2 + hex.length;
      } else if (/^[0-7]/.test(e)) {
        const oct = /^[0-7]{1,3}/.exec(input.slice(i + 1))?.[0] ?? '0';
        value += String.fromCharCode(Number.parseInt(oct, 8) & 0xff);
        i += 1 + oct.length;
      } else {
        value += `\\${e}`;
        i += 2;
      }
    }
    this.pushText(value, true);
    this.i = i + 1;
  }
}

/** Splits a command line into words and operators, bash-style. */
export function lex(input: string): LexResult {
  const tokens: Token[] = [];
  let i = 0;
  try {
    while (i < input.length) {
      const c = input.charAt(i);
      if (c === ' ' || c === '\t') {
        i += 1;
        continue;
      }
      if (c === '\\' && input.charAt(i + 1) === '\n') {
        i += 2;
        continue;
      }
      if (c === '\n') {
        tokens.push({ type: 'op', op: '\n' });
        i += 1;
        continue;
      }
      if (c === '#') {
        while (i < input.length && input.charAt(i) !== '\n') i += 1;
        continue;
      }
      const op = OPERATORS.find((candidate) => input.startsWith(candidate, i));
      if (op) {
        tokens.push({ type: 'op', op });
        i += op.length;
        continue;
      }
      const { word, end } = new WordReader(input, i).read();
      i = end;
      const next = input.charAt(i);
      const onlyDigits =
        /^\d+$/.test(word.raw) && word.parts.every((p) => p.kind === 'text' && !p.quoted);
      if (onlyDigits && (next === '<' || next === '>')) {
        tokens.push({ type: 'io', fd: Number(word.raw), raw: word.raw });
      } else {
        tokens.push({ type: 'word', word });
      }
    }
  } catch (error) {
    if (error instanceof Stop) return error.result;
    throw error;
  }
  return { ok: true, tokens };
}
