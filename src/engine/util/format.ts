/** Output formatting shared by commands. All dates are rendered in UTC (the simulated servers' zone). */

export const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** Half of a Gregorian year, the threshold GNU ls uses to decide between showing time or year. */
const SIX_MONTHS_MS = (31556952 / 2) * 1000;

const pad2 = (n: number): string => String(n).padStart(2, '0');

function month(date: Date): string {
  return MONTHS[date.getUTCMonth()] ?? '???';
}

/** `ls -l` timestamp: `Mar 14 03:12` for recent files, `Mar 14  2025` for old or future ones. */
export function formatLsTime(mtime: number, now: number): string {
  const date = new Date(mtime);
  const day = String(date.getUTCDate()).padStart(2, ' ');
  const recent = mtime > now - SIX_MONTHS_MS && mtime <= now + 1000;
  if (recent) {
    return `${month(date)} ${day} ${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}`;
  }
  return `${month(date)} ${day}  ${date.getUTCFullYear()}`;
}

/** syslog timestamp as found in /var/log/auth.log: `Mar  4 03:12:45`. */
export function formatSyslogTime(time: number): string {
  const date = new Date(time);
  const day = String(date.getUTCDate()).padStart(2, ' ');
  const clock = `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())}`;
  return `${month(date)} ${day} ${clock}`;
}

const UNITS = ['K', 'M', 'G', 'T', 'P', 'E'] as const;

/**
 * GNU `ls -h` sizes: powers of 1024, rounded up, one decimal below 10 (`1.1K`, `4.0K`, `10K`).
 */
export function humanSize(bytes: number): string {
  if (bytes < 1024) return String(bytes);
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  let text: string;
  if (value < 10) {
    const tenths = Math.ceil(value * 10);
    text = tenths >= 100 ? '10' : (tenths / 10).toFixed(1);
  } else {
    const whole = Math.ceil(value);
    if (whole >= 1024 && unit < UNITS.length - 1) {
      unit += 1;
      text = '1.0';
    } else {
      text = String(whole);
    }
  }
  return `${text}${UNITS[unit] ?? ''}`;
}
