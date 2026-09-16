import { describe, expect, it } from 'vitest';
import { buildMatcher, RegexError, translateRegex } from '../../../src/engine/commands/regex';

function matches(
  pattern: string,
  text: string,
  dialect: 'basic' | 'extended' | 'fixed' = 'basic',
): boolean {
  return new RegExp(translateRegex(pattern, dialect), 's').test(text);
}

describe('translateRegex', () => {
  it('handles basic regular expressions', () => {
    expect(matches('a.c', 'abc')).toBe(true);
    expect(matches('^Mar', 'Mar 14')).toBe(true);
    expect(matches('ssh2$', 'port ssh2')).toBe(true);
    expect(matches('[0-9][0-9]', '42')).toBe(true);
    expect(matches('a*b', 'aaab')).toBe(true);
  });

  it('treats + ? | ( ) { } as literals in BRE unless backslashed', () => {
    expect(matches('a+', 'a+')).toBe(true);
    expect(matches('a+', 'aaa')).toBe(false);
    expect(matches('a\\+', 'aaa')).toBe(true);
    expect(matches('cat\\|dog', 'dog')).toBe(true);
    expect(matches('cat|dog', 'cat|dog')).toBe(true);
    expect(matches('\\(ab\\)\\{2\\}', 'abab')).toBe(true);
  });

  it('handles extended regular expressions', () => {
    expect(matches('cat|dog', 'dog', 'extended')).toBe(true);
    expect(matches('(ab)+', 'abab', 'extended')).toBe(true);
    expect(matches('colou?r', 'color', 'extended')).toBe(true);
    expect(matches('[0-9]{3}', '123', 'extended')).toBe(true);
    expect(matches('a{2,3}', 'aa', 'extended')).toBe(true);
  });

  it('supports POSIX character classes', () => {
    expect(matches('[[:digit:]]+', '42', 'extended')).toBe(true);
    expect(matches('[[:alpha:]]', '7')).toBe(false);
    expect(matches('[[:upper:]][[:lower:]]*', 'Hello')).toBe(true);
    expect(matches('[[:space:]]', ' ')).toBe(true);
    expect(matches('[^[:digit:]]', 'x')).toBe(true);
    expect(matches('[[:alnum:]_]+', 'a_1', 'extended')).toBe(true);
  });

  it('handles GNU backslash shorthands and word boundaries', () => {
    expect(matches('\\w\\+', 'abc')).toBe(true);
    expect(matches('\\s', ' ')).toBe(true);
    expect(matches('\\<word\\>', 'a word here')).toBe(true);
    expect(matches('\\bword\\b', 'a word', 'extended')).toBe(true);
    expect(matches('a\\.b', 'a.b')).toBe(true);
    expect(matches('a\\.b', 'axb')).toBe(false);
  });

  it('escapes fixed strings entirely', () => {
    expect(matches('a.c', 'a.c', 'fixed')).toBe(true);
    expect(matches('a.c', 'abc', 'fixed')).toBe(false);
    expect(matches('1+1', '1+1', 'fixed')).toBe(true);
    expect(matches('[x]', '[x]', 'fixed')).toBe(true);
  });

  it('keeps brackets, ranges and negation working', () => {
    expect(matches('[]a]', ']')).toBe(true);
    expect(matches('[^0-9]', 'a')).toBe(true);
    expect(matches('[a-c-]', '-')).toBe(true);
    expect(matches('[.]', '.')).toBe(true);
  });

  it('reports invalid expressions', () => {
    expect(() => translateRegex('[unterminated', 'extended')).toThrow(RegexError);
    expect(() => translateRegex('[[:bogus:]]', 'extended')).toThrow(RegexError);
  });
});

describe('buildMatcher', () => {
  it('combines multiple patterns and honours flags', () => {
    const matcher = buildMatcher(['cat', 'dog'], {
      dialect: 'basic',
      ignoreCase: true,
      wordRegexp: false,
      lineRegexp: false,
    });
    expect('a CAT'.match(matcher)?.[0]).toBe('CAT');
    const line = buildMatcher(['yes'], {
      dialect: 'basic',
      ignoreCase: false,
      wordRegexp: false,
      lineRegexp: true,
    });
    expect(line.test('yes')).toBe(true);
    expect(line.test('yes!')).toBe(false);
    const word = buildMatcher(['the'], {
      dialect: 'basic',
      ignoreCase: false,
      wordRegexp: true,
      lineRegexp: false,
    });
    expect(word.test('the theme')).toBe(true);
    expect('theme'.replace(word, 'X')).toBe('theme');
    expect(() =>
      buildMatcher(['('], {
        dialect: 'extended',
        ignoreCase: false,
        wordRegexp: false,
        lineRegexp: false,
      }),
    ).toThrow(RegexError);
    expect(
      buildMatcher([], {
        dialect: 'basic',
        ignoreCase: false,
        wordRegexp: false,
        lineRegexp: false,
      }).test('x'),
    ).toBe(false);
  });
});
