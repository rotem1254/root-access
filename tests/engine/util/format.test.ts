import { describe, expect, it } from 'vitest';
import { formatLsTime, formatSyslogTime, humanSize } from '../../../src/engine/util/format';

const at = (iso: string): number => Date.parse(iso);

describe('humanSize (ls -h)', () => {
  it.each([
    [0, '0'],
    [512, '512'],
    [1023, '1023'],
    [1024, '1.0K'],
    [1025, '1.1K'],
    [1536, '1.5K'],
    [4096, '4.0K'],
    [10239, '10K'],
    [10240, '10K'],
    [10241, '11K'],
    [1048575, '1.0M'],
    [1048576, '1.0M'],
    [5 * 1048576 + 1, '5.1M'],
    [3 * 1024 ** 3, '3.0G'],
  ])('%i bytes → %s', (bytes, expected) => {
    expect(humanSize(bytes)).toBe(expected);
  });
});

describe('formatLsTime', () => {
  const now = at('2026-03-15T09:00:00Z');

  it('shows hours and minutes for files from the last six months', () => {
    expect(formatLsTime(at('2026-03-14T03:12:45Z'), now)).toBe('Mar 14 03:12');
  });

  it('pads single-digit days with a space', () => {
    expect(formatLsTime(at('2026-03-04T23:05:00Z'), now)).toBe('Mar  4 23:05');
  });

  it('shows the year for old files', () => {
    expect(formatLsTime(at('2025-01-09T10:00:00Z'), now)).toBe('Jan  9  2025');
  });

  it('shows the year for files in the future', () => {
    expect(formatLsTime(at('2026-12-24T10:00:00Z'), now)).toBe('Dec 24  2026');
  });
});

describe('formatSyslogTime', () => {
  it('formats auth.log timestamps', () => {
    expect(formatSyslogTime(at('2026-03-04T03:07:44Z'))).toBe('Mar  4 03:07:44');
    expect(formatSyslogTime(at('2026-11-14T13:59:02Z'))).toBe('Nov 14 13:59:02');
  });
});
