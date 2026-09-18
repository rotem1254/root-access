import { defineCommand } from './define';
import { leaveShell } from './exit';

export const logout = defineCommand({
  name: 'logout',
  kind: 'builtin',
  description: 'Exit a login shell.',
  usage: ['[n]'],
  about:
    'Exits a login shell with exit status N. Returns an error if not executed\nin a login shell.',
  seeAlso: ['exit(1)'],
  run: async (ctx) => {
    if (!ctx.shell.isLoginShell) {
      ctx.stderr("bash: logout: not login shell: use `exit'\n");
      return 1;
    }
    return leaveShell(ctx);
  },
});
