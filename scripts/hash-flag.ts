// Prints the SHA-256 hex digest to store as a level's `flagHash`.
// Usage: npm run hash-flag -- 'FLAG{example_flag}'
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

const flag = process.argv[2]?.trim() ?? '';
if (!/^FLAG\{[A-Za-z0-9_]+\}$/.test(flag)) {
  console.error("usage: npm run hash-flag -- 'FLAG{letters_digits_underscores}'");
  process.exit(1);
}
console.log(bytesToHex(sha256(utf8ToBytes(flag))));
