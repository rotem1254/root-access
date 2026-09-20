import type { Level } from '../../engine/game/level';
import { generateAuthLog, STAGED_PATH } from './authlog';
import stagedSealed from './files/staged.csv?sealed';
import { asSealed } from '../_sealed';

const staged = asSealed(stagedSealed);

const README = `From: alex.mercer@novacorp.example
To: you@novacorp.example
Subject: File server — suspicious login

Good work on the workstation. Now to the file server, corp-fs-01.

You're on the "analyst" account, which is in the "adm" group, so you can read
the system logs under /var/log. Somebody logged into a staff account from
OUTSIDE our network and copied a finance export somewhere it shouldn't be.

/var/log/auth.log has the whole story. Find the account that was brute-forced
and then successfully logged in from a single outside address, work out what
that session did, and read the file it left behind. The DLP tripwire stamped a
marker into that file — that's your flag.

The staff home directories are locked down (drwx--x--x): you can't list them,
so a wildcard search won't help. You'll need the EXACT path from the log.

— Alex
`;

const authLog = generateAuthLog();

export const level02: Level = {
  id: '02-needle-in-the-logs',
  chapter: 1,
  title: 'Needle in the Logs',
  briefing:
    'On the NovaCorp file server, a staff account was logged into from outside the company network ' +
    'and used to copy a finance export. The evidence is in /var/log/auth.log — over 600 lines of ' +
    'routine sessions, background brute-force noise, and, buried among them, the real break-in. You ' +
    'are on the "analyst" account, a member of the adm group, so you can read the log. Count the ' +
    'failed logins by source address to find the attacker, see which account they finally got into, ' +
    'then read what that session staged. The home directories are not listable, so you must recover ' +
    'the exact path from the log itself.',
  objective:
    "Find the compromised account's successful login, follow it to the staged file, and submit the flag inside.",
  debrief:
    'That counting pipeline — grep the failures, extract the field, sort | uniq -c | sort -rn — is ' +
    'exactly how real analysts surface a brute-force source out of a noisy log. And you read a file ' +
    'in a directory you could not list, because traversal (x) and listing (r) are different rights.',
  skills: ['grep', 'grep -oE', 'sort | uniq -c', 'sort -rn', 'pipes', 'cat'],
  startUser: 'analyst',
  startHost: 'corp-fs-01',
  startCwd: '/home/analyst',
  users: [
    { name: 'analyst', uid: 1001, gecos: 'SOC Analyst', groups: ['adm'] },
    { name: 'mreyes', uid: 1007, gecos: 'Morgan Reyes' },
    { name: 'jlin', uid: 1002, gecos: 'Jamie Lin' },
    { name: 'dpatel', uid: 1003, gecos: 'Dev Patel' },
  ],
  fs: {
    '/home/analyst/README.txt': { content: README, owner: 'analyst' },
    '/var/log/auth.log': { content: authLog, owner: 'root', group: 'adm', mode: '0640' },
    // Staff homes are traversable but not listable, like a locked-down real system.
    '/home/mreyes': { dir: true, owner: 'mreyes', mode: '0711' },
    '/home/mreyes/.cache': { dir: true, owner: 'mreyes', mode: '0711' },
    [STAGED_PATH]: { content: staged, owner: 'mreyes', mode: '0644' },
    '/srv/finance': { dir: true, owner: 'root', group: 'adm', mode: '0750' },
    '/srv/finance/q3-review.csv': {
      content: 'record_id,customer,plan\n1001,Northwind Traders,enterprise\n',
      owner: 'root',
      group: 'adm',
      mode: '0640',
    },
  },
  flagHash: '967b5301d2f0ccb8381c97fea60740c5675ae1c64482f326e84d81ee386c8f17',
  hints: [
    'Count the failed logins by source address. Try: grep "Failed password" /var/log/auth.log | grep -oE "from [0-9.]+" | sort | uniq -c | sort -rn. One address stands far above the noise.',
    'That address brute-forced one real account and then succeeded. Find the success: grep <that-ip> /var/log/auth.log | grep Accepted — note the username.',
    'Right after logging in, that user ran a sudo command. Find it with grep <user> /var/log/auth.log | grep COMMAND — it copied the export to a file under /home/mreyes/.cache. cat that exact path to read the flag.',
  ],
  parTimeSec: 420,
  onCommand: (event, api) => {
    const say = (en: string, he: string): void =>
      api.echo(`\x1b[36m${api.locale === 'he' ? he : en}\x1b[0m`);
    const arg = event.args.join(' ');
    // Trying to list a staff home fails by design — point back to the log, not a wildcard.
    if (
      event.name === 'ls' &&
      arg.includes('/home/') &&
      event.exitCode !== 0 &&
      api.once('home-denied')
    ) {
      say(
        'The staff homes are locked down — no listing. Recover the exact path from auth.log itself.',
        'תיקיות הבית של הצוות נעולות — אין רשימה. שחזרו את הנתיב המדויק מתוך auth.log עצמו.',
      );
      return;
    }
    if (
      event.name === 'cat' &&
      arg.includes(STAGED_PATH) &&
      event.exitCode === 0 &&
      api.once('read-loot')
    ) {
      say(
        'That is the staged export. The DLP tripwire stamped the marker inside — that is your flag.',
        'זהו הייצוא שהוכן. מלכודת ה-DLP הטביעה בפנים את הסימן — זה הדגל שלכם.',
      );
    }
  },
};
