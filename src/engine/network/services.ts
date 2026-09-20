/** Well-known TCP service names, as nmap's nmap-services / /etc/services would report them. */
export const WELL_KNOWN_PORTS: Readonly<Record<number, string>> = {
  21: 'ftp',
  22: 'ssh',
  23: 'telnet',
  25: 'smtp',
  53: 'domain',
  80: 'http',
  110: 'pop3',
  111: 'rpcbind',
  143: 'imap',
  443: 'https',
  445: 'microsoft-ds',
  993: 'imaps',
  995: 'pop3s',
  3000: 'ppp',
  3306: 'mysql',
  3389: 'ms-wbt-server',
  5432: 'postgresql',
  5900: 'vnc',
  6379: 'redis',
  8000: 'http-alt',
  8080: 'http-proxy',
  8443: 'https-alt',
  9000: 'cslistener',
  9200: 'wap-wsp',
};

/** The default ports nmap scans without -p (a trimmed "top ports" list for the sim). */
export const NMAP_TOP_PORTS: readonly number[] = [
  21, 22, 23, 25, 53, 80, 110, 111, 143, 443, 445, 993, 995, 3306, 3389, 5432, 5900, 6379, 8000,
  8080, 8443,
];

export function serviceName(port: number, override?: string): string {
  return override ?? WELL_KNOWN_PORTS[port] ?? 'unknown';
}

/** The daemon that typically owns a well-known port, as `netstat -p` / `ss -p` would name it. */
export const PORT_PROGRAMS: Readonly<Record<number, string>> = {
  22: 'sshd',
  21: 'vsftpd',
  25: 'master',
  53: 'named',
  80: 'nginx',
  110: 'dovecot',
  143: 'dovecot',
  443: 'nginx',
  445: 'smbd',
  3000: 'node',
  3306: 'mysqld',
  5432: 'postgres',
  6379: 'redis-server',
  8000: 'python3',
  8080: 'nginx',
  8443: 'nginx',
  9200: 'java',
};

/** The program name for a listening port: an explicit override, else the well-known daemon. */
export function programName(port: number, override?: string): string {
  return override ?? PORT_PROGRAMS[port] ?? serviceName(port);
}

/** A default connect banner for services that send one, used by nc and nmap -sV. */
export function defaultBanner(
  port: number,
  product?: string,
  version?: string,
): string | undefined {
  const label = product && version ? `${product} ${version}` : product;
  switch (port) {
    case 22:
      return `SSH-2.0-${(product ?? 'OpenSSH').replace(/\s+/g, '_')}_${version ?? '8.9p1'}`;
    case 21:
      return `220 ${label ?? 'FTP service'} ready.`;
    case 25:
      return `220 ${label ?? 'SMTP'} ESMTP`;
    default:
      return undefined;
  }
}

/** Parses an nmap -p value: "22", "22,80", "1-100", "-" (all), "22,80,8000-8100". */
export function parsePortRange(spec: string): number[] | null {
  if (spec === '-') {
    const all: number[] = [];
    for (let p = 1; p <= 65535; p++) all.push(p);
    return all;
  }
  const ports = new Set<number>();
  for (const part of spec.split(',')) {
    const range = /^(\d+)-(\d+)$/.exec(part);
    if (range) {
      const lo = Number(range[1]);
      const hi = Number(range[2]);
      if (lo < 1 || hi > 65535 || lo > hi) return null;
      for (let p = lo; p <= hi; p++) ports.add(p);
    } else if (/^\d+$/.test(part)) {
      const p = Number(part);
      if (p < 1 || p > 65535) return null;
      ports.add(p);
    } else {
      return null;
    }
  }
  return [...ports].sort((a, b) => a - b);
}
