import { parseOptions } from './args';
import { defineCommand } from './define';

export const hostname = defineCommand({
  name: 'hostname',
  kind: 'binary',
  description: "show or set the system's host name",
  usage: ['[-s|-f|-d|-i]'],
  about: 'Display the name of the system you are logged in to.',
  options: [
    ['-s, --short', 'short host name'],
    ['-f, --fqdn, --long', 'long host name (FQDN)'],
    ['-d, --domain', 'DNS domain name'],
    ['-i, --ip-address', 'addresses for the host name'],
  ],
  details: 'Changing the host name requires root and is not supported in this simulation.',
  examples: [['hostname', 'confirm which machine this terminal is connected to']],
  seeAlso: ['uname(1)'],
  run: async (ctx) => {
    const outcome = parseOptions(
      ctx.name,
      ctx.args,
      [
        { short: 's', long: 'short' },
        { short: 'f', long: 'fqdn' },
        { long: 'long', key: 'fqdn' },
        { short: 'd', long: 'domain' },
        { short: 'i', long: 'ip-address' },
        { short: 'I', long: 'all-ip-addresses' },
      ],
      { unsupported: ['a', 'alias', 'F', 'file'] },
    );
    if (!outcome.ok) {
      ctx.stderr(outcome.message);
      return 1;
    }
    const { options } = outcome;
    if (options.operands.length > 0) {
      if (ctx.credentials.uid !== 0) {
        ctx.stderr('hostname: you must be root to change the host name\n');
      } else {
        ctx.stderr('hostname: changing the host name is not supported in this simulation\n');
      }
      return 1;
    }
    const name = ctx.machine.hostname;
    const dot = name.indexOf('.');
    const externalIps = ctx.network
      .interfacesOf(ctx.machine)
      .filter((iface) => iface.name !== 'lo')
      .map((iface) => iface.ip);
    if (options.has('all-ip-addresses'))
      ctx.stdout(`${externalIps.join(' ')}${externalIps.length ? ' ' : ''}\n`);
    else if (options.has('short')) ctx.stdout(`${dot < 0 ? name : name.slice(0, dot)}\n`);
    else if (options.has('domain')) ctx.stdout(`${dot < 0 ? '' : name.slice(dot + 1)}\n`);
    else if (options.has('ip-address')) ctx.stdout(`${externalIps[0] ?? '127.0.1.1'} \n`);
    else ctx.stdout(`${name}\n`);
    return 0;
  },
});
