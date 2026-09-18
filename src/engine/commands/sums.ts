import { type DigestName, digestHex } from '../crypto/digest';
import { strerror } from '../errors';
import { parseOptions } from './args';
import { defineCommand } from './define';
import type { Command } from './types';
import { readOperand, splitLines } from './util';

/** A checksum line: `<hex>  <file>` (two spaces = text mode, ` *` = binary mode). */
const LINE = /^([0-9a-fA-F]+)\s[\s*]?(.+)$/;

interface SumSpec {
  name: string;
  digest: DigestName;
  label: string;
  bits: number;
}

function defineSum(spec: SumSpec): Command {
  return defineCommand({
    name: spec.name,
    kind: 'binary',
    description: `compute and check ${spec.label} message digest`,
    usage: ['[OPTION]... [FILE]...'],
    about: `Print or check ${spec.label} (${spec.bits}-bit) checksums. With no FILE, or when FILE is -,\nread standard input. The output is the hex digest, two spaces, then the file name.`,
    options: [
      ['-b, --binary', 'read in binary mode'],
      ['-c, --check', 'read checksums from the FILEs and check them'],
      ['-t, --text', 'read in text mode (default)'],
      ['--quiet', "don't print OK for each successfully verified file"],
      ['--status', "don't output anything, status code shows success"],
    ],
    details: `A checksum is a fingerprint of a file's exact bytes: change one byte and the\ndigest changes completely. Use it to verify that a file is the one you expect.\n\nTo check a list of checksums:\n  ${spec.name} -c SHA256SUMS\nEach line is reported as "file: OK" or "file: FAILED", and ${spec.name} exits\nnon-zero if any file failed — which is how you spot the one file that was\ntampered with.`,
    examples: [
      [`${spec.name} report.pdf`, 'print the checksum of a file'],
      [`${spec.name} -c SHA256SUMS`, 'verify files against a checksum list'],
      [`${spec.name} *`, 'checksum every file in the directory'],
    ],
    seeAlso: ['md5sum(1)', 'sha256sum(1)', 'xxd(1)', 'openssl(1)'],
    run: async (ctx) => {
      const outcome = parseOptions(
        ctx.name,
        ctx.args,
        [
          { short: 'b', long: 'binary' },
          { short: 'c', long: 'check' },
          { short: 't', long: 'text' },
          { long: 'quiet' },
          { long: 'status' },
          { short: 'w', long: 'warn' },
        ],
        { unsupported: ['tag', 'zero', 'ignore-missing', 'strict'] },
      );
      if (!outcome.ok) {
        ctx.stderr(outcome.message);
        return 1;
      }
      const o = outcome.options;
      const operands = o.operands.length > 0 ? o.operands : ['-'];

      if (!o.has('check')) {
        let status = 0;
        for (const operand of operands) {
          const input = await readOperand(ctx, operand);
          if (input === null) return 130;
          if (!input.ok) {
            ctx.stderr(`${ctx.name}: ${operand}: ${strerror(input.errno)}\n`);
            status = 1;
            continue;
          }
          const marker = o.has('binary') ? '*' : ' ';
          ctx.stdout(`${digestHex(spec.digest, input.data)} ${marker}${operand}\n`);
        }
        return status;
      }

      // -c: verify each listed file against its recorded digest.
      const quiet = o.has('quiet') || o.has('status');
      const silent = o.has('status');
      let failures = 0;
      let unreadable = 0;
      let status = 0;
      for (const operand of operands) {
        const list = await readOperand(ctx, operand);
        if (list === null) return 130;
        if (!list.ok) {
          ctx.stderr(`${ctx.name}: ${operand}: ${strerror(list.errno)}\n`);
          status = 1;
          continue;
        }
        const lines = splitLines(list.data).filter((line) => line.trim() !== '');
        let parsed = 0;
        for (const line of lines) {
          const match = LINE.exec(line);
          if (!match?.[1] || !match[2]) continue;
          parsed += 1;
          const expected = match[1].toLowerCase();
          const file = match[2];
          const input = await readOperand(ctx, file);
          if (input === null) return 130;
          if (!input.ok) {
            if (!silent) {
              ctx.stderr(`${ctx.name}: ${file}: ${strerror(input.errno)}\n`);
              ctx.stdout(`${file}: FAILED open or read\n`);
            }
            unreadable += 1;
            continue;
          }
          if (digestHex(spec.digest, input.data) === expected) {
            if (!quiet) ctx.stdout(`${file}: OK\n`);
          } else {
            if (!silent) ctx.stdout(`${file}: FAILED\n`);
            failures += 1;
          }
        }
        if (parsed === 0) {
          ctx.stderr(`${ctx.name}: ${operand}: no properly formatted checksum lines found\n`);
          status = 1;
        }
      }
      if (!silent && failures > 0) {
        ctx.stderr(
          `${ctx.name}: WARNING: ${failures} computed checksum${failures === 1 ? '' : 's'} did NOT match\n`,
        );
      }
      if (!silent && unreadable > 0) {
        ctx.stderr(
          `${ctx.name}: WARNING: ${unreadable} listed file${unreadable === 1 ? '' : 's'} could not be read\n`,
        );
      }
      return failures > 0 || unreadable > 0 ? 1 : status;
    },
  });
}

export const md5sum = defineSum({ name: 'md5sum', digest: 'md5', label: 'MD5', bits: 128 });
export const sha1sum = defineSum({ name: 'sha1sum', digest: 'sha1', label: 'SHA1', bits: 160 });
export const sha256sum = defineSum({
  name: 'sha256sum',
  digest: 'sha256',
  label: 'SHA256',
  bits: 256,
});
export const sha512sum = defineSum({
  name: 'sha512sum',
  digest: 'sha512',
  label: 'SHA512',
  bits: 512,
});
