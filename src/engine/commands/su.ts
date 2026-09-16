import { parseOptions } from './args';
import { defineCommand } from './define';
import type { CommandContext } from './types';

/** su and sudo both authenticate; this shared helper prompts and checks, mimicking PAM timing. */
async function authenticate(
  ctx: CommandContext,
  targetName: string,
): Promise<'ok' | 'cancelled' | 'failed'> {
  // su is setuid-root, so check the REAL user: only an actual root caller skips the password.
  if (ctx.user.uid === 0) return 'ok';
  const users = ctx.machine.users;
  if (users.isLocked(targetName)) {
    // Still prompt, so you cannot tell a locked account from a wrong password.
    await ctx.tty.readLine(`Password: `, { secret: true });
    return 'failed';
  }
  const password = await ctx.tty.readLine(`Password: `, { secret: true });
  if (password === null) return 'cancelled';
  await ctx.tty.sleep(300);
  if (ctx.tty.interrupted) return 'cancelled';
  return users.checkPassword(targetName, password) ? 'ok' : 'failed';
}

export const su = defineCommand({
  name: 'su',
  kind: 'binary',
  setuid: true,
  description: 'run a shell with substitute user and group ID',
  usage: ['[options] [-] [USER]'],
  about:
    'Change the effective user ID and group ID to those of USER (root by default).\nA password is required unless you are already root. With - (or -l), start a\nlogin shell: a fresh environment, as if USER had just logged in.',
  options: [
    ['-, -l, --login', 'make the shell a login shell, resetting the environment and directory'],
    ['-c, --command=COMMAND', 'pass a single COMMAND to the shell with -c'],
    ['-s, --shell=SHELL', 'run SHELL if /etc/shells permits it'],
  ],
  details:
    'su asks for the password of the TARGET account, not your own. After a\nsuccessful su you are that user until you type exit. Compare:\n  su admin        become admin, keeping the current directory\n  su - admin      become admin with a clean login environment\nThe root account is locked in this simulation, so `su` with no user fails; use\nsudo or su to a specific unlocked account instead.',
  examples: [
    ['su admin', 'switch to the admin account (asks for admin’s password)'],
    ['su - admin', 'switch to admin with a login shell'],
    ['exit', 'return to your previous user'],
  ],
  seeAlso: ['sudo(8)', 'id(1)', 'whoami(1)', 'exit(1)'],
  run: async (ctx) => {
    const outcome = parseOptions(ctx.name, ctx.args, [
      { short: 'l', long: 'login' },
      { short: 'c', long: 'command', arg: 'required' },
      { short: 's', long: 'shell', arg: 'required' },
      { short: 'm', key: 'preserve' },
      { short: 'p', key: 'preserve' },
    ]);
    if (!outcome.ok) {
      ctx.stderr(outcome.message);
      return 1;
    }
    const o = outcome.options;
    const operands = [...o.operands];
    let login = o.has('login');
    if (operands[0] === '-') {
      login = true;
      operands.shift();
    }
    const targetName = operands.shift() ?? 'root';
    const extra = operands;

    const target = ctx.machine.users.byName(targetName);
    if (!target) {
      ctx.stderr(
        `su: user ${targetName} does not exist or the user entry does not contain all the required fields\n`,
      );
      return 1;
    }

    const result = await authenticate(ctx, targetName);
    if (result === 'cancelled') {
      ctx.stderr('\n');
      return 1;
    }
    if (result === 'failed') {
      await ctx.tty.sleep(300);
      ctx.stderr('su: Authentication failure\n');
      return 1;
    }

    const command = o.value('command');
    if (command !== undefined) {
      const env = login ? ctx.shell.loginEnvironment(target) : ctx.env;
      return ctx.shell.runLineAs(
        target,
        command,
        {
          stdin: ctx.stdin.isTTY ? null : ((await ctx.stdin.readAll()) ?? ''),
          stdout: (chunk) => ctx.stdout(chunk),
          stderr: (chunk) => ctx.stderr(chunk),
          stdoutIsTTY: ctx.tty.stdoutIsTTY,
        },
        env,
      );
    }
    if (extra.length > 0) {
      ctx.stderr('su: running a shell with extra arguments is not supported in this simulation\n');
      return 1;
    }
    ctx.shell.pushSession(target, { login });
    return 0;
  },
});
