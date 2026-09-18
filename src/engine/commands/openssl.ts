import { type DigestName, digestHex, isDigestName } from '../crypto/digest';
import { opensslDecrypt, opensslEncrypt } from '../crypto/openssl';
import { strerror } from '../errors';
import { base64Decode, base64Encode } from '../util/base64';
import type { ByteString } from '../util/bytes';
import { defineCommand } from './define';
import type { CommandContext } from './types';
import { readOperand } from './util';

/** Ciphers the simulation accepts; only the key length differs. */
const CIPHERS: Readonly<Record<string, number>> = {
  'aes-256-cbc': 32,
  'aes-192-cbc': 24,
  'aes-128-cbc': 16,
};

interface EncArgs {
  decrypt: boolean;
  cipher: string;
  inFile: string | undefined;
  outFile: string | undefined;
  password: string | undefined;
  passFile: string | undefined;
  base64: boolean;
  digest: 'md5' | 'sha1' | 'sha256';
  pbkdf2: boolean;
}

/** openssl uses its own `-flag value` style, not getopt, so parse the argv directly. */
function parseEnc(args: readonly string[]): EncArgs | { error: string } {
  const result: EncArgs = {
    decrypt: false,
    cipher: 'aes-256-cbc',
    inFile: undefined,
    outFile: undefined,
    password: undefined,
    passFile: undefined,
    base64: false,
    digest: 'sha256',
    pbkdf2: false,
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    const next = (): string | undefined => args[++i];
    if (arg.startsWith('-') && arg.slice(1) in CIPHERS) {
      result.cipher = arg.slice(1);
    } else if (arg === '-d' || arg === '-decrypt') {
      result.decrypt = true;
    } else if (arg === '-e' || arg === '-encrypt') {
      result.decrypt = false;
    } else if (arg === '-in') {
      result.inFile = next();
    } else if (arg === '-out') {
      result.outFile = next();
    } else if (arg === '-k' || arg === '-pass') {
      const value = next();
      if (value === undefined) return { error: `${arg} needs an argument` };
      result.password = value.startsWith('pass:') ? value.slice(5) : value;
      if (value.startsWith('file:')) {
        result.passFile = value.slice(5);
        result.password = undefined;
      }
    } else if (arg === '-kfile') {
      result.passFile = next();
    } else if (arg === '-a' || arg === '-base64') {
      result.base64 = true;
    } else if (arg === '-md') {
      const value = next() ?? '';
      if (value !== 'md5' && value !== 'sha1' && value !== 'sha256') {
        return { error: `unknown digest '${value}'` };
      }
      result.digest = value;
    } else if (arg === '-pbkdf2') {
      result.pbkdf2 = true;
    } else if (arg === '-salt' || arg === '-nosalt' || arg === '-iter') {
      if (arg === '-iter') next();
    } else if (arg.startsWith('-')) {
      return { error: `Unknown option: ${arg}` };
    }
  }
  return result;
}

async function runEnc(ctx: CommandContext, args: readonly string[]): Promise<number> {
  const parsed = parseEnc(args);
  if ('error' in parsed) {
    ctx.stderr(`${parsed.error}\nenc: Use -help for summary.\n`);
    return 1;
  }
  const keyLength = CIPHERS[parsed.cipher];
  if (keyLength === undefined) {
    ctx.stderr(`enc: unknown cipher '${parsed.cipher}'\n`);
    return 1;
  }

  let password = parsed.password;
  if (password === undefined && parsed.passFile !== undefined) {
    const file = await readOperand(ctx, parsed.passFile);
    if (file === null) return 130;
    if (!file.ok) {
      ctx.stderr(`Can't open ${parsed.passFile} for reading\n`);
      return 1;
    }
    password = file.data.split('\n')[0] ?? '';
  }
  if (password === undefined) {
    const prompt = parsed.decrypt
      ? 'enter AES-256-CBC decryption password:'
      : 'enter AES-256-CBC encryption password:';
    const typed = await ctx.tty.readLine(prompt, { secret: true });
    if (typed === null) return 1;
    password = typed;
  }

  const input = await readOperand(ctx, parsed.inFile ?? '-');
  if (input === null) return 130;
  if (!input.ok) {
    ctx.stderr(`Can't open ${parsed.inFile ?? '-'} for reading, ${strerror(input.errno)}\n`);
    return 1;
  }

  const options = {
    keyLength,
    digest: parsed.digest,
    pbkdf2: parsed.pbkdf2,
  };
  let output: ByteString;
  if (parsed.decrypt) {
    const container = parsed.base64
      ? base64Decode(input.data)
      : { ok: true as const, bytes: input.data };
    if (!container.ok) {
      ctx.stderr('error reading input file\n');
      return 1;
    }
    const result = opensslDecrypt(container.bytes, password, options);
    if (!result.ok) {
      ctx.stderr('bad decrypt\n');
      return 1;
    }
    output = result.plaintext;
  } else {
    const encrypted = opensslEncrypt(input.data, password, options);
    output = parsed.base64 ? `${base64Encode(encrypted)}\n` : encrypted;
  }

  if (parsed.outFile !== undefined) {
    try {
      ctx.fs.writeFile(parsed.outFile, output);
    } catch {
      ctx.stderr(`Can't open ${parsed.outFile} for writing\n`);
      return 1;
    }
    return 0;
  }
  ctx.stdout(output);
  return 0;
}

async function runDgst(ctx: CommandContext, args: readonly string[]): Promise<number> {
  let algorithm: DigestName = 'sha256';
  const files: string[] = [];
  for (const arg of args) {
    if (arg.startsWith('-')) {
      const name = arg.slice(1);
      if (isDigestName(name)) algorithm = name;
      else if (name !== 'hex') {
        ctx.stderr(`dgst: Unknown option: ${arg}\n`);
        return 1;
      }
    } else {
      files.push(arg);
    }
  }
  const operands = files.length > 0 ? files : ['-'];
  let status = 0;
  for (const operand of operands) {
    const input = await readOperand(ctx, operand);
    if (input === null) return 130;
    if (!input.ok) {
      ctx.stderr(`dgst: Can't open ${operand}, ${strerror(input.errno)}\n`);
      status = 1;
      continue;
    }
    const digest = digestHex(algorithm, input.data);
    ctx.stdout(
      operand === '-'
        ? `(stdin)= ${digest}\n`
        : `${algorithm.toUpperCase()}(${operand})= ${digest}\n`,
    );
  }
  return status;
}

export const openssl = defineCommand({
  name: 'openssl',
  kind: 'binary',
  description: 'OpenSSL cryptography toolkit',
  usage: ['enc [-d] -aes-256-cbc -in FILE [-out FILE] [-k PASS]', 'dgst [-sha256|-md5] FILE'],
  about:
    'The general-purpose cryptography tool. Two subcommands are available here:\n  enc    encrypt or decrypt a file with a password\n  dgst   print a message digest\n\nA file encrypted with `openssl enc` starts with the bytes "Salted__" — which is\nhow you recognise one with xxd or file.',
  options: [
    ['-d', 'decrypt (the default is to encrypt)'],
    ['-in FILE', 'input file'],
    ['-out FILE', 'output file (otherwise stdout)'],
    ['-k PASS', 'the password, on the command line'],
    ['-a', 'the input/output is base64 encoded'],
    ['-md DIGEST', 'digest used to derive the key (md5, sha1, sha256; default sha256)'],
    ['-pbkdf2', 'use PBKDF2 key derivation instead of the legacy one'],
  ],
  details:
    'Decrypt a file when you know the password:\n  openssl enc -d -aes-256-cbc -in archive.enc -out archive.txt -k PASSWORD\n\nWithout -k, openssl prompts for the password. A wrong password does not produce\ngarbage — the padding check fails and it says "bad decrypt", which tells you the\npassword is wrong rather than the file being corrupt.\n\nThe encryption here is genuine AES-256-CBC in the real OpenSSL container format.',
  examples: [
    ['openssl enc -d -aes-256-cbc -in vault.enc -k hunter2', 'decrypt to the screen'],
    ['openssl dgst -sha256 report.pdf', 'print a SHA-256 digest'],
    ['xxd -l 16 vault.enc', 'check for the Salted__ header first'],
  ],
  seeAlso: ['sha256sum(1)', 'xxd(1)', 'gpg(1)', 'john(1)'],
  run: async (ctx) => {
    const subcommand = ctx.args[0];
    const rest = ctx.args.slice(1);
    if (subcommand === undefined) {
      ctx.stderr('openssl: a subcommand is required (enc, dgst)\n');
      return 1;
    }
    if (subcommand === 'enc') return runEnc(ctx, rest);
    if (subcommand === 'dgst') return runDgst(ctx, rest);
    if (subcommand === 'version') {
      ctx.stdout('OpenSSL 3.0.13 30 Jan 2024 (Library: OpenSSL 3.0.13 30 Jan 2024)\n');
      return 0;
    }
    ctx.stderr(
      `openssl: '${subcommand}' is an invalid command in this simulation (try enc or dgst)\n`,
    );
    return 1;
  },
});
