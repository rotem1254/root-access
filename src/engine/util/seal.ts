import { base64Decode, base64Encode } from './base64';
import type { ByteString } from './bytes';

/**
 * A level file scrambled at build time (see `?sealed` imports), so story files and flags are not
 * readable plaintext in the JavaScript bundle. This deters casual spoilers; it is not security.
 */
export interface Sealed {
  readonly sealed: string;
}

const KEY = 'ROOT_ACCESS::level-content';

function xor(bytes: ByteString): ByteString {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += String.fromCharCode(bytes.charCodeAt(i) ^ KEY.charCodeAt(i % KEY.length));
  }
  return out;
}

export function sealBytes(bytes: ByteString): Sealed {
  return { sealed: base64Encode(xor(bytes)) };
}

export function unseal(value: Sealed): ByteString {
  return xor(base64Decode(value.sealed).bytes);
}

export function isSealed(value: unknown): value is Sealed {
  return (
    typeof value === 'object' &&
    value !== null &&
    'sealed' in value &&
    typeof value.sealed === 'string'
  );
}
