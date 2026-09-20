import type { NetworkInterface } from '../network/types';

/** A deterministic, locally-administered MAC derived from an IP (so output is stable). */
export function macFor(iface: NetworkInterface): string {
  if (iface.mac) return iface.mac;
  if (iface.name === 'lo') return '00:00:00:00:00:00';
  const octets = iface.ip.split('.').map((n) => Number(n) & 0xff);
  const hex = (n: number): string => n.toString(16).padStart(2, '0');
  return `02:42:${octets.map(hex).join(':')}`;
}

/** Network (subnet) address for an IP + netmask: the bitwise AND, so 10.10.5.20/16 → 10.10.0.0. */
export function networkOf(ip: string, netmask: string): string {
  const a = ip.split('.').map(Number);
  const m = netmask.split('.').map(Number);
  return a.map((octet, i) => octet & (m[i] ?? 0)).join('.');
}

/** Broadcast address for an IP + netmask (a /24 → x.y.z.255). */
export function broadcastOf(ip: string, netmask: string): string {
  const a = ip.split('.').map(Number);
  const m = netmask.split('.').map(Number);
  return a.map((octet, i) => (octet & (m[i] ?? 0)) | (~(m[i] ?? 0) & 0xff)).join('.');
}

/** CIDR prefix length for a dotted netmask (255.255.255.0 → 24). */
export function prefixLength(netmask: string): number {
  return netmask
    .split('.')
    .map((n) => (Number(n) >>> 0).toString(2).replace(/0+$/, ''))
    .join('')
    .split('')
    .filter((bit) => bit === '1').length;
}
