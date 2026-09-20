export const FLAG = 'FLAG{3nv_v4r14bl3s}';
export const SOLUTION: readonly string[] = [
  'env',
  'cat config.txt',
  'export BACKUP_KEY=unlock-2026',
  `submit ${FLAG}`,
];
// The flag is never in a file; the config only holds the key value, not the flag.
export const SHORTCUTS_THAT_FAIL: readonly string[] = ['cat config.txt'];
