import type { Level } from '../../engine/game/level';
import type { HostDefinition } from '../../engine/system/host';
import dbFlagSealed from './files/dbflag.txt?sealed';
import jumpNotesSealed from './files/jumpnotes.txt?sealed';
import { asSealed } from '../_sealed';

const dbFlag = asSealed(dbFlagSealed);
const jumpNotes = asSealed(jumpNotesSealed);

const BRIEF = `From: alex.mercer@novacorp.example
To: you@novacorp.example
Subject: The database is on the other side

The exports came off corp-db01, 10.10.9.20. Try to reach it from where you are
and you will get nothing — the office LAN is not routed to the server segment.
That is deliberate, and it is the control we now have to get past legitimately.

There is one machine with a leg in both networks: corp-jump01 (10.10.0.5). That
is what a jump host is for. Your analyst account works there; the password
NetOps issued you is:

    an4lyst-jump-2026

So:
  ssh analyst@corp-jump01      (answer "yes" to the host key, then the password)
  then, from the jump host, reach 10.10.9.20

NetOps leave a crib sheet in the analyst home directory on that box. Read it
before you go further. When you are done on a host, "exit" walks you back.

— Alex
`;

const WS_NOTES = `Reminder to self
----------------
10.10.9.20 is NOT reachable from this desk. Stop trying.
Everything to the server segment goes through corp-jump01 (10.10.0.5).
`;

const HOSTS: readonly HostDefinition[] = [
  {
    // The pivot: one interface on each segment.
    hostname: 'corp-jump01',
    users: [
      { name: 'analyst', uid: 1000, gecos: 'Security Analyst', password: 'an4lyst-jump-2026' },
    ],
    motd: 'corp-jump01 — NetOps jump host. All sessions are recorded.\n',
    fs: {
      '/home/analyst/netops-notes.txt': { content: jumpNotes, owner: 'analyst', mode: '0600' },
    },
    net: {
      interfaces: [
        { name: 'eth0', ip: '10.10.0.5' },
        { name: 'eth1', ip: '10.10.9.5' },
      ],
      ports: [{ port: 22, product: 'OpenSSH', version: '8.9p1 Ubuntu-3ubuntu0.6' }],
    },
  },
  {
    // Server segment only: unreachable from the office LAN.
    hostname: 'corp-db01',
    users: [{ name: 'dbadmin', uid: 1002, gecos: 'Database Admin', password: 'Qu4rterlyExp0rt!' }],
    motd: 'corp-db01 — production database. Authorised access only.\n',
    fs: {
      '/opt/export': { dir: true, mode: '0750', owner: 'dbadmin' },
      '/opt/export/README': { content: dbFlag, owner: 'dbadmin', mode: '0640' },
    },
    net: {
      interfaces: [{ name: 'eth0', ip: '10.10.9.20' }],
      ports: [
        { port: 22, product: 'OpenSSH', version: '9.6p1 Ubuntu-3ubuntu13.5' },
        { port: 5432, product: 'PostgreSQL DB', version: '16.2' },
      ],
    },
  },
  {
    hostname: 'corp-fs-01',
    net: {
      interfaces: [{ name: 'eth0', ip: '10.10.0.20' }],
      ports: [{ port: 22, product: 'OpenSSH', version: '8.9p1 Ubuntu-3ubuntu0.6' }],
    },
  },
];

export const level06: Level = {
  id: '06-hop-the-fence',
  chapter: 2,
  title: 'Hop the Fence',
  briefing:
    'The customer exports came off corp-db01 (10.10.9.20), which sits in a separate server ' +
    'segment your workstation cannot route to — scan it and it looks dead. Exactly one machine ' +
    'bridges the two networks: the jump host corp-jump01. This is pivoting, the core move of ' +
    'lateral movement: you cannot reach the target, so you log in to something that can, and ' +
    'work from there. Your analyst password for the jump host is in the briefing; the database ' +
    'credentials are waiting on the jump host itself.',
  objective: 'Pivot through corp-jump01 to reach corp-db01 and read /opt/export/README.',
  debrief:
    'Network segmentation only holds if nothing bridges it. One dual-homed jump host, one reused ' +
    'password in a crib file, and the boundary is gone. This is why real defenders care so much ' +
    'about who can log in to the jump host — it is the whole fence.',
  skills: ['ssh', 'pivoting', 'network segmentation', 'exit'],
  startUser: 'analyst',
  startHost: 'corp-ws-09',
  startCwd: '/home/analyst',
  users: [{ name: 'analyst', uid: 1000, gecos: 'Security Analyst', password: 'analyst' }],
  fs: {
    '/home/analyst/brief.txt': { content: BRIEF, owner: 'analyst' },
    '/home/analyst/notes.txt': { content: WS_NOTES, owner: 'analyst' },
  },
  net: {
    interfaces: [{ name: 'eth0', ip: '10.10.0.9' }],
    gateway: '10.10.0.1',
    ports: [{ port: 22, product: 'OpenSSH', version: '8.9p1 Ubuntu-3ubuntu0.6' }],
  },
  hosts: HOSTS,
  flagHash: 'f21488898a3fed136256d29127489faffb58e39435d29e5124379efd6f91da19',
  hints: [
    'Prove the problem first: `nmap 10.10.9.20` from here reports the host as down, and `ssh dbadmin@10.10.9.20` says "No route to host". Your workstation has no path to 10.10.9.0/24 — you need a machine that does.',
    'Log in to the bridge with `ssh analyst@corp-jump01`. Answer `yes` to the host-key question, then use the password from brief.txt (an4lyst-jump-2026). Once you are on the jump host, `ip a` shows it has a second interface on 10.10.9.0/24.',
    'On the jump host read `cat /home/analyst/netops-notes.txt` for the dbadmin password, then `ssh dbadmin@10.10.9.20` and `cat /opt/export/README`. The flag is the signing key on that page.',
  ],
  parTimeSec: 480,
  onCommand: (event, api) => {
    const say = (en: string, he: string): void =>
      api.echo(`\x1b[36m${api.locale === 'he' ? he : en}\x1b[0m`);
    const arg = event.args.join(' ');
    // Trying to reach the segmented DB directly can't work — point at the pivot.
    if (
      event.name === 'ssh' &&
      arg.includes('10.10.9.20') &&
      event.exitCode !== 0 &&
      api.once('no-route')
    ) {
      say(
        'No route from here to 10.10.9.0/24. You need a machine that can see it — ssh to the jump host first.',
        'אין נתיב מכאן ל-10.10.9.0/24. צריך מכונה שרואה אותה — התחברו קודם ל-jump host ב-ssh.',
      );
      return;
    }
    if (
      event.name === 'ssh' &&
      arg.includes('corp-jump01') &&
      event.exitCode === 0 &&
      api.once('on-jump')
    ) {
      say(
        'You are on the jump host. It has a second interface into the server network — `ip a` shows it. Find the db credentials here.',
        'אתם על ה-jump host. יש לו ממשק שני אל רשת השרתים — `ip a` יראה אותו. מצאו כאן את פרטי ה-db.',
      );
      return;
    }
    if (
      event.name === 'ssh' &&
      arg.includes('dbadmin@') &&
      event.exitCode === 0 &&
      api.once('on-db')
    ) {
      say(
        'On corp-db01 now. Read the export it holds:  cat /opt/export/README',
        'עכשיו על corp-db01. קראו את הייצוא שהוא מחזיק:  cat /opt/export/README',
      );
    }
  },
};
