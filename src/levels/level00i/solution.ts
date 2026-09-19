export const FLAG = 'FLAG{c0unt_th3_n01s3}';
export const SOLUTION: readonly string[] = [
  'wc -l sessions.log',
  'sort sessions.log | uniq -c',
  `submit ${FLAG}`,
];
// The flag is never in a file, so reading the raw log is the shortcut that fails.
export const SHORTCUTS_THAT_FAIL: readonly string[] = ['cat sessions.log'];
