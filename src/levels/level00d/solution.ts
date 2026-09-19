export const FLAG = 'FLAG{p1p3_1t_thr0ugh}';
export const SOLUTION: readonly string[] = [
  'ls',
  'ls | grep key',
  'cat keycard.txt',
  `submit ${FLAG}`,
];
export const SHORTCUTS_THAT_FAIL: readonly string[] = ['ls', 'submit FLAG{nope}'];
