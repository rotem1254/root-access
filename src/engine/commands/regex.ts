/**
 * POSIX regular expressions (basic and extended, with the GNU extensions grep supports)
 * translated to JavaScript RegExp source, with GNU grep's error messages.
 */

export type RegexDialect = 'basic' | 'extended' | 'fixed';

export class RegexError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegexError';
  }
}

const CLASSES: Readonly<Record<string, string>> = {
  alpha: 'A-Za-z',
  digit: '0-9',
  alnum: 'A-Za-z0-9',
  upper: 'A-Z',
  lower: 'a-z',
  space: ' \\t\\n\\r\\f\\v',
  blank: ' \\t',
  punct: '!-\\/:-@\\[-`{-~',
  xdigit: '0-9A-Fa-f',
  print: ' -~',
  graph: '!-~',
  cntrl: '\\x00-\\x1f\\x7f',
};

const escapeRegExp = (char: string): string => char.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');

/** Parses `[...]` starting at `start`; POSIX brackets treat backslash literally. */
function bracket(pattern: string, start: number): { source: string; end: number } {
  let i = start + 1;
  let negate = false;
  if (pattern.charAt(i) === '^') {
    negate = true;
    i += 1;
  }
  let body = '';
  let first = true;
  while (i < pattern.length) {
    const c = pattern.charAt(i);
    if (c === ']' && !first) return { source: `[${negate ? '^' : ''}${body}]`, end: i + 1 };
    first = false;
    if (c === '[' && pattern.charAt(i + 1) === ':') {
      const close = pattern.indexOf(':]', i + 2);
      if (close < 0) break;
      const cls = CLASSES[pattern.slice(i + 2, close)];
      if (cls === undefined) throw new RegexError('Invalid character class name');
      body += cls;
      i = close + 2;
      continue;
    }
    if (c === '-' && body !== '' && pattern.charAt(i + 1) !== ']') {
      body += '-';
    } else {
      body += escapeRegExp(c);
    }
    i += 1;
  }
  throw new RegexError('Unmatched [, [^, [:, [., or [=');
}

/** Translates a basic or extended regular expression into JavaScript regex source. */
export function translateRegex(pattern: string, dialect: RegexDialect): string {
  if (dialect === 'fixed') return escapeRegExp(pattern).replace(/\n/g, '\\n');
  const extended = dialect === 'extended';
  let out = '';
  let depth = 0;
  let atomStart = true;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern.charAt(i);
    if (c === '\\') {
      if (i + 1 >= pattern.length) throw new RegexError('Trailing backslash');
      const e = pattern.charAt(++i);
      if (!extended && e === '(') {
        out += '(';
        depth += 1;
        atomStart = true;
      } else if (!extended && e === ')') {
        if (depth === 0) throw new RegexError('Unmatched ) or \\)');
        out += ')';
        depth -= 1;
        atomStart = false;
      } else if (!extended && e === '{') {
        const close = pattern.indexOf('\\}', i + 1);
        const body = close < 0 ? '' : pattern.slice(i + 1, close);
        if (close < 0 || !/^\d*(,\d*)?$/.test(body) || body === '' || body === ',') {
          throw new RegexError(close < 0 ? 'Unmatched \\{' : 'Invalid content of \\{\\}');
        }
        out += `{${body}}`;
        i = close + 1;
        atomStart = false;
      } else if (!extended && (e === '|' || e === '+' || e === '?')) {
        out += e;
        atomStart = e === '|';
      } else if (e === '<') {
        out += '\\b(?=\\w)';
      } else if (e === '>') {
        out += '\\b(?<=\\w)';
      } else if ('wWsSbB'.includes(e)) {
        out += `\\${e}`;
        atomStart = false;
      } else if (/[1-9]/.test(e)) {
        out += `\\${e}`;
        atomStart = false;
      } else {
        out += escapeRegExp(e);
        atomStart = false;
      }
      continue;
    }
    if (c === '[') {
      const parsed = bracket(pattern, i);
      out += parsed.source;
      i = parsed.end - 1;
      atomStart = false;
      continue;
    }
    if (c === '.') {
      out += '.';
      atomStart = false;
      continue;
    }
    if (c === '^') {
      out += extended || atomStart ? '^' : '\\^';
      continue;
    }
    if (c === '$') {
      const next = pattern.slice(i + 1);
      const atEnd =
        next === '' || (!extended && next.startsWith('\\)')) || (extended && /^[)|]/.test(next));
      out += extended || atEnd ? '$' : '\\$';
      continue;
    }
    if (c === '*') {
      out += atomStart ? '\\*' : '*';
      continue;
    }
    if (extended) {
      if (c === '(') {
        out += '(';
        depth += 1;
        atomStart = true;
        continue;
      }
      if (c === ')') {
        if (depth === 0) {
          out += '\\)';
          atomStart = false;
          continue;
        }
        out += ')';
        depth -= 1;
        atomStart = false;
        continue;
      }
      if (c === '|') {
        out += '|';
        atomStart = true;
        continue;
      }
      if (c === '+' || c === '?') {
        out += atomStart ? `\\${c}` : c;
        continue;
      }
      if (c === '{') {
        const close = pattern.indexOf('}', i + 1);
        const body = close < 0 ? '' : pattern.slice(i + 1, close);
        if (close >= 0 && /^\d+(,\d*)?$|^,\d+$/.test(body) && !atomStart) {
          out += `{${body}}`;
          i = close;
        } else {
          out += '\\{';
        }
        continue;
      }
    }
    out += escapeRegExp(c);
    atomStart = false;
  }
  if (depth > 0) throw new RegexError('Unmatched ( or \\(');
  return out;
}

export interface MatcherOptions {
  dialect: RegexDialect;
  ignoreCase: boolean;
  wordRegexp: boolean;
  lineRegexp: boolean;
}

/** Builds one global RegExp matching any of the patterns (grep's newline-separated list). */
export function buildMatcher(patterns: readonly string[], options: MatcherOptions): RegExp {
  const alternatives = patterns.map((pattern) => {
    const source = translateRegex(pattern, options.dialect);
    return `(?:${source})`;
  });
  let source = alternatives.length === 0 ? '(?!)' : alternatives.join('|');
  if (options.lineRegexp) source = `^(?:${source})$`;
  else if (options.wordRegexp) source = `(?<![A-Za-z0-9_])(?:${source})(?![A-Za-z0-9_])`;
  try {
    return new RegExp(source, options.ignoreCase ? 'gi' : 'g');
  } catch {
    throw new RegexError('Invalid regular expression');
  }
}
