import { defineCommand } from './define';
import { parseBuiltinOptions } from './util';

export const pwd = defineCommand({
  name: 'pwd',
  kind: 'builtin',
  description: 'Print the name of the current working directory.',
  usage: ['[-LP]'],
  about: 'Print the absolute pathname of the current working directory.',
  options: [
    ['-L', 'print the value of $PWD, which may contain symbolic links (default)'],
    ['-P', 'print the physical directory, without any symbolic links'],
  ],
  examples: [['pwd', 'show where you are, e.g. /home/guest']],
  seeAlso: ['cd(1)'],
  run: async (ctx) => {
    const parsed = parseBuiltinOptions(ctx, 'LP', 'pwd [-LP]');
    if (!parsed) return 2;
    try {
      const physical = ctx.fs.realpath(ctx.env.cwd);
      ctx.stdout(`${parsed.flags.has('P') ? physical : ctx.env.cwd}\n`);
      return 0;
    } catch {
      ctx.stderr(
        'pwd: error retrieving current directory: getcwd: cannot access parent directories: No such file or directory\n',
      );
      return 1;
    }
  },
});
