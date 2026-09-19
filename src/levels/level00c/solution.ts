export const FLAG = 'FLAG{gr3p_f1nds_1t}';
export const SOLUTION: readonly string[] = [
  'cat logbook.txt',
  'grep token logbook.txt',
  `submit ${FLAG}`,
];
export const SHORTCUTS_THAT_FAIL: readonly string[] = ['ls', 'grep nothing logbook.txt'];
