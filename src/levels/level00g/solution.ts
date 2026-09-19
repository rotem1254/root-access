export const FLAG = 'FLAG{f0und_1t_w1th_f1nd}';
export const SOLUTION: readonly string[] = [
  'ls',
  'find . -name vault.bak',
  'cat ./archive/2023/backups/vault.bak',
  `submit ${FLAG}`,
];
export const SHORTCUTS_THAT_FAIL: readonly string[] = ['ls', 'cat vault.bak'];
