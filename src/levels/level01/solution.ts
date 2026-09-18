// TEST-ONLY: the plaintext flag and canonical solution live here, never in the bundle.
export const FLAG = 'FLAG{h1dd3n_1n_pl41n_s1ght}';

export const SOLUTION: readonly string[] = [
  'ls -la',
  'cat .handover',
  'base64 -d memo.txt',
  `submit ${FLAG}`,
];

/** Obvious shortcuts that must NOT reveal or accept the flag. */
export const SHORTCUTS_THAT_FAIL: readonly string[] = ['ls', 'submit FLAG{h1dd3n_1n_}'];
