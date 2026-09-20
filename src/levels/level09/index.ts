import { digestHex } from '../../engine/crypto/digest';
import type { Level } from '../../engine/game/level';
import notesSealed from './files/mreyes-notes.txt?sealed';
import { asSealed } from '../_sealed';

// Kept sealed: the filesystem loader decodes it, so the flag never enters the level object.
const notes = asSealed(notesSealed);

/** The password the wordlist recovers. Not a flag, so it may live in the source. */
const MREYES_PASSWORD = 'Sunflower2019!';

const BRIEF = `From: alex.mercer@novacorp.example
To: you@novacorp.example
Subject: A legacy hash dump

The old build panel stored its logins as bare MD5 hashes — no salt, nothing.
I pulled the table into hashes.txt on your box. One of those accounts is
mreyes, the account that ran the export.

You cannot reverse a hash. What you can do is guess: hash a candidate password
and see whether the digest matches. That is all cracking is, and it is why a
common password is worth nothing.

  cat hashes.txt                 look at what you have
  john --wordlist=/usr/share/wordlists/common.txt hashes.txt

john works out the hash type from its length (32 hex characters is MD5) or you
can tell it with --format=raw-md5. Cracked results are remembered, so
"john --show hashes.txt" reprints them.

mreyes reused that password everywhere, including their local login on this
machine. Once you have it, "su mreyes" and read their notes.

— Alex
`;

const WORDLIST = [
  '123456',
  'password',
  'qwerty',
  'letmein',
  'dragon',
  'monkey',
  'football',
  'iloveyou',
  'admin123',
  'welcome1',
  'Summer2020',
  'Password1',
  'novacorp',
  'Spring2021!',
  MREYES_PASSWORD,
  'Autumn2022!',
  'trustno1',
  'changeme',
  'sunshine',
  'baseball',
].join('\n');

/** The legacy panel's MD5 table. Only mreyes' password is in the wordlist. */
const HASH_TABLE = [
  `jhoskins:${digestHex('md5', 'a-passphrase-no-list-will-have')}`,
  `mreyes:${digestHex('md5', MREYES_PASSWORD)}`,
  `svc-build:${digestHex('md5', 'x8Qv-3Lm-not-in-any-wordlist')}`,
].join('\n');

export const level09: Level = {
  id: '09-the-wordlist',
  chapter: 3,
  title: 'The Wordlist',
  briefing:
    'An old build panel stored its logins as bare, unsalted MD5 hashes, and one of the accounts ' +
    'is the one that ran the suspicious export. A hash cannot be reversed — cracking means ' +
    'hashing candidate passwords and comparing the digests, which is exactly why a common ' +
    'password protects nothing and a long unusual one is safe. Crack the table with a wordlist, ' +
    'then use what you find: the same password was reused for the local login.',
  objective: 'Crack the hash table, then su to mreyes and read their notes.',
  debrief:
    'Two lessons in one. Unsalted MD5 means identical passwords produce identical hashes and a ' +
    'wordlist run takes seconds. Password reuse means one weak hash did not cost one account, it ' +
    'cost every place that password was used.',
  skills: ['john --wordlist', 'md5sum', 'hash identification', 'su'],
  startUser: 'analyst',
  startHost: 'corp-audit',
  startCwd: '/home/analyst',
  users: [
    { name: 'analyst', uid: 1000, gecos: 'Security Analyst', password: 'analyst' },
    { name: 'mreyes', uid: 1002, gecos: 'M. Reyes', password: MREYES_PASSWORD },
  ],
  fs: {
    '/home/analyst/brief.txt': { content: BRIEF, owner: 'analyst' },
    '/home/analyst/hashes.txt': { content: `${HASH_TABLE}\n`, owner: 'analyst', mode: '0600' },
    '/usr/share/wordlists': { dir: true, mode: '0755', owner: 'root' },
    '/usr/share/wordlists/common.txt': { content: `${WORDLIST}\n`, owner: 'root', mode: '0644' },
    '/home/mreyes/notes.txt': { content: notes, owner: 'mreyes', mode: '0600' },
  },
  flagHash: '7822b2f6f9ae2ac562774d0b9e8b032f4658470b33bd78dacaff860902c24f91',
  hints: [
    'Look at the file first: `cat hashes.txt`. Each line is `user:hash`, and each hash is 32 hex characters — that length means MD5.',
    'Run the wordlist against it: `john --wordlist=/usr/share/wordlists/common.txt hashes.txt`. Only one of the three accounts uses a password that appears in the list; the other two are not guessable this way.',
    'The cracked account is mreyes. Use that password with `su mreyes`, then `cat /home/mreyes/notes.txt` — the incident reference on that page is the flag.',
  ],
  parTimeSec: 420,
  onCommand: (event, api) => {
    const say = (en: string, he: string): void =>
      api.echo(`\x1b[36m${api.locale === 'he' ? he : en}\x1b[0m`);
    const arg = event.args.join(' ');
    if (event.name === 'john' && arg.includes('--wordlist') && api.once('cracking')) {
      say(
        'Run through the wordlist. See what fell:  john --show hashes.txt',
        'עברתם על רשימת המילים. ראו מה נפל:  john --show hashes.txt',
      );
      return;
    }
    if (event.name === 'su' && event.exitCode === 0 && api.once('became')) {
      say(
        'That password worked — you are mreyes now. Read the notes in the home directory.',
        'הסיסמה עבדה — עכשיו אתם mreyes. קראו את ההערות בתיקיית הבית.',
      );
    }
  },
};
