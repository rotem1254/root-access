/**
 * Byte strings.
 *
 * The engine stores file contents and pipe data as JavaScript strings in which every UTF-16 code
 * unit is exactly one byte (0x00–0xFF). Binary data survives pipes and redirects untouched, and
 * byte counts (`wc -c`, `ls -l`) are exact. Author-written text is UTF-8 encoded on the way in; the
 * UI decodes UTF-8 on the way out to the terminal.
 */
export type ByteString = string;

export function isAscii(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) > 0x7f) return false;
  }
  return true;
}

/** Encodes a JavaScript (UTF-16) string as UTF-8 bytes. */
export function utf8Encode(text: string): ByteString {
  if (isAscii(text)) return text;
  let out = '';
  for (const char of text) {
    const cp = char.codePointAt(0) ?? 0;
    if (cp < 0x80) {
      out += String.fromCharCode(cp);
    } else if (cp < 0x800) {
      out += String.fromCharCode(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    } else if (cp < 0x10000) {
      out += String.fromCharCode(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      out += String.fromCharCode(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    }
  }
  return out;
}

const REPLACEMENT = '�';

function continuation(bytes: ByteString, index: number): number {
  const b = bytes.charCodeAt(index);
  return (b & 0xc0) === 0x80 ? b & 0x3f : -1;
}

/** Decodes UTF-8 bytes. Invalid sequences become U+FFFD, one per offending byte. */
export function utf8Decode(bytes: ByteString): string {
  if (isAscii(bytes)) return bytes;
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes.charCodeAt(i);
    if (b0 < 0x80) {
      out += bytes.charAt(i);
      i += 1;
      continue;
    }
    let needed = 0;
    let cp = 0;
    let min = 0;
    if (b0 >= 0xc2 && b0 <= 0xdf) {
      needed = 1;
      cp = b0 & 0x1f;
      min = 0x80;
    } else if (b0 >= 0xe0 && b0 <= 0xef) {
      needed = 2;
      cp = b0 & 0x0f;
      min = 0x800;
    } else if (b0 >= 0xf0 && b0 <= 0xf4) {
      needed = 3;
      cp = b0 & 0x07;
      min = 0x10000;
    }
    let valid = needed > 0;
    for (let k = 1; valid && k <= needed; k++) {
      const c = i + k < bytes.length ? continuation(bytes, i + k) : -1;
      if (c < 0) valid = false;
      else cp = (cp << 6) | c;
    }
    if (valid && cp >= min && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff)) {
      out += String.fromCodePoint(cp);
      i += needed + 1;
    } else {
      out += REPLACEMENT;
      i += 1;
    }
  }
  return out;
}

export function toUint8Array(bytes: ByteString): Uint8Array {
  const array = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) array[i] = bytes.charCodeAt(i) & 0xff;
  return array;
}

export function fromUint8Array(array: Uint8Array): ByteString {
  let out = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < array.length; i += CHUNK) {
    out += String.fromCharCode(...array.subarray(i, i + CHUNK));
  }
  return out;
}
