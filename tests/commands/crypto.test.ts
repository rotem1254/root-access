import { describe, expect, it } from 'vitest';
import { LINUX_COMMANDS } from '../../src/engine/commands';
import { digestHex, identifyHash } from '../../src/engine/crypto/digest';
import { opensslDecrypt, opensslEncrypt } from '../../src/engine/crypto/openssl';
import { expandSet } from '../../src/engine/commands/tr';
import type { HostDefinition } from '../../src/engine/system/host';
import { createHarness } from '../helpers/shell';

const HOST: HostDefinition = {
  hostname: 'crypto-box',
  users: [{ name: 'guest', uid: 1000, password: 'guest' }],
  fs: {
    '/home/guest/report.txt': { content: 'NovaCorp quarterly report\n', owner: 'guest' },
    '/home/guest/other.txt': { content: 'other\n', owner: 'guest' },
    '/home/guest/binary.bin': { bytes: '\x7fELF\x02\x01\x01\x00NovaCorp', owner: 'guest' },
  },
};

const harness = () => createHarness({ commands: LINUX_COMMANDS, host: HOST, user: 'guest' });

// Known-answer vectors, so the digests are verifiably real.
const ABC = {
  md5: '900150983cd24fb0d6963f7d28e17f72',
  sha1: 'a9993e364706816aba3e25717850c26c9cd0d89d',
};

describe('digest primitives', () => {
  it('matches published test vectors', () => {
    expect(digestHex('md5', 'abc')).toBe(ABC.md5);
    expect(digestHex('sha1', 'abc')).toBe(ABC.sha1);
    expect(digestHex('sha256', 'abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(digestHex('md5', '')).toBe('d41d8cd98f00b204e9800998ecf8427e');
  });

  it('identifies a hash by its length, and refuses non-hex', () => {
    expect(identifyHash(ABC.md5).candidates).toEqual(['md5']);
    expect(identifyHash(ABC.sha1).candidates).toEqual(['sha1', 'ripemd160']);
    expect(
      identifyHash('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'),
    ).toMatchObject({
      candidates: ['sha256'],
      bits: 256,
    });
    expect(identifyHash('not a hash').looksLikeHash).toBe(false);
    expect(identifyHash('abc').looksLikeHash).toBe(false);
  });
});

describe('md5sum / sha256sum', () => {
  it('prints digests in coreutils format', async () => {
    const h = harness();
    const expected = digestHex('sha256', 'NovaCorp quarterly report\n');
    expect((await h.run('sha256sum report.txt')).stdout).toBe(`${expected}  report.txt\n`);
    expect((await h.run('md5sum report.txt')).stdout).toMatch(/^[0-9a-f]{32} {2}report\.txt\n$/);
    expect((await h.run('sha1sum report.txt')).stdout).toMatch(/^[0-9a-f]{40} {2}report\.txt\n$/);
    expect((await h.run('printf abc | md5sum')).stdout).toBe(`${ABC.md5}  -\n`);
  });

  it('verifies a checksum list and flags the tampered file', async () => {
    const h = harness();
    await h.run('sha256sum report.txt other.txt > SHA256SUMS');
    expect((await h.run('sha256sum -c SHA256SUMS')).stdout).toBe('report.txt: OK\nother.txt: OK\n');
    await h.run('echo tampered > other.txt');
    const checked = await h.run('sha256sum -c SHA256SUMS');
    expect(checked.stdout).toContain('report.txt: OK');
    expect(checked.stdout).toContain('other.txt: FAILED');
    expect(checked.stderr).toContain('WARNING: 1 computed checksum did NOT match');
    expect(checked.status).toBe(1);
    expect((await h.run('sha256sum -c --status SHA256SUMS')).stdout).toBe('');
  });

  it('reports unreadable files', async () => {
    const h = harness();
    expect((await h.run('sha256sum nope.txt')).stderr).toContain('No such file or directory');
    expect((await h.run('sha256sum nope.txt')).status).toBe(1);
  });
});

describe('xxd', () => {
  it('dumps bytes with offsets and a printable gutter', async () => {
    const h = harness();
    const out = (await h.run('xxd binary.bin')).stdout;
    expect(out).toBe('00000000: 7f45 4c46 0201 0100 4e6f 7661 436f 7270  .ELF....NovaCorp\n');
  });

  it('supports -p, -l, -s and round-trips with -r', async () => {
    const h = harness();
    expect((await h.run('xxd -p -l 4 binary.bin')).stdout).toBe('7f454c46\n');
    expect((await h.run('xxd -p -s 8 binary.bin')).stdout).toBe('4e6f7661436f7270\n');
    expect((await h.run('echo 464c41477b7d | xxd -r -p')).stdout).toBe('FLAG{}');
    expect((await h.run('echo zz | xxd -r -p')).stderr).toContain('cannot revert');
  });
});

describe('tr', () => {
  it('expands ranges and classes', () => {
    expect(expandSet('a-e')).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(expandSet('[:digit:]')).toHaveLength(10);
    expect(expandSet('\\n')).toEqual(['\n']);
  });

  it('applies ROT13 and is its own inverse', async () => {
    const h = harness();
    const rot13 = "tr 'A-Za-z' 'N-ZA-Mn-za-m'";
    expect((await h.run(`echo 'Attack at dawn' | ${rot13}`)).stdout).toBe('Nggnpx ng qnja\n');
    expect((await h.run(`echo 'Nggnpx ng qnja' | ${rot13}`)).stdout).toBe('Attack at dawn\n');
  });

  it('upper-cases, deletes and squeezes', async () => {
    const h = harness();
    expect((await h.run("echo hello | tr 'a-z' 'A-Z'")).stdout).toBe('HELLO\n');
    expect((await h.run("printf 'a1b2c3' | tr -d '[:digit:]'")).stdout).toBe('abc');
    expect((await h.run("printf 'aa  bb' | tr -s ' '")).stdout).toBe('aa bb');
    expect((await h.run("tr 'a'")).stderr).toContain('missing operand after');
    expect((await h.run('tr')).stderr).toContain('missing operand');
  });
});

describe('openssl', () => {
  it('round-trips a real AES-256-CBC container', () => {
    const container = opensslEncrypt('secret payload\n', 'hunter2');
    expect(container.startsWith('Salted__')).toBe(true);
    const back = opensslDecrypt(container, 'hunter2');
    expect(back.ok && back.plaintext).toBe('secret payload\n');
    expect(opensslDecrypt(container, 'wrong')).toEqual({ ok: false, reason: 'bad-decrypt' });
    expect(opensslDecrypt('not a container', 'hunter2')).toEqual({
      ok: false,
      reason: 'bad-magic',
    });
  });

  it('encrypts and decrypts through the command', async () => {
    const h = harness();
    expect(
      (await h.run('openssl enc -aes-256-cbc -in report.txt -out report.enc -k s3cret')).status,
    ).toBe(0);
    expect((await h.run('xxd -p -l 8 report.enc')).stdout).toBe('53616c7465645f5f\n');
    expect((await h.run('file report.enc')).stdout).toContain('openssl enc');
    const out = await h.run('openssl enc -d -aes-256-cbc -in report.enc -k s3cret');
    expect(out.stdout).toBe('NovaCorp quarterly report\n');
    const bad = await h.run('openssl enc -d -aes-256-cbc -in report.enc -k wrong');
    expect(bad.stderr).toBe('bad decrypt\n');
    expect(bad.status).toBe(1);
  });

  it('computes digests with dgst', async () => {
    const h = harness();
    const expected = digestHex('sha256', 'NovaCorp quarterly report\n');
    expect((await h.run('openssl dgst -sha256 report.txt')).stdout).toBe(
      `SHA256(report.txt)= ${expected}\n`,
    );
    expect((await h.run('printf abc | openssl dgst -md5')).stdout).toBe(`(stdin)= ${ABC.md5}\n`);
    expect((await h.run('openssl bogus')).status).toBe(1);
  });
});

describe('john', () => {
  const WORDS = 'letmein\npassword\ncorrect horse\nQu4rterly!\nsunshine\n';
  const cracked = digestHex('md5', 'Qu4rterly!');
  const uncracked = digestHex('md5', 'not-in-the-list-xyz');

  const johnHarness = () =>
    createHarness({
      commands: LINUX_COMMANDS,
      host: {
        hostname: 'crack-box',
        users: [{ name: 'guest', uid: 1000 }],
        fs: {
          '/home/guest/words.txt': { content: WORDS, owner: 'guest' },
          '/home/guest/hashes.txt': {
            content: `mreyes:${cracked}\nghost:${uncracked}\n`,
            owner: 'guest',
          },
        },
      },
      user: 'guest',
    });

  it('cracks a hash from a wordlist and remembers it', async () => {
    const h = johnHarness();
    const out = await h.run('john --wordlist=words.txt hashes.txt');
    expect(out.stdout).toContain('Loaded 2 password hashes (raw-md5');
    expect(out.stdout).toContain('Qu4rterly!');
    expect(out.stdout).toContain('(mreyes)');
    expect(out.stdout).toContain('Session completed.');
    // The uncracked hash is not reported.
    expect(out.stdout).not.toContain('(ghost)');
    const shown = await h.run('john --show hashes.txt');
    expect(shown.stdout).toContain('mreyes:Qu4rterly!');
    expect(shown.stdout).toContain('1 password hash cracked, 1 left');
  });

  it('honours --format and rejects an unknown one', async () => {
    const h = johnHarness();
    expect((await h.run('john --format=raw-md5 --wordlist=words.txt hashes.txt')).stdout).toContain(
      'Qu4rterly!',
    );
    expect((await h.run('john --format=bogus --wordlist=words.txt hashes.txt')).stderr).toContain(
      'Unknown ciphertext format',
    );
    // A wrong format simply cracks nothing.
    const wrong = await h.run('john --format=raw-sha256 --wordlist=words.txt hashes.txt');
    expect(wrong.stdout).not.toContain('Qu4rterly!');
  });

  it('errors without a wordlist or a hash file', async () => {
    const h = johnHarness();
    expect((await h.run('john hashes.txt')).stderr).toContain('--wordlist=FILE');
    expect((await h.run('john')).stderr).toContain('Usage: john');
    expect((await h.run('john --wordlist=words.txt nope.txt')).stderr).toContain('Error: file');
  });
});
