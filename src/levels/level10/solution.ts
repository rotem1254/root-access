// TEST-ONLY: the plaintext flag and canonical solution live here, never in the bundle.
export const FLAG = 'FLAG{s4lt3d__4nd_0p3n3d}';

/** The archive passphrase, stored ROT13'd in the level as "Dhnegre-Frny-2026". */
export const PASSPHRASE = 'Quarter-Seal-2026';

export const SOLUTION: readonly string[] = [
  'file exports.enc',
  'xxd -l 16 exports.enc',
  "tr 'A-Za-z' 'N-ZA-Mn-za-m' < passphrase.note",
  `openssl enc -d -aes-256-cbc -in exports.enc -k ${PASSPHRASE}`,
  `submit ${FLAG}`,
];

/** Obvious shortcuts that must NOT reveal or accept the flag. */
export const SHORTCUTS_THAT_FAIL: readonly string[] = [
  'cat exports.enc',
  'strings exports.enc',
  'openssl enc -d -aes-256-cbc -in exports.enc -k Dhnegre-Frny-2026',
];
