import { describe, expect, it } from 'vitest';
import { FsError, isFsError, strerror } from '../../../src/engine/errors';
import { ManualClock, storyClock, systemClock } from '../../../src/engine/util/clock';
import { createRandom, hashString } from '../../../src/engine/util/prng';
import { isSealed, sealBytes, unseal } from '../../../src/engine/util/seal';
import { sha256Hex, sha256HexOfBytes } from '../../../src/engine/util/sha256';

describe('errors', () => {
  it('uses glibc strerror wording', () => {
    expect(strerror('ENOENT')).toBe('No such file or directory');
    expect(strerror('EACCES')).toBe('Permission denied');
    const error = new FsError('ENOTDIR', 'notes.txt/x');
    expect(error.message).toBe('notes.txt/x: Not a directory');
    expect(isFsError(error)).toBe(true);
    expect(isFsError(new Error('nope'))).toBe(false);
  });
});

describe('clocks', () => {
  it('advances a manual clock only when told to', () => {
    const clock = new ManualClock(1000);
    clock.advance(500);
    expect(clock.now()).toBe(1500);
    clock.set(42);
    expect(clock.now()).toBe(42);
  });

  it('offsets story time by elapsed real time', () => {
    const real = new ManualClock(5_000);
    const story = storyClock(Date.parse('2026-03-14T09:00:00Z'), real);
    real.advance(60_000);
    expect(new Date(story.now()).toISOString()).toBe('2026-03-14T09:01:00.000Z');
  });

  it('reads the system clock', () => {
    expect(Math.abs(systemClock.now() - Date.now())).toBeLessThan(1000);
  });
});

describe('prng', () => {
  it('is deterministic for a seed', () => {
    const a = createRandom('auth.log');
    const b = createRandom('auth.log');
    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    expect(seqA).toEqual(seqB);
    expect(seqA.every((n) => n >= 0 && n < 1)).toBe(true);
  });

  it('produces integers in range and picks items', () => {
    const random = createRandom(7);
    for (let i = 0; i < 200; i++) {
      const n = random.int(3, 5);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(5);
    }
    expect(['a', 'b']).toContain(random.pick(['a', 'b']));
    expect(() => random.pick([])).toThrow(RangeError);
    expect(typeof random.chance(0.5)).toBe('boolean');
    expect(random.chance(0)).toBe(false);
    expect(random.chance(1)).toBe(true);
  });

  it('hashes strings with FNV-1a', () => {
    expect(hashString('')).toBe(0x811c9dc5);
    expect(hashString('a')).toBe(0xe40c292c);
  });
});

describe('sha256', () => {
  it('matches the NIST test vector', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('hashes UTF-8 text and raw bytes consistently', () => {
    expect(sha256Hex('é')).toBe(sha256HexOfBytes('\xc3\xa9'));
  });
});

describe('seal', () => {
  it('round-trips bytes and hides plaintext', () => {
    const secret = 'FLAG{do_not_ship_me}\n\x00\xff';
    const sealed = sealBytes(secret);
    expect(sealed.sealed).not.toContain('FLAG');
    expect(unseal(sealed)).toBe(secret);
  });

  it('recognises sealed values', () => {
    expect(isSealed(sealBytes('x'))).toBe(true);
    expect(isSealed({ sealed: 3 })).toBe(false);
    expect(isSealed('text')).toBe(false);
    expect(isSealed(null)).toBe(false);
  });
});
