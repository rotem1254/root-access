import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { type ByteString, toUint8Array, utf8Encode } from './bytes';

/** SHA-256 hex digest of a byte string. Synchronous and available outside secure contexts. */
export function sha256HexOfBytes(bytes: ByteString): string {
  return bytesToHex(sha256(toUint8Array(bytes)));
}

/** SHA-256 hex digest of text, UTF-8 encoded first (matches `printf '%s' text | sha256sum`). */
export function sha256Hex(text: string): string {
  return sha256HexOfBytes(utf8Encode(text));
}
