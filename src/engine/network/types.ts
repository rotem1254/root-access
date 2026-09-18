/** A simulated network: hosts with interfaces, listening services and reachability. */

export interface NetworkInterface {
  /** e.g. "eth0", "eth1". A loopback "lo" is added automatically. */
  name: string;
  ip: string;
  /** Defaults to 255.255.255.0 (a /24). */
  netmask?: string;
  mac?: string;
}

/** A tiny simulated HTTP site served on an http/https port. */
export interface HttpRoute {
  status?: number;
  headers?: Readonly<Record<string, string>>;
  /** Body as text; sealed content is decoded by the level loader before it gets here. */
  body: string;
  /** Basic-auth realm: if set, requests without the right credentials get 401. */
  auth?: { realm: string; user: string; password: string };
}

export interface HttpSite {
  server?: string;
  routes: Readonly<Record<string, HttpRoute>>;
}

/** A service listening on a port. */
export interface ServiceSpec {
  port: number;
  /** Overrides the well-known name for the port (see services.ts). */
  name?: string;
  product?: string;
  version?: string;
  /** Raw banner sent on connect (ssh/ftp/smtp do this; http does not). */
  banner?: string;
  /** For http/https ports: the site served. */
  http?: HttpSite;
  /** Marks the ssh service; `ssh` connects to the host that has one. Defaults true for port 22. */
  ssh?: boolean;
}

/** Network metadata attached to a host definition. */
export interface HostNetwork {
  interfaces: readonly NetworkInterface[];
  ports?: readonly ServiceSpec[];
  gateway?: string;
  /** Time-to-live reported by ping (Linux hosts default to 64). */
  ttl?: number;
}

/** Level-wide network configuration. */
export interface NetworkDefinition {
  /** Extra DNS names → IP, on top of each host's own hostname(s). */
  dns?: Readonly<Record<string, string>>;
  /** Latency in ms that ping/nmap report (default a small fixed value). */
  latencyMs?: number;
}

export type PortState = 'open' | 'closed' | 'filtered';

export interface ScannedPort {
  port: number;
  state: PortState;
  service: string;
  version?: string;
}

export interface ScanResult {
  ip: string;
  hostname: string | null;
  up: boolean;
  ports: ScannedPort[];
}

/** A summarized packet-capture entry, as `tcpdump -r` would show. */
export interface PacketSummary {
  /** Seconds since capture start, e.g. "12.3040". */
  time: string;
  protocol: 'TCP' | 'UDP' | 'ICMP' | 'HTTP' | 'DNS' | 'FTP';
  src: string;
  dst: string;
  /** One-line description, as tcpdump prints after the addresses. */
  info: string;
}

export interface PcapSummary {
  entries: readonly PacketSummary[];
}
