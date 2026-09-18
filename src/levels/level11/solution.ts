// TEST-ONLY: the plaintext flag and canonical solution live here, never in the bundle.
export const FLAG = 'FLAG{k3y_b3f0r3_p4ssphr4s3}';

export const PASSPHRASE = 'ledger-oak-quiet-42';

export const SOLUTION: readonly string[] = [
  'gpg -d message.asc',
  'gpg --import alex-private.asc',
  'gpg --list-secret-keys',
  `gpg --passphrase ${PASSPHRASE} -d message.asc`,
  `submit ${FLAG}`,
];

/** Obvious shortcuts that must NOT reveal or accept the flag. */
export const SHORTCUTS_THAT_FAIL: readonly string[] = [
  'cat message.asc',
  'strings message.asc',
  'gpg -d message.asc',
];
