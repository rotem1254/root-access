import { describe, expect, it } from 'vitest';
import {
  applyCompletion,
  commonPrefix,
  complete,
  type CompletionContext,
  firstWord,
} from '../../../src/engine/shell/complete';

const tree: Record<string, string[]> = {
  '/home/guest': ['notes.txt', 'nova.txt', 'docs', '.hidden', 'memo.txt'],
  '/home/guest/docs': ['a.md', 'b.md'],
  '/etc': ['passwd', 'group', 'hosts'],
  '/home': ['guest', 'admin'],
  '/': ['home', 'etc', 'usr', 'var'],
};
const dirs = new Set(['/', '/home/guest', '/home/guest/docs', '/etc', '/home', '/home/admin']);

const context: CompletionContext = {
  commandNames: () => ['cat', 'cd', 'chmod', 'ls', 'grep', 'find', 'submit'],
  cwd: () => '/home/guest',
  home: () => '/home/guest',
  readdir: (path) => tree[path.replace(/\/$/, '') || '/'] ?? null,
  isDirectory: (path) => dirs.has(path.replace(/\/$/, '')),
};

const at = (line: string): ReturnType<typeof complete> => complete(line, line.length, context);

describe('commonPrefix', () => {
  it('finds the longest shared prefix', () => {
    expect(commonPrefix(['notes.txt', 'nova.txt'])).toBe('no');
    expect(commonPrefix(['abc'])).toBe('abc');
    expect(commonPrefix([])).toBe('');
    expect(commonPrefix(['a', 'b'])).toBe('');
  });
});

describe('command completion', () => {
  it('completes command names in the first position', () => {
    expect(at('c').candidates).toEqual(['cat', 'cd', 'chmod']);
    expect(at('gr').candidates).toEqual(['grep']);
    expect(at('gr').suffix).toBe(' ');
    expect(at('zz').candidates).toEqual([]);
  });

  it('completes commands after a pipe or semicolon', () => {
    expect(complete('ls | c', 6, context).candidates).toEqual(['cat', 'cd', 'chmod']);
    expect(complete('true; gr', 8, context).candidates).toEqual(['grep']);
  });
});

describe('path completion', () => {
  it('completes files in the current directory', () => {
    expect(at('cat n').candidates).toEqual(['notes.txt', 'nova.txt']);
    expect(at('cat notes').candidates).toEqual(['notes.txt']);
    expect(at('cat notes').suffix).toBe(' ');
  });

  it('completes directories with a trailing slash', () => {
    expect(at('cd doc').candidates).toEqual(['docs']);
    expect(at('cd doc').suffix).toBe('/');
  });

  it('completes inside a subdirectory, keeping the typed prefix', () => {
    expect(at('cat docs/').candidates).toEqual(['docs/a.md', 'docs/b.md']);
    expect(at('cat docs/a').candidates).toEqual(['docs/a.md']);
  });

  it('completes absolute paths and ~', () => {
    expect(at('cat /et').candidates).toEqual(['/etc']);
    expect(at('cat /etc/pa').candidates).toEqual(['/etc/passwd']);
    expect(at('cat ~/no').candidates).toEqual(['~/notes.txt', '~/nova.txt']);
  });

  it('hides dotfiles unless a dot is typed', () => {
    expect(at('cat ').candidates).not.toContain('.hidden');
    expect(at('cat .').candidates).toEqual(['.hidden']);
  });

  it('returns nothing for an unlistable directory', () => {
    expect(at('cat /nope/x').candidates).toEqual([]);
  });
});

describe('applyCompletion', () => {
  it('inserts a unique completion with its suffix', () => {
    const line = 'cat nov';
    const result = applyCompletion(line, line.length, complete(line, line.length, context));
    expect(result).toEqual({ line: 'cat nova.txt ', point: 13, listing: [] });
  });

  it('extends to the common prefix when ambiguous', () => {
    const line = 'cat n';
    const result = applyCompletion(line, line.length, complete(line, line.length, context));
    expect(result.line).toBe('cat no');
    expect(result.listing).toEqual([]);
  });

  it('lists candidates when the prefix cannot grow', () => {
    const line = 'cat no';
    const result = applyCompletion(line, line.length, complete(line, line.length, context));
    expect(result.line).toBe('cat no');
    expect(result.listing).toEqual(['notes.txt', 'nova.txt']);
  });

  it('does nothing with no candidates', () => {
    const line = 'cat zzz';
    expect(applyCompletion(line, line.length, complete(line, line.length, context)).line).toBe(
      line,
    );
  });

  it('completes in the middle of a line', () => {
    const line = 'cat nov here';
    const result = applyCompletion(line, 7, complete(line, 7, context));
    expect(result.line).toBe('cat nova.txt  here');
  });
});

describe('firstWord', () => {
  it('extracts the command name', () => {
    expect(firstWord('ls -la /tmp')).toBe('ls');
    expect(firstWord('  grep foo')).toBe('grep');
    expect(firstWord('')).toBe('');
  });
});
