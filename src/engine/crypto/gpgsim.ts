import { base64Decode, base64Encode } from '../util/base64';
import { digestHex } from './digest';
import { opensslDecrypt, opensslEncrypt } from './openssl';
import type { ByteString } from '../util/bytes';

/**
 * A deliberately simplified OpenPGP stand-in. Real OpenPGP (RSA/ECC key packets, session keys,
 * MDC, signature subpackets) is far out of scope; what transfers to a real system is the
 * *workflow* — import a key, decrypt with its passphrase, verify a signature — so that is what is
 * modelled. The man page says so plainly.
 *
 * A "private key" is a labelled blob; the message body is AES-encrypted (genuinely) under a key
 * derived from the key id and the passphrase.
 */

export const PRIVATE_KEY_HEADER = '-----BEGIN PGP PRIVATE KEY BLOCK-----';
export const PRIVATE_KEY_FOOTER = '-----END PGP PRIVATE KEY BLOCK-----';
export const MESSAGE_HEADER = '-----BEGIN PGP MESSAGE-----';
export const MESSAGE_FOOTER = '-----END PGP MESSAGE-----';

export interface PgpKey {
  keyId: string;
  uid: string;
  /** Passphrase protecting the private key. */
  passphrase: string;
  created: string;
}

/** The 16-hex-digit key id OpenPGP shows, derived from the uid so it is stable. */
export function keyIdFor(uid: string): string {
  return digestHex('sha1', uid).slice(0, 16).toUpperCase();
}

/** Serializes a private key block (armoured, like a real export). */
export function armorPrivateKey(key: PgpKey): string {
  const payload = base64Encode(JSON.stringify(key));
  const lines = payload.match(/.{1,64}/g) ?? [payload];
  return `${PRIVATE_KEY_HEADER}\n\n${lines.join('\n')}\n${PRIVATE_KEY_FOOTER}\n`;
}

export function parsePrivateKey(text: string): PgpKey | null {
  if (!text.includes(PRIVATE_KEY_HEADER)) return null;
  const body = text
    .slice(
      text.indexOf(PRIVATE_KEY_HEADER) + PRIVATE_KEY_HEADER.length,
      text.indexOf(PRIVATE_KEY_FOOTER),
    )
    .replace(/[\s\n]/g, '');
  const decoded = base64Decode(body);
  if (!decoded.ok) return null;
  try {
    const parsed = JSON.parse(decoded.bytes) as PgpKey;
    return typeof parsed.keyId === 'string' && typeof parsed.uid === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

/** The AES password protecting a message: the recipient's key id plus its passphrase. */
function messageSecret(key: PgpKey): string {
  return `${key.keyId}:${key.passphrase}`;
}

export function armorMessage(plaintext: ByteString, key: PgpKey): string {
  const encrypted = opensslEncrypt(plaintext, messageSecret(key));
  const payload = base64Encode(`${key.keyId}\n${encrypted}`);
  const lines = payload.match(/.{1,64}/g) ?? [payload];
  return `${MESSAGE_HEADER}\n\n${lines.join('\n')}\n${MESSAGE_FOOTER}\n`;
}

export type PgpDecryptResult =
  | { ok: true; plaintext: ByteString; keyId: string }
  | { ok: false; reason: 'not-a-message' | 'no-secret-key' | 'bad-passphrase'; keyId?: string };

export function decryptMessage(
  armored: string,
  keys: readonly PgpKey[],
  passphrase: string,
): PgpDecryptResult {
  if (!armored.includes(MESSAGE_HEADER)) return { ok: false, reason: 'not-a-message' };
  const body = armored
    .slice(armored.indexOf(MESSAGE_HEADER) + MESSAGE_HEADER.length, armored.indexOf(MESSAGE_FOOTER))
    .replace(/[\s\n]/g, '');
  const decodedResult = base64Decode(body);
  if (!decodedResult.ok) return { ok: false, reason: 'not-a-message' };
  const decoded = decodedResult.bytes;
  const newline = decoded.indexOf('\n');
  if (newline < 0) return { ok: false, reason: 'not-a-message' };
  const keyId = decoded.slice(0, newline);
  const container = decoded.slice(newline + 1);
  const key = keys.find((candidate) => candidate.keyId === keyId);
  if (!key) return { ok: false, reason: 'no-secret-key', keyId };
  const result = opensslDecrypt(container, `${keyId}:${passphrase}`);
  if (!result.ok) return { ok: false, reason: 'bad-passphrase', keyId };
  return { ok: true, plaintext: result.plaintext, keyId };
}
