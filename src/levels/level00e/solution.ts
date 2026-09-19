export const FLAG = 'FLAG{ch4ng3_th3_m0d3}';
export const SOLUTION: readonly string[] = [
  'ls -l',
  'chmod +r locked.txt',
  'cat locked.txt',
  `submit ${FLAG}`,
];
export const SHORTCUTS_THAT_FAIL: readonly string[] = ['ls -l', 'cat locked.txt'];
