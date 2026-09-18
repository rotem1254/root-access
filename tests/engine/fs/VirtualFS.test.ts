import { beforeEach, describe, expect, it } from 'vitest';
import { FsError } from '../../../src/engine/errors';
import { createFileSystemView } from '../../../src/engine/fs/FileSystemView';
import {
  deserializeRoot,
  SerializationError,
  serializeNode,
} from '../../../src/engine/fs/serialize';
import { statOf } from '../../../src/engine/fs/types';
import type { VirtualFS } from '../../../src/engine/fs/VirtualFS';
import { ALICE, BOB, makeVfs, ROOT, T0 } from '../../helpers/vfs';

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof FsError) return error.code;
    throw error;
  }
  return 'OK';
}

describe('VirtualFS', () => {
  let vfs: VirtualFS;
  let h: ReturnType<typeof makeVfs>;

  beforeEach(() => {
    h = makeVfs();
    vfs = h.vfs;
    h.dir('/home');
    h.dir('/home/alice', { uid: 1000, gid: 1000, mode: 0o750 });
    h.file('/home/alice/notes.txt', 'hello\n', { uid: 1000, gid: 1000, mode: 0o644 });
    h.dir('/tmp', { mode: 0o1777 });
    h.dir('/var');
    h.dir('/var/log');
    h.file('/var/log/auth.log', 'log\n', { gid: 4, mode: 0o640 });
  });

  describe('reading', () => {
    it('reads files the user may read', () => {
      expect(vfs.readFile('/home/alice/notes.txt', ALICE)).toBe('hello\n');
      expect(vfs.readFile('/var/log/auth.log', BOB)).toBe('log\n');
    });

    it('needs execute permission on every directory on the way', () => {
      expect(code(() => vfs.readFile('/home/alice/notes.txt', BOB))).toBe('EACCES');
    });

    it('reports missing files, directories and non-directories', () => {
      expect(code(() => vfs.readFile('/home/alice/nope', ALICE))).toBe('ENOENT');
      expect(code(() => vfs.readFile('/home', ALICE))).toBe('EISDIR');
      expect(code(() => vfs.readFile('/home/alice/notes.txt/x', ALICE))).toBe('ENOTDIR');
      expect(code(() => vfs.readFile('/home/alice/notes.txt/', ALICE))).toBe('ENOTDIR');
      expect(code(() => vfs.readFile('relative', ALICE))).toBe('ENOENT');
    });

    it('lists directories with read permission only', () => {
      expect(vfs.readdir('/home/alice', ALICE)).toEqual(['notes.txt']);
      expect(code(() => vfs.readdir('/home/alice', BOB))).toBe('EACCES');
      expect(code(() => vfs.readdir('/home/alice/notes.txt', ALICE))).toBe('ENOTDIR');
    });

    it('allows listing but not entering a directory with r and no x', () => {
      h.dir('/listonly', { uid: 1000, gid: 1000, mode: 0o744 });
      h.file('/listonly/secret', 'x', { uid: 1000, gid: 1000, mode: 0o644 });
      expect(vfs.readdir('/listonly', BOB)).toEqual(['secret']);
      expect(code(() => vfs.stat('/listonly/secret', BOB))).toBe('EACCES');
    });

    it('allows entering but not listing a directory with x and no r', () => {
      h.dir('/hidden', { uid: 1000, gid: 1000, mode: 0o711 });
      h.file('/hidden/known.txt', 'found me', { uid: 1000, gid: 1000, mode: 0o644 });
      expect(code(() => vfs.readdir('/hidden', BOB))).toBe('EACCES');
      expect(vfs.readFile('/hidden/known.txt', BOB)).toBe('found me');
    });

    it('lets root read anything', () => {
      h.file('/locked', 'secret', { uid: 1000, gid: 1000, mode: 0o000 });
      expect(vfs.readFile('/locked', ROOT)).toBe('secret');
      expect(vfs.access('/locked', ROOT, 'x')).toBe(false);
      expect(vfs.access('/locked', ALICE, 'r')).toBe(false);
      expect(vfs.access('/missing', ROOT, 'r')).toBe(false);
    });

    it('reports stats like Linux', () => {
      expect(vfs.stat('/home/alice/notes.txt', ALICE)).toMatchObject({
        type: 'file',
        size: 6,
        nlink: 1,
        uid: 1000,
        mode: 0o644,
      });
      expect(vfs.stat('/var', ROOT)).toMatchObject({ type: 'dir', size: 4096, nlink: 3 });
    });
  });

  describe('symlinks', () => {
    beforeEach(() => {
      h.dir('/usr');
      h.dir('/usr/bin');
      h.file('/usr/bin/tool', 'ELF', { mode: 0o755 });
      vfs.symlink('usr/bin', '/bin', ROOT);
      vfs.symlink('/home/alice/notes.txt', '/tmp/abs', ROOT);
      vfs.symlink('../var/log', '/home/logs', ROOT);
    });

    it('follows relative and absolute links', () => {
      expect(vfs.readFile('/bin/tool', ROOT)).toBe('ELF');
      expect(vfs.readFile('/tmp/abs', ALICE)).toBe('hello\n');
      expect(vfs.readFile('/home/logs/auth.log', BOB)).toBe('log\n');
      expect(vfs.realpath('/bin/tool', ROOT)).toBe('/usr/bin/tool');
    });

    it('resolves .. physically after following a link', () => {
      expect(vfs.realpath('/bin/..', ROOT)).toBe('/usr');
    });

    it('distinguishes stat from lstat and reads link targets', () => {
      expect(vfs.lstat('/bin', ROOT)).toMatchObject({
        type: 'symlink',
        size: 7,
        target: 'usr/bin',
      });
      expect(vfs.stat('/bin', ROOT).type).toBe('dir');
      expect(vfs.readlink('/bin', ROOT)).toBe('usr/bin');
      expect(code(() => vfs.readlink('/usr', ROOT))).toBe('EINVAL');
    });

    it('follows a trailing slash through a link', () => {
      expect(vfs.lstat('/bin/', ROOT).type).toBe('dir');
    });

    it('detects loops and dangling links', () => {
      vfs.symlink('/loop-b', '/loop-a', ROOT);
      vfs.symlink('/loop-a', '/loop-b', ROOT);
      expect(code(() => vfs.readFile('/loop-a', ROOT))).toBe('ELOOP');
      vfs.symlink('/nowhere', '/dangling', ROOT);
      expect(code(() => vfs.stat('/dangling', ROOT))).toBe('ENOENT');
      expect(vfs.exists('/dangling', ROOT)).toBe(true);
      expect(vfs.exists('/dangling', ROOT, true)).toBe(false);
    });

    it('writes through links, creating the target if needed', () => {
      vfs.symlink('/tmp/created.txt', '/tmp/link', ROOT);
      vfs.writeFile('/tmp/link', 'via link', ROOT);
      expect(vfs.readFile('/tmp/created.txt', ROOT)).toBe('via link');
      vfs.symlink('created.txt', '/tmp/rel', ROOT);
      vfs.writeFile('/tmp/rel', '!', ROOT, { append: true });
      expect(vfs.readFile('/tmp/created.txt', ROOT)).toBe('via link!');
    });
  });

  describe('writing', () => {
    it('creates files owned by the writer with the umask applied', () => {
      vfs.writeFile('/tmp/new.txt', 'data', ALICE);
      expect(vfs.stat('/tmp/new.txt', ALICE)).toMatchObject({ uid: 1000, gid: 1000, mode: 0o644 });
    });

    it('truncates or appends', () => {
      vfs.writeFile('/tmp/f', 'one\n', ALICE);
      vfs.writeFile('/tmp/f', 'two\n', ALICE, { append: true });
      expect(vfs.readFile('/tmp/f', ALICE)).toBe('one\ntwo\n');
      vfs.writeFile('/tmp/f', 'three\n', ALICE);
      expect(vfs.readFile('/tmp/f', ALICE)).toBe('three\n');
    });

    it('needs write permission on the file, or on the directory to create', () => {
      expect(code(() => vfs.writeFile('/var/log/auth.log', 'x', BOB))).toBe('EACCES');
      expect(code(() => vfs.writeFile('/var/log/new', 'x', BOB))).toBe('EACCES');
      h.file('/home/alice/shared', '', { uid: 1000, gid: 1000, mode: 0o666 });
      h.dir('/home/open', { mode: 0o755 });
      h.file('/home/open/shared', '', { mode: 0o666 });
      vfs.writeFile('/home/open/shared', 'ok', BOB);
      expect(vfs.readFile('/home/open/shared', BOB)).toBe('ok');
    });

    it('refuses to write directories', () => {
      expect(code(() => vfs.writeFile('/tmp', 'x', ROOT))).toBe('EISDIR');
      expect(code(() => vfs.writeFile('/tmp/', 'x', ROOT))).toBe('EISDIR');
      expect(code(() => vfs.writeFile('/nope/', 'x', ROOT))).toBe('ENOTDIR');
      expect(code(() => vfs.writeFile('/tmp/..', 'x', ROOT))).toBe('EISDIR');
    });

    it('discards writes to /dev/null', () => {
      h.dir('/dev');
      vfs.writeFile('/dev/null', '', ROOT);
      const node = vfs.lookup('/dev/null', ROOT).node;
      if (node.type === 'file') node.device = 'null';
      vfs.chmod('/dev/null', 0o666, ROOT);
      vfs.writeFile('/dev/null', 'gone', ALICE);
      expect(vfs.readFile('/dev/null', ALICE)).toBe('');
      expect(vfs.stat('/dev/null', ALICE)).toMatchObject({ size: 0, device: 'null' });
    });

    it('inherits the group of setgid directories', () => {
      h.dir('/srv', { gid: 50, mode: 0o2777 });
      vfs.writeFile('/srv/report', 'x', ALICE);
      vfs.mkdir('/srv/sub', ALICE);
      expect(vfs.stat('/srv/report', ALICE).gid).toBe(50);
      expect(vfs.stat('/srv/sub', ALICE)).toMatchObject({ gid: 50, mode: 0o2755 });
    });

    it('updates mtimes on the clock', () => {
      h.clock.advance(60_000);
      vfs.writeFile('/tmp/f', 'x', ALICE);
      expect(vfs.stat('/tmp/f', ALICE).mtime).toBe(T0 + 60_000);
    });
  });

  describe('touch', () => {
    it('creates empty files and updates mtimes', () => {
      vfs.touch('/tmp/t', ALICE);
      expect(vfs.readFile('/tmp/t', ALICE)).toBe('');
      h.clock.advance(1000);
      vfs.writeFile('/tmp/t', 'keep', ALICE);
      h.clock.advance(1000);
      vfs.touch('/tmp/t', ALICE);
      expect(vfs.readFile('/tmp/t', ALICE)).toBe('keep');
      expect(vfs.stat('/tmp/t', ALICE).mtime).toBe(T0 + 2000);
    });

    it('needs ownership or write permission', () => {
      expect(code(() => vfs.touch('/var/log/auth.log', BOB))).toBe('EACCES');
      expect(code(() => vfs.touch('/missing/dir/file', ROOT))).toBe('ENOENT');
    });
  });

  describe('directories', () => {
    it('creates and removes directories', () => {
      vfs.mkdir('/tmp/d', ALICE);
      expect(vfs.stat('/tmp/d', ALICE)).toMatchObject({ type: 'dir', mode: 0o755, uid: 1000 });
      expect(code(() => vfs.mkdir('/tmp/d', ALICE))).toBe('EEXIST');
      vfs.writeFile('/tmp/d/f', 'x', ALICE);
      expect(code(() => vfs.rmdir('/tmp/d', ALICE))).toBe('ENOTEMPTY');
      vfs.unlink('/tmp/d/f', ALICE);
      vfs.rmdir('/tmp/d', ALICE);
      expect(vfs.exists('/tmp/d', ALICE)).toBe(false);
    });

    it('reports rmdir and unlink misuse', () => {
      expect(code(() => vfs.rmdir('/', ROOT))).toBe('EBUSY');
      expect(code(() => vfs.rmdir('/tmp/.', ROOT))).toBe('EINVAL');
      expect(code(() => vfs.rmdir('/tmp/..', ROOT))).toBe('ENOTEMPTY');
      expect(code(() => vfs.rmdir('/var/log/auth.log', ROOT))).toBe('ENOTDIR');
      expect(code(() => vfs.rmdir('/var/nope', ROOT))).toBe('ENOENT');
      expect(code(() => vfs.unlink('/var', ROOT))).toBe('EISDIR');
      expect(code(() => vfs.unlink('/var/..', ROOT))).toBe('EISDIR');
      expect(code(() => vfs.unlink('/var/nope', ROOT))).toBe('ENOENT');
      expect(code(() => vfs.mkdir('/', ROOT))).toBe('EEXIST');
      expect(code(() => vfs.mkdir('/var/log/new', BOB))).toBe('EACCES');
    });

    it('enforces the sticky bit on /tmp', () => {
      vfs.writeFile('/tmp/alices', 'x', ALICE);
      expect(code(() => vfs.unlink('/tmp/alices', BOB))).toBe('EPERM');
      expect(code(() => vfs.rename('/tmp/alices', '/tmp/stolen', BOB))).toBe('EPERM');
      vfs.unlink('/tmp/alices', ALICE);
      vfs.writeFile('/tmp/again', 'x', ALICE);
      vfs.unlink('/tmp/again', ROOT);
    });
  });

  describe('rename', () => {
    it('moves and replaces files', () => {
      vfs.writeFile('/tmp/a', 'A', ALICE);
      vfs.writeFile('/tmp/b', 'B', ALICE);
      vfs.rename('/tmp/a', '/tmp/b', ALICE);
      expect(vfs.readFile('/tmp/b', ALICE)).toBe('A');
      expect(vfs.exists('/tmp/a', ALICE)).toBe(false);
      vfs.rename('/tmp/b', '/tmp/b', ALICE);
      expect(vfs.readFile('/tmp/b', ALICE)).toBe('A');
    });

    it('rejects invalid moves', () => {
      vfs.mkdir('/tmp/dir', ALICE);
      vfs.mkdir('/tmp/dir/sub', ALICE);
      vfs.writeFile('/tmp/file', 'x', ALICE);
      vfs.mkdir('/tmp/full', ALICE);
      vfs.writeFile('/tmp/full/x', 'x', ALICE);
      expect(code(() => vfs.rename('/tmp/dir', '/tmp/dir/sub/inside', ALICE))).toBe('EINVAL');
      expect(code(() => vfs.rename('/tmp/file', '/tmp/dir', ALICE))).toBe('EISDIR');
      expect(code(() => vfs.rename('/tmp/dir', '/tmp/file', ALICE))).toBe('ENOTDIR');
      expect(code(() => vfs.rename('/tmp/dir', '/tmp/full', ALICE))).toBe('ENOTEMPTY');
      expect(code(() => vfs.rename('/tmp/missing', '/tmp/x', ALICE))).toBe('ENOENT');
      expect(code(() => vfs.rename('/tmp/file', '/var/log/file', ALICE))).toBe('EACCES');
      expect(code(() => vfs.rename('/tmp/.', '/tmp/x', ALICE))).toBe('EBUSY');
      expect(code(() => vfs.rename('/tmp/file', '/tmp/..', ALICE))).toBe('EBUSY');
    });
  });

  describe('metadata', () => {
    it('lets only owners and root chmod', () => {
      expect(code(() => vfs.chmod('/home/alice/notes.txt', 0o777, BOB))).toBe('EACCES');
      vfs.chmod('/home/alice/notes.txt', 0o600, ALICE);
      expect(vfs.stat('/home/alice/notes.txt', ALICE).mode).toBe(0o600);
      vfs.writeFile('/tmp/bobs', 'x', BOB);
      expect(code(() => vfs.chmod('/tmp/bobs', 0o777, ALICE))).toBe('EPERM');
    });

    it('drops setgid when a non-member changes a file mode', () => {
      vfs.writeFile('/tmp/g', 'x', ALICE);
      vfs.chown('/tmp/g', 1000, 4, ROOT);
      vfs.chmod('/tmp/g', 0o2755, ALICE);
      expect(vfs.stat('/tmp/g', ALICE).mode).toBe(0o755);
    });

    it('lets only root chown, and owners set mtimes', () => {
      expect(code(() => vfs.chown('/tmp', 1000, 1000, ALICE))).toBe('EPERM');
      vfs.setMtime('/home/alice/notes.txt', 42, ALICE);
      expect(vfs.stat('/home/alice/notes.txt', ALICE).mtime).toBe(42);
      expect(code(() => vfs.setMtime('/var/log/auth.log', 42, BOB))).toBe('EPERM');
    });
  });

  describe('serialization', () => {
    it('round-trips the whole tree', () => {
      vfs.symlink('/home/alice', '/tmp/link', ROOT);
      const node = vfs.lookup('/var/log/auth.log', ROOT).node;
      if (node.type === 'file') node.exec = 'cat';
      const json = JSON.parse(JSON.stringify(serializeNode(vfs.root))) as unknown;
      const restored = deserializeRoot(json);
      expect(serializeNode(restored)).toEqual(serializeNode(vfs.root));
      expect(statOf(restored)).toEqual(statOf(vfs.root));
    });

    it.each([
      ['a non-object', 42],
      ['bad metadata', { t: 'f', u: 'x', g: 0, m: 0, mt: 0, d: '' }],
      ['bad file data', { t: 'f', u: 0, g: 0, m: 0, mt: 0, d: 1 }],
      ['bad link', { t: 'l', u: 0, g: 0, m: 0, mt: 0, l: 1 }],
      ['bad children', { t: 'd', u: 0, g: 0, m: 0, mt: 0, c: {} }],
      ['bad entry', { t: 'd', u: 0, g: 0, m: 0, mt: 0, c: [['a']] }],
      [
        'bad name',
        {
          t: 'd',
          u: 0,
          g: 0,
          m: 0,
          mt: 0,
          c: [['a/b', { t: 'l', u: 0, g: 0, m: 0, mt: 0, l: 'x' }]],
        },
      ],
      ['unknown type', { t: 'z', u: 0, g: 0, m: 0, mt: 0 }],
      ['a non-directory root', { t: 'l', u: 0, g: 0, m: 0, mt: 0, l: 'x' }],
    ])('rejects %s', (_label, value) => {
      expect(() => deserializeRoot(value)).toThrow(SerializationError);
    });
  });
});

describe('FileSystem view', () => {
  it('resolves relative paths and reports them as written', () => {
    const h = makeVfs();
    h.dir('/home');
    h.dir('/home/alice', { uid: 1000, gid: 1000, mode: 0o750 });
    h.file('/home/alice/notes.txt', 'hi', { uid: 1000, gid: 1000 });
    let cwd = '/home/alice';
    let who = ALICE;
    const fs = createFileSystemView(
      h.vfs,
      () => who,
      () => cwd,
    );

    expect(fs.readFile('notes.txt')).toBe('hi');
    expect(fs.absolute('notes.txt')).toBe('/home/alice/notes.txt');
    expect(fs.exists('notes.txt')).toBe(true);
    expect(fs.access('notes.txt', 'w')).toBe(true);
    expect(fs.readdir('.')).toEqual(['notes.txt']);
    expect(fs.realpath('../alice/notes.txt')).toBe('/home/alice/notes.txt');

    fs.writeFile('draft', 'x');
    fs.touch('draft');
    fs.mkdir('dir');
    fs.symlink('draft', 'link');
    expect(fs.readlink('link')).toBe('draft');
    expect(fs.lstat('link').type).toBe('symlink');
    fs.rename('draft', 'dir/draft');
    fs.chmod('dir/draft', 0o600);
    expect(fs.stat('dir/draft').mode).toBe(0o600);
    fs.unlink('dir/draft');
    fs.rmdir('dir');
    expect(fs.umask).toBe(0o022);

    who = BOB;
    cwd = '/';
    expect(() => fs.readFile('home/alice/notes.txt')).toThrow(
      'home/alice/notes.txt: Permission denied',
    );
    expect(() => fs.readFile('')).toThrow(': No such file or directory');
    expect(fs.exists('')).toBe(false);
    expect(fs.access('', 'r')).toBe(false);
    try {
      fs.rename('home/alice/notes.txt', 'tmp');
    } catch (error) {
      expect((error as FsError).path).toBe('home/alice/notes.txt');
    }
  });
});
