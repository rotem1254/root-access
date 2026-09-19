export const FLAG = 'FLAG{cd_1nt0_th3_f0ld3r}';
export const SOLUTION: readonly string[] = [
  'ls',
  'cd projects',
  'ls',
  'cat secret.txt',
  `submit ${FLAG}`,
];
export const SHORTCUTS_THAT_FAIL: readonly string[] = ['ls', 'pwd', 'cat secret.txt'];
