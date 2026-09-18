import { isFsError, strerror } from '../errors';
import { basename } from '../fs/path';
import { parseOptions } from './args';
import { defineCommand } from './define';

export const mv = defineCommand({
  name: 'mv',
  kind: 'binary',
  description: 'move (rename) files',
  usage: ['[OPTION]... SOURCE... DEST'],
  about:
    'Rename SOURCE to DEST, or move SOURCE(s) into an existing DIRECTORY.\nMoving within the same filesystem simply renames; there is no copying.',
  options: [
    ['-f, --force', 'do not prompt before overwriting'],
    ['-n, --no-clobber', 'do not overwrite an existing file'],
    ['-v, --verbose', 'explain what is being done'],
  ],
  examples: [
    ['mv old.txt new.txt', 'rename a file'],
    ['mv report.txt reports/', 'move a file into a directory'],
  ],
  seeAlso: ['cp(1)', 'rm(1)'],
  run: async (ctx) => {
    const outcome = parseOptions(ctx.name, ctx.args, [
      { short: 'f', long: 'force' },
      { short: 'n', long: 'no-clobber' },
      { short: 'v', long: 'verbose' },
      { short: 'i' },
      { short: 't', long: 'target-directory', arg: 'required' },
    ]);
    if (!outcome.ok) {
      ctx.stderr(outcome.message);
      return 1;
    }
    const o = outcome.options;
    const operands = [...o.operands];
    const explicitTarget = o.value('target-directory');
    if (operands.length === 0 && explicitTarget === undefined) {
      ctx.stderr("mv: missing file operand\nTry 'mv --help' for more information.\n");
      return 1;
    }
    const dest = explicitTarget ?? operands.pop();
    if (dest === undefined || operands.length === 0) {
      ctx.stderr(
        `mv: missing destination file operand after '${operands[0] ?? dest ?? ''}'\nTry 'mv --help' for more information.\n`,
      );
      return 1;
    }
    const destIsDir = ctx.fs.exists(dest, true) && ctx.fs.stat(dest).type === 'dir';
    if (operands.length > 1 && !destIsDir) {
      ctx.stderr(`mv: target '${dest}' is not a directory\n`);
      return 1;
    }
    let status = 0;
    for (const source of operands) {
      const target = destIsDir ? `${dest.replace(/\/$/, '')}/${basename(source)}` : dest;
      if (o.has('no-clobber') && ctx.fs.exists(target, true)) continue;
      try {
        ctx.fs.rename(source, target);
        if (o.has('verbose')) ctx.stdout(`'${source}' -> '${target}'\n`);
      } catch (error) {
        ctx.stderr(
          `mv: cannot move '${source}' to '${target}': ${strerror(isFsError(error) ? error.code : 'EACCES')}\n`,
        );
        status = 1;
      }
    }
    return status;
  },
});
