import { describe, expect, it } from 'vitest';
import { LINUX_COMMANDS } from '../../src/engine/commands';
import { ROOT_CREDENTIALS as ROOT } from '../../src/engine/fs/permissions';
import type { HostDefinition } from '../../src/engine/system/host';
import { base64Encode } from '../../src/engine/util/base64';
import { utf8Encode } from '../../src/engine/util/bytes';
import { createHarness } from '../helpers/shell';

const HOST: HostDefinition = {
  hostname: 'corp-web01',
  users: [
    { name: 'guest', uid: 1000 },
    { name: 'admin', uid: 1001 },
  ],
  fs: {
    '/home/guest/notes.txt': { content: 'hello\n', owner: 'guest', mtime: '2026-03-14T03:12:00Z' },
    '/home/guest/.hidden': {
      content: 'secret\n',
      owner: 'guest',
      mode: '0600',
      mtime: '2026-03-10T10:00:00Z',
    },
    '/home/guest/docs': { dir: true, owner: 'guest', mtime: '2026-03-12T08:30:00Z' },
    '/home/guest/docs/big.log': {
      content: 'x'.repeat(5000),
      owner: 'guest',
      mtime: '2026-03-13T00:00:00Z',
    },
    '/home/guest/run.sh': {
      content: '#!/bin/bash\necho hi\n',
      owner: 'guest',
      mode: '0755',
      mtime: '2026-03-11T00:00:00Z',
    },
    '/home/guest/link': { symlink: 'notes.txt', owner: 'guest', group: 'guest' },
    '/home/guest/broken': { symlink: '/nowhere', owner: 'guest', group: 'guest' },
    '/home/guest/archive.tar.gz': { binary: base64Encode('\x1f\x8b\x08\x00'), owner: 'guest' },
    '/home/guest/my file.txt': { content: '', owner: 'guest' },
    '/srv/listonly': { dir: true, owner: 'admin', mode: '0744' },
    '/srv/listonly/secret.txt': { content: 'x', owner: 'admin' },
    '/srv/private': { dir: true, owner: 'admin', mode: '0700' },
    '/srv/hidden': { dir: true, owner: 'admin', mode: '0711' },
    '/srv/hidden/known.txt': { content: 'k', owner: 'admin' },
  },
};

const harness = (columns = 80) => createHarness({ commands: LINUX_COMMANDS, host: HOST, columns });

async function piped(
  h: ReturnType<typeof harness>,
  command: string,
): Promise<{ stdout: string; stderr: string; status: number }> {
  const result = await h.run(`${command} > /tmp/out.txt`);
  return { ...result, stdout: h.machine.fs.readFile('/tmp/out.txt', ROOT) };
}

describe('ls', () => {
  it('lists names in columns on a terminal, quoting unusual names', async () => {
    const h = harness();
    expect((await h.run('ls --color=never')).stdout).toBe(
      "archive.tar.gz  broken  docs  link  'my file.txt'  notes.txt  run.sh\n",
    );
  });

  it('fills columns top to bottom when names do not fit on one line', async () => {
    const h = harness(30);
    expect((await h.run('ls --color=never')).stdout).toBe(
      "archive.tar.gz  'my file.txt'\nbroken          notes.txt\ndocs            run.sh\nlink\n",
    );
  });

  it('prints one name per line without colors when piped', async () => {
    const h = harness();
    expect((await piped(h, 'ls')).stdout).toBe(
      'archive.tar.gz\nbroken\ndocs\nlink\nmy file.txt\nnotes.txt\nrun.sh\n',
    );
    expect((await h.run('ls -1 --color=never docs')).stdout).toBe('big.log\n');
  });

  it('shows hidden files with -a and -A', async () => {
    const h = harness();
    expect((await piped(h, 'ls -a')).stdout).toBe(
      '.\n..\n.bash_logout\n.bashrc\n.hidden\n.profile\narchive.tar.gz\nbroken\ndocs\nlink\nmy file.txt\nnotes.txt\nrun.sh\n',
    );
    expect((await piped(h, 'ls -A')).stdout.startsWith('.bash_logout\n')).toBe(true);
    expect((await piped(h, 'ls -aA')).stdout.startsWith('.bash_logout\n')).toBe(true);
  });

  it('uses the long format with totals, owners and dates', async () => {
    const h = harness();
    expect((await h.run('ls -l --color=never docs')).stdout).toBe(
      'total 8\n-rw-r--r-- 1 guest guest 5000 Mar 13 00:00 big.log\n',
    );
    expect((await h.run('ls -lh --color=never docs')).stdout).toBe(
      'total 8.0K\n-rw-r--r-- 1 guest guest 4.9K Mar 13 00:00 big.log\n',
    );
    expect((await h.run('ls -ld --color=never docs')).stdout).toBe(
      'drwxr-xr-x 2 guest guest 4096 Mar 12 08:30 docs\n',
    );
    expect((await h.run('ls -n --color=never docs')).stdout).toBe(
      'total 8\n-rw-r--r-- 1 1000 1000 5000 Mar 13 00:00 big.log\n',
    );
  });

  it('aligns columns and shows symlink targets', async () => {
    const h = harness();
    const output = (await h.run('ls -l --color=never link broken notes.txt /dev/null')).stdout;
    expect(output).toBe(
      [
        'crw-rw-rw- 1 root  root  1, 3 Nov 14 09:00 /dev/null',
        'lrwxrwxrwx 1 guest guest    8 Mar 14 09:00 broken -> /nowhere',
        'lrwxrwxrwx 1 guest guest    9 Mar 14 09:00 link -> notes.txt',
        '-rw-r--r-- 1 guest guest    6 Mar 14 03:12 notes.txt',
        '',
      ].join('\n'),
    );
  });

  it('shows . and .. in long listings with -a', async () => {
    const h = harness();
    const output = (await h.run('ls -la --color=never /srv/hidden/..')).stdout;
    expect(output).toMatch(/drwxr-xr-x +\d+ root +root +4096 .* \.\.\n/);
    expect(output).toMatch(/drwx--x--x +2 admin admin 4096 \w{3} +\d+ \d\d:\d\d hidden\n/);
  });

  it('colors entries like Ubuntu', async () => {
    const h = harness();
    h.machine.fs.writeFile('/home/guest/suid', 'x', ROOT);
    h.machine.fs.chmod('/home/guest/suid', 0o4755, ROOT);
    const output = (
      await h.run(
        'ls --color=always -d docs run.sh link broken archive.tar.gz notes.txt /tmp suid /dev/null',
      )
    ).stdout;
    expect(output).toContain('\x1b[01;34mdocs\x1b[0m');
    expect(output).toContain('\x1b[01;32mrun.sh\x1b[0m');
    expect(output).toContain('\x1b[01;36mlink\x1b[0m');
    expect(output).toContain('\x1b[40;31;01mbroken\x1b[0m');
    expect(output).toContain('\x1b[01;31marchive.tar.gz\x1b[0m');
    expect(output).toContain('\x1b[30;42m/tmp\x1b[0m');
    expect(output).toContain('\x1b[37;41msuid\x1b[0m');
    expect(output).toContain('\x1b[40;33;01m/dev/null\x1b[0m');
    expect(output).toContain('notes.txt');
    expect(output).not.toContain('m notes.txt');
    const long = (await h.run('ls -l --color=always link')).stdout;
    expect(long).toContain('\x1b[01;36mlink\x1b[0m -> notes.txt');
  });

  it('classifies entries with -F', async () => {
    const h = harness();
    expect((await piped(h, 'ls -F')).stdout).toBe(
      'archive.tar.gz\nbroken@\ndocs/\nlink@\nmy file.txt\nnotes.txt\nrun.sh*\n',
    );
  });

  it('sorts by time, size and in reverse', async () => {
    const h = harness();
    expect((await piped(h, 'ls -t docs notes.txt run.sh')).stdout).toBe(
      'notes.txt\nrun.sh\n\ndocs:\nbig.log\n',
    );
    expect((await piped(h, 'ls -S notes.txt run.sh archive.tar.gz')).stdout).toBe(
      'run.sh\nnotes.txt\narchive.tar.gz\n',
    );
    expect((await piped(h, 'ls -r')).stdout.split('\n')[0]).toBe('run.sh');
    expect((await piped(h, 'ls -St notes.txt run.sh')).stdout).toBe('notes.txt\nrun.sh\n');
  });

  it('lists files before directories, with headers for several operands', async () => {
    const h = harness();
    expect((await piped(h, 'ls docs notes.txt /srv/hidden/known.txt')).stdout).toBe(
      '/srv/hidden/known.txt\nnotes.txt\n\ndocs:\nbig.log\n',
    );
  });

  it('recurses with -R', async () => {
    const h = harness();
    await h.run('cd docs');
    h.machine.fs.mkdir('/home/guest/docs/sub', ROOT);
    h.machine.fs.writeFile('/home/guest/docs/sub/deep.txt', '', ROOT);
    expect((await piped(h, 'ls -R')).stdout).toBe('.:\nbig.log\nsub\n\n./sub:\ndeep.txt\n');
    expect((await piped(h, 'ls -Rd .')).stdout).toBe('.\n');
  });

  it('follows command-line symlinks to directories unless -l or -d', async () => {
    const h = harness();
    h.machine.fs.writeFile('/usr/bin/tool', 'x', ROOT);
    expect((await piped(h, 'ls /bin')).stdout).toBe(
      'tool\n'.replace('tool', (await piped(h, 'ls /usr/bin')).stdout.trim()),
    );
    expect((await h.run('ls -l --color=never /bin')).stdout).toMatch(
      /^lrwxrwxrwx 1 root root 7 .* \/bin -> usr\/bin\n$/,
    );
    expect((await piped(h, 'ls /bin/')).stdout).toContain('tool');
  });

  it('reports missing operands and unreadable directories', async () => {
    const h = harness();
    expect(await h.run('ls /nope')).toEqual({
      stdout: '',
      stderr: "ls: cannot access '/nope': No such file or directory\n",
      status: 2,
    });
    expect(await h.run('ls /srv/private')).toMatchObject({
      stderr: "ls: cannot open directory '/srv/private': Permission denied\n",
      status: 2,
    });
    expect(await h.run('ls /srv/private/x')).toMatchObject({
      stderr: "ls: cannot access '/srv/private/x': Permission denied\n",
      status: 2,
    });
    expect(await h.run('ls /srv/hidden')).toMatchObject({
      stderr: "ls: cannot open directory '/srv/hidden': Permission denied\n",
      status: 2,
    });
    expect((await h.run('ls --color=never /srv/hidden/known.txt')).stdout).toBe(
      '/srv/hidden/known.txt\n',
    );
    const mixed = await piped(h, 'ls /nope docs');
    expect(mixed).toMatchObject({ stdout: 'docs:\nbig.log\n', status: 2 });
  });

  it('shows unknown details for entries of a directory without execute permission', async () => {
    const h = harness();
    expect(await h.run('ls -l /srv/listonly')).toEqual({
      stdout: 'total 0\n-????????? ? ? ? ?            ? secret.txt\n',
      stderr: "ls: cannot access '/srv/listonly/secret.txt': Permission denied\n",
      status: 1,
    });
    expect(await piped(h, 'ls /srv/listonly')).toMatchObject({
      stdout: 'secret.txt\n',
      stderr: '',
      status: 0,
    });
    expect(await h.run('ls /srv/listonly')).toMatchObject({ stdout: 'secret.txt\n', status: 1 });
  });

  it('rejects invalid and unsupported options', async () => {
    const h = harness();
    expect(await h.run('ls -z')).toMatchObject({
      stderr: "ls: invalid option -- 'z'\nTry 'ls --help' for more information.\n",
      status: 2,
    });
    expect((await h.run('ls -i')).stderr).toBe(
      "ls: option '-i' is not supported in this simulation\nTry 'ls --help' for more information.\n",
    );
    expect((await h.run('ls --color=sometimes')).stderr).toContain(
      "ls: invalid argument 'sometimes' for '--color'",
    );
  });
});

describe('cat', () => {
  it('prints and concatenates files', async () => {
    const h = harness();
    expect(await h.run('cat notes.txt')).toEqual({ stdout: 'hello\n', stderr: '', status: 0 });
    expect((await h.run('cat notes.txt run.sh')).stdout).toBe('hello\n#!/bin/bash\necho hi\n');
    expect((await h.run('cat link')).stdout).toBe('hello\n');
  });

  it('reads stdin from pipes, redirects and -', async () => {
    const h = harness();
    expect((await h.run('echo piped | cat')).stdout).toBe('piped\n');
    expect((await h.run('cat < notes.txt')).stdout).toBe('hello\n');
    expect((await h.run('echo mid | cat notes.txt - run.sh')).stdout).toBe(
      'hello\nmid\n#!/bin/bash\necho hi\n',
    );
  });

  it('numbers lines across files and squeezes blanks', async () => {
    const h = harness();
    h.machine.fs.writeFile('/tmp/blanks', 'a\n\n\n\nb\n', ROOT);
    expect((await h.run('cat -n notes.txt /tmp/blanks')).stdout).toBe(
      '     1\thello\n     2\ta\n     3\t\n     4\t\n     5\t\n     6\tb\n',
    );
    expect((await h.run('cat -b /tmp/blanks')).stdout).toBe('     1\ta\n\n\n\n     2\tb\n');
    expect((await h.run('cat -sn /tmp/blanks')).stdout).toBe('     1\ta\n     2\t\n     3\tb\n');
  });

  it('shows ends, tabs and non-printing bytes', async () => {
    const h = harness();
    h.machine.fs.writeFile('/tmp/odd', 'a\tb\x01\x7f\xe9\r\nend', ROOT);
    expect((await h.run('cat -E /tmp/odd')).stdout).toBe('a\tb\x01\x7f\ufffd\r$\nend');
    expect((await h.run('cat -T /tmp/odd')).stdout).toBe('a^Ib\x01\x7f\ufffd\r\nend');
    expect((await h.run('cat -v /tmp/odd')).stdout).toBe('a\tb^A^?M-i^M\nend');
    expect((await h.run('cat -A /tmp/odd')).stdout).toBe('a^Ib^A^?M-i^M$\nend');
    expect((await h.run('cat -e /tmp/odd')).stdout).toBe('a\tb^A^?M-i^M$\nend');
    expect((await h.run('cat -t /tmp/odd')).stdout).toBe('a^Ib^A^?M-i^M\nend');
    expect((await h.run('cat -u notes.txt')).stdout).toBe('hello\n');
  });

  it('keeps numbering state across a partial last line', async () => {
    const h = harness();
    h.machine.fs.writeFile('/tmp/partial', 'one', ROOT);
    expect((await h.run('cat -n /tmp/partial notes.txt')).stdout).toBe('     1\tonehello\n');
  });

  it('reports errors and keeps going', async () => {
    const h = harness();
    expect(await h.run('cat nope notes.txt docs /srv/hidden/known.txt .hidden')).toEqual({
      stdout: 'hello\nk.secret\n'.replace('k.secret\n', 'ksecret\n'),
      stderr: 'cat: nope: No such file or directory\ncat: docs: Is a directory\n',
      status: 1,
    });
    expect((await h.run("cat 'my file.txt' 'no such'")).stderr).toBe(
      "cat: 'no such': No such file or directory\n",
    );
    expect((await h.run('cat /srv/private/x')).stderr).toBe(
      'cat: /srv/private/x: Permission denied\n',
    );
    expect((await h.run('cat -Z')).status).toBe(1);
  });

  it('echoes lines typed on the terminal until Ctrl+D', async () => {
    const h = harness();
    await h.shell.submit('cat -n');
    await h.shell.submit('typed');
    expect(h.take().stdout).toBe('     1\ttyped\n');
    await h.shell.eof();
    expect(h.shell.session.env.lastStatus).toBe(0);
    await h.shell.submit('cat');
    h.shell.interrupt();
    await h.shell.whenReady();
    expect(h.shell.session.env.lastStatus).toBe(130);
  });
});

describe('file', () => {
  const write = (h: ReturnType<typeof harness>, path: string, data: string, mode = 0o644): void => {
    h.machine.fs.writeFile(path, data, ROOT);
    h.machine.fs.chmod(path, mode, ROOT);
  };

  it('classifies text files', async () => {
    const h = harness();
    write(h, '/tmp/utf8', utf8Encode('שלום\n'));
    write(h, '/tmp/crlf', 'a\r\nb\r\n');
    write(h, '/tmp/noeol', 'no newline');
    write(h, '/tmp/long', `${'x'.repeat(400)}\n`);
    write(h, '/tmp/esc', 'red \x1b[31mtext\n');
    write(h, '/tmp/key', '-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n');
    write(h, '/tmp/pub', 'ssh-ed25519 AAAAC3Nza guest@box\n');
    write(h, '/tmp/py', '#!/usr/bin/env python3\nprint(1)\n');
    write(h, '/tmp/sh', '#!/bin/sh\necho\n');
    const output = (
      await h.run(
        'file notes.txt run.sh /tmp/utf8 /tmp/crlf /tmp/noeol /tmp/long /tmp/esc /tmp/key /tmp/pub /tmp/py /tmp/sh',
      )
    ).stdout;
    expect(output).toBe(
      [
        'notes.txt:  ASCII text',
        'run.sh:     Bourne-Again shell script, ASCII text executable',
        '/tmp/utf8:  Unicode text, UTF-8 text',
        '/tmp/crlf:  ASCII text, with CRLF line terminators',
        '/tmp/noeol: ASCII text, with no line terminators',
        '/tmp/long:  ASCII text, with very long lines (400)',
        '/tmp/esc:   ASCII text, with escape sequences',
        '/tmp/key:   OpenSSH private key',
        '/tmp/pub:   OpenSSH ED25519 public key',
        '/tmp/py:    Python script, ASCII text executable',
        '/tmp/sh:    POSIX shell script, ASCII text executable',
        '',
      ].join('\n'),
    );
  });

  it('classifies special files and binaries by magic', async () => {
    const h = harness();
    write(h, '/tmp/empty', '');
    write(
      h,
      '/tmp/png',
      '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x01\x00\x00\x00\x00\x80\x08\x06\x00\x00\x00',
    );
    write(h, '/tmp/gif', 'GIF89a\x40\x00\x20\x00');
    write(h, '/tmp/jpg', '\xff\xd8\xff\xe0');
    write(h, '/tmp/zip', 'PK\x03\x04rest');
    write(h, '/tmp/pdf', '%PDF-1.7\n');
    write(h, '/tmp/db', 'SQLite format 3\x00');
    write(h, '/tmp/pcap', '\xd4\xc3\xb2\xa1');
    write(h, '/tmp/data', '\x00\x01\x02\x03');
    write(h, '/tmp/latin', 'caf\xe9\n');
    write(h, '/tmp/suid', '\x7fELF\x02\x01\x01', 0o4755);
    write(h, '/tmp/sgid', '\x7fELF\x01\x02\x01', 0o2755);
    const lines = (
      await h.run(
        'file -b /tmp/empty /tmp/png /tmp/gif /tmp/jpg /tmp/zip /tmp/pdf /tmp/db /tmp/pcap /tmp/data /tmp/latin archive.tar.gz docs /tmp /dev/null link broken /tmp/suid /tmp/sgid /usr/bin/ls',
      )
    ).stdout.split('\n');
    expect(lines.slice(0, 16)).toEqual([
      'empty',
      'PNG image data, 256 x 128, 8-bit/color RGBA, non-interlaced',
      'GIF image data, version 89a, 64 x 32',
      'JPEG image data',
      'Zip archive data, at least v2.0 to extract, compression method=deflate',
      'PDF document, version 1.7',
      'SQLite 3.x database',
      'pcap capture file, microsecond ts (little-endian) - version 2.4 (Ethernet, capture length 65535)',
      'data',
      'data',
      'gzip compressed data, from Unix',
      'directory',
      'sticky, directory',
      'character special (1/3)',
      'symbolic link to notes.txt',
      'broken symbolic link to /nowhere',
    ]);
    expect(lines[16]).toMatch(
      /^setuid ELF 64-bit LSB pie executable, x86-64, .*BuildID\[sha1\]=[0-9a-f]{40}, for GNU\/Linux 3\.2\.0, stripped$/,
    );
    expect(lines[17]).toMatch(/^setgid ELF 32-bit MSB pie executable/);
    expect(lines[18]).toMatch(/^ELF 64-bit LSB pie executable/);
  });

  it('follows links, prints MIME types and reports problems', async () => {
    const h = harness();
    expect((await h.run('file -L link broken')).stdout).toBe(
      'link:   ASCII text\nbroken: broken symbolic link to /nowhere\n',
    );
    expect((await h.run('file -i notes.txt docs')).stdout).toBe(
      'notes.txt: text/plain; charset=us-ascii\ndocs:      inode/directory; charset=binary\n',
    );
    expect((await h.run('file --mime-type run.sh /usr/bin/ls')).stdout).toBe(
      'run.sh:      text/x-shellscript\n/usr/bin/ls: application/x-pie-executable\n',
    );
    expect(await h.run('file nope /srv/listonly/secret.txt /etc/shadow')).toEqual({
      stdout:
        "nope:                     cannot open `nope' (No such file or directory)\n/srv/listonly/secret.txt: cannot open `/srv/listonly/secret.txt' (Permission denied)\n/etc/shadow:              regular file, no read permission\n",
      stderr: '',
      status: 0,
    });
    const usage = await h.run('file');
    expect(usage.status).toBe(1);
    expect(usage.stderr).toContain('Usage: file');
    expect((await h.run('file -z x')).stderr).toContain("option '-z' is not supported");
  });
});

describe('strings', () => {
  const blob =
    '\x00\x01ELF\x00/lib64/ld-linux-x86-64.so.2\x00\x02pass=hunter2\xff\xfeab\x00tab\there\x00';

  it('prints runs of at least four printable characters', async () => {
    const h = harness();
    h.machine.fs.writeFile('/tmp/blob', blob, ROOT);
    expect(await h.run('strings /tmp/blob')).toEqual({
      stdout: '/lib64/ld-linux-x86-64.so.2\npass=hunter2\ntab\there\n',
      stderr: '',
      status: 0,
    });
    expect((await h.run('strings -n 12 /tmp/blob')).stdout).toBe(
      '/lib64/ld-linux-x86-64.so.2\npass=hunter2\n',
    );
    expect((await h.run('strings -3 /tmp/blob')).stdout).toBe(
      'ELF\n/lib64/ld-linux-x86-64.so.2\npass=hunter2\ntab\there\n',
    );
    expect((await h.run('strings -t x -f /tmp/blob')).stdout.split('\n')[0]).toBe(
      '/tmp/blob:       6 /lib64/ld-linux-x86-64.so.2',
    );
    expect((await h.run('strings --radix=d /tmp/blob')).stdout.split('\n')[1]).toBe(
      '     35 pass=hunter2',
    );
    expect((await h.run('cat /tmp/blob | strings -f')).stdout.split('\n')[0]).toBe(
      '{standard input}: /lib64/ld-linux-x86-64.so.2',
    );
  });

  it('reports bad input', async () => {
    const h = harness();
    expect(await h.run('strings nope docs /etc/shadow')).toEqual({
      stdout: '',
      stderr:
        "strings: 'nope': No such file\nstrings: Warning: 'docs' is a directory\nstrings: /etc/shadow: Permission denied\n",
      status: 1,
    });
    expect((await h.run('strings -n 0 notes.txt')).stderr).toBe(
      'strings: invalid minimum string length 0\n',
    );
    expect((await h.run('strings -t z notes.txt')).stderr).toBe("strings: invalid radix 'z'\n");
    expect((await h.run('strings -e l x')).stderr).toContain("option '-e' is not supported");
  });
});
