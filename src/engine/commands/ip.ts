import { defineCommand } from './define';
import { broadcastOf, macFor, networkOf, prefixLength } from './nethelp';

const DEFAULT_NETMASK = '255.255.255.0';

/** The `ip` command's address view (`ip a`), the part players need for recon. */
export const ip = defineCommand({
  name: 'ip',
  kind: 'binary',
  description: 'show / manipulate routing, network devices, interfaces and tunnels',
  usage: ['a[ddr] [show [dev NAME]]', 'r[oute]'],
  about:
    'The modern iproute2 tool. `ip addr` (or `ip a`) shows interface addresses; `ip\nroute` shows the routing table. Use it to find your own IP and default gateway.',
  options: [['-br, --brief', 'brief output (one line per interface)']],
  details:
    'Common forms:\n  ip a               show all interface addresses\n  ip a show eth0     show one interface\n  ip route           show the routing table (your default gateway)\nThe inet line gives your address in CIDR form, e.g. 10.10.0.5/24.',
  examples: [
    ['ip a', 'list interface addresses'],
    ['ip route', 'show your default gateway'],
  ],
  seeAlso: ['ifconfig(8)', 'ping(8)', 'nmap(1)'],
  run: async (ctx) => {
    const args = [...ctx.args].filter((arg) => arg !== '-4' && arg !== '-br' && arg !== '-brief');
    const object = (args[0] ?? 'addr').toLowerCase();
    const interfaces = ctx.network.interfacesOf(ctx.machine);

    if (
      'route'.startsWith(object) &&
      object.length >= 1 &&
      object !== 'a' &&
      object !== 'addr' &&
      object !== 'address'
    ) {
      const gateway = ctx.network.gatewayOf(ctx.machine);
      const eth = interfaces.find((iface) => iface.name !== 'lo');
      if (gateway && eth) {
        ctx.stdout(`default via ${gateway} dev ${eth.name} proto static\n`);
      }
      for (const iface of interfaces) {
        if (iface.name === 'lo') continue;
        const netmask = iface.netmask ?? DEFAULT_NETMASK;
        ctx.stdout(
          `${networkOf(iface.ip, netmask)}/${prefixLength(netmask)} dev ${iface.name} proto kernel scope link src ${iface.ip}\n`,
        );
      }
      return 0;
    }
    if (!('addr'.startsWith(object) || object === 'a' || object === 'address')) {
      ctx.stderr(`Object "${args[0] ?? ''}" is unknown, try "ip help".\n`);
      return 1;
    }

    // `ip addr [show] [dev] NAME`
    const rest = args.slice(1).filter((arg) => arg !== 'show' && arg !== 'dev');
    const only = rest[0];
    const chosen = only ? interfaces.filter((iface) => iface.name === only) : interfaces;
    if (only && chosen.length === 0) {
      ctx.stderr(`Device "${only}" does not exist.\n`);
      return 1;
    }
    chosen.forEach((iface) => {
      const netmask = iface.netmask ?? DEFAULT_NETMASK;
      const n = interfaces.indexOf(iface) + 1;
      if (iface.name === 'lo') {
        ctx.stdout(
          `${n}: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000\n`,
        );
        ctx.stdout('    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00\n');
        ctx.stdout(`    inet ${iface.ip}/8 scope host lo\n`);
      } else {
        ctx.stdout(
          `${n}: ${iface.name}: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000\n`,
        );
        ctx.stdout(`    link/ether ${macFor(iface)} brd ff:ff:ff:ff:ff:ff\n`);
        ctx.stdout(
          `    inet ${iface.ip}/${prefixLength(netmask)} brd ${broadcastOf(iface.ip, netmask)} scope global ${iface.name}\n`,
        );
      }
      ctx.stdout('       valid_lft forever preferred_lft forever\n');
    });
    return 0;
  },
});
