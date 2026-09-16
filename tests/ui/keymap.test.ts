import { describe, expect, it } from 'vitest';
import { decodeInput } from '../../src/ui/keymap';

describe('decodeInput', () => {
  it('decodes printable text as a single insert event', () => {
    expect(decodeInput('ls -la')).toEqual([{ key: 'ls -la' }]);
  });

  it('decodes Enter, Tab and Backspace', () => {
    expect(decodeInput('\r')).toEqual([{ key: 'Enter' }]);
    expect(decodeInput('\n')).toEqual([{ key: 'Enter' }]);
    expect(decodeInput('\t')).toEqual([{ key: 'Tab' }]);
    expect(decodeInput('\x7f')).toEqual([{ key: 'Backspace' }]);
    expect(decodeInput('\b')).toEqual([{ key: 'Backspace' }]);
  });

  it('splits a pasted multi-line block into inserts and Enters', () => {
    expect(decodeInput('echo hi\ncat x\n')).toEqual([
      { key: 'echo hi' },
      { key: 'Enter' },
      { key: 'cat x' },
      { key: 'Enter' },
    ]);
  });

  it('decodes control keys', () => {
    expect(decodeInput('\x03')).toEqual([{ key: 'c', ctrl: true }]);
    expect(decodeInput('\x04')).toEqual([{ key: 'd', ctrl: true }]);
    expect(decodeInput('\x0c')).toEqual([{ key: 'l', ctrl: true }]);
    expect(decodeInput('\x01')).toEqual([{ key: 'a', ctrl: true }]);
    expect(decodeInput('\x05')).toEqual([{ key: 'e', ctrl: true }]);
    expect(decodeInput('\x15')).toEqual([{ key: 'u', ctrl: true }]);
    expect(decodeInput('\x17')).toEqual([{ key: 'w', ctrl: true }]);
  });

  it('decodes arrow keys and navigation escape sequences', () => {
    expect(decodeInput('\x1b[A')).toEqual([{ key: 'ArrowUp' }]);
    expect(decodeInput('\x1b[B')).toEqual([{ key: 'ArrowDown' }]);
    expect(decodeInput('\x1b[C')).toEqual([{ key: 'ArrowRight' }]);
    expect(decodeInput('\x1b[D')).toEqual([{ key: 'ArrowLeft' }]);
    expect(decodeInput('\x1b[H')).toEqual([{ key: 'Home' }]);
    expect(decodeInput('\x1b[F')).toEqual([{ key: 'End' }]);
    expect(decodeInput('\x1bOH')).toEqual([{ key: 'Home' }]);
    expect(decodeInput('\x1b[1~')).toEqual([{ key: 'Home' }]);
    expect(decodeInput('\x1b[4~')).toEqual([{ key: 'End' }]);
    expect(decodeInput('\x1b[3~')).toEqual([{ key: 'Delete' }]);
  });

  it('decodes alt/meta word motions', () => {
    expect(decodeInput('\x1bb')).toEqual([{ key: 'b', alt: true }]);
    expect(decodeInput('\x1bf')).toEqual([{ key: 'f', alt: true }]);
    expect(decodeInput('\x1b\x7f')).toEqual([{ key: 'Backspace', alt: true }]);
  });

  it('interleaves text and keys in one chunk', () => {
    expect(decodeInput('ab\x7f\x1b[Dc')).toEqual([
      { key: 'ab' },
      { key: 'Backspace' },
      { key: 'ArrowLeft' },
      { key: 'c' },
    ]);
  });

  it('ignores lone escapes and unknown control bytes', () => {
    expect(decodeInput('\x1b')).toEqual([]);
    expect(decodeInput('a\x00b')).toEqual([{ key: 'ab' }]);
    expect(decodeInput('')).toEqual([]);
  });
});
