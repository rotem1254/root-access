import { defineCommand } from './define';
import type { CommandContext } from './types';

/** Shared by `exit` and `logout`. */
export async function leaveShell(ctx: CommandContext): Promise<number> {
  const farewell = ctx.shell.isLoginShell ? 'logout\n' : 'exit\n';
  if (ctx.args.length > 1) {
    ctx.stderr(`bash: ${ctx.name}: too many arguments\n`);
    return 1;
  }
  const arg = ctx.args[0];
  let status = ctx.env.lastStatus;
  if (arg !== undefined) {
    if (!/^[+-]?\d+$/.test(arg)) {
      ctx.stderr(`${farewell}bash: ${ctx.name}: ${arg}: numeric argument required\n`);
      ctx.shell.exit(2);
      return 2;
    }
    status = ((Number(arg) % 256) + 256) % 256;
  }
  ctx.stderr(farewell);
  ctx.shell.exit(status);
  return status;
}

export const exit = defineCommand({
  name: 'exit',
  kind: 'builtin',
  description: 'Exit the shell.',
  usage: ['[n]'],
  about:
    'Exits the shell with a status of N. If N is omitted, the exit status\nis that of the last command executed.',
  details:
    'After `su`, exit returns you to the previous user. In your login shell it disconnects and reconnects you.',
  examples: [['exit', 'leave a shell started with su']],
  seeAlso: ['logout(1)', 'su(1)'],
  run: leaveShell,
});
