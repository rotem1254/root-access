import { isFsError, strerror } from '../errors';
import { applySymbolicMode, parseOctalMode } from '../fs/mode';
import type { Stat } from '../fs/types';
import { parseOptions } from './args';
import { defineCommand } from './define';

import { localeQuote } from './util';

export const chmod = defineCommand({
  name: 'chmod',
  kind: 'binary',
  description: 'change file mode bits',
  usage: ['[OPTION]... MODE[,MODE]... FILE...', '[OPTION]... OCTAL-MODE FILE...'],
  about:
    'Change the mode of each FILE to MODE. MODE can be octal (like 644 or 4755) or\nsymbolic (like u+x, go-w, a=r). Only the file owner or root may change a mode.',
  options: [
    ['-R, --recursive', 'change files and directories recursively'],
    ['-v, --verbose', 'output a diagnostic for every file processed'],
    ['-c, --changes', 'like verbose but report only when a change is made'],
  ],
  details:
    'The bits are read (4), write (2) and execute (1), for the owner, the group and\nothers. 755 is rwxr-xr-x. The special bits are setuid (4000), setgid (2000)\nand the sticky bit (1000). A directory needs execute (x) to be entered.',
  examples: [
    ['chmod 600 secret.txt', 'make a file readable and writable only by its owner'],
    ['chmod +x script.sh', 'make a file executable'],
    ['chmod -R go-rwx private', 'remove group and other access from a tree'],
  ],
  seeAlso: ['ls(1)', 'chown(1)', 'umask(1)'],
  run: async (ctx) => {
    const outcome = parseOptions(
      ctx.name,
      ctx.args,
      [
        { short: 'R', long: 'recursive' },
        { short: 'v', long: 'verbose' },
        { short: 'c', long: 'changes' },
        { short: 'f', long: 'silent' },
      ],
      { stopAtOperand: true },
    );
    if (!outcome.ok) {
      ctx.stderr(outcome.message);
      return 1;
    }
    const o = outcome.options;
    const [modeSpec, ...files] = o.operands;
    if (modeSpec === undefined) {
      ctx.stderr(`chmod: missing operand\nTry 'chmod --help' for more information.\n`);
      return 1;
    }
    if (files.length === 0) {
      ctx.stderr(
        `chmod: missing operand after '${modeSpec}'\nTry 'chmod --help' for more information.\n`,
      );
      return 1;
    }
    const octal = parseOctalMode(modeSpec);
    if (
      octal === null &&
      applySymbolicMode(modeSpec, 0, { isDirectory: false, umask: 0 }) === null
    ) {
      ctx.stderr(`chmod: invalid mode: ${localeQuote(modeSpec)}\n`);
      return 1;
    }
    let status = 0;
    const apply = (path: string, stat: Stat): void => {
      const next =
        octal ??
        applySymbolicMode(modeSpec, stat.mode, {
          isDirectory: stat.type === 'dir',
          umask: ctx.fs.umask,
        }) ??
        stat.mode;
      try {
        const changed = next !== stat.mode;
        ctx.fs.chmod(path, next);
        if (o.has('verbose') || (o.has('changes') && changed)) {
          ctx.stdout(
            `mode of ${localeQuote(path)} ${changed ? 'changed' : 'retained as'} 0${next.toString(8).padStart(3, '0')}\n`,
          );
        }
      } catch (error) {
        if (!o.has('silent')) {
          ctx.stderr(
            `chmod: changing permissions of ${localeQuote(path)}: ${strerror(isFsError(error) ? error.code : 'EPERM')}\n`,
          );
        }
        status = 1;
      }
    };
    const walk = (path: string): void => {
      let stat: Stat;
      try {
        stat = ctx.fs.lstat(path);
      } catch (error) {
        if (!o.has('silent')) {
          ctx.stderr(
            `chmod: cannot access ${localeQuote(path)}: ${strerror(isFsError(error) ? error.code : 'ENOENT')}\n`,
          );
        }
        status = 1;
        return;
      }
      if (stat.type === 'symlink') return;
      apply(path, stat);
      if (o.has('recursive') && stat.type === 'dir') {
        let names: string[];
        try {
          names = ctx.fs.readdir(path);
        } catch {
          return;
        }
        for (const name of names) walk(path === '/' ? `/${name}` : `${path}/${name}`);
      }
    };
    for (const file of files) walk(file);
    return status;
  },
});
