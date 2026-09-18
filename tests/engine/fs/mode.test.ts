import { describe, expect, it } from 'vitest';
import {
  applySymbolicMode,
  formatModeString,
  formatOctalMode,
  parseOctalMode,
} from '../../../src/engine/fs/mode';
import { canAccess, type Credentials, isOwnerOrRoot } from '../../../src/engine/fs/permissions';

describe('octal modes', () => {
  it('parses and formats', () => {
    expect(parseOctalMode('644')).toBe(0o644);
    expect(parseOctalMode('0644')).toBe(0o644);
    expect(parseOctalMode('4755')).toBe(0o4755);
    expect(parseOctalMode('01777')).toBe(0o1777);
    expect(parseOctalMode('0888')).toBeNull();
    expect(parseOctalMode('u+x')).toBeNull();
    expect(parseOctalMode('77777')).toBeNull();
    expect(formatOctalMode(0o755)).toBe('0755');
  });
});

describe('formatModeString', () => {
  it.each([
    ['file', 0o644, '-rw-r--r--'],
    ['dir', 0o755, 'drwxr-xr-x'],
    ['file', 0o4755, '-rwsr-xr-x'],
    ['file', 0o4644, '-rwSr--r--'],
    ['file', 0o2755, '-rwxr-sr-x'],
    ['dir', 0o1777, 'drwxrwxrwt'],
    ['dir', 0o1776, 'drwxrwxrwT'],
    ['symlink', 0o777, 'lrwxrwxrwx'],
    ['chardev', 0o666, 'crw-rw-rw-'],
    ['file', 0o400, '-r--------'],
  ] as const)('%s %o → %s', (type, mode, expected) => {
    expect(formatModeString(type, mode)).toBe(expected);
  });
});

describe('applySymbolicMode', () => {
  const file = { isDirectory: false, umask: 0o022 };
  const dir = { isDirectory: true, umask: 0o022 };

  it.each([
    ['u+x', 0o644, 0o744],
    ['go-r', 0o644, 0o600],
    ['a=r', 0o755, 0o444],
    ['u=rwx,g=rx,o=', 0o000, 0o750],
    ['o=r', 0o777, 0o774],
    ['+x', 0o644, 0o755],
    ['-w', 0o666, 0o466],
    ['=r', 0o777, 0o466],
    ['u+s', 0o755, 0o4755],
    ['g+s', 0o755, 0o2755],
    ['+t', 0o777, 0o1777],
    ['o+s', 0o755, 0o755],
    ['u+t', 0o755, 0o755],
    ['g=u', 0o740, 0o770],
    ['a+X', 0o644, 0o644],
    ['a+X', 0o744, 0o755],
    ['u+rw,g+w', 0o400, 0o620],
    ['o-rwx,g+r', 0o707, 0o740],
    ['u=rw', 0o4755, 0o655],
  ])('%s on %o → %o', (spec, before, after) => {
    expect(applySymbolicMode(spec, before, file)).toBe(after);
  });

  it('applies X to directories', () => {
    expect(applySymbolicMode('a+X', 0o644, dir)).toBe(0o755);
  });

  it('keeps a directory setgid bit on =', () => {
    expect(applySymbolicMode('g=rx', 0o2775, dir)).toBe(0o2755);
  });

  it('works on a zero base for find -perm', () => {
    expect(applySymbolicMode('o=r', 0, { isDirectory: false, umask: 0 })).toBe(0o004);
    expect(applySymbolicMode('u=s', 0, { isDirectory: false, umask: 0 })).toBe(0o4000);
  });

  it.each(['', 'u', 'z+x', 'u+q', 'u+x,', '+ux'])('rejects %j', (spec) => {
    expect(applySymbolicMode(spec, 0o644, file)).toBeNull();
  });
});

describe('canAccess', () => {
  const alice: Credentials = { uid: 1000, gid: 1000, groups: [1000] };
  const bob: Credentials = { uid: 1001, gid: 1001, groups: [1001, 4] };
  const carol: Credentials = { uid: 1002, gid: 1002, groups: [1002] };
  const root: Credentials = { uid: 0, gid: 0, groups: [0] };

  it('uses owner bits for the owner, even when others have more', () => {
    const node = { uid: 1000, gid: 1000, mode: 0o077 };
    expect(canAccess(node, false, alice, 'r')).toBe(false);
    expect(canAccess(node, false, carol, 'r')).toBe(true);
  });

  it('uses group bits for group members, including supplementary groups', () => {
    const log = { uid: 0, gid: 4, mode: 0o640 };
    expect(canAccess(log, false, bob, 'r')).toBe(true);
    expect(canAccess(log, false, bob, 'w')).toBe(false);
    expect(canAccess(log, false, carol, 'r')).toBe(false);
    const groupDenied = { uid: 0, gid: 4, mode: 0o604 };
    expect(canAccess(groupDenied, false, bob, 'r')).toBe(false);
    expect(canAccess(groupDenied, false, carol, 'r')).toBe(true);
  });

  it('lets root read, write and search anything but only execute files with an x bit', () => {
    const locked = { uid: 1000, gid: 1000, mode: 0o000 };
    expect(canAccess(locked, false, root, 'r')).toBe(true);
    expect(canAccess(locked, false, root, 'w')).toBe(true);
    expect(canAccess(locked, false, root, 'x')).toBe(false);
    expect(canAccess(locked, true, root, 'x')).toBe(true);
    expect(canAccess({ ...locked, mode: 0o001 }, false, root, 'x')).toBe(true);
  });

  it('identifies owners and root', () => {
    const node = { uid: 1000, gid: 1000, mode: 0o600 };
    expect(isOwnerOrRoot(node, alice)).toBe(true);
    expect(isOwnerOrRoot(node, root)).toBe(true);
    expect(isOwnerOrRoot(node, bob)).toBe(false);
  });
});
