// TEST-ONLY: the plaintext flag and canonical solution live here, never in the bundle.
export const FLAG = 'FLAG{h3ll0_t3rm1n4l}';

export const SOLUTION: readonly string[] = [
  'ls',
  'cat welcome.txt',
  'cat badge.txt',
  `submit ${FLAG}`,
];

/** Obvious shortcuts that must NOT reveal or accept the flag. */
export const SHORTCUTS_THAT_FAIL: readonly string[] = ['ls', 'pwd', 'submit FLAG{wrong}'];
