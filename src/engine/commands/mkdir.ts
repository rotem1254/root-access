import { dirname } from '../fs/path';
import { parseOctalMode } from '../fs/mode';
import { parseOptions } from './args';
import { defineCommand } from './define';
import { errorText, localeQuote } from './util';

export const mkdir = defineCommand({
  name: 'mkdir',
  kind: 'binary',
  description: 'make directories',
  usage: ['[OPTION]... DIRECTORY...'],
  about: 'Create the DIRECTORY(ies), if they do not already exist.',
  options: [
    ['-p, --parents', 'no error if existing, make parent directories as needed'],
    ['-m, --mode=MODE', 'set file mode (as in chmod), not a=rwx - umask'],
    ['-v, --verbose', 'print a message for each created directory'],
  ],
  examples: [
    ['mkdir data', 'create a directory'],
    ['mkdir -p a/b/c', 'create a directory and any missing parents'],
  ],
  seeAlso: ['rmdir(1)', 'ls(1)'],
  run: async (ctx) => {
    const outcome = parseOptions(ctx.name, ctx.args, [
      { short: 'p', long: 'parents' },
      { short: 'm', long: 'mode', arg: 'required' },
      { short: 'v', long: 'verbose' },
    ]);
    if (!outcome.ok) {
      ctx.stderr(outcome.message);
      return 1;
    }
    const o = outcome.options;
    if (o.operands.length === 0) {
      ctx.stderr(`mkdir: missing operand\nTry 'mkdir --help' for more information.\n`);
      return 1;
    }
    const modeText = o.value('mode');
    let mode = 0o777;
    if (modeText !== undefined) {
      const parsed = parseOctalMode(modeText);
      if (parsed === null) {
        ctx.stderr(`mkdir: invalid mode ${localeQuote(modeText)}\n`);
        return 1;
      }
      mode = parsed;
    }
    let status = 0;
    const verbose = (path: string): void => {
      if (o.has('verbose')) ctx.stdout(`mkdir: created directory ${localeQuote(path)}\n`);
    };
    for (const path of o.operands) {
      try {
        if (o.has('parents')) {
          const parts: string[] = [];
          let current = path;
          while (current !== '/' && current !== '.' && !ctx.fs.exists(current, true)) {
            parts.unshift(current);
            const parent = dirname(current);
            if (parent === current) break;
            current = parent;
          }
          for (const part of parts) {
            if (!ctx.fs.exists(part, true)) {
              ctx.fs.mkdir(part, mode);
              verbose(part);
            }
          }
        } else {
          ctx.fs.mkdir(path, modeText !== undefined ? mode : undefined);
          verbose(path);
        }
      } catch (error) {
        ctx.stderr(`mkdir: cannot create directory ${localeQuote(path)}: ${errorText(error)}\n`);
        status = 1;
      }
    }
    return status;
  },
});
