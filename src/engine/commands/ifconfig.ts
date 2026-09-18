import { parseOptions } from './args';
import { defineCommand } from './define';
import { broadcastOf, macFor } from './nethelp';

const DEFAULT_NETMASK = '255.255.255.0';

export const ifconfig = defineCommand({
  name: 'ifconfig',
  kind: 'binary',
  description: 'configure a network interface',
  usage: ['[-a] [interface]'],
  about:
    'Show the status of the active network interfaces (the net-tools view). With an\ninterface name, show only that one. `ifconfig -a` includes interfaces that are down.',
  options: [['-a', 'display all interfaces which are currently available']],
  details:
    'Each entry shows the interface flags, its IPv4 address (inet), netmask and\nbroadcast, and its hardware (ether) address. The modern equivalent is `ip a`.\nYour own address is the one on eth0 — that tells you which network you are on.',
  examples: [
    ['ifconfig', 'show your active interfaces and IP addresses'],
    ['ip a', 'the modern equivalent'],
  ],
  seeAlso: ['ip(8)', 'netstat(8)', 'ping(8)'],
  run: async (ctx) => {
    const outcome = parseOptions(ctx.name, ctx.args, [{ short: 'a' }], {
      unsupported: ['s', 'v'],
    });
    if (!outcome.ok) {
      ctx.stderr(outcome.message);
      return 1;
    }
    const only = outcome.options.operands[0];
    const interfaces = ctx.network.interfacesOf(ctx.machine);
    const chosen = only ? interfaces.filter((iface) => iface.name === only) : interfaces;
    if (only && chosen.length === 0) {
      ctx.stderr(`${only}: error fetching interface information: Device not found\n`);
      return 1;
    }
    const blocks = chosen.map((iface) => {
      const netmask = iface.netmask ?? DEFAULT_NETMASK;
      const lines: string[] = [];
      if (iface.name === 'lo') {
        lines.push(`${iface.name}: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536`);
        lines.push(`        inet ${iface.ip}  netmask ${netmask}`);
        lines.push('        loop  txqueuelen 1000  (Local Loopback)');
      } else {
        lines.push(`${iface.name}: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500`);
        lines.push(
          `        inet ${iface.ip}  netmask ${netmask}  broadcast ${broadcastOf(iface.ip, netmask)}`,
        );
        lines.push(`        ether ${macFor(iface)}  txqueuelen 1000  (Ethernet)`);
      }
      lines.push('        RX packets 4213  bytes 1128470 (1.1 MB)');
      lines.push('        TX packets 3187  bytes 498210 (498.2 KB)');
      return lines.join('\n');
    });
    ctx.stdout(`${blocks.join('\n\n')}\n\n`);
    return 0;
  },
});
