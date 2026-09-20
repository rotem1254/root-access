import { digestHex } from '../../engine/crypto/digest';
import type { Level } from '../../engine/game/level';
import tamperedSealed from './files/tampered.csv?sealed';
import { asSealed } from '../_sealed';

// Kept sealed: the filesystem loader decodes it, so the flag never enters the level object.
const tampered = asSealed(tamperedSealed);

const BRIEF = `From: alex.mercer@novacorp.example
To: you@novacorp.example
Subject: The delivery does not add up

Chapter three. We have the how; now we need the proof.

A vendor delivered six CSV files to /srv/delivery, along with a signed manifest
(SHA256SUMS) listing what each file's checksum should be. Legal says the files
are untouched. I do not believe them.

A checksum is a fingerprint of a file's exact bytes. Change one byte and the
digest changes completely — which is the whole point: you cannot quietly edit a
file that someone has a checksum for.

  cd /srv/delivery
  sha256sum -c SHA256SUMS

Every file will report OK except the one that was modified after the manifest
was made. Read that file.

— Alex
`;

/** The vendor's six delivery files. One of them has been modified after signing. */
const CLEAN_FILES: readonly (readonly [name: string, content: string])[] = [
  [
    'q1-renewals.csv',
    'customer_id,region,plan,renewal\n4401,EMEA,growth,2026-01-12\n4402,AMER,starter,2026-02-03\n',
  ],
  [
    'q2-renewals.csv',
    'customer_id,region,plan,renewal\n4421,APAC,growth,2026-04-22\n4422,EMEA,enterprise,2026-05-30\n',
  ],
  [
    'q4-renewals.csv',
    'customer_id,region,plan,renewal\n4491,AMER,enterprise,2026-12-08\n4492,APAC,starter,2026-10-17\n',
  ],
  ['regions.csv', 'code,name\nEMEA,Europe Middle East Africa\nAPAC,Asia Pacific\nAMER,Americas\n'],
  ['plans.csv', 'code,seats,price\nstarter,10,290\ngrowth,50,1450\nenterprise,250,7900\n'],
];

const TAMPERED_NAME = 'q3-renewals.csv';

/**
 * The manifest as the vendor signed it: the honest digest of every clean file, plus the digest the
 * tampered file had *before* it was modified. Computed here so the level stays self-consistent.
 */
const ORIGINAL_Q3 =
  'customer_id,region,plan,renewal\n' +
  '4471,EMEA,enterprise,2026-08-01\n' +
  '4472,APAC,growth,2026-09-14\n' +
  '4473,EMEA,enterprise,2026-11-02\n' +
  '4474,AMER,growth,2026-07-19\n';

const MANIFEST = [
  ...CLEAN_FILES.map(([name, content]) => `${digestHex('sha256', content)}  ${name}`),
  `${digestHex('sha256', ORIGINAL_Q3)}  ${TAMPERED_NAME}`,
]
  .sort((a, b) => (a.slice(66) < b.slice(66) ? -1 : 1))
  .join('\n');

export const level08: Level = {
  id: '08-fingerprints',
  chapter: 3,
  title: 'Fingerprints',
  briefing:
    'A vendor delivered six files with a signed manifest of their SHA-256 checksums, and everyone ' +
    'insists nothing has been touched. A checksum is a fingerprint of a file’s exact bytes: ' +
    'change one byte and the digest changes completely, so a manifest is how you prove a file is ' +
    'the one that was delivered. Run the check, find the single file whose fingerprint no longer ' +
    'matches, and read what was added to it.',
  objective: 'Verify /srv/delivery against SHA256SUMS and read the file that fails.',
  debrief:
    'That is integrity checking, and it is why downloads ship with a checksum file. The attacker ' +
    'could edit the CSV, but they could not edit the signed manifest — so the change announced ' +
    'itself the moment anyone bothered to run `sha256sum -c`.',
  skills: ['sha256sum', 'sha256sum -c', 'file integrity'],
  startUser: 'analyst',
  startHost: 'corp-audit',
  startCwd: '/home/analyst',
  users: [{ name: 'analyst', uid: 1000, gecos: 'Security Analyst', password: 'analyst' }],
  fs: {
    '/home/analyst/brief.txt': { content: BRIEF, owner: 'analyst' },
    '/srv/delivery': { dir: true, mode: '0755', owner: 'root' },
    ...Object.fromEntries(
      CLEAN_FILES.map(([name, content]) => [
        `/srv/delivery/${name}`,
        { content, owner: 'root', mode: '0644' },
      ]),
    ),
    [`/srv/delivery/${TAMPERED_NAME}`]: { content: tampered, owner: 'root', mode: '0644' },
    '/srv/delivery/SHA256SUMS': { content: `${MANIFEST}\n`, owner: 'root', mode: '0444' },
  },
  flagHash: '4d7c0aee8d214b6dd6f6bdbea579af6fffb97577db48bc6d27a726d1423f8378',
  hints: [
    'Move into the delivery directory (`cd /srv/delivery`) and look at SHA256SUMS with `cat`. Each line is a SHA-256 digest and the file it belongs to.',
    'Let sha256sum do the comparing for you: `sha256sum -c SHA256SUMS`. It prints `OK` for each file whose bytes still match, and `FAILED` for any that do not.',
    'One file reports FAILED: q3-renewals.csv. Read it with `cat q3-renewals.csv` — something was appended after the manifest was signed, and the audit token there is the flag.',
  ],
  parTimeSec: 240,
  onCommand: (event, api) => {
    const say = (en: string, he: string): void =>
      api.echo(`\x1b[36m${api.locale === 'he' ? he : en}\x1b[0m`);
    if (
      event.name === 'sha256sum' &&
      event.args.some((a) => a === '-c' || a === '--check') &&
      api.once('checked')
    ) {
      say(
        'One file FAILS its checksum — that is the tampered delivery. Read that file.',
        'קובץ אחד נכשל בבדיקת ה-checksum — זהו המשלוח שזויף. קראו את הקובץ הזה.',
      );
    }
  },
};
