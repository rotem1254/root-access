// TEST-ONLY: the plaintext flag and canonical solution live here, never in the bundle.
export const FLAG = 'FLAG{r0b0ts_txt_1s_n0t_4_l0ck}';

export const SOLUTION: readonly string[] = [
  'curl http://portal.novacorp.internal/',
  'curl http://portal.novacorp.internal/robots.txt',
  'curl http://portal.novacorp.internal/internal/backup/notes.txt',
  `submit ${FLAG}`,
];

/** Obvious shortcuts that must NOT reveal or accept the flag. */
export const SHORTCUTS_THAT_FAIL: readonly string[] = [
  'curl http://portal.novacorp.internal/',
  'curl http://portal.novacorp.internal/admin',
  'curl http://portal.novacorp.internal/internal/',
];
