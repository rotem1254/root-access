import type { Machine } from '../system/Machine';
import { NMAP_TOP_PORTS, serviceName } from './services';
import type {
  HostNetwork,
  NetworkDefinition,
  NetworkInterface,
  ScannedPort,
  ScanResult,
  ServiceSpec,
} from './types';

const DEFAULT_NETMASK = '255.255.255.0';

/** Bitwise AND of an IPv4 address and a netmask, as a string, for subnet comparison. */
function subnetOf(ip: string, netmask: string): string | null {
  const a = ip.split('.').map(Number);
  const m = netmask.split('.').map(Number);
  if (
    a.length !== 4 ||
    m.length !== 4 ||
    [...a, ...m].some((n) => Number.isNaN(n) || n < 0 || n > 255)
  ) {
    return null;
  }
  return a.map((octet, i) => octet & (m[i] ?? 0)).join('.');
}

export interface NetworkedMachine {
  machine: Machine;
  net: HostNetwork;
}

/** One host as the network knows it, with its usable interfaces (loopback included). */
interface HostEntry {
  machine: Machine;
  net: HostNetwork;
  interfaces: NetworkInterface[];
}

/** A set of machines with IP addresses: DNS, reachability and port scanning between them. */
export class Network {
  private readonly hosts: HostEntry[] = [];
  private readonly dns = new Map<string, string>();
  readonly latencyMs: number;

  constructor(definition: NetworkDefinition = {}) {
    this.latencyMs = definition.latencyMs ?? 0.3;
    for (const [name, ip] of Object.entries(definition.dns ?? {}))
      this.dns.set(name.toLowerCase(), ip);
  }

  add(machine: Machine, net: HostNetwork): void {
    const interfaces: NetworkInterface[] = [
      { name: 'lo', ip: '127.0.0.1', netmask: '255.0.0.0' },
      ...net.interfaces.map((iface) => ({ ...iface, netmask: iface.netmask ?? DEFAULT_NETMASK })),
    ];
    this.hosts.push({ machine, net, interfaces });
    // A hostname resolves to its primary (first) interface, like a single DNS A record.
    const primary = net.interfaces[0];
    if (primary) {
      const name = machine.hostname.toLowerCase();
      if (!this.dns.has(name)) this.dns.set(name, primary.ip);
      if (!this.dns.has(`${name}.novacorp.internal`)) {
        this.dns.set(`${name}.novacorp.internal`, primary.ip);
      }
    }
  }

  private entryOf(machine: Machine): HostEntry | undefined {
    return this.hosts.find((host) => host.machine === machine);
  }

  private entryByIp(ip: string): HostEntry | undefined {
    return this.hosts.find((host) => host.interfaces.some((iface) => iface.ip === ip));
  }

  machineByIp(ip: string): Machine | undefined {
    return this.entryByIp(ip)?.machine;
  }

  machineByHostname(name: string): Machine | undefined {
    return this.hosts.find((host) => host.machine.hostname === name)?.machine;
  }

  interfacesOf(machine: Machine): NetworkInterface[] {
    return this.entryOf(machine)?.interfaces ?? [];
  }

  gatewayOf(machine: Machine): string | undefined {
    return this.entryOf(machine)?.net.gateway;
  }

  ttlOf(machine: Machine): number {
    return this.entryOf(machine)?.net.ttl ?? 64;
  }

  /** Resolves a hostname or DNS name to an IP; returns the input unchanged if it is already an IP. */
  resolve(name: string): string | undefined {
    if (/^\d+\.\d+\.\d+\.\d+$/.test(name)) return name;
    return this.dns.get(name.toLowerCase());
  }

  /** Reverse lookup: the primary hostname for an IP, if known. */
  hostnameOf(ip: string): string | null {
    return this.entryByIp(ip)?.machine.hostname ?? null;
  }

  /** The subnets the given host has a (non-loopback) interface on. */
  private subnetsOf(entry: HostEntry): string[] {
    return entry.interfaces
      .filter((iface) => iface.name !== 'lo')
      .map((iface) => subnetOf(iface.ip, iface.netmask ?? DEFAULT_NETMASK))
      .filter((subnet): subnet is string => subnet !== null);
  }

  /**
   * A target IP is reachable when the source has an interface on that IP's subnet. Reachability is
   * per-interface, so a dual-homed host bridges two segments but a host on only one cannot reach the
   * other through it. A host always reaches its own IPs and loopback.
   */
  canReach(from: Machine, targetIp: string): boolean {
    const source = this.entryOf(from);
    if (!source) return false;
    if (source.interfaces.some((iface) => iface.ip === targetIp)) return true;
    if (targetIp === '127.0.0.1' || targetIp === 'localhost') return true;
    const target = this.entryByIp(targetIp);
    const targetIface = target?.interfaces.find((iface) => iface.ip === targetIp);
    if (!targetIface) return false;
    const targetSubnet = subnetOf(targetIface.ip, targetIface.netmask ?? DEFAULT_NETMASK);
    return targetSubnet !== null && this.subnetsOf(source).includes(targetSubnet);
  }

  /** IPs of every host reachable from `from` (excluding itself), for a ping sweep. */
  reachableIps(from: Machine): string[] {
    const source = this.entryOf(from);
    if (!source) return [];
    const ips = new Set<string>();
    for (const host of this.hosts) {
      if (host === source) continue;
      for (const iface of host.interfaces) {
        if (iface.name !== 'lo' && this.canReach(from, iface.ip)) ips.add(iface.ip);
      }
    }
    return [...ips].sort(compareIp);
  }

  portsOf(machine: Machine): readonly ServiceSpec[] {
    return this.entryOf(machine)?.net.ports ?? [];
  }

  serviceOn(machine: Machine, port: number): ServiceSpec | undefined {
    return this.portsOf(machine).find((service) => service.port === port);
  }

  /** The ssh service of a host (an explicit one, or a default on port 22 if listed). */
  sshServiceOf(machine: Machine): ServiceSpec | undefined {
    const ports = this.portsOf(machine);
    return ports.find((service) => service.ssh) ?? ports.find((service) => service.port === 22);
  }

  /** Scans `targetIp` from `from`. Unreachable → not up; reachable → open/closed per port. */
  scan(from: Machine, targetIp: string, ports: readonly number[] = NMAP_TOP_PORTS): ScanResult {
    const hostname = this.hostnameOf(targetIp);
    if (!this.canReach(from, targetIp) || !this.entryByIp(targetIp)) {
      return { ip: targetIp, hostname, up: false, ports: [] };
    }
    const target = this.entryByIp(targetIp);
    const open = new Set((target?.net.ports ?? []).map((service) => service.port));
    const scanned: ScannedPort[] = [];
    for (const port of ports) {
      if (!open.has(port)) continue;
      const service = target?.net.ports?.find((candidate) => candidate.port === port);
      const entry: ScannedPort = {
        port,
        state: 'open',
        service: serviceName(port, service?.name),
      };
      const version = service?.product
        ? `${service.product}${service.version ? ` ${service.version}` : ''}`
        : undefined;
      if (version !== undefined) entry.version = version;
      scanned.push(entry);
    }
    return { ip: targetIp, hostname, up: true, ports: scanned };
  }

  allMachines(): Machine[] {
    return this.hosts.map((host) => host.machine);
  }
}

/** Numeric-octet ordering for a list of IPv4 addresses. */
export function compareIp(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 4; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
