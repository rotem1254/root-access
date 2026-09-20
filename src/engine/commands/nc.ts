import { serveHttp, statusText } from '../network/http';
import { defaultBanner, serviceName } from '../network/services';
import { parseOptions } from './args';
import { defineCommand } from './define';

export const nc = defineCommand({
  name: 'nc',
  kind: 'binary',
  description: 'arbitrary TCP and UDP connections and listens (netcat)',
  usage: ['[-vz] [-w timeout] host port'],
  about:
    'Open a raw TCP connection to a host and port. netcat is the tool for grabbing a\nservice banner or speaking a protocol by hand. Whatever the service sends on\nconnect is printed; what you type is sent to it.',
  options: [
    ['-v', 'verbose (report the connection)'],
    ['-z', 'zero-I/O mode: just check whether the port is open, then close'],
    ['-w timeout', 'timeout for connects and final reads (accepted, ignored)'],
    ['-n', 'do not resolve names'],
  ],
  details:
    'Grab a banner:\n  nc -v 10.10.9.20 22        prints the SSH version string\nSpeak HTTP by hand:\n  nc vault 8080             then type: GET / HTTP/1.0  (blank line to send)\nThe banner and version often tell you exactly what software you are up against.',
  examples: [
    ['nc -v 10.10.9.20 22', 'grab the SSH banner'],
    ['nc -z 10.10.0.5 80', 'test whether a port is open'],
  ],
  seeAlso: ['curl(1)', 'nmap(1)', 'ssh(1)'],
  run: async (ctx) => {
    const outcome = parseOptions(
      ctx.name,
      ctx.args,
      [
        { short: 'v' },
        { short: 'z' },
        { short: 'n' },
        { short: 'w', arg: 'required' },
        { short: 'u' },
      ],
      { stopAtOperand: false },
    );
    if (!outcome.ok) {
      ctx.stderr(outcome.message);
      return 2;
    }
    const o = outcome.options;
    const [host, portText] = o.operands;
    if (host === undefined || portText === undefined || !/^\d+$/.test(portText)) {
      ctx.stderr('usage: nc [-vz] [-w timeout] hostname port\n');
      return 2;
    }
    const port = Number(portText);
    const ip = ctx.network.resolve(host);
    if (ip === undefined) {
      ctx.stderr(`nc: getaddrinfo for host "${host}" port ${port}: Name or service not known\n`);
      return 1;
    }
    const target = ctx.network.machineByIp(ip);
    const service = target ? ctx.network.serviceOn(target, port) : undefined;
    const reachable = ctx.network.canReach(ctx.machine, ip);
    if (!target || !reachable || !service) {
      if (o.has('v'))
        ctx.stderr(`nc: connect to ${host} port ${port} (tcp) failed: Connection refused\n`);
      return 1;
    }
    if (o.has('v')) {
      // Real nc names the port from /etc/services: `... port [tcp/ssh] succeeded!`.
      const name = serviceName(port, service.name);
      const label = name === 'unknown' ? '' : `[tcp/${name}] `;
      ctx.stderr(`Connection to ${host} ${port} port ${label}succeeded!\n`);
    }
    if (o.has('z')) return 0;

    // Banner services announce themselves on connect.
    const banner = service.banner ?? defaultBanner(port, service.product, service.version);
    if (banner !== undefined) ctx.stdout(`${banner}\r\n`);

    // Read what the user types. For an HTTP service, respond to the request.
    const input = await ctx.stdin.readAll();
    if (input === null) return 130;
    if (service.http) {
      const requestLine = input.split(/\r?\n/)[0] ?? '';
      const match = /^(\w+)\s+(\S+)/.exec(requestLine);
      const path = match?.[2] ?? '/';
      const response = serveHttp(service.http, { method: match?.[1] ?? 'GET', path, headers: {} });
      ctx.stdout(`HTTP/1.1 ${response.status} ${statusText(response.status)}\r\n`);
      for (const [key, value] of Object.entries(response.headers))
        ctx.stdout(`${key}: ${value}\r\n`);
      ctx.stdout(`\r\n${response.body}`);
    }
    return 0;
  },
});
