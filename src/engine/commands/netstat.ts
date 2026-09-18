import type { ServiceSpec } from '../network/types';
import { parseOptions } from './args';
import { defineCommand } from './define';
import type { CommandContext } from './types';

function listeningRows(ctx: CommandContext): ServiceSpec[] {
  return [...ctx.network.portsOf(ctx.machine)].sort((a, b) => a.port - b.port);
}

export const netstat = defineCommand({
  name: 'netstat',
  kind: 'binary',
  description: 'print network connections, routing tables, interface statistics',
  usage: ['[-tulnp]'],
  about:
    'Show network connections. The common form, netstat -tlnp, lists the TCP ports\nyour machine is listening on — the services it exposes to the network.',
  options: [
    ['-t, --tcp', 'display TCP sockets'],
    ['-u, --udp', 'display UDP sockets'],
    ['-l, --listening', 'display only listening sockets'],
    ['-n, --numeric', 'do not resolve names'],
    ['-p, --programs', 'show the PID/program name for each socket'],
    ['-a, --all', 'display all sockets'],
  ],
  details:
    'Run on a host you have landed on, netstat -tlnp tells you what that host\nserves — including services bound only to localhost that a remote scan (nmap)\nwould never see.',
  examples: [['netstat -tlnp', 'list listening TCP services on this host']],
  seeAlso: ['ss(8)', 'nmap(1)', 'nc(1)'],
  run: async (ctx) => {
    const outcome = parseOptions(ctx.name, ctx.args, [
      { short: 't', long: 'tcp' },
      { short: 'u', long: 'udp' },
      { short: 'l', long: 'listening' },
      { short: 'n', long: 'numeric' },
      { short: 'p', long: 'programs' },
      { short: 'a', long: 'all' },
    ]);
    if (!outcome.ok) {
      ctx.stderr(outcome.message);
      return 1;
    }
    const programs = outcome.options.has('programs');
    ctx.stdout('Active Internet connections (only servers)\n');
    ctx.stdout(
      `Proto Recv-Q Send-Q Local Address           Foreign Address         State      ${programs ? ' PID/Program name' : ''}\n`.trimEnd() +
        '\n',
    );
    for (const service of listeningRows(ctx)) {
      const local = `0.0.0.0:${service.port}`.padEnd(23);
      const prog = programs ? ` ${1000 + service.port}/${service.name ?? 'sshd'}` : '';
      ctx.stdout(
        `tcp        0      0 ${local} 0.0.0.0:*               LISTEN     ${prog}\n`.replace(
          /\s+$/,
          '\n',
        ),
      );
    }
    return 0;
  },
});
