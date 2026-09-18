import { describe, expect, it } from 'vitest';
import { LINUX_COMMANDS } from '../../src/engine/commands';
import {
  armorMessage,
  armorPrivateKey,
  decryptMessage,
  keyIdFor,
  parsePrivateKey,
  type PgpKey,
} from '../../src/engine/crypto/gpgsim';
import type { HostDefinition } from '../../src/engine/system/host';
import { createHarness } from '../helpers/shell';

const KEY: PgpKey = {
  keyId: keyIdFor('Alex Mercer <alex.mercer@novacorp.example>'),
  uid: 'Alex Mercer <alex.mercer@novacorp.example>',
  passphrase: 'correct-horse',
  created: '2026-01-04',
};
const OTHER: PgpKey = {
  ...KEY,
  keyId: keyIdFor('someone else'),
  uid: 'Someone Else <x@y.example>',
};

const SECRET = 'The auditor signed off on the export.\n';

const HOST: HostDefinition = {
  hostname: 'gpg-box',
  users: [{ name: 'guest', uid: 1000 }],
  fs: {
    '/home/guest/alex-private.asc': { content: armorPrivateKey(KEY), owner: 'guest' },
    '/home/guest/message.asc': { content: armorMessage(SECRET, KEY), owner: 'guest' },
    '/home/guest/foreign.asc': { content: armorMessage(SECRET, OTHER), owner: 'guest' },
    '/home/guest/notes.txt': { content: 'not a key\n', owner: 'guest' },
  },
};

const harness = () => createHarness({ commands: LINUX_COMMANDS, host: HOST, user: 'guest' });

describe('gpg simulation module', () => {
  it('round-trips a key and a message', () => {
    expect(parsePrivateKey(armorPrivateKey(KEY))).toEqual(KEY);
    expect(parsePrivateKey('not a key')).toBeNull();
    expect(
      parsePrivateKey(
        '-----BEGIN PGP PRIVATE KEY BLOCK-----\n\n!!!\n-----END PGP PRIVATE KEY BLOCK-----',
      ),
    ).toBeNull();
    const message = armorMessage(SECRET, KEY);
    const opened = decryptMessage(message, [KEY], KEY.passphrase);
    expect(opened.ok && opened.plaintext).toBe(SECRET);
  });

  it('fails without the key, and with a wrong passphrase', () => {
    const message = armorMessage(SECRET, KEY);
    expect(decryptMessage(message, [], KEY.passphrase)).toMatchObject({ reason: 'no-secret-key' });
    expect(decryptMessage(message, [KEY], 'nope')).toMatchObject({ reason: 'bad-passphrase' });
    expect(decryptMessage('plain text', [KEY], 'x')).toMatchObject({ reason: 'not-a-message' });
  });

  it('derives a stable key id from the uid', () => {
    expect(keyIdFor(KEY.uid)).toMatch(/^[0-9A-F]{16}$/);
    expect(keyIdFor(KEY.uid)).toBe(keyIdFor(KEY.uid));
    expect(keyIdFor('other')).not.toBe(keyIdFor(KEY.uid));
  });
});

describe('gpg command', () => {
  it('imports a key, lists it, and decrypts a message', async () => {
    const h = harness();
    // Without the key, decryption cannot even start.
    const before = await h.run(`gpg --passphrase ${KEY.passphrase} -d message.asc`);
    expect(before.stderr).toContain('No secret key');
    expect(before.status).toBe(2);

    const imported = await h.run('gpg --import alex-private.asc');
    expect(imported.stderr).toContain('secret key imported');
    expect(imported.status).toBe(0);

    const listed = await h.run('gpg --list-secret-keys');
    expect(listed.stdout).toContain(KEY.keyId);
    expect(listed.stdout).toContain('Alex Mercer');

    const opened = await h.run(`gpg --passphrase ${KEY.passphrase} -d message.asc`);
    expect(opened.stdout).toBe(SECRET);
    expect(opened.stderr).toContain(`encrypted with rsa4096 key, ID ${KEY.keyId}`);
  });

  it('prompts for the passphrase when it is not given', async () => {
    const h = harness();
    await h.run('gpg --import alex-private.asc');
    h.take();
    await h.shell.submit('gpg -d message.asc');
    expect(h.shell.inputRequest.kind).toBe('read');
    await h.shell.submit(KEY.passphrase);
    await h.shell.whenReady();
    expect(h.take().stdout).toContain(SECRET);
  });

  it('rejects a wrong passphrase and a message for another key', async () => {
    const h = harness();
    await h.run('gpg --import alex-private.asc');
    expect((await h.run('gpg --passphrase wrong -d message.asc')).stderr).toContain(
      'Bad passphrase',
    );
    expect((await h.run(`gpg --passphrase ${KEY.passphrase} -d foreign.asc`)).stderr).toContain(
      'No secret key',
    );
    expect((await h.run(`gpg --passphrase x -d notes.txt`)).stderr).toContain(
      'no valid OpenPGP data',
    );
  });

  it('writes to a file with -o and reports import problems', async () => {
    const h = harness();
    await h.run('gpg --import alex-private.asc');
    await h.run(`gpg --passphrase ${KEY.passphrase} -o out.txt -d message.asc`);
    expect((await h.run('cat out.txt')).stdout).toBe(SECRET);
    // Re-importing the same key changes nothing.
    expect((await h.run('gpg --import alex-private.asc')).stderr).toContain('not changed');
    expect((await h.run('gpg --import notes.txt')).stderr).toContain('no valid OpenPGP data');
    expect((await h.run('gpg --import nope.asc')).stderr).toContain('No such file or directory');
  });

  it('reports an empty keyring and a missing command', async () => {
    const h = harness();
    expect((await h.run('gpg --list-secret-keys')).stderr).toContain('no keys found');
    expect((await h.run('gpg')).stderr).toContain('no command supplied');
    expect((await h.run('gpg --import')).stderr).toContain('no file to import');
    expect((await h.run('gpg -d')).stderr).toContain('no input file');
  });

  it('identifies key and message files with file(1)', async () => {
    const h = harness();
    expect((await h.run('file alex-private.asc')).stdout).toContain('PGP private key block');
    expect((await h.run('file message.asc')).stdout).toContain('PGP message');
  });
});
