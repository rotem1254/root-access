import { parseOptions } from './args';
import { defineCommand } from './define';

export const dig = defineCommand({
  name: 'dig',
  kind: 'binary',
  description: 'DNS lookup utility',
  usage: ['[@server] name [type]', '-x addr'],
  about:
    'Resolve a hostname to an IP address (and, with -x, an IP back to a name) using\nthe internal DNS. Handy for turning a name like vault.novacorp.internal into an\naddress you can scan or ssh to.',
  options: [
    ['-x addr', 'do a reverse lookup on an address'],
    ['+short', 'print only the short answer'],
  ],
  examples: [
    ['dig vault.novacorp.internal', 'resolve a name to an address'],
    ['dig +short vault', 'just the address'],
    ['dig -x 10.10.9.20', 'reverse lookup'],
  ],
  seeAlso: ['nslookup(1)', 'host(1)', 'ping(8)'],
  run: async (ctx) => {
    const short = ctx.args.includes('+short');
    const outcome = parseOptions(
      ctx.name,
      ctx.args.filter((a) => !a.startsWith('+')),
      [{ short: 'x', arg: 'required' }],
    );
    if (!outcome.ok) {
      ctx.stderr(outcome.message);
      return 1;
    }
    const reverse = outcome.options.value('x');
    if (reverse !== undefined) {
      const name = ctx.network.hostnameOf(reverse);
      if (short) {
        ctx.stdout(name ? `${name}.novacorp.internal.\n` : '');
      } else if (name) {
        ctx.stdout(
          `; <<>> DiG 9.18.28 <<>> -x ${reverse}\n;; ANSWER SECTION:\n${reverse}.in-addr.arpa. 3600 IN PTR ${name}.novacorp.internal.\n`,
        );
      } else {
        ctx.stdout(
          `; <<>> DiG 9.18.28 <<>> -x ${reverse}\n;; ->>HEADER<<- opcode: QUERY, status: NXDOMAIN\n`,
        );
      }
      return 0;
    }
    const target = outcome.options.operands.find((a) => !a.startsWith('@'));
    if (target === undefined) {
      ctx.stderr('dig: no name to look up\n');
      return 1;
    }
    const ip = ctx.network.resolve(target);
    if (short) {
      ctx.stdout(ip ? `${ip}\n` : '');
      return 0;
    }
    ctx.stdout(`; <<>> DiG 9.18.28 <<>> ${target}\n;; global options: +cmd\n`);
    if (ip) {
      ctx.stdout(`;; ANSWER SECTION:\n${target}.\t\t3600\tIN\tA\t${ip}\n\n;; Query time: 0 msec\n`);
    } else {
      ctx.stdout(`;; ->>HEADER<<- opcode: QUERY, status: NXDOMAIN, id: 42\n;; ANSWER SECTION:\n\n`);
    }
    return 0;
  },
});
