import { cbc } from '@noble/ciphers/aes.js';
import { md5, sha1 } from '@noble/hashes/legacy.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { type ByteString, fromUint8Array, toUint8Array } from '../util/bytes';

/** OpenSSL's magic header for a salted `enc` container. */
export const SALTED_MAGIC = 'Salted__';

export type EncDigest = 'md5' | 'sha1' | 'sha256';

const HASHES = { md5, sha1, sha256 } as const;

/**
 * OpenSSL's legacy EVP_BytesToKey: repeatedly hash (previous block ‖ password ‖ salt) until enough
 * bytes exist for the key and IV. This is what `openssl enc -aes-256-cbc -k pass` uses without
 * `-pbkdf2`, so files produced here open with a real openssl.
 */
export function evpBytesToKey(
  password: ByteString,
  salt: Uint8Array,
  keyLength: number,
  ivLength: number,
  digest: EncDigest = 'sha256',
): { key: Uint8Array; iv: Uint8Array } {
  const hash = HASHES[digest];
  const passwordBytes = toUint8Array(password);
  const derived: number[] = [];
  let block = new Uint8Array(0);
  while (derived.length < keyLength + ivLength) {
    const input = new Uint8Array(block.length + passwordBytes.length + salt.length);
    input.set(block, 0);
    input.set(passwordBytes, block.length);
    input.set(salt, block.length + passwordBytes.length);
    block = hash(input);
    derived.push(...block);
  }
  return {
    key: new Uint8Array(derived.slice(0, keyLength)),
    iv: new Uint8Array(derived.slice(keyLength, keyLength + ivLength)),
  };
}

/** PBKDF2 derivation, as `openssl enc -pbkdf2` uses (10000 iterations, SHA-256). */
export function pbkdf2Key(
  password: ByteString,
  salt: Uint8Array,
  keyLength: number,
  ivLength: number,
  iterations = 10000,
): { key: Uint8Array; iv: Uint8Array } {
  const derived = pbkdf2(sha256, toUint8Array(password), salt, {
    c: iterations,
    dkLen: keyLength + ivLength,
  });
  return { key: derived.slice(0, keyLength), iv: derived.slice(keyLength) };
}

export interface EncOptions {
  /** 32 for aes-256, 16 for aes-128. */
  keyLength?: number;
  digest?: EncDigest;
  pbkdf2?: boolean;
  /** Fixed salt, so level content is byte-stable across builds. */
  salt?: Uint8Array;
}

function deriveFor(
  password: ByteString,
  salt: Uint8Array,
  options: EncOptions,
): { key: Uint8Array; iv: Uint8Array } {
  const keyLength = options.keyLength ?? 32;
  return options.pbkdf2
    ? pbkdf2Key(password, salt, keyLength, 16)
    : evpBytesToKey(password, salt, keyLength, 16, options.digest ?? 'sha256');
}

/** Encrypts to the OpenSSL container: `Salted__` ‖ 8-byte salt ‖ AES-CBC ciphertext. */
export function opensslEncrypt(
  plaintext: ByteString,
  password: ByteString,
  options: EncOptions = {},
): ByteString {
  const salt = options.salt ?? new Uint8Array([0x53, 0x9a, 0x2c, 0x71, 0xe4, 0x0b, 0x86, 0x1f]);
  const { key, iv } = deriveFor(password, salt, options);
  const ciphertext = cbc(key, iv).encrypt(toUint8Array(plaintext));
  return SALTED_MAGIC + fromUint8Array(salt) + fromUint8Array(ciphertext);
}

export type DecryptResult =
  { ok: true; plaintext: ByteString } | { ok: false; reason: 'bad-magic' | 'bad-decrypt' };

/** Decrypts an OpenSSL container. A wrong password fails the PKCS#7 padding check: `bad decrypt`. */
export function opensslDecrypt(
  container: ByteString,
  password: ByteString,
  options: EncOptions = {},
): DecryptResult {
  if (!container.startsWith(SALTED_MAGIC) || container.length < SALTED_MAGIC.length + 8) {
    return { ok: false, reason: 'bad-magic' };
  }
  const salt = toUint8Array(container.slice(SALTED_MAGIC.length, SALTED_MAGIC.length + 8));
  const body = toUint8Array(container.slice(SALTED_MAGIC.length + 8));
  if (body.length === 0 || body.length % 16 !== 0) return { ok: false, reason: 'bad-decrypt' };
  const { key, iv } = deriveFor(password, salt, options);
  try {
    return { ok: true, plaintext: fromUint8Array(cbc(key, iv).decrypt(body)) };
  } catch {
    return { ok: false, reason: 'bad-decrypt' };
  }
}
