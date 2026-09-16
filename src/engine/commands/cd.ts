import { FsError } from '../errors';
import { resolve } from '../fs/path';
import { defineCommand } from './define';
import { errorText, parseBuiltinOptions } from './util';

export const cd = defineCommand({
  name: 'cd',
  kind: 'builtin',
  description: 'Change the shell working directory.',
  usage: ['[-L|-P] [dir]'],
  about:
    'Change the current directory to DIR. The default DIR is the value of the\nHOME shell variable. `cd -` returns to the previous directory ($OLDPWD).',
  options: [
    ['-L', 'follow symbolic links, resolving .. after the link (default)'],
    ['-P', 'use the physical directory structure without following symbolic links'],
  ],
  details:
    'Changing into a directory requires execute (x) permission on it and on every directory above it.',
  examples: [
    ['cd /var/log', 'go to an absolute path'],
    ['cd ..', 'go up one directory'],
    ['cd ~', 'go to your home directory'],
    ['cd -', 'go back to the previous directory'],
  ],
  seeAlso: ['pwd(1)', 'ls(1)'],
  run: async (ctx) => {
    const parsed = parseBuiltinOptions(ctx, 'LP', 'cd [-L|[-P [-e]] [-@]] [dir]');
    if (!parsed) return 2;
    const { flags, operands } = parsed;
    if (operands.length > 1) {
      ctx.stderr('bash: cd: too many arguments\n');
      return 1;
    }
    let target = operands[0];
    let announce = false;
    if (target === '') return 0;
    if (target === undefined) {
      target = ctx.env.get('HOME');
      if (target === undefined) {
        ctx.stderr('bash: cd: HOME not set\n');
        return 1;
      }
    } else if (target === '-') {
      target = ctx.env.get('OLDPWD');
      if (target === undefined) {
        ctx.stderr('bash: cd: OLDPWD not set\n');
        return 1;
      }
      announce = true;
    }

    const logical = resolve(ctx.env.cwd, target);
    let destination = logical;
    try {
      if (ctx.fs.stat(logical).type !== 'dir') throw new FsError('ENOTDIR', target);
      if (!ctx.fs.access(logical, 'x')) throw new FsError('EACCES', target);
      if (flags.has('P')) destination = ctx.fs.realpath(logical);
    } catch (error) {
      ctx.stderr(`bash: cd: ${target}: ${errorText(error)}\n`);
      return 1;
    }
    ctx.env.set('OLDPWD', ctx.env.cwd, { export: true });
    ctx.env.cwd = destination;
    ctx.env.set('PWD', destination, { export: true });
    if (announce) ctx.stdout(`${destination}\n`);
    return 0;
  },
});
