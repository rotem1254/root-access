import { describe, expect, it } from 'vitest';
import {
  fromUint8Array,
  isAscii,
  toUint8Array,
  utf8Decode,
  utf8Encode,
} from '../../../src/engine/util/bytes';

describe('utf8Encode', () => {
  it('leaves ASCII untouched', () => {
    expect(utf8Encode('hello\n')).toBe('hello\n');
  });

  it('encodes 2, 3 and 4 byte sequences', () => {
    expect(utf8Encode('é')).toBe('\xc3\xa9');
    expect(utf8Encode('€')).toBe('\xe2\x82\xac');
    expect(utf8Encode('😀')).toBe('\xf0\x9f\x98\x80');
  });

  it('counts bytes, not characters', () => {
    expect(utf8Encode('שלום').length).toBe(8);
  });
});

describe('utf8Decode', () => {
  it('round-trips encoded text', () => {
    const text = 'ROOT_ACCESS — שלום 😀';
    expect(utf8Decode(utf8Encode(text))).toBe(text);
  });

  it('replaces invalid bytes with U+FFFD', () => {
    expect(utf8Decode('a\xffb')).toBe('a�b');
    expect(utf8Decode('\xe2\x82')).toBe('��');
    expect(utf8Decode('\xc0\xaf')).toBe('��');
  });

  it('rejects surrogates and overlong encodings', () => {
    expect(utf8Decode('\xed\xa0\x80')).toBe('���');
    expect(utf8Decode('\xe0\x80\xaf')).toBe('���');
  });
});

describe('byte arrays', () => {
  it('converts between byte strings and Uint8Array', () => {
    const bytes = '\x00\x7f\x80\xff';
    const array = toUint8Array(bytes);
    expect(Array.from(array)).toEqual([0, 127, 128, 255]);
    expect(fromUint8Array(array)).toBe(bytes);
  });

  it('handles arrays larger than one chunk', () => {
    const array = new Uint8Array(100_000).map((_, i) => i % 256);
    expect(toUint8Array(fromUint8Array(array))).toEqual(array);
  });

  it('detects ASCII', () => {
    expect(isAscii('plain')).toBe(true);
    expect(isAscii('caf\xe9')).toBe(false);
  });
});
