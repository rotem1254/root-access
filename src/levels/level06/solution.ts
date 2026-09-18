// TEST-ONLY: the plaintext flag and canonical solution live here, never in the bundle.
export const FLAG = 'FLAG{p1v0t_thr0ugh_th3_jump}';

export const JUMP_PASSWORD = 'an4lyst-jump-2026';
export const DB_PASSWORD = 'Qu4rterlyExp0rt!';

/** Lines that need an interactive answer: ssh asks for the host key, then the password. */
export const SOLUTION: readonly string[] = [
  'nmap 10.10.9.20',
  'ssh analyst@corp-jump01',
  'cat /home/analyst/netops-notes.txt',
  'ssh dbadmin@10.10.9.20',
  'cat /opt/export/README',
  `submit ${FLAG}`,
];

/** Obvious shortcuts that must NOT reveal or accept the flag. */
export const SHORTCUTS_THAT_FAIL: readonly string[] = [
  'ssh dbadmin@10.10.9.20',
  'curl http://10.10.9.20/',
  'ping -c 1 10.10.9.20',
];
