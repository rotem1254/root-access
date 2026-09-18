import type { ByteString } from './bytes';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const DECODE = new Map<string, number>(Array.from(ALPHABET, (char, index) => [char, index]));

/** RFC 4648 Base64 of a byte string, without line wrapping. */
export function base64Encode(bytes: ByteString): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes.charCodeAt(i);
    const has1 = i + 1 < bytes.length;
    const has2 = i + 2 < bytes.length;
    const b1 = has1 ? bytes.charCodeAt(i + 1) : 0;
    const b2 = has2 ? bytes.charCodeAt(i + 2) : 0;
    out += ALPHABET.charAt(b0 >> 2);
    out += ALPHABET.charAt(((b0 & 0x03) << 4) | (b1 >> 4));
    out += has1 ? ALPHABET.charAt(((b1 & 0x0f) << 2) | (b2 >> 6)) : '=';
    out += has2 ? ALPHABET.charAt(b2 & 0x3f) : '=';
  }
  return out;
}

export interface Base64DecodeResult {
  /** Everything decoded before the first problem (GNU base64 prints this too). */
  bytes: ByteString;
  /** False when the input contained invalid characters or an incomplete final block. */
  ok: boolean;
}

/**
 * Decodes Base64 with GNU `base64 -d` semantics: newlines are ignored, anything else outside the
 * alphabet is invalid (unless `ignoreGarbage`, like `-i`), and a truncated final block is invalid
 * after its complete bytes are emitted.
 */
export function base64Decode(
  text: string,
  options: { ignoreGarbage?: boolean } = {},
): Base64DecodeResult {
  let bytes = '';
  const quad: string[] = [];

  const flush = (): boolean => {
    const [c0 = '', c1 = '', c2 = '', c3 = ''] = quad;
    quad.length = 0;
    const v0 = DECODE.get(c0);
    const v1 = DECODE.get(c1);
    if (v0 === undefined || v1 === undefined) return false;
    bytes += String.fromCharCode(((v0 << 2) | (v1 >> 4)) & 0xff);
    if (c2 === '=') return c3 === '=';
    const v2 = DECODE.get(c2);
    if (v2 === undefined) return false;
    bytes += String.fromCharCode(((v1 << 4) | (v2 >> 2)) & 0xff);
    if (c3 === '=') return true;
    const v3 = DECODE.get(c3);
    if (v3 === undefined) return false;
    bytes += String.fromCharCode(((v2 << 6) | v3) & 0xff);
    return true;
  };

  for (const char of text) {
    if (char === '\n') continue;
    if (!DECODE.has(char) && char !== '=') {
      if (options.ignoreGarbage) continue;
      return { bytes, ok: false };
    }
    quad.push(char);
    if (quad.length === 4 && !flush()) return { bytes, ok: false };
  }

  if (quad.length === 0) return { bytes, ok: true };
  // Truncated block: emit whatever complete bytes it holds, then report invalid input.
  const partial = [...quad];
  quad.length = 0;
  const v = partial.map((char) => DECODE.get(char));
  const [v0, v1, v2] = v;
  if (v0 !== undefined && v1 !== undefined) {
    bytes += String.fromCharCode(((v0 << 2) | (v1 >> 4)) & 0xff);
    if (v2 !== undefined) bytes += String.fromCharCode(((v1 << 4) | (v2 >> 2)) & 0xff);
  }
  return { bytes, ok: false };
}

/** Wraps encoded text into lines of `width` columns (0 disables wrapping). Ends with a newline. */
export function wrapBase64(encoded: string, width: number): string {
  if (encoded === '') return '';
  if (width <= 0) return `${encoded}\n`;
  let out = '';
  for (let i = 0; i < encoded.length; i += width) out += `${encoded.slice(i, i + width)}\n`;
  return out;
}
