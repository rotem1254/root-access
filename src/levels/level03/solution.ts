// TEST-ONLY: plaintext flag, password and canonical solution.
export const FLAG = 'FLAG{p3rm1ss10n_l4dd3r_cl1mb3d}';
export const ADMIN_PASSWORD = 'R3dOct0ber!2026';

/** Steps that need an interactive password answer are marked; the runner supplies it. */
export const SOLUTION: readonly string[] = [
  'ls -l /home/admin',
  'find / -perm -o=r -name "*.bak" 2>/dev/null',
  'cat /opt/portal/releases/2025-11-09/portal.conf.bak',
  'su admin', // answer: ADMIN_PASSWORD
  'cat /home/admin/flag.txt',
  `submit ${FLAG}`,
];

export const SHORTCUTS_THAT_FAIL: readonly string[] = [
  'cat /home/admin/flag.txt',
  'su admin', // answer: wrongpassword
];
