import { isFsError, strerror } from '../errors';
import { basename } from '../fs/path';
import type { Stat } from '../fs/types';
import { parseOptions } from './args';
import { defineCommand } from './define';
import type { CommandContext } from './types';

function copyTree(ctx: CommandContext, source: string, dest: string, recursive: boolean): boolean {
  let stat: Stat;
  try {
    stat = ctx.fs.lstat(source);
  } catch (error) {
    ctx.stderr(
      `cp: cannot stat '${source}': ${strerror(isFsError(error) ? error.code : 'EACCES')}\n`,
    );
    return false;
  }
  if (stat.type === 'symlink') {
    try {
      ctx.fs.symlink(ctx.fs.readlink(source), dest);
      return true;
    } catch (error) {
      ctx.stderr(
        `cp: cannot create symbolic link '${dest}': ${strerror(isFsError(error) ? error.code : 'EACCES')}\n`,
      );
      return false;
    }
  }
  if (stat.type === 'dir') {
    if (!recursive) {
      ctx.stderr(`cp: -r not specified; omitting directory '${source}'\n`);
      return false;
    }
    try {
      if (!ctx.fs.exists(dest, true)) ctx.fs.mkdir(dest, stat.mode);
    } catch (error) {
      ctx.stderr(
        `cp: cannot create directory '${dest}': ${strerror(isFsError(error) ? error.code : 'EACCES')}\n`,
      );
      return false;
    }
    let ok = true;
    let names: string[];
    try {
      names = ctx.fs.readdir(source);
    } catch (error) {
      ctx.stderr(
        `cp: cannot access '${source}': ${strerror(isFsError(error) ? error.code : 'EACCES')}\n`,
      );
      return false;
    }
    for (const name of names) {
      ok =
        copyTree(
          ctx,
          source === '/' ? `/${name}` : `${source}/${name}`,
          dest.endsWith('/') ? `${dest}${name}` : `${dest}/${name}`,
          recursive,
        ) && ok;
    }
    return ok;
  }
  try {
    ctx.fs.writeFile(dest, ctx.fs.readFile(source));
    return true;
  } catch (error) {
    ctx.stderr(
      `cp: cannot create regular file '${dest}': ${strerror(isFsError(error) ? error.code : 'EACCES')}\n`,
    );
    return false;
  }
}

export const cp = defineCommand({
  name: 'cp',
  kind: 'binary',
  description: 'copy files and directories',
  usage: ['[OPTION]... SOURCE... DEST'],
  about:
    'Copy SOURCE to DEST, or multiple SOURCE(s) to an existing DIRECTORY.\nBy default cp does not copy directories; use -r to copy a directory tree.',
  options: [
    ['-r, -R, --recursive', 'copy directories recursively'],
    ['-f, --force', 'overwrite the destination if it exists'],
    ['-v, --verbose', 'explain what is being done'],
  ],
  examples: [
    ['cp report.txt backup.txt', 'copy a file'],
    ['cp -r src src-backup', 'copy a directory tree'],
  ],
  seeAlso: ['mv(1)', 'rm(1)', 'ls(1)'],
  run: async (ctx) => {
    const outcome = parseOptions(ctx.name, ctx.args, [
      { short: 'r', long: 'recursive' },
      { short: 'R', key: 'recursive' },
      { short: 'f', long: 'force' },
      { short: 'v', long: 'verbose' },
      { short: 'p' },
      { short: 'a', key: 'recursive' },
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
      ctx.stderr("cp: missing file operand\nTry 'cp --help' for more information.\n");
      return 1;
    }
    const dest = explicitTarget ?? operands.pop();
    if (dest === undefined || operands.length === 0) {
      ctx.stderr(
        `cp: missing destination file operand after '${operands[0] ?? dest ?? ''}'\nTry 'cp --help' for more information.\n`,
      );
      return 1;
    }
    const destIsDir = ctx.fs.exists(dest, true) && ctx.fs.stat(dest).type === 'dir';
    if (operands.length > 1 && !destIsDir) {
      ctx.stderr(`cp: target '${dest}' is not a directory\n`);
      return 1;
    }
    let status = 0;
    for (const source of operands) {
      const target = destIsDir ? `${dest.replace(/\/$/, '')}/${basename(source)}` : dest;
      const ok = copyTree(ctx, source, target, o.has('recursive'));
      if (ok && o.has('verbose')) ctx.stdout(`'${source}' -> '${target}'\n`);
      if (!ok) status = 1;
    }
    return status;
  },
});
