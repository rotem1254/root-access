export const FLAG = 'FLAG{k1ll_th3_m1n3r}';
export const SOLUTION: readonly string[] = [
  'ps aux',
  'kill 1337',
  'kill -9 1337',
  `submit ${FLAG}`,
];
// The flag is never in a file; listing processes shows the miner but not the flag.
export const SHORTCUTS_THAT_FAIL: readonly string[] = ['ps aux'];
