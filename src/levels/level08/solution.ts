// TEST-ONLY: the plaintext flag and canonical solution live here, never in the bundle.
export const FLAG = 'FLAG{0n3_byt3_0ff}';

export const SOLUTION: readonly string[] = [
  'cd /srv/delivery',
  'sha256sum -c SHA256SUMS',
  'cat q3-renewals.csv',
  `submit ${FLAG}`,
];

/** Obvious shortcuts that must NOT reveal or accept the flag. */
export const SHORTCUTS_THAT_FAIL: readonly string[] = [
  'ls -la /srv/delivery',
  'sha256sum /srv/delivery/q1-renewals.csv',
  'cat /srv/delivery/q1-renewals.csv',
];
