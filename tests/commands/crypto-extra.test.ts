import { describe, expect, it } from 'vitest';
import { LINUX_COMMANDS } from '../../src/engine/commands';
import { digestHex } from '../../src/engine/crypto/digest';
import { evpBytesToKey, pbkdf2Key } from '../../src/engine/crypto/openssl';
import type { HostDefinition } from '../../src/engine/system/host';
import { createHarness } from '../helpers/shell';

const HOST: HostDefinition = {
  hostname: 'lab',
  users: [
    { name: 'guest', uid: 1000, password: 'guest' },
    { name: 'ops', uid: 1001, password: 'ops', groups: ['sudo'] },
  ],
  fs: {
    '/home/guest/a.txt': { content: 'alpha\n', owner: 'guest' },
    '/home/guest/b.txt': { content: 'beta\n', owner: 'guest' },
    '/home/guest/pass.txt': { content: 'file-password\n', owner: 'guest' },
    '/home/guest/junk.txt': { content: 'no checksums here\n', owner: 'guest' },
    '/home/guest/data': { dir: true, owner: 'guest' },
    '/home/guest/data/deep.txt': { content: 'deep\n', owner: 'guest' },
  },
};

const h = () => createHarness({ commands: LINUX_COMMANDS, host: HOST, user: 'guest' });

describe('key derivation', () => {
  it('derives deterministic key/iv material', () => {
    const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const a = evpBytesToKey('pw', salt, 32, 16);
    const b = evpBytesToKey('pw', salt, 32, 16);
    expect(a.key).toEqual(b.key);
    expect(a.key).toHaveLength(32);
    expect(a.iv).toHaveLength(16);
    expect(evpBytesToKey('other', salt, 32, 16).key).not.toEqual(a.key);
    expect(evpBytesToKey('pw', salt, 32, 16, 'md5').key).not.toEqual(a.key);
    const p = pbkdf2Key('pw', salt, 32, 16);
    expect(p.key).toHaveLength(32);
    expect(p.key).not.toEqual(a.key);
  });
});

describe('sums extra flags', () => {
  it('handles binary mode, multiple files, stdin and bad lists', async () => {
    const t = h();
    expect((await t.run('md5sum -b a.txt')).stdout).toMatch(/ \*a\.txt\n$/);
    const both = await t.run('sha256sum a.txt b.txt');
    expect(both.stdout.split('\n').filter(Boolean)).toHaveLength(2);
    expect((await t.run('sha512sum a.txt')).stdout).toMatch(/^[0-9a-f]{128} {2}a\.txt\n$/);
    expect((await t.run('sha256sum -c junk.txt')).stderr).toContain(
      'no properly formatted checksum lines found',
    );
    await t.run('sha256sum a.txt > sums.txt');
    expect((await t.run('sha256sum -c --quiet sums.txt')).stdout).toBe('');
    expect((await t.run('sha256sum -c nope.txt')).status).toBe(1);
  });

  it('reports a listed file that cannot be read', async () => {
    const t = h();
    await t.run('sha256sum a.txt > sums.txt');
    await t.run('rm a.txt');
    const checked = await t.run('sha256sum -c sums.txt');
    expect(checked.stdout).toContain('a.txt: FAILED open or read');
    expect(checked.stderr).toContain('WARNING: 1 listed file could not be read');
    expect(checked.status).toBe(1);
  });
});

describe('xxd extra flags', () => {
  it('honours -c and -g and reports errors', async () => {
    const t = h();
    expect((await t.run('xxd -c 4 a.txt')).stdout).toBe(
      '00000000: 616c 7068  alph\n00000004: 610a       a.\n',
    );
    expect((await t.run('xxd -g 1 -c 4 a.txt')).stdout).toBe(
      '00000000: 61 6c 70 68  alph\n00000004: 61 0a        a.\n',
    );
    expect((await t.run('xxd nope.txt')).status).toBe(1);
    expect((await t.run('xxd -p -c 2 a.txt')).stdout).toBe('616c\n7068\n610a\n');
  });
});

describe('tr extra behaviour', () => {
  it('complements, squeezes and pads SET2', async () => {
    const t = h();
    expect((await t.run("printf 'a1b2' | tr -c '[:digit:]' '.'")).stdout).toBe('.1.2');
    expect((await t.run("printf 'abc' | tr 'abc' 'x'")).stdout).toBe('xxx');
    expect((await t.run("printf 'aabbcc' | tr -s 'abc' 'abc'")).stdout).toBe('abc');
    expect((await t.run("printf 'a\\tb' | tr -d '\\t'")).stdout).toBe('ab');
  });
});

describe('openssl extra options', () => {
  it('supports -a, -pbkdf2, -md and password files', async () => {
    const t = h();
    await t.run('openssl enc -aes-256-cbc -a -in a.txt -out a.b64 -k pw');
    expect((await t.run('cat a.b64')).stdout).toMatch(/^[A-Za-z0-9+/=]+\n$/);
    expect((await t.run('openssl enc -d -aes-256-cbc -a -in a.b64 -k pw')).stdout).toBe('alpha\n');

    await t.run('openssl enc -aes-128-cbc -pbkdf2 -in a.txt -out a2.enc -k pw');
    expect((await t.run('openssl enc -d -aes-128-cbc -pbkdf2 -in a2.enc -k pw')).stdout).toBe(
      'alpha\n',
    );
    // Same password, different derivation: it must not decrypt.
    expect((await t.run('openssl enc -d -aes-128-cbc -in a2.enc -k pw')).status).toBe(1);

    await t.run('openssl enc -aes-256-cbc -md md5 -in a.txt -out a3.enc -k pw');
    expect((await t.run('openssl enc -d -aes-256-cbc -md md5 -in a3.enc -k pw')).stdout).toBe(
      'alpha\n',
    );

    await t.run('openssl enc -aes-256-cbc -in a.txt -out a4.enc -kfile pass.txt');
    expect((await t.run('openssl enc -d -aes-256-cbc -in a4.enc -k file-password')).stdout).toBe(
      'alpha\n',
    );
  });

  it('honours -iter (PBKDF2 iteration count) and round-trips with the same count', async () => {
    const t = h();
    await t.run('openssl enc -aes-256-cbc -iter 2048 -in a.txt -out it.enc -k pw');
    // -iter implies PBKDF2, so a matching -iter (or -pbkdf2 with the same count) decrypts it.
    expect((await t.run('openssl enc -d -aes-256-cbc -iter 2048 -in it.enc -k pw')).stdout).toBe(
      'alpha\n',
    );
    // The count really is used: a different -iter derives a different key (checked deterministically,
    // since "wrong key fails to decrypt" is only probabilistically true with CBC padding).
    const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(pbkdf2Key('pw', salt, 32, 16, 2048).key).not.toEqual(
      pbkdf2Key('pw', salt, 32, 16, 1024).key,
    );
    // A bad iteration count is rejected, not silently ignored.
    expect((await t.run('openssl enc -aes-256-cbc -iter zero -in a.txt -k pw')).status).toBe(1);
  });

  it('rejects -nosalt rather than silently ignoring it', async () => {
    const t = h();
    const out = await t.run('openssl enc -aes-256-cbc -nosalt -in a.txt -k pw');
    expect(out.status).toBe(1);
    expect(out.stderr).toContain('-nosalt is not supported');
  });

  it('rejects bad ciphers, digests, options and files', async () => {
    const t = h();
    expect((await t.run('openssl enc -bogus-cipher -in a.txt -k pw')).status).toBe(1);
    expect((await t.run('openssl enc -md bogus -in a.txt -k pw')).stderr).toContain(
      'unknown digest',
    );
    expect((await t.run('openssl enc -in nope.txt -k pw')).stderr).toContain("Can't open");
    expect((await t.run('openssl enc -zzz -in a.txt -k pw')).stderr).toContain('Unknown option');
    expect((await t.run('openssl enc -k')).stderr).toContain('needs an argument');
    expect((await t.run('openssl dgst -bogus a.txt')).stderr).toContain('Unknown option');
    expect((await t.run('openssl dgst -sha256 nope.txt')).status).toBe(1);
    expect((await t.run('openssl')).stderr).toContain('subcommand is required');
    expect((await t.run('openssl version')).stdout).toContain('OpenSSL 3.0.13');
    expect((await t.run('openssl enc -d -aes-256-cbc -in a.txt -k pw')).stderr).toBe(
      'bad decrypt\n',
    );
  });

  it('prompts for a password when -k is absent', async () => {
    const t = h();
    t.take();
    await t.shell.submit('openssl enc -aes-256-cbc -in a.txt -out p.enc');
    expect(t.shell.inputRequest.kind).toBe('read');
    await t.shell.submit('typed-password');
    await t.shell.whenReady();
    expect((await t.run('openssl enc -d -aes-256-cbc -in p.enc -k typed-password')).stdout).toBe(
      'alpha\n',
    );
  });
});

describe('john extra behaviour', () => {
  it('handles bare hashes and an empty hash file', async () => {
    const bare = digestHex('sha256', 'sunshine');
    const t = createHarness({
      commands: LINUX_COMMANDS,
      host: {
        hostname: 'jl',
        users: [{ name: 'guest', uid: 1000 }],
        fs: {
          '/home/guest/w.txt': { content: 'sunshine\n', owner: 'guest' },
          '/home/guest/bare.txt': { content: `${bare}\n`, owner: 'guest' },
          '/home/guest/empty.txt': { content: '# nothing\n', owner: 'guest' },
        },
      },
      user: 'guest',
    });
    const out = await t.run('john --wordlist=w.txt bare.txt');
    expect(out.stdout).toContain('sunshine');
    expect(out.stdout).toContain('(?)');
    expect((await t.run('john --show bare.txt')).stdout).toContain('?:sunshine');
    expect((await t.run('john --wordlist=w.txt empty.txt')).stderr).toContain(
      'No password hashes loaded',
    );
  });
});

describe('older commands: extra branches', () => {
  it('env, find and su edge cases', async () => {
    const t = h();
    expect((await t.run('env -u HOME printenv HOME')).status).not.toBe(0);
    expect((await t.run('find . -name deep.txt')).stdout).toContain('./data/deep.txt');
    expect((await t.run('find . -type d')).stdout).toContain('./data');
    expect((await t.run('find . -newer a.txt')).status).toBe(0);
    expect((await t.run('find nope -name x')).status).toBe(1);
    expect((await t.run('su --bogus')).status).not.toBe(0);
  });
});
