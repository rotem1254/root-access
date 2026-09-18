// TEST-ONLY: the plaintext flag and canonical solution live here, never in the bundle.
export const FLAG = 'FLAG{sw33p_th3_subn3t}';

export const SOLUTION: readonly string[] = [
  'ip a',
  'nmap 10.10.0.0/24',
  'curl http://10.10.0.30/',
  `submit ${FLAG}`,
];

/** Obvious shortcuts that must NOT reveal or accept the flag. */
export const SHORTCUTS_THAT_FAIL: readonly string[] = [
  'ls -la',
  'grep -r FLAG /home/analyst',
  'curl http://10.10.0.9/',
  'curl http://10.10.9.20/',
];
