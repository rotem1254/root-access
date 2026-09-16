import { describe, expect, it } from 'vitest';
import {
  basename,
  components,
  dirname,
  expandTilde,
  hasTrailingSlash,
  isAbsolute,
  join,
  joinRaw,
  normalize,
  resolve,
  tildify,
} from '../../../src/engine/fs/path';

describe('normalize', () => {
  it.each([
    ['/', '/'],
    ['//', '/'],
    ['/a//b/', '/a/b'],
    ['/a/./b/.', '/a/b'],
    ['/a/b/../c', '/a/c'],
    ['/../..', '/'],
    ['/a/../../b', '/b'],
    ['a/b/..', 'a'],
    ['a/..', '.'],
    ['../a', '../a'],
    ['a/../../b', '../b'],
    ['', '.'],
    ['.', '.'],
  ])('%j → %j', (input, expected) => {
    expect(normalize(input)).toBe(expected);
  });
});

describe('resolve and join', () => {
  it('resolves relative paths against the working directory', () => {
    expect(resolve('/home/guest', 'docs/../notes.txt')).toBe('/home/guest/notes.txt');
    expect(resolve('/home/guest', '/etc/passwd')).toBe('/etc/passwd');
    expect(resolve('/home/guest', '..')).toBe('/home');
    expect(resolve('/', '..')).toBe('/');
  });

  it('joins and normalizes', () => {
    expect(join('/usr', 'bin', '../lib')).toBe('/usr/lib');
    expect(join('', '')).toBe('.');
  });

  it('joins without normalizing for physical resolution', () => {
    expect(joinRaw('/home/guest', '../x')).toBe('/home/guest/../x');
    expect(joinRaw('/', 'etc')).toBe('/etc');
    expect(joinRaw('/home', '/abs')).toBe('/abs');
  });
});

describe('dirname and basename', () => {
  it.each([
    ['/a/b', '/a', 'b'],
    ['/a/b/', '/a', 'b'],
    ['/a', '/', 'a'],
    ['/', '/', '/'],
    ['a', '.', 'a'],
    ['a/b', 'a', 'b'],
    ['//a//b//', '//a', 'b'],
    ['', '.', ''],
  ])('%j → dirname %j, basename %j', (input, dir, base) => {
    expect(dirname(input)).toBe(dir);
    expect(basename(input)).toBe(base);
  });
});

describe('small helpers', () => {
  it('detects absolute paths, components and trailing slashes', () => {
    expect(isAbsolute('/x')).toBe(true);
    expect(isAbsolute('x')).toBe(false);
    expect(components('/a//b/')).toEqual(['a', 'b']);
    expect(hasTrailingSlash('/a/')).toBe(true);
    expect(hasTrailingSlash('/')).toBe(false);
  });

  it('tildifies paths under HOME like the bash prompt', () => {
    expect(tildify('/home/guest', '/home/guest')).toBe('~');
    expect(tildify('/home/guest/docs', '/home/guest')).toBe('~/docs');
    expect(tildify('/home/guestbook', '/home/guest')).toBe('/home/guestbook');
    expect(tildify('/etc', '/')).toBe('/etc');
  });

  it('expands ~ and ~user', () => {
    const homeOf = (user: string): string | undefined =>
      user === 'admin' ? '/home/admin' : undefined;
    expect(expandTilde('~', '/home/guest', homeOf)).toBe('/home/guest');
    expect(expandTilde('~/notes', '/home/guest', homeOf)).toBe('/home/guest/notes');
    expect(expandTilde('~admin/flag.txt', '/home/guest', homeOf)).toBe('/home/admin/flag.txt');
    expect(expandTilde('~nobody', '/home/guest', homeOf)).toBe('~nobody');
    expect(expandTilde('~/x', '/', homeOf)).toBe('/x');
    expect(expandTilde('plain', '/home/guest', homeOf)).toBe('plain');
  });
});
