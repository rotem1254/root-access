import { opensslEncrypt } from '../../engine/crypto/openssl';
import type { Level } from '../../engine/game/level';
import { unseal } from '../../engine/util/seal';
import plaintextSealed from './files/plaintext.txt?sealed';
import { asSealed } from '../_sealed';

/** The passphrase; the note beside the archive stores it ROT13'd, which is not encryption. */
const PASSPHRASE = 'Quarter-Seal-2026';

/** Real AES-256-CBC in the OpenSSL container format, built at load from sealed content. */
const ARCHIVE = opensslEncrypt(unseal(asSealed(plaintextSealed)), PASSPHRASE, {
  salt: new Uint8Array([0x4e, 0x6f, 0x76, 0x61, 0x43, 0x6f, 0x72, 0x70]),
});

const BRIEF = `From: alex.mercer@novacorp.example
To: you@novacorp.example
Subject: The archive itself

We recovered the export archive: exports.enc. It is encrypted, and legal will
not accept "we think it contained customer data" — they want the contents.

Work out what it is before you try anything:
  file exports.enc        what does the tool think it is?
  xxd -l 16 exports.enc   look at the first bytes yourself

A file produced by "openssl enc" starts with the literal text Salted__ followed
by eight random salt bytes. Once you see that, you know the tool and the shape
of the command that opens it:

  openssl enc -d -aes-256-cbc -in exports.enc -k PASSPHRASE

Which leaves the passphrase. Whoever encrypted this left a note next to it,
passphrase.note, and "obscured" it by rotating the letters thirteen places.
ROT13 is not encryption — it is a party trick, and tr undoes it:

  tr 'A-Za-z' 'N-ZA-Mn-za-m' < passphrase.note

— Alex
`;

/** ROT13 of the passphrase — a rotation, not encryption. */
function rot13(text: string): string {
  return text.replace(/[a-zA-Z]/g, (char) => {
    const base = char <= 'Z' ? 65 : 97;
    return String.fromCharCode(((char.charCodeAt(0) - base + 13) % 26) + base);
  });
}

const NOTE = `Archive passphrase (do not leave this lying around):

    ${rot13(PASSPHRASE)}

Rotated thirteen places so it is not obvious at a glance.
`;

export const level10: Level = {
  id: '10-sealed-archive',
  chapter: 3,
  title: 'Sealed Archive',
  briefing:
    'The export archive has been recovered, and it is encrypted. Before reaching for tools, ' +
    'identify it: `file` and `xxd` will show you the literal text Salted__ at the start, which is ' +
    'the signature of `openssl enc`. That tells you exactly which command opens it. The ' +
    'passphrase was left in a note beside the archive, "hidden" with ROT13 — a thirteen-place ' +
    'letter rotation that `tr` undoes in one line. Encryption protects a file; a passphrase ' +
    'written down next to it does not.',
  objective: 'Identify exports.enc, recover the passphrase and decrypt the archive.',
  debrief:
    'Everything here was done right except the last step. AES-256 held perfectly — what failed ' +
    'was key management. And ROT13 is worth saying out loud: it hides nothing, because there is ' +
    'no key, only a fixed rotation anyone can reverse.',
  skills: ['file', 'xxd', 'tr (ROT13)', 'openssl enc -d'],
  startUser: 'analyst',
  startHost: 'corp-audit',
  startCwd: '/home/analyst',
  users: [{ name: 'analyst', uid: 1000, gecos: 'Security Analyst', password: 'analyst' }],
  fs: {
    '/home/analyst/brief.txt': { content: BRIEF, owner: 'analyst' },
    '/home/analyst/exports.enc': { bytes: ARCHIVE, owner: 'analyst', mode: '0600' },
    '/home/analyst/passphrase.note': { content: NOTE, owner: 'analyst', mode: '0600' },
  },
  flagHash: 'efad2c802215cafe70a5acc1ca2c4bf811187abfa6e6ca42953a1217f91a8c01',
  hints: [
    'Identify the file before trying to open it: `file exports.enc` and `xxd -l 16 exports.enc`. The first eight bytes spell Salted__, the header `openssl enc` writes.',
    "The passphrase is in passphrase.note, rotated thirteen places. Undo it with `tr 'A-Za-z' 'N-ZA-Mn-za-m' < passphrase.note` — ROT13 is its own inverse, so the same command also re-encodes it.",
    'With the passphrase, run `openssl enc -d -aes-256-cbc -in exports.enc -k Quarter-Seal-2026`. If you get "bad decrypt", the passphrase is wrong — check you decoded the note, not copied it.',
  ],
  parTimeSec: 420,
  onCommand: (event, api) => {
    const say = (en: string, he: string): void =>
      api.echo(`\x1b[36m${api.locale === 'he' ? he : en}\x1b[0m`);
    if (event.name === 'openssl' && event.exitCode !== 0 && api.once('bad-pass')) {
      say(
        'Wrong passphrase. The note is ROT13-encoded — decode it first with tr, then use that value.',
        'סיסמה שגויה. ההערה מקודדת ב-ROT13 — פענחו אותה קודם עם tr, ואז השתמשו בערך הזה.',
      );
      return;
    }
    if (event.name === 'tr' && event.exitCode === 0 && api.once('rot13')) {
      say(
        'That is the real passphrase. Decrypt now:  openssl enc -d -aes-256-cbc -in exports.enc -k <passphrase>',
        'זו הסיסמה האמיתית. פענחו עכשיו:  openssl enc -d -aes-256-cbc -in exports.enc -k <passphrase>',
      );
    }
  },
};
