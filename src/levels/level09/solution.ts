// TEST-ONLY: the plaintext flag and canonical solution live here, never in the bundle.
export const FLAG = 'FLAG{w0rdl1st_w1ns_ag41n}';

/** The password that the wordlist recovers for mreyes. */
export const MREYES_PASSWORD = 'Sunflower2019!';

export const SOLUTION: readonly string[] = [
  'cat hashes.txt',
  'john --wordlist=/usr/share/wordlists/common.txt hashes.txt',
  'john --show hashes.txt',
  'su mreyes',
  'cat /home/mreyes/notes.txt',
  `submit ${FLAG}`,
];

/** Obvious shortcuts that must NOT reveal or accept the flag. */
export const SHORTCUTS_THAT_FAIL: readonly string[] = [
  'cat /home/mreyes/notes.txt',
  'john --wordlist=/usr/share/wordlists/common.txt --format=raw-sha256 hashes.txt',
  'su mreyes',
];
