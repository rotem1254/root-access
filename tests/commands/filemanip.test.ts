import { describe, expect, it } from 'vitest';
import { LINUX_COMMANDS } from '../../src/engine/commands';
import { ROOT_CREDENTIALS as ROOT } from '../../src/engine/fs/permissions';
import type { HostDefinition } from '../../src/engine/system/host';
import { createHarness } from '../helpers/shell';

const HOST: HostDefinition = {
  hostname: 'corp-web01',
  users: [
    { name: 'guest', uid: 1000 },
    { name: 'admin', uid: 1001 },
  ],
  fs: {
    '/home/guest/notes.txt': { content: 'hello\n', owner: 'guest' },
    '/home/guest/data': { dir: true, owner: 'guest' },
    '/home/guest/data/a.txt': { content: 'A\n', owner: 'guest' },
    '/home/guest/data/b.txt': { content: 'B\n', owner: 'guest' },
    '/home/guest/protected.txt': { content: 'secret\n', owner: 'admin', mode: '0644' },
    '/opt/readonly': { dir: true, owner: 'admin', mode: '0755' },
  },
};

const harness = () => createHarness({ commands: LINUX_COMMANDS, host: HOST });
const read = (h: ReturnType<typeof harness>, path: string): string =>
  h.machine.fs.readFile(path, ROOT);
const exists = (h: ReturnType<typeof harness>, path: string): boolean =>
  h.machine.fs.exists(path, ROOT, true);

describe('mkdir', () => {
  it('creates directories, including parents', async () => {
    const h = harness();
    expect((await h.run('mkdir newdir')).status).toBe(0);
    expect(h.machine.fs.stat('/home/guest/newdir', ROOT)).toMatchObject({
      type: 'dir',
      uid: 1000,
      mode: 0o755,
    });
    expect(await h.run('mkdir a/b/c')).toMatchObject({
      stderr: 'mkdir: cannot create directory ‘a/b/c’: No such file or directory\n',
      status: 1,
    });
    expect((await h.run('mkdir -p a/b/c')).status).toBe(0);
    expect(exists(h, '/home/guest/a/b/c')).toBe(true);
    expect((await h.run('mkdir -m 700 vault')).status).toBe(0);
    expect(h.machine.fs.stat('/home/guest/vault', ROOT).mode).toBe(0o700);
  });

  it('reports errors', async () => {
    const h = harness();
    expect(await h.run('mkdir data')).toMatchObject({
      stderr: 'mkdir: cannot create directory ‘data’: File exists\n',
      status: 1,
    });
    expect(await h.run('mkdir /opt/readonly/x')).toMatchObject({
      stderr: 'mkdir: cannot create directory ‘/opt/readonly/x’: Permission denied\n',
      status: 1,
    });
    expect((await h.run('mkdir')).stderr).toBe(
      "mkdir: missing operand\nTry 'mkdir --help' for more information.\n",
    );
    expect((await h.run('mkdir -p data && echo ok')).stdout).toBe('ok\n');
  });
});

describe('touch', () => {
  it('creates files and updates timestamps', async () => {
    const h = harness();
    expect((await h.run('touch fresh.txt')).status).toBe(0);
    expect(read(h, '/home/guest/fresh.txt')).toBe('');
    h.clock.advance(5000);
    await h.run('touch notes.txt');
    expect(h.machine.fs.stat('/home/guest/notes.txt', ROOT).mtime).toBe(h.clock.now());
    expect((await h.run('touch -c missing.txt')).status).toBe(0);
    expect(exists(h, '/home/guest/missing.txt')).toBe(false);
    expect(await h.run('touch /opt/readonly/x')).toMatchObject({
      stderr: "touch: cannot touch '/opt/readonly/x': Permission denied\n",
      status: 1,
    });
  });
});

describe('rm', () => {
  it('removes files and trees', async () => {
    const h = harness();
    await h.run('rm notes.txt');
    expect(exists(h, '/home/guest/notes.txt')).toBe(false);
    expect(await h.run('rm data')).toMatchObject({
      stderr: "rm: cannot remove 'data': Is a directory\n",
      status: 1,
    });
    await h.run('rm -r data');
    expect(exists(h, '/home/guest/data')).toBe(false);
    expect(await h.run('rm gone.txt')).toMatchObject({
      stderr: "rm: cannot remove 'gone.txt': No such file or directory\n",
      status: 1,
    });
    expect((await h.run('rm -f gone.txt')).status).toBe(0);
  });

  it('refuses to remove / and reports verbose output', async () => {
    const h = harness();
    const removeRoot = await h.run('rm -r /');
    expect(removeRoot.status).toBe(1);
    expect(removeRoot.stderr).toContain("dangerous to operate recursively on '/'");
    expect((await h.run('rm -v notes.txt')).stdout).toBe("removed 'notes.txt'\n");
    await h.run('mkdir empty');
    expect((await h.run('rm -d empty')).status).toBe(0);
  });
});

describe('cp', () => {
  it('copies files and directory trees', async () => {
    const h = harness();
    await h.run('cp notes.txt copy.txt');
    expect(read(h, '/home/guest/copy.txt')).toBe('hello\n');
    expect(read(h, '/home/guest/notes.txt')).toBe('hello\n');
    expect(h.machine.fs.stat('/home/guest/copy.txt', ROOT).uid).toBe(1000);
    await h.run('cp notes.txt data');
    expect(read(h, '/home/guest/data/notes.txt')).toBe('hello\n');
    expect(await h.run('cp data data2')).toMatchObject({
      stderr: "cp: -r not specified; omitting directory 'data'\n",
      status: 1,
    });
    await h.run('cp -r data data2');
    expect(read(h, '/home/guest/data2/a.txt')).toBe('A\n');
  });

  it('copies several files into a directory and reports errors', async () => {
    const h = harness();
    await h.run('cp notes.txt protected.txt data');
    expect(read(h, '/home/guest/data/notes.txt')).toBe('hello\n');
    expect(await h.run('cp notes.txt protected.txt copy.txt')).toMatchObject({
      stderr: "cp: target 'copy.txt' is not a directory\n",
      status: 1,
    });
    expect(await h.run('cp missing.txt out.txt')).toMatchObject({
      stderr: "cp: cannot stat 'missing.txt': No such file or directory\n",
      status: 1,
    });
    expect((await h.run('cp')).stderr).toContain('missing file operand');
  });
});

describe('mv', () => {
  it('renames and moves files', async () => {
    const h = harness();
    await h.run('mv notes.txt renamed.txt');
    expect(exists(h, '/home/guest/notes.txt')).toBe(false);
    expect(read(h, '/home/guest/renamed.txt')).toBe('hello\n');
    await h.run('mv renamed.txt data');
    expect(read(h, '/home/guest/data/renamed.txt')).toBe('hello\n');
    await h.run('mv data archive');
    expect(exists(h, '/home/guest/archive/a.txt')).toBe(true);
    expect(exists(h, '/home/guest/data')).toBe(false);
  });

  it('handles -n and reports errors', async () => {
    const h = harness();
    await h.run('mv -n data/a.txt data/b.txt');
    expect(read(h, '/home/guest/data/b.txt')).toBe('B\n');
    expect(await h.run('mv missing.txt out.txt')).toMatchObject({
      stderr: "mv: cannot move 'missing.txt' to 'out.txt': No such file or directory\n",
      status: 1,
    });
    expect((await h.run('mv one.txt')).stderr).toContain('missing destination file operand');
  });
});

describe('chmod', () => {
  it('changes modes with octal and symbolic specs', async () => {
    const h = harness();
    await h.run('chmod 600 notes.txt');
    expect(h.machine.fs.stat('/home/guest/notes.txt', ROOT).mode).toBe(0o600);
    await h.run('chmod u+x,go= notes.txt');
    expect(h.machine.fs.stat('/home/guest/notes.txt', ROOT).mode).toBe(0o700);
    await h.run('chmod +x data/a.txt');
    expect(h.machine.fs.stat('/home/guest/data/a.txt', ROOT).mode & 0o111).not.toBe(0);
  });

  it('changes trees recursively and reports verbose changes', async () => {
    const h = harness();
    await h.run('chmod -R 700 data');
    expect(h.machine.fs.stat('/home/guest/data/a.txt', ROOT).mode).toBe(0o700);
    await h.run('chmod 600 notes.txt');
    expect((await h.run('chmod -v 644 notes.txt')).stdout).toContain('mode of ‘notes.txt’ changed');
  });

  it('refuses to change files you do not own', async () => {
    const h = harness();
    expect(await h.run('chmod 777 protected.txt')).toMatchObject({
      stderr: 'chmod: changing permissions of ‘protected.txt’: Operation not permitted\n',
      status: 1,
    });
    expect((await h.run('chmod 644 missing.txt')).stderr).toBe(
      'chmod: cannot access ‘missing.txt’: No such file or directory\n',
    );
    expect((await h.run('chmod zzz notes.txt')).stderr).toBe('chmod: invalid mode: ‘zzz’\n');
    expect((await h.run('chmod 644')).stderr).toContain("missing operand after '644'");
  });
});
