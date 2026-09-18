import { compareIp } from '../network/Network';
import { NMAP_TOP_PORTS, parsePortRange } from '../network/services';
import type { ScanResult } from '../network/types';
import { parseOptions } from './args';
import { defineCommand } from './define';
import type { CommandContext } from './types';

/** Expands a target that may be a hostname, an IP, or a `10.10.0.0/24` block. */
function expandTargets(ctx: CommandContext, target: string): { ips: string[]; cidr: boolean } {
  const cidr = /^(\d+\.\d+\.\d+)\.\d+\/(\d+)$/.exec(target);
  if (cidr) {
    const prefix = cidr[1] ?? '';
    // For the sim, a /24 (or anything /24+) means "the .0/24 that our reachable hosts live on".
    const ips = new Set<string>();
    for (const ip of ctx.network.reachableIps(ctx.machine)) {
      if (ip.startsWith(`${prefix}.`)) ips.add(ip);
    }
    // Include our own address on that subnet.
    for (const iface of ctx.network.interfacesOf(ctx.machine)) {
      if (iface.name !== 'lo' && iface.ip.startsWith(`${prefix}.`)) ips.add(iface.ip);
    }
    return { ips: [...ips].sort(compareIp), cidr: true };
  }
  const ip = ctx.network.resolve(target);
  return { ips: ip ? [ip] : [], cidr: false };
}

function reportHost(
  ctx: CommandContext,
  target: string,
  scan: ScanResult,
  versions: boolean,
): void {
  const label = scan.hostname ? `${scan.hostname} (${scan.ip})` : scan.ip;
  ctx.stdout(`Nmap scan report for ${label}\n`);
  if (!scan.up) {
    ctx.stdout('Host seems down. If it is really up, but blocking our ping probes, try -Pn\n');
    return;
  }
  ctx.stdout(`Host is up (0.000${20 + (scan.ports.length % 8)}s latency).\n`);
  if (scan.ports.length === 0) {
    ctx.stdout('All scanned ports are closed\n');
    return;
  }
  const portCol = Math.max(8, ...scan.ports.map((p) => `${p.port}/tcp`.length));
  const serviceCol = Math.max(7, ...scan.ports.map((p) => p.service.length)) + 2;
  const header = `${'PORT'.padEnd(portCol)} STATE SERVICE${versions ? `${' '.repeat(serviceCol - 7)}VERSION` : ''}`;
  ctx.stdout(`${header.trimEnd()}\n`);
  for (const port of scan.ports) {
    const service = versions ? port.service.padEnd(serviceCol) : port.service;
    const left = `${`${port.port}/tcp`.padEnd(portCol)} open  ${service}`;
    ctx.stdout(`${(versions && port.version ? left + port.version : left).trimEnd()}\n`);
  }
}

export const nmap = defineCommand({
  name: 'nmap',
  kind: 'binary',
  description: 'network exploration tool and security / port scanner',
  usage: ['[-sV] [-Pn] [-p PORTS] target'],
  about:
    'Scan a host (or a whole subnet) to discover which TCP ports are open and which\nservices listen on them. Nmap is the standard first step in mapping a network.',
  options: [
    ['-p PORTS', 'only scan these ports, e.g. -p 22, -p 1-1000, -p- for all'],
    ['-sV', 'probe open ports to determine service/version info'],
    ['-Pn', 'treat all hosts as online (skip host discovery)'],
    ['-F', 'fast mode - scan fewer ports than the default'],
  ],
  details:
    'Targets can be a hostname, an IP, or a range like 10.10.0.0/24 (which scans the\nhosts you can reach on that subnet — a "ping sweep" plus port scan). Add -sV to\nlearn the software and version behind each open port, which often reveals the\nway in.',
  examples: [
    ['nmap 10.10.0.0/24', 'discover live hosts on your subnet'],
    ['nmap -sV vault', 'scan a host and identify its services'],
    ['nmap -p 22,8080 10.10.9.20', 'scan specific ports'],
  ],
  seeAlso: ['ping(8)', 'ip(8)', 'nc(1)', 'ssh(1)'],
  run: async (ctx) => {
    // Scan-type flags like -sV/-sS/-sT are single tokens, not clustered options; handle them first.
    const versions = ctx.args.includes('-sV');
    const scanArgs = ctx.args.filter(
      (arg) => !/^-s[A-Za-z]$/.test(arg) && arg !== '-Pn' && arg !== '-n',
    );
    const outcome = parseOptions(
      ctx.name,
      scanArgs,
      [{ short: 'p', arg: 'required' }, { short: 'F' }],
      {
        unsupported: ['O', 'A', 'T', 'oN', 'oX', 'script'],
      },
    );
    if (!outcome.ok) {
      ctx.stderr(outcome.message);
      return 1;
    }
    const o = outcome.options;
    const target = o.operands[0];
    if (target === undefined) {
      ctx.stderr(
        'Nmap: no target specified.\nSee the output of nmap -h for a summary of options.\n',
      );
      return 1;
    }
    let ports = o.has('F') ? NMAP_TOP_PORTS.slice(0, 10) : NMAP_TOP_PORTS;
    const portSpec = o.value('p');
    if (portSpec !== undefined) {
      const parsed = parsePortRange(portSpec);
      if (!parsed) {
        ctx.stderr(`Ports specified must be between 0 and 65535 inclusive\n`);
        return 1;
      }
      ports = parsed;
    }

    const { ips, cidr } = expandTargets(ctx, target);
    ctx.stdout('Starting Nmap 7.94 ( https://nmap.org ) at 2026-03-14 09:00 UTC\n');
    if (ips.length === 0) {
      if (cidr) {
        ctx.stdout('Nmap done: 256 IP addresses (0 hosts up) scanned in 2.15 seconds\n');
        return 0;
      }
      ctx.stderr(`Failed to resolve "${target}".\n`);
      ctx.stdout('Nmap done: 0 IP addresses (0 hosts up) scanned in 0.02 seconds\n');
      return 0;
    }
    let hostsUp = 0;
    for (const ip of ips) {
      await ctx.tty.sleep(50);
      if (ctx.tty.interrupted) return 130;
      const scan = ctx.network.scan(ctx.machine, ip, ports);
      if (cidr && !scan.up) continue;
      if (scan.up) hostsUp += 1;
      reportHost(ctx, target, scan, versions);
      ctx.stdout('\n');
    }
    const scannedCount = cidr ? 256 : ips.length;
    ctx.stdout(
      `Nmap done: ${scannedCount} IP address${scannedCount === 1 ? '' : 'es'} (${hostsUp} host${hostsUp === 1 ? '' : 's'} up) scanned in 1.32 seconds\n`,
    );
    return 0;
  },
});
