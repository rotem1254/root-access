import { armorMessage, armorPrivateKey, keyIdFor, type PgpKey } from '../../engine/crypto/gpgsim';
import type { Level } from '../../engine/game/level';
import { unseal } from '../../engine/util/seal';
import messageSealed from './files/message.txt?sealed';
import { asSealed } from '../_sealed';

const UID = 'Alex Mercer <alex.mercer@novacorp.example>';
const PASSPHRASE = 'ledger-oak-quiet-42';

const KEY: PgpKey = {
  keyId: keyIdFor(UID),
  uid: UID,
  passphrase: PASSPHRASE,
  created: '2026-01-04',
};

const MESSAGE = armorMessage(unseal(asSealed(messageSealed)), KEY);

const BRIEF = `From: alex.mercer@novacorp.example
To: you@novacorp.example
Subject: Last one — read it with my key

The write-up is in message.asc, encrypted to my key. Two things travel
separately, and you need both:

  alex-private.asc   the private key (couriered to your box)
  the passphrase     ${PASSPHRASE}   (in this mail, on a different channel)

That separation is the point. The passphrase alone is useless without the key,
and the key alone is useless without the passphrase.

Try the obvious thing first and watch it fail:

  gpg -d message.asc              -> "decryption failed: No secret key"

gpg can only use keys that are in your keyring, so import it, confirm it is
there, then decrypt:

  gpg --import alex-private.asc
  gpg --list-secret-keys
  gpg -d message.asc              (it will ask for the passphrase)

— Alex
`;

export const level11: Level = {
  id: '11-signed-and-sealed',
  chapter: 3,
  title: 'Signed and Sealed',
  briefing:
    "The final report is encrypted to Alex's PGP key. Public-key encryption splits the secret in " +
    'two: the private key file and the passphrase that unlocks it, delivered over different ' +
    'channels so that intercepting one gets you nothing. gpg can only use keys that are in your ' +
    'keyring, so decryption fails with "No secret key" until you import it. Import the key, ' +
    'confirm it is there, then decrypt the message and close the case.',
  objective: 'Import the private key and decrypt message.asc.',
  debrief:
    'You have finished the investigation. Note what actually protected this message: not secrecy ' +
    'about the algorithm, which is public, but a key you hold and a passphrase you know, sent ' +
    'separately. That is the whole idea, and it is why key management — not cipher choice — is ' +
    'where real systems fail.',
  skills: ['gpg --import', 'gpg --list-secret-keys', 'gpg -d', 'key management'],
  startUser: 'analyst',
  startHost: 'corp-audit',
  startCwd: '/home/analyst',
  users: [{ name: 'analyst', uid: 1000, gecos: 'Security Analyst', password: 'analyst' }],
  fs: {
    '/home/analyst/brief.txt': { content: BRIEF, owner: 'analyst' },
    '/home/analyst/alex-private.asc': {
      content: armorPrivateKey(KEY),
      owner: 'analyst',
      mode: '0600',
    },
    '/home/analyst/message.asc': { content: MESSAGE, owner: 'analyst', mode: '0600' },
  },
  flagHash: '0addecee447b6a26e78f609fb7ff42e1066225e6ca4dcbf9176f23a039ce9f4a',
  hints: [
    'Try `gpg -d message.asc` first and read the error: "decryption failed: No secret key". gpg will only use keys that are in your keyring, and yours is empty — `gpg --list-secret-keys` confirms it.',
    'Import the key file you were given: `gpg --import alex-private.asc`. Run `gpg --list-secret-keys` again and you should see Alex Mercer and a key id.',
    'Now `gpg -d message.asc` works. It asks for the passphrase — it is in brief.txt (ledger-oak-quiet-42). The case seal at the bottom of the message is the flag.',
  ],
  parTimeSec: 360,
  onCommand: (event, api) => {
    const say = (en: string, he: string): void =>
      api.echo(`\x1b[36m${api.locale === 'he' ? he : en}\x1b[0m`);
    const arg = event.args.join(' ');
    if (event.name === 'gpg' && arg.includes('-d') && event.exitCode !== 0 && api.once('no-key')) {
      say(
        "No secret key to decrypt with yet. Import Alex's private key first:  gpg --import alex-private.asc",
        'עדיין אין מפתח סודי לפענוח. ייבאו קודם את המפתח הפרטי של אלכס:  gpg --import alex-private.asc',
      );
      return;
    }
    if (
      event.name === 'gpg' &&
      arg.includes('--import') &&
      event.exitCode === 0 &&
      api.once('imported')
    ) {
      say(
        'Key imported. Now decrypt with the passphrase:  gpg --passphrase <pass> -d message.asc',
        'המפתח יובא. עכשיו פענחו עם ה-passphrase:  gpg --passphrase <pass> -d message.asc',
      );
    }
  },
};
