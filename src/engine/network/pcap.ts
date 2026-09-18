import type { ByteString } from '../util/bytes';
import type { PcapSummary } from './types';

/** libpcap little-endian magic; `file` recognises it, and tcpdump -r reads what follows. */
const PCAP_MAGIC = '\xd4\xc3\xb2\xa1';

/**
 * Encodes a capture as a byte string that begins with the real pcap magic (so `file` reports a
 * pcap) followed by a JSON summary that `tcpdump -r` renders. Not a real pcap on the wire — a
 * teaching stand-in that keeps the tooling honest.
 */
export function encodePcap(summary: PcapSummary): ByteString {
  return `${PCAP_MAGIC}\x02\x00\x04\x00${JSON.stringify(summary)}`;
}

export function isPcap(data: ByteString): boolean {
  return data.startsWith(PCAP_MAGIC);
}

export function decodePcap(data: ByteString): PcapSummary | null {
  if (!isPcap(data)) return null;
  const brace = data.indexOf('{');
  if (brace < 0) return null;
  try {
    const parsed = JSON.parse(data.slice(brace)) as PcapSummary;
    return Array.isArray(parsed.entries) ? parsed : null;
  } catch {
    return null;
  }
}
