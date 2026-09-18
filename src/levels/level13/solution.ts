// TEST-ONLY: the plaintext flag and canonical solution live here, never in the bundle.
export const FLAG = 'FLAG{1d0r_c0unt_up_t0_r00t}';

export const SOLUTION: readonly string[] = [
  'curl http://helpdesk.novacorp.internal/',
  'curl "http://helpdesk.novacorp.internal/ticket?id=4187"',
  'curl "http://helpdesk.novacorp.internal/ticket?id=1"',
  `submit ${FLAG}`,
];

/** Obvious shortcuts that must NOT reveal or accept the flag. */
export const SHORTCUTS_THAT_FAIL: readonly string[] = [
  'curl "http://helpdesk.novacorp.internal/ticket?id=4187"',
  'curl http://helpdesk.novacorp.internal/admin',
  'curl "http://helpdesk.novacorp.internal/ticket?id=99999"',
];
