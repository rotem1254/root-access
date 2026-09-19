export const FLAG = 'FLAG{m0v3d_c0p13d_d0n3}';
export const SOLUTION: readonly string[] = [
  'mkdir vault',
  'cp data.dat vault/',
  'mv vault/data.dat vault/flag.txt',
  'rm junk.tmp',
  `submit ${FLAG}`,
];
// The flag is never in a file, so the only "shortcut" is trying to read the raw material.
export const SHORTCUTS_THAT_FAIL: readonly string[] = ['cat data.dat'];
