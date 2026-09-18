import { parseOptions } from './args';
import { defineCommand } from './define';

export const ss = defineCommand({
  name: 'ss',
  kind: 'binary',
  description: 'another utility to investigate sockets',
  usage: ['[-tulnp]'],
  about:
    'The modern replacement for netstat. `ss -tlnp` lists the TCP ports this host is\nlistening on, with the owning process.',
  options: [
    ['-t', 'display TCP sockets'],
    ['-u', 'display UDP sockets'],
    ['-l', 'display only listening sockets'],
    ['-n', 'do not resolve service names'],
    ['-p', 'show the process using each socket'],
    ['-a', 'display all sockets'],
  ],
  examples: [['ss -tlnp', 'list listening TCP services on this host']],
  seeAlso: ['netstat(8)', 'nmap(1)'],
  run: async (ctx) => {
    const outcome = parseOptions(ctx.name, ctx.args, [
      { short: 't' },
      { short: 'u' },
      { short: 'l' },
      { short: 'n' },
      { short: 'p' },
      { short: 'a' },
    ]);
    if (!outcome.ok) {
      ctx.stderr(outcome.message);
      return 1;
    }
    const programs = outcome.options.has('p');
    ctx.stdout(
      `State      Recv-Q     Send-Q         Local Address:Port          Peer Address:Port${programs ? '     Process' : ''}\n`,
    );
    const ports = [...ctx.network.portsOf(ctx.machine)].sort((a, b) => a.port - b.port);
    for (const service of ports) {
      const local = `0.0.0.0:${service.port}`.padEnd(27);
      const proc = programs
        ? `     users:(("${service.name ?? 'sshd'}",pid=${1000 + service.port},fd=3))`
        : '';
      ctx.stdout(`LISTEN     0          128            ${local}0.0.0.0:*${proc}\n`);
    }
    return 0;
  },
});
