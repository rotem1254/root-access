import { isFsError, strerror } from '../errors';
import { S_ISGID, S_ISUID, S_ISVTX } from '../fs/mode';
import type { Stat } from '../fs/types';
import type { ByteString } from '../util/bytes';
import { sha256Hex } from '../util/sha256';
import { parseOptions } from './args';
import { defineCommand } from './define';

interface Magic {
  description: string;
  mime: string;
}

const u16be = (d: string, at: number): number => (d.charCodeAt(at) << 8) | d.charCodeAt(at + 1);
const u32be = (d: string, at: number): number => (u16be(d, at) * 65536 + u16be(d, at + 2)) >>> 0;
const u16le = (d: string, at: number): number => d.charCodeAt(at) | (d.charCodeAt(at + 1) << 8);

function isUtf8(data: ByteString): boolean {
  let i = 0;
  while (i < data.length) {
    const b = data.charCodeAt(i);
    let extra: number;
    if (b < 0x80) extra = 0;
    else if (b >= 0xc2 && b <= 0xdf) extra = 1;
    else if (b >= 0xe0 && b <= 0xef) extra = 2;
    else if (b >= 0xf0 && b <= 0xf4) extra = 3;
    else return false;
    for (let k = 1; k <= extra; k++) {
      if (i + k >= data.length || (data.charCodeAt(i + k) & 0xc0) !== 0x80) return false;
    }
    i += extra + 1;
  }
  return true;
}

const TEXT_CONTROL = new Set([7, 8, 9, 10, 12, 13, 27]);

function textDescription(data: ByteString): Magic | null {
  let ascii = true;
  let escapes = false;
  for (let i = 0; i < data.length; i++) {
    const b = data.charCodeAt(i);
    if (b === 0) return null;
    if (b === 27) escapes = true;
    if (b >= 128) ascii = false;
    else if (b < 32 && !TEXT_CONTROL.has(b)) return null;
    else if (b === 127) return null;
  }
  const utf8 = !ascii && isUtf8(data);
  if (!ascii && !utf8) return null;

  const features: string[] = [];
  const longest = Math.max(...data.split('\n').map((line) => line.length));
  if (longest > 300) features.push(`with very long lines (${longest})`);
  if (data.includes('\r\n')) features.push('with CRLF line terminators');
  else if (!data.includes('\n')) features.push('with no line terminators');
  if (escapes) features.push('with escape sequences');

  const charset = ascii ? 'us-ascii' : 'utf-8';
  const base = ascii ? 'ASCII text' : 'Unicode text, UTF-8 text';
  const newline = data.indexOf('\n');
  const firstLine = newline < 0 ? data : data.slice(0, newline);
  if (firstLine.startsWith('#!')) {
    const interpreter = firstLine.slice(2).trim();
    const kind = /\bbash$/.test(interpreter)
      ? 'Bourne-Again shell script'
      : /\bsh$/.test(interpreter)
        ? 'POSIX shell script'
        : /python3?$/.test(interpreter)
          ? 'Python script'
          : interpreter.endsWith('perl')
            ? 'Perl script'
            : null;
    if (kind) {
      const mime = kind.includes('shell')
        ? 'text/x-shellscript'
        : kind.includes('Python')
          ? 'text/x-script.python'
          : 'text/x-perl';
      return {
        description: [`${kind}, ${base} executable`, ...features].join(', '),
        mime: `${mime}; charset=${charset}`,
      };
    }
  }
  if (data.startsWith('-----BEGIN OPENSSH PRIVATE KEY-----')) {
    return { description: 'OpenSSH private key', mime: 'text/plain; charset=us-ascii' };
  }
  if (data.startsWith('-----BEGIN RSA PRIVATE KEY-----')) {
    return { description: 'PEM RSA private key', mime: 'text/plain; charset=us-ascii' };
  }
  if (data.startsWith('-----BEGIN CERTIFICATE-----')) {
    return { description: 'PEM certificate', mime: 'text/plain; charset=us-ascii' };
  }
  if (data.startsWith('-----BEGIN PGP MESSAGE-----')) {
    return { description: 'PGP message', mime: 'text/plain; charset=us-ascii' };
  }
  if (/^ssh-(rsa|ed25519) AAAA/.test(data)) {
    const type = data.startsWith('ssh-rsa') ? 'RSA' : 'ED25519';
    return { description: `OpenSSH ${type} public key`, mime: 'text/plain; charset=us-ascii' };
  }
  return { description: [base, ...features].join(', '), mime: `text/plain; charset=${charset}` };
}

function binaryDescription(data: ByteString, stat: Stat, name: string): Magic | null {
  if (data.startsWith('\x7fELF')) {
    const bits = data.charCodeAt(4) === 2 ? '64-bit' : '32-bit';
    const endian = data.charCodeAt(5) === 2 ? 'MSB' : 'LSB';
    const special = stat.mode & S_ISUID ? 'setuid ' : stat.mode & S_ISGID ? 'setgid ' : '';
    const buildId = sha256Hex(`build:${name}`).slice(0, 40);
    return {
      description: `${special}ELF ${bits} ${endian} pie executable, x86-64, version 1 (SYSV), dynamically linked, interpreter /lib64/ld-linux-x86-64.so.2, BuildID[sha1]=${buildId}, for GNU/Linux 3.2.0, stripped`,
      mime: 'application/x-pie-executable; charset=binary',
    };
  }
  if (data.startsWith('\x89PNG\r\n\x1a\n') && data.length >= 29) {
    const colorTypes: Record<number, string> = {
      0: 'grayscale',
      2: 'RGB',
      3: 'colormap',
      4: 'gray+alpha',
      6: 'RGBA',
    };
    const color = colorTypes[data.charCodeAt(25)] ?? 'RGB';
    return {
      description: `PNG image data, ${u32be(data, 16)} x ${u32be(data, 20)}, ${data.charCodeAt(24)}-bit/color ${color}, ${data.charCodeAt(28) ? 'interlaced' : 'non-interlaced'}`,
      mime: 'image/png; charset=binary',
    };
  }
  if (data.startsWith('\xff\xd8\xff'))
    return { description: 'JPEG image data', mime: 'image/jpeg; charset=binary' };
  if (/^GIF8[79]a/.test(data) && data.length >= 10) {
    return {
      description: `GIF image data, version ${data.slice(3, 6)}, ${u16le(data, 6)} x ${u16le(data, 8)}`,
      mime: 'image/gif; charset=binary',
    };
  }
  if (data.startsWith('\x1f\x8b'))
    return {
      description: 'gzip compressed data, from Unix',
      mime: 'application/gzip; charset=binary',
    };
  if (data.startsWith('PK\x03\x04')) {
    return {
      description: 'Zip archive data, at least v2.0 to extract, compression method=deflate',
      mime: 'application/zip; charset=binary',
    };
  }
  const pdf = /^%PDF-(\d\.\d)/.exec(data);
  if (pdf)
    return {
      description: `PDF document, version ${pdf[1] ?? '1.4'}`,
      mime: 'application/pdf; charset=binary',
    };
  if (data.startsWith('SQLite format 3\x00'))
    return { description: 'SQLite 3.x database', mime: 'application/vnd.sqlite3; charset=binary' };
  if (data.startsWith('\xd4\xc3\xb2\xa1')) {
    return {
      description:
        'pcap capture file, microsecond ts (little-endian) - version 2.4 (Ethernet, capture length 65535)',
      mime: 'application/vnd.tcpdump.pcap; charset=binary',
    };
  }
  return null;
}

function describe(
  ctx: Parameters<Parameters<typeof defineCommand>[0]['run']>[0],
  name: string,
  follow: boolean,
): Magic {
  let stat: Stat;
  try {
    stat = follow ? ctx.fs.stat(name) : ctx.fs.lstat(name);
  } catch (error) {
    if (!isFsError(error)) throw error;
    if (follow && error.code === 'ENOENT' && ctx.fs.exists(name)) {
      const target = ctx.fs.readlink(name);
      return {
        description: `broken symbolic link to ${target}`,
        mime: 'inode/symlink; charset=binary',
      };
    }
    return {
      description: `cannot open \`${name}' (${strerror(error.code)})`,
      mime: `cannot open \`${name}' (${strerror(error.code)})`,
    };
  }
  if (stat.type === 'symlink') {
    const target = stat.target ?? '';
    const broken = !ctx.fs.exists(name, true);
    return {
      description: `${broken ? 'broken ' : ''}symbolic link to ${target}`,
      mime: 'inode/symlink; charset=binary',
    };
  }
  if (stat.type === 'dir') {
    return {
      description: stat.mode & S_ISVTX ? 'sticky, directory' : 'directory',
      mime: 'inode/directory; charset=binary',
    };
  }
  if (stat.device)
    return { description: 'character special (1/3)', mime: 'inode/chardevice; charset=binary' };
  let data: ByteString;
  try {
    data = ctx.fs.readFile(name);
  } catch {
    return {
      description: 'regular file, no read permission',
      mime: 'regular file, no read permission',
    };
  }
  if (data === '') return { description: 'empty', mime: 'inode/x-empty; charset=binary' };
  return (
    binaryDescription(data, stat, name) ??
    textDescription(data) ?? {
      description: 'data',
      mime: 'application/octet-stream; charset=binary',
    }
  );
}

export const file = defineCommand({
  name: 'file',
  kind: 'binary',
  description: 'determine file type',
  usage: ['[-bL] [-i|--mime-type] FILE...'],
  about:
    'file tests each argument and classifies it by looking at its contents\n(magic numbers such as \\x7fELF or \\x89PNG), not at its name. A .txt file\nthat is really an executable is reported as an executable.',
  options: [
    ['-b, --brief', 'do not prepend filenames to output lines'],
    ['-i, --mime', 'output MIME type strings'],
    ['    --mime-type', 'output only the MIME type'],
    ['-L, --dereference', 'follow symlinks'],
    ['-h, --no-dereference', "don't follow symlinks (default)"],
  ],
  examples: [
    ['file *', 'classify every file in the directory'],
    ['file /usr/bin/su', 'inspect a program (note: setuid ELF)'],
  ],
  seeAlso: ['strings(1)', 'xxd(1)'],
  run: async (ctx) => {
    const outcome = parseOptions(
      ctx.name,
      ctx.args,
      [
        { short: 'b', long: 'brief' },
        { short: 'i', long: 'mime' },
        { long: 'mime-type' },
        { short: 'L', long: 'dereference' },
        { short: 'h', long: 'no-dereference' },
      ],
      { unsupported: ['z', 'Z', 'k', 'f', 'm', 'r', 's', 'N', 'p', 'E'] },
    );
    if (!outcome.ok) {
      ctx.stderr(outcome.message);
      return 1;
    }
    const o = outcome.options;
    if (o.operands.length === 0) {
      ctx.stderr(
        "Usage: file [-bchikLlNnprsSvzZ0] [--apple] [--extension] [--mime-encoding]\n            [--mime-type] [-e <testname>] [-F <separator>]  [-f <namefile>]\n            [-m <magicfiles>] [-P <parameter=value>] [--exclude-quiet]\n            <file> ...\nTry `file --help' for more information.\n",
      );
      return 1;
    }
    const lastFollow = o.entries
      .filter((e) => e.key === 'dereference' || e.key === 'no-dereference')
      .pop();
    const follow = lastFollow?.key === 'dereference';
    const width = Math.max(...o.operands.map((name) => name.length + 1));
    for (const name of o.operands) {
      const magic = describe(ctx, name, follow);
      let text = magic.description;
      if (o.has('mime-type')) text = magic.mime.split(';')[0] ?? magic.mime;
      else if (o.has('mime')) text = magic.mime;
      ctx.stdout(o.has('brief') ? `${text}\n` : `${`${name}:`.padEnd(width)} ${text}\n`);
    }
    return 0;
  },
});
