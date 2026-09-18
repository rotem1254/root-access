import { isFsError, strerror } from '../errors';
import type { Stat } from '../fs/types';
import { parseOptions } from './args';
import { defineCommand } from './define';
import type { CommandContext } from './types';

function removeTree(ctx: CommandContext, path: string, force: boolean): boolean {
  let stat: Stat;
  try {
    stat = ctx.fs.lstat(path);
  } catch (error) {
    if (isFsError(error) && error.code === 'ENOENT') {
      if (!force) ctx.stderr(`rm: cannot remove '${path}': No such file or directory\n`);
      return force;
    }
    ctx.stderr(
      `rm: cannot remove '${path}': ${strerror(isFsError(error) ? error.code : 'EACCES')}\n`,
    );
    return false;
  }
  if (stat.type === 'dir') {
    let names: string[];
    try {
      names = ctx.fs.readdir(path);
    } catch (error) {
      ctx.stderr(
        `rm: cannot remove '${path}': ${strerror(isFsError(error) ? error.code : 'EACCES')}\n`,
      );
      return false;
    }
    let ok = true;
    for (const name of names)
      ok = removeTree(ctx, path === '/' ? `/${name}` : `${path}/${name}`, force) && ok;
    if (!ok) return false;
    try {
      ctx.fs.rmdir(path);
      return true;
    } catch (error) {
      ctx.stderr(
        `rm: cannot remove '${path}': ${strerror(isFsError(error) ? error.code : 'EACCES')}\n`,
      );
      return false;
    }
  }
  try {
    ctx.fs.unlink(path);
    return true;
  } catch (error) {
    ctx.stderr(
      `rm: cannot remove '${path}': ${strerror(isFsError(error) ? error.code : 'EACCES')}\n`,
    );
    return false;
  }
}

export const rm = defineCommand({
  name: 'rm',
  kind: 'binary',
  description: 'remove files or directories',
  usage: ['[OPTION]... [FILE]...'],
  about:
    'Remove (unlink) the FILE(s). By default rm does not remove directories; use\n-r to remove a directory and everything in it.',
  options: [
    ['-f, --force', 'ignore nonexistent files and arguments, never prompt'],
    ['-r, -R, --recursive', 'remove directories and their contents recursively'],
    ['-d, --dir', 'remove empty directories'],
    ['-v, --verbose', 'explain what is being done'],
  ],
  details:
    'There is no undo and no trash can: removed files are gone. In this simulation\nyou can restore a level to its starting state with the `reset` command.',
  examples: [
    ['rm old.log', 'remove a file'],
    ['rm -r build', 'remove a directory and its contents'],
  ],
  seeAlso: ['rmdir(1)', 'cp(1)', 'mv(1)'],
  run: async (ctx) => {
    const outcome = parseOptions(ctx.name, ctx.args, [
      { short: 'f', long: 'force' },
      { short: 'r', long: 'recursive' },
      { short: 'R', key: 'recursive' },
      { short: 'd', long: 'dir' },
      { short: 'v', long: 'verbose' },
      { short: 'i' },
    ]);
    if (!outcome.ok) {
      ctx.stderr(outcome.message);
      return 1;
    }
    const o = outcome.options;
    if (o.operands.length === 0) {
      if (o.has('force')) return 0;
      ctx.stderr(`rm: missing operand\nTry 'rm --help' for more information.\n`);
      return 1;
    }
    let status = 0;
    for (const path of o.operands) {
      if (path === '/') {
        ctx.stderr(
          "rm: it is dangerous to operate recursively on '/'\nrm: use --no-preserve-root to override this failsafe\n",
        );
        status = 1;
        continue;
      }
      let stat: Stat | null;
      try {
        stat = ctx.fs.lstat(path);
      } catch {
        stat = null;
      }
      if (stat?.type === 'dir' && !o.has('recursive')) {
        if (o.has('dir')) {
          try {
            ctx.fs.rmdir(path);
            if (o.has('verbose')) ctx.stdout(`removed directory '${path}'\n`);
          } catch (error) {
            ctx.stderr(
              `rm: cannot remove '${path}': ${strerror(isFsError(error) ? error.code : 'EACCES')}\n`,
            );
            status = 1;
          }
        } else {
          ctx.stderr(`rm: cannot remove '${path}': Is a directory\n`);
          status = 1;
        }
        continue;
      }
      const removed = removeTree(ctx, path, o.has('force'));
      if (removed && o.has('verbose')) ctx.stdout(`removed '${path}'\n`);
      if (!removed) status = 1;
    }
    return status;
  },
});
