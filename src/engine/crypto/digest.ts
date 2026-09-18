import { md5, ripemd160, sha1 } from '@noble/hashes/legacy.js';
import { sha256, sha512 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { type ByteString, toUint8Array } from '../util/bytes';

/** The digest algorithms the game's tools understand. */
export type DigestName = 'md5' | 'sha1' | 'sha256' | 'sha512' | 'ripemd160';

const ALGORITHMS: Readonly<Record<DigestName, (input: Uint8Array) => Uint8Array>> = {
  md5,
  sha1,
  sha256,
  sha512,
  ripemd160,
};

/** Hex digest of a byte string under the named algorithm. */
export function digestHex(name: DigestName, bytes: ByteString): string {
  return bytesToHex(ALGORITHMS[name](toUint8Array(bytes)));
}

export function isDigestName(name: string): name is DigestName {
  return name in ALGORITHMS;
}

export const DIGEST_NAMES: readonly DigestName[] = ['md5', 'sha1', 'sha256', 'sha512', 'ripemd160'];

/** Hex length → the algorithms that produce a digest of that length. */
const BY_LENGTH: Readonly<Record<number, readonly DigestName[]>> = {
  32: ['md5'],
  40: ['sha1', 'ripemd160'],
  64: ['sha256'],
  128: ['sha512'],
};

export interface HashIdentification {
  /** The candidate algorithms, most likely first. Empty when nothing matches. */
  candidates: readonly DigestName[];
  /** True when the text is a plausible bare hex digest at all. */
  looksLikeHash: boolean;
  bits: number;
}

/**
 * Identifies a bare hex digest by its length, the way `hashid`/`hash-identifier` do. Length is the
 * only signal a raw digest carries — which is exactly the lesson: you narrow it down, you do not
 * "detect" it.
 */
export function identifyHash(text: string): HashIdentification {
  const trimmed = text.trim();
  const looksLikeHash = /^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0;
  if (!looksLikeHash) return { candidates: [], looksLikeHash: false, bits: 0 };
  return {
    candidates: BY_LENGTH[trimmed.length] ?? [],
    looksLikeHash: true,
    bits: trimmed.length * 4,
  };
}
