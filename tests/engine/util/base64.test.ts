import { describe, expect, it } from 'vitest';
import { base64Decode, base64Encode, wrapBase64 } from '../../../src/engine/util/base64';

describe('base64Encode', () => {
  it.each([
    ['', ''],
    ['M', 'TQ=='],
    ['Ma', 'TWE='],
    ['Man', 'TWFu'],
    ['flag{hidden}', 'ZmxhZ3toaWRkZW59'],
    ['\x00\xff\xfe', 'AP/+'],
  ])('encodes %j as %s', (input, expected) => {
    expect(base64Encode(input)).toBe(expected);
  });
});

describe('base64Decode', () => {
  it('decodes padded input and ignores newlines', () => {
    expect(base64Decode('ZmxhZ3to\naWRkZW59\n')).toEqual({ bytes: 'flag{hidden}', ok: true });
    expect(base64Decode('TWE=')).toEqual({ bytes: 'Ma', ok: true });
    expect(base64Decode('TQ==')).toEqual({ bytes: 'M', ok: true });
  });

  it('decodes concatenated padded blocks', () => {
    expect(base64Decode('TQ==TWE=')).toEqual({ bytes: 'MMa', ok: true });
  });

  it('reports invalid characters after emitting what it decoded', () => {
    expect(base64Decode('TWFu!TWFu')).toEqual({ bytes: 'Man', ok: false });
    expect(base64Decode('TWFu\r\n')).toEqual({ bytes: 'Man', ok: false });
  });

  it('skips garbage when asked, like base64 -di', () => {
    expect(base64Decode('TW*Fu', { ignoreGarbage: true })).toEqual({ bytes: 'Man', ok: true });
  });

  it('treats a truncated final block as invalid but keeps its complete bytes', () => {
    expect(base64Decode('TWFuTQ')).toEqual({ bytes: 'ManM', ok: false });
    expect(base64Decode('TWFuTWE')).toEqual({ bytes: 'ManMa', ok: false });
    expect(base64Decode('TWFuT')).toEqual({ bytes: 'Man', ok: false });
  });

  it('rejects misplaced padding', () => {
    expect(base64Decode('T===').ok).toBe(false);
    expect(base64Decode('TQ=a').ok).toBe(false);
    expect(base64Decode('=AAA').ok).toBe(false);
  });

  it('round-trips binary data', () => {
    const bytes = Array.from({ length: 256 }, (_, i) => String.fromCharCode(i)).join('');
    expect(base64Decode(base64Encode(bytes))).toEqual({ bytes, ok: true });
  });
});

describe('wrapBase64', () => {
  it('wraps at the requested width like GNU base64', () => {
    expect(wrapBase64('abcdefgh', 3)).toBe('abc\ndef\ngh\n');
    expect(wrapBase64('abc', 0)).toBe('abc\n');
    expect(wrapBase64('', 76)).toBe('');
  });
});
