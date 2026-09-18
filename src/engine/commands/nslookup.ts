import { defineCommand } from './define';

export const nslookup = defineCommand({
  name: 'nslookup',
  kind: 'binary',
  description: 'query internet name servers interactively',
  usage: ['name'],
  about: 'Resolve a hostname to an IP address (or the reverse) using the internal DNS.',
  examples: [['nslookup vault', 'resolve a name to an address']],
  seeAlso: ['dig(1)', 'host(1)'],
  run: async (ctx) => {
    const target = ctx.args[0];
    if (target === undefined) {
      ctx.stderr('nslookup: missing host operand\n');
      return 1;
    }
    ctx.stdout('Server:\t\t10.10.0.1\nAddress:\t10.10.0.1#53\n\n');
    const ip = ctx.network.resolve(target);
    if (/^\d+\.\d+\.\d+\.\d+$/.test(target)) {
      const name = ctx.network.hostnameOf(target);
      if (name) {
        ctx.stdout(`${target}.in-addr.arpa\tname = ${name}.novacorp.internal.\n`);
        return 0;
      }
    }
    if (ip) {
      ctx.stdout(`Non-authoritative answer:\nName:\t${target}\nAddress: ${ip}\n`);
      return 0;
    }
    ctx.stderr(`** server can't find ${target}: NXDOMAIN\n`);
    return 1;
  },
});
