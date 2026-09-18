import { parseOptions } from './args';
import { defineCommand } from './define';
import type { CommandContext } from './types';

/** Splits `[user@]host` into its parts. */
function parseTarget(target: string): { user: string | null; host: string } {
  const at = target.indexOf('@');
  return at < 0
    ? { user: null, host: target }
    : { user: target.slice(0, at), host: target.slice(at + 1) };
}

export const ssh = defineCommand({
  name: 'ssh',
  kind: 'binary',
  description: 'OpenSSH remote login client',
  usage: ['[-p port] [user@]hostname [command]'],
  about:
    'Log in to another machine over the network. ssh connects to the host, checks\nits key, asks for the password of the target account, and drops you into a\nshell there. Type exit to return to where you came from.',
  options: [
    ['-p port', 'connect to this port instead of 22'],
    ['-l login_name', 'log in as this user'],
    ['-i identity_file', 'use a private key file (accepted; keys are not simulated)'],
  ],
  details:
    'This is how you pivot: a machine you cannot reach directly may be reachable\nfrom one you can ssh into. On the first connection ssh asks you to confirm the\nhost key (answer yes). Then enter the account password.\n  ssh admin@10.10.9.20\n  ssh -l backup vault',
  examples: [
    ['ssh guest@10.10.0.5', 'log in to another host as guest'],
    ['ssh admin@vault', 'log in by hostname'],
  ],
  seeAlso: ['nmap(1)', 'nc(1)', 'scp(1)', 'exit(1)'],
  run: async (ctx) => {
    const outcome = parseOptions(
      ctx.name,
      ctx.args,
      [
        { short: 'p', arg: 'required' },
        { short: 'l', arg: 'required' },
        { short: 'i', arg: 'required' },
        { short: 'o', arg: 'required' },
        { short: 'v' },
      ],
      { stopAtOperand: true, unsupported: ['X', 'A', 'T', 't', 'N', 'L', 'R', 'D'] },
    );
    if (!outcome.ok) {
      ctx.stderr(outcome.message);
      return 255;
    }
    const o = outcome.options;
    const [targetArg, ...rest] = o.operands;
    if (targetArg === undefined) {
      ctx.stderr('usage: ssh [-p port] [-l login_name] destination [command]\n');
      return 255;
    }
    if (rest.length > 0) {
      ctx.stderr(
        'ssh: running a remote command non-interactively is not supported in this simulation\n',
      );
      return 255;
    }
    const port = Number(o.value('p') ?? '22');
    const parsed = parseTarget(targetArg);
    const username = o.value('l') ?? parsed.user ?? ctx.user.name;

    const targetIp = ctx.network.resolve(parsed.host);
    if (targetIp === undefined) {
      ctx.stderr(`ssh: Could not resolve hostname ${parsed.host}: Name or service not known\n`);
      return 255;
    }
    if (!ctx.network.canReach(ctx.machine, targetIp)) {
      ctx.stderr(`ssh: connect to host ${parsed.host} port ${port}: No route to host\n`);
      return 255;
    }
    const target = ctx.network.machineByIp(targetIp);
    const sshService = target ? ctx.network.sshServiceOf(target) : undefined;
    if (!target || !sshService || (port !== 22 && sshService.port !== port)) {
      ctx.stderr(`ssh: connect to host ${parsed.host} port ${port}: Connection refused\n`);
      return 255;
    }
    const account = target.users.byName(username);

    // First-connection host-key prompt.
    const fingerprint = `SHA256:${'abcdefghijklmnopqrstuvwxyz012345'.slice(0, 43 - 7)}${username.length}`;
    ctx.stderr(
      `The authenticity of host '${parsed.host} (${targetIp})' can't be established.\n` +
        `ED25519 key fingerprint is ${fingerprint}.\n` +
        `This key is not known by any other names.\n`,
    );
    const confirm = await ctx.tty.readLine(
      `Are you sure you want to continue connecting (yes/no/[fingerprint])? `,
    );
    if (confirm === null) {
      ctx.stderr('\n');
      return 255;
    }
    if (!/^yes$/i.test(confirm.trim())) {
      ctx.stderr('Host key verification failed.\n');
      return 255;
    }
    ctx.stderr(
      `Warning: Permanently added '${parsed.host}' (ED25519) to the list of known hosts.\n`,
    );

    // Password authentication (up to 3 attempts, like OpenSSH).
    for (let attempt = 1; attempt <= 3; attempt++) {
      const password = await ctx.tty.readLine(`${username}@${parsed.host}'s password: `, {
        secret: true,
      });
      if (password === null) {
        ctx.stderr('\n');
        return 255;
      }
      await ctx.tty.sleep(300);
      if (ctx.tty.interrupted) return 255;
      if (
        account &&
        !target.users.isLocked(username) &&
        target.users.checkPassword(username, password)
      ) {
        printLoginBanner(ctx, target);
        ctx.shell.sshTo(target, account);
        return 0;
      }
      ctx.stderr('Permission denied, please try again.\n');
    }
    ctx.stderr(`${username}@${parsed.host}: Permission denied (publickey,password).\n`);
    return 255;
  },
});

function printLoginBanner(ctx: CommandContext, target: import('../system/Machine').Machine): void {
  try {
    const motd = target.fs.readFile('/etc/motd', { uid: 0, gid: 0, groups: [0] });
    if (motd) ctx.stdout(motd);
  } catch {
    // no motd
  }
}
