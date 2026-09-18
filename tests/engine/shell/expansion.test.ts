import { describe, expect, it } from 'vitest';
import { Environment } from '../../../src/engine/shell/Environment';
import {
  expandAssignment,
  type ExpansionContext,
  expandWords,
} from '../../../src/engine/shell/expand';
import {
  compareBytes,
  escapeGlob,
  expandPathname,
  globToRegExp,
  type GlobFileSystem,
  hasGlobChars,
  matchGlob,
  unescapeGlob,
} from '../../../src/engine/shell/glob';
import { parse } from '../../../src/engine/shell/Parser';

describe('glob matching', () => {
  it.each([
    ['*.txt', 'notes.txt', true],
    ['*.txt', 'notes.txt.bak', false],
    ['?.log', 'a.log', true],
    ['?.log', 'ab.log', false],
    ['[abc]*', 'banana', true],
    ['[!abc]*', 'banana', false],
    ['[^abc]*', 'delta', true],
    ['[a-c]x', 'bx', true],
    ['[a-c]x', 'dx', false],
    ['file[[:digit:]]', 'file7', true],
    ['file[[:digit:]]', 'filex', false],
    ['[[:upper:]]*', 'README', true],
    ['[]]', ']', true],
    ['[!]]', 'a', true],
    ['[a-]', '-', true],
    ['\\*', '*', true],
    ['\\*', 'x', false],
    ['[unterminated', '[unterminated', true],
    ['a.b', 'axb', false],
    ['*', '.hidden', false],
    ['.*', '.hidden', true],
    ['\\.h*', '.hidden', true],
    ['[.]hidden', '.hidden', false],
  ])('%j matches %j: %s', (pattern, name, expected) => {
    expect(matchGlob(pattern, name)).toBe(expected);
  });

  it('lets find-style matching see dotfiles and ignore case', () => {
    expect(matchGlob('*', '.hidden', { dotMatchesWildcard: true })).toBe(true);
    expect(matchGlob('*.BAK', 'x.bak', { caseInsensitive: true, dotMatchesWildcard: true })).toBe(
      true,
    );
    expect(globToRegExp('a/b').test('a/b')).toBe(true);
    expect(matchGlob('[[:space:][:punct:]]', '!')).toBe(true);
  });

  it('detects, escapes and unescapes glob characters', () => {
    expect(hasGlobChars('plain')).toBe(false);
    expect(hasGlobChars('a\\*b')).toBe(false);
    expect(hasGlobChars('a*b')).toBe(true);
    expect(escapeGlob('a*b?[c]\\')).toBe('a\\*b\\?\\[c\\]\\\\');
    expect(unescapeGlob('a\\*b')).toBe('a*b');
  });

  it('compares like the C locale', () => {
    expect(['b', 'B', '.a', '_z', 'a'].sort(compareBytes)).toEqual(['.a', 'B', '_z', 'a', 'b']);
    expect(compareBytes('x', 'x')).toBe(0);
  });
});

describe('pathname expansion', () => {
  const tree: Record<string, string[]> = {
    '/': ['home', 'etc'],
    '/home': ['guest', 'admin'],
    '/home/guest': ['notes.txt', 'memo.txt', '.handover', 'docs', 'x*y'],
    '/home/guest/docs': ['a.md', 'b.md'],
    '/home/admin': [],
    '/etc': ['passwd', 'group', 'nginx'],
    '/etc/nginx': ['nginx.conf.bak'],
  };
  const dirs = new Set(Object.keys(tree));
  const fs: GlobFileSystem = {
    readdir: (path) => tree[path.replace(/\/+$/, '') || '/'] ?? null,
    isDirectory: (path) => dirs.has(path),
    exists: (path) => {
      if (dirs.has(path)) return true;
      const slash = path.lastIndexOf('/');
      const parent = path.slice(0, slash) || '/';
      return (tree[parent] ?? []).includes(path.slice(slash + 1));
    },
  };

  it('expands relative patterns to relative, sorted paths', () => {
    expect(expandPathname('*.txt', '/home/guest', fs)).toEqual(['memo.txt', 'notes.txt']);
    expect(expandPathname('docs/*', '/home/guest', fs)).toEqual(['docs/a.md', 'docs/b.md']);
  });

  it('expands absolute patterns across directories', () => {
    expect(expandPathname('/home/*/notes.txt', '/', fs)).toEqual(['/home/guest/notes.txt']);
    expect(expandPathname('/etc/*/*.bak', '/', fs)).toEqual(['/etc/nginx/nginx.conf.bak']);
  });

  it('matches only directories with a trailing slash', () => {
    expect(expandPathname('/home/guest/*/', '/', fs)).toEqual(['/home/guest/docs/']);
  });

  it('skips dotfiles unless the pattern starts with a dot', () => {
    expect(expandPathname('*', '/home/guest', fs)).not.toContain('.handover');
    expect(expandPathname('.*', '/home/guest', fs)).toEqual(['.handover']);
  });

  it('returns null when nothing matches or the pattern has no glob', () => {
    expect(expandPathname('*.pdf', '/home/guest', fs)).toBeNull();
    expect(expandPathname('/nope/*', '/', fs)).toBeNull();
    expect(expandPathname('notes.txt', '/home/guest', fs)).toBeNull();
    expect(expandPathname('/home/admin/*', '/', fs)).toBeNull();
  });
});

describe('Environment', () => {
  it('tracks values, exports and the working directory', () => {
    const env = new Environment('/home/guest', { HOME: '/home/guest', PATH: '/usr/bin' });
    env.set('LOCAL', '1');
    expect(env.get('LOCAL')).toBe('1');
    expect(env.isExported('LOCAL')).toBe(false);
    expect(env.exported()).toEqual([
      ['HOME', '/home/guest'],
      ['PATH', '/usr/bin'],
    ]);
    env.export('LOCAL');
    env.set('LOCAL', '2');
    expect(env.isExported('LOCAL')).toBe(true);
    env.export('NEW', 'v');
    expect(env.get('NEW')).toBe('v');
    env.export('LATER');
    expect(env.isExported('LATER')).toBe(true);
    expect(env.has('LATER')).toBe(false);
    env.unexport('LOCAL');
    expect(env.isExported('LOCAL')).toBe(false);
    env.unset('NEW');
    expect(env.has('NEW')).toBe(false);
    expect(env.names()).toContain('LOCAL');

    env.lastStatus = 3;
    const copy = env.clone();
    copy.set('HOME', '/root');
    copy.cwd = '/root';
    expect(env.get('HOME')).toBe('/home/guest');
    expect(copy.lastStatus).toBe(3);
    expect(copy.isExported('LATER')).toBe(true);
  });
});

describe('word expansion', () => {
  const vars: Record<string, string> = {
    HOME: '/home/guest',
    USER: 'guest',
    SPACED: '  one two  ',
    EMPTY: '',
    STAR: '*.txt',
    '?': '0',
  };
  const context: ExpansionContext = {
    lookup: (name) => vars[name],
    home: () => '/home/guest',
    homeOf: (user) => (user === 'admin' ? '/home/admin' : undefined),
    glob: (pattern) => (pattern === '*.txt' ? ['memo.txt', 'notes.txt'] : null),
  };

  const expand = (input: string): string[] => {
    const result = parse(input);
    if (!result.ok) throw new Error('parse failed');
    return expandWords(result.list.items[0]!.pipeline.commands[0]!.words, context);
  };

  it('expands variables and special parameters', () => {
    expect(expand('echo $USER ${HOME} $? $UNSET')).toEqual(['echo', 'guest', '/home/guest', '0']);
  });

  it('splits unquoted expansions but not quoted ones', () => {
    expect(expand('echo $SPACED')).toEqual(['echo', 'one', 'two']);
    expect(expand('echo "$SPACED"')).toEqual(['echo', '  one two  ']);
    expect(expand('echo x${SPACED}y')).toEqual(['echo', 'x', 'one', 'two', 'y']);
  });

  it('drops empty unquoted expansions but keeps empty quoted words', () => {
    expect(expand('echo $EMPTY "" \'\' "$EMPTY"')).toEqual(['echo', '', '', '']);
  });

  it('expands tildes', () => {
    expect(expand('ls ~ ~/docs ~admin ~ghost "~"')).toEqual([
      'ls',
      '/home/guest',
      '/home/guest/docs',
      '/home/admin',
      '~ghost',
      '~',
    ]);
  });

  it('globs unquoted patterns and keeps literal text when nothing matches', () => {
    expect(expand('cat *.txt')).toEqual(['cat', 'memo.txt', 'notes.txt']);
    expect(expand('cat "*.txt"')).toEqual(['cat', '*.txt']);
    expect(expand('cat \\*.txt')).toEqual(['cat', '*.txt']);
    expect(expand('find / -name *.bak')).toEqual(['find', '/', '-name', '*.bak']);
    expect(expand('echo $STAR')).toEqual(['echo', 'memo.txt', 'notes.txt']);
    expect(expand('echo "$STAR"')).toEqual(['echo', '*.txt']);
  });

  it('expands assignment values without splitting or globbing', () => {
    const result = parse('X=~/bin:$SPACED*');
    if (!result.ok) throw new Error('parse failed');
    const assignment = result.list.items[0]!.pipeline.commands[0]!.assignments[0]!;
    expect(expandAssignment(assignment.value, context)).toBe('/home/guest/bin:  one two  *');
  });
});
