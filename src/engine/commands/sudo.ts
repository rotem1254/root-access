import { findSudoPermission, formatSudoRule, rulesFor } from '../system/sudoers';
import { parseOptions } from './args';
import { defineCommand } from './define';
import type { CommandContext } from './types';
import { findInPath } from './util';

export const sudo = defineCommand({
  name: 'sudo',
  kind: 'binary',
  setuid: true,
  section: 8,
  description: 'execute a command as another user',
  usage: ['-l', '[-u USER] COMMAND [ARG]...'],
  about:
    'sudo allows a permitted user to execute a COMMAND as the superuser or another\nuser, as the security policy in /etc/sudoers allows. Use sudo -l to list what\nyou are allowed to run.',
  options: [
    ['-l, --list', 'list the commands allowed (or forbidden) for the current user'],
    ['-u, --user=USER', 'run the command as USER instead of root'],
    ['-n, --non-interactive', 'do not prompt for a password; fail if one is needed'],
    ['-k, --reset-timestamp', 'invalidate the cached credentials'],
  ],
  details:
    'Unlike su, sudo asks for YOUR password, then checks the sudoers policy to see\nwhether you may run the command. `sudo -l` is the first thing to try: it tells\nyou exactly which commands, if any, you are permitted to run.',
  examples: [
    ['sudo -l', 'list what you may run with sudo'],
    ['sudo cat /etc/shadow', 'read a root-only file, if the policy allows it'],
    ['sudo -u admin id', 'run a command as another user'],
  ],
  seeAlso: ['su(1)', 'sudoers(5)', 'id(1)'],
  run: async (ctx) => {
    const outcome = parseOptions(
      ctx.name,
      ctx.args,
      [
        { short: 'l', long: 'list' },
        { short: 'u', long: 'user', arg: 'required' },
        { short: 'n', long: 'non-interactive' },
        { short: 'k', long: 'reset-timestamp' },
        { short: 'b', long: 'background' },
        { short: 's', long: 'shell' },
        { short: 'i', long: 'login' },
      ],
      { stopAtOperand: true },
    );
    if (!outcome.ok) {
      ctx.stderr(outcome.message);
      return 1;
    }
    const o = outcome.options;
    const users = ctx.machine.users;
    const targetName = o.value('user') ?? 'root';
    const target = users.byName(targetName);
    if (!target) {
      ctx.stderr(`sudo: unknown user: ${targetName}\n`);
      return 1;
    }
    const groups = users
      .credentials(ctx.user)
      .groups.map((gid) => users.groupByGid(gid)?.name)
      .filter((name): name is string => name !== undefined);

    if (o.has('list')) {
      const applicable = rulesFor(ctx.machine.sudoers, ctx.user.name, groups);
      if (applicable.length === 0) {
        ctx.stderr(`Sorry, user ${ctx.user.name} may not run sudo on ${ctx.machine.hostname}.\n`);
        return 1;
      }
      if (!(await confirmPassword(ctx, o.has('non-interactive')))) return 1;
      ctx.stdout(
        `Matching Defaults entries for ${ctx.user.name} on ${ctx.machine.hostname}:\n    env_reset, mail_badpass,\n    secure_path=/usr/local/sbin\\:/usr/local/bin\\:/usr/sbin\\:/usr/bin\\:/sbin\\:/bin\n\n`,
      );
      ctx.stdout(
        `User ${ctx.user.name} may run the following commands on ${ctx.machine.hostname}:\n`,
      );
      for (const rule of applicable) ctx.stdout(`    ${formatSudoRule(rule)}\n`);
      return 0;
    }

    const commandArgs = [...o.operands];
    const commandName = commandArgs.shift();
    if (commandName === undefined) {
      ctx.stderr(
        'usage: sudo -h | -K | -k | -V\nusage: sudo -l [-u user] [command [arg ...]]\nusage: sudo [-u user] command [arg ...]\n',
      );
      return 1;
    }

    const path = findInPath(
      ctx,
      commandName,
      '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    );
    if (path === null) {
      ctx.stderr(`sudo: ${commandName}: command not found\n`);
      return 1;
    }
    const permission = findSudoPermission(
      ctx.machine.sudoers,
      ctx.user.name,
      groups,
      targetName,
      path,
      commandArgs,
    );
    const anyRule = rulesFor(ctx.machine.sudoers, ctx.user.name, groups).length > 0;
    // A user with no sudoers entry at all is refused up front, without a password prompt.
    if (!anyRule) {
      ctx.stderr(`Sorry, user ${ctx.user.name} may not run sudo on ${ctx.machine.hostname}.\n`);
      return 1;
    }

    if (!(await confirmPassword(ctx, o.has('non-interactive')))) return 1;

    if (!permission) {
      const commandLine = [commandName, ...commandArgs].join(' ');
      ctx.stderr(
        `Sorry, user ${ctx.user.name} is not allowed to execute '${commandLine}' as ${targetName} on ${ctx.machine.hostname}.\n`,
      );
      return 1;
    }

    const env = ctx.shell.loginEnvironment(target);
    env.cwd = ctx.env.cwd;
    return ctx.shell.runAs(
      target,
      path,
      [commandName, ...commandArgs],
      {
        stdin: ctx.stdin.isTTY ? null : ((await ctx.stdin.readAll()) ?? ''),
        stdout: (chunk) => ctx.stdout(chunk),
        stderr: (chunk) => ctx.stderr(chunk),
        stdoutIsTTY: ctx.tty.stdoutIsTTY,
      },
      env,
    );
  },
});

/** Prompts for the invoking user's password (once), unless already root. */
async function confirmPassword(ctx: CommandContext, nonInteractive: boolean): Promise<boolean> {
  // sudo is setuid-root; authenticate the REAL invoking user, not the effective uid.
  if (ctx.user.uid === 0) return true;
  if (ctx.machine.users.isLocked(ctx.user.name)) {
    if (nonInteractive) {
      ctx.stderr('sudo: a password is required\n');
      return false;
    }
    ctx.stderr(`[sudo] password for ${ctx.user.name}: \n`);
    await ctx.tty.readLine(`[sudo] password for ${ctx.user.name}: `, { secret: true });
    ctx.stderr('sudo: Authentication failure\n');
    return false;
  }
  if (nonInteractive) {
    ctx.stderr('sudo: a password is required\n');
    return false;
  }
  const password = await ctx.tty.readLine(`[sudo] password for ${ctx.user.name}: `, {
    secret: true,
  });
  if (password === null) {
    ctx.stderr('sudo: 1 incorrect password attempt\n');
    return false;
  }
  await ctx.tty.sleep(300);
  if (ctx.machine.users.checkPassword(ctx.user.name, password)) return true;
  ctx.stderr('Sorry, try again.\nsudo: 1 incorrect password attempt\n');
  return false;
}
