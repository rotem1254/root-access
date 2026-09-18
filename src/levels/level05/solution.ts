// TEST-ONLY: the plaintext flag and canonical solution live here, never in the bundle.
export const FLAG = 'FLAG{h1gh_p0rt_l0w_pr0f1l3}';

export const SOLUTION: readonly string[] = [
  'nmap corp-build01',
  'nmap -p 8000-9000 -sV corp-build01',
  'curl http://corp-build01:8686/',
  `submit ${FLAG}`,
];

/** Obvious shortcuts that must NOT reveal or accept the flag. */
export const SHORTCUTS_THAT_FAIL: readonly string[] = [
  'nmap corp-build01',
  'curl http://corp-build01/',
  'curl http://corp-build01:8080/',
];
