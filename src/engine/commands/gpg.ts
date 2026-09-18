import { decryptMessage, type PgpKey, parsePrivateKey } from '../crypto/gpgsim';
import { strerror } from '../errors';
import { parseOptions } from './args';
import { defineCommand } from './define';
import type { CommandContext } from './types';
import { readOperand } from './util';

const KEYRING = '.gnupg/secring.json';

function keyringPath(ctx: CommandContext): string {
  return `${ctx.env.get('HOME') ?? '/'}/${KEYRING}`;
}

function loadKeys(ctx: CommandContext): PgpKey[] {
  try {
    const parsed: unknown = JSON.parse(ctx.fs.readFile(keyringPath(ctx)));
    return Array.isArray(parsed) ? (parsed as PgpKey[]) : [];
  } catch {
    return [];
  }
}

function saveKeys(ctx: CommandContext, keys: readonly PgpKey[]): boolean {
  const home = ctx.env.get('HOME') ?? '/';
  try {
    if (!ctx.fs.exists(`${home}/.gnupg`)) ctx.fs.mkdir(`${home}/.gnupg`, 0o700);
    ctx.fs.writeFile(keyringPath(ctx), `${JSON.stringify(keys)}\n`);
    return true;
  } catch {
    return false;
  }
}

export const gpg = defineCommand({
  name: 'gpg',
  kind: 'binary',
  description: 'OpenPGP encryption and signing tool',
  usage: ['--import KEYFILE', '--list-secret-keys', '-d FILE', '--decrypt FILE'],
  about:
    'Work with OpenPGP messages and keys. The workflow is the point: you import the\nprivate key you were given, unlock it with its passphrase, and decrypt a message\nthat was encrypted to that key. Without the key, the passphrase alone is useless\n— and without the passphrase, so is the key.',
  options: [
    ['--import FILE', 'import a key from FILE into your keyring'],
    ['--list-keys, --list-secret-keys', 'list the keys in your keyring'],
    ['-d, --decrypt FILE', 'decrypt FILE and write the result to stdout'],
    ['--passphrase PASS', 'supply the passphrase instead of being prompted'],
    ['-o, --output FILE', 'write the result to FILE'],
  ],
  details:
    'Typical sequence:\n  gpg --import alex-private.asc      add the key to your keyring\n  gpg --list-secret-keys             confirm it is there, note the key id\n  gpg -d message.asc                 decrypt (you will be asked for the passphrase)\n\nSIMULATION NOTE: this is a teaching stand-in, not OpenPGP. The commands, the\nkeyring workflow and the failure messages mirror the real tool, but the key\nformat is simplified and the message body is AES-encrypted rather than using\nreal OpenPGP packets. Everything you learn about *using* gpg transfers; the\nfile format does not.',
  examples: [
    ['gpg --import key.asc', 'import a private key'],
    ['gpg --list-secret-keys', 'show your keyring'],
    ['gpg -d secret.asc', 'decrypt a message'],
  ],
  seeAlso: ['openssl(1)', 'base64(1)', 'john(1)'],
  run: async (ctx) => {
    const outcome = parseOptions(
      ctx.name,
      ctx.args,
      [
        { long: 'import' },
        { long: 'list-keys' },
        { long: 'list-secret-keys' },
        { short: 'd', long: 'decrypt' },
        { long: 'passphrase', arg: 'required' },
        { short: 'o', long: 'output', arg: 'required' },
        { long: 'batch' },
        { short: 'q', long: 'quiet' },
      ],
      {
        unsupported: [
          'gen-key',
          'full-generate-key',
          'sign',
          'clearsign',
          'export',
          'encrypt',
          'e',
        ],
      },
    );
    if (!outcome.ok) {
      ctx.stderr(outcome.message);
      return 2;
    }
    const o = outcome.options;
    const keys = loadKeys(ctx);

    if (o.has('list-keys') || o.has('list-secret-keys')) {
      const path = keyringPath(ctx);
      ctx.stdout(`${path}\n${'-'.repeat(path.length)}\n`);
      if (keys.length === 0) {
        ctx.stderr('gpg: no keys found\n');
        return 2;
      }
      for (const key of keys) {
        ctx.stdout(`sec   rsa4096 ${key.created} [SC]\n`);
        ctx.stdout(`      ${key.keyId}\n`);
        ctx.stdout(`uid           [ultimate] ${key.uid}\n\n`);
      }
      return 0;
    }

    if (o.has('import')) {
      const target = o.operands[0];
      if (target === undefined) {
        ctx.stderr('gpg: no file to import\n');
        return 2;
      }
      const file = await readOperand(ctx, target);
      if (file === null) return 130;
      if (!file.ok) {
        ctx.stderr(
          `gpg: can't open '${target}': ${strerror(file.errno)}\ngpg: Total number processed: 0\n`,
        );
        return 2;
      }
      const key = parsePrivateKey(file.data);
      if (!key) {
        ctx.stderr(`gpg: no valid OpenPGP data found.\ngpg: Total number processed: 0\n`);
        return 2;
      }
      if (keys.some((existing) => existing.keyId === key.keyId)) {
        ctx.stderr(
          `gpg: key ${key.keyId}: "${key.uid}" not changed\ngpg: Total number processed: 1\ngpg:              unchanged: 1\n`,
        );
        return 0;
      }
      keys.push(key);
      if (!saveKeys(ctx, keys)) {
        ctx.stderr('gpg: failed to write the keyring\n');
        return 2;
      }
      ctx.stderr(
        `gpg: key ${key.keyId}: secret key imported\ngpg: Total number processed: 1\ngpg:       secret keys read: 1\ngpg:   secret keys imported: 1\n`,
      );
      return 0;
    }

    if (o.has('decrypt')) {
      const target = o.operands[0];
      if (target === undefined) {
        ctx.stderr('gpg: no input file\n');
        return 2;
      }
      const file = await readOperand(ctx, target);
      if (file === null) return 130;
      if (!file.ok) {
        ctx.stderr(`gpg: can't open '${target}': ${strerror(file.errno)}\n`);
        return 2;
      }
      let passphrase = o.value('passphrase');
      if (passphrase === undefined) {
        const typed = await ctx.tty.readLine('Enter passphrase: ', { secret: true });
        if (typed === null) {
          ctx.stderr('\ngpg: signal Interrupt caught ... exiting\n');
          return 2;
        }
        passphrase = typed;
      }
      const result = decryptMessage(file.data, keys, passphrase);
      if (!result.ok) {
        if (result.reason === 'not-a-message') {
          ctx.stderr(
            'gpg: no valid OpenPGP data found.\ngpg: decrypt_message failed: Unknown system error\n',
          );
        } else if (result.reason === 'no-secret-key') {
          ctx.stderr(
            `gpg: encrypted with RSA key, ID ${result.keyId ?? '????'}\ngpg: decryption failed: No secret key\n`,
          );
        } else {
          ctx.stderr('gpg: encrypted with RSA key\ngpg: decryption failed: Bad passphrase\n');
        }
        return 2;
      }
      ctx.stderr(`gpg: encrypted with rsa4096 key, ID ${result.keyId}\n`);
      const output = o.value('output');
      if (output !== undefined) {
        try {
          ctx.fs.writeFile(output, result.plaintext);
        } catch {
          ctx.stderr(`gpg: can't create '${output}'\n`);
          return 2;
        }
        return 0;
      }
      ctx.stdout(result.plaintext);
      return 0;
    }

    ctx.stderr('gpg: Go ahead and type your message ...\ngpg: no command supplied (try --help)\n');
    return 2;
  },
});
