import type { Level } from '../../engine/game/level';
import flagSealed from './files/flag.txt?sealed';
import backupSealed from './files/portal.conf.bak?sealed';
import { asSealed } from '../_sealed';

const flag = asSealed(flagSealed);
const backup = asSealed(backupSealed);

const NOTES = `From: alex.mercer@novacorp.example
To: you@novacorp.example
Subject: Last step — the admin's files

The leaker used the "admin" account on this box. The evidence we need is in
admin's home directory, in a file only admin can read. As "guest" you can't
read it — try, and you'll get "Permission denied". That's correct behaviour,
not a puzzle to brute-force.

The way in is the way the attacker got in: a reused password. Somewhere on this
system a world-readable BACKUP file (*.bak) was saved with a password still in
it. Old backups are a classic mistake. Find it, and if that password also works
for the admin account, use su to become admin and read the file.

To search the whole filesystem for readable backups without drowning in
"Permission denied" noise, send the errors to /dev/null:

    find / -perm -o=r -name "*.bak" 2>/dev/null

— Alex
`;

export const level03: Level = {
  id: '03-permission-denied',
  chapter: 1,
  title: 'Permission Denied',
  briefing:
    "The evidence against the leaker sits in the admin account's home directory, in a file only " +
    'admin can read. As the guest account you will be refused — and that is exactly the point: file ' +
    'permissions mean some things cannot be read until you become the right user. The attacker got ' +
    'in by reusing a password found lying around. A world-readable backup file somewhere on this ' +
    'system still contains the admin password. Hunt it down with find (sending permission errors to ' +
    '/dev/null), then use su to become admin and read the flag.',
  objective:
    'Find the leaked admin password in a world-readable backup, su to admin, and read the flag.',
  debrief:
    'You climbed a privilege ladder the honest way: a credential left in a readable file let you ' +
    'authenticate as a more powerful user. This is one of the most common ways real intrusions ' +
    'escalate — and why secrets never belong in world-readable files.',
  skills: ['find -perm', 'find 2>/dev/null', 'file permissions', 'su'],
  startUser: 'guest',
  startHost: 'corp-portal-02',
  startCwd: '/home/guest',
  users: [
    { name: 'guest', uid: 1000, gecos: 'Guest Analyst' },
    { name: 'admin', uid: 1001, gecos: 'Portal Admin', password: 'R3dOct0ber!2026' },
  ],
  fs: {
    '/home/guest/notes.txt': { content: NOTES, owner: 'guest' },
    '/home/admin': { dir: true, owner: 'admin', mode: '0755' },
    '/home/admin/flag.txt': { content: flag, owner: 'admin', mode: '0400' },
    // The leaked backup: world-readable, tucked away where old configs pile up.
    '/opt/portal/releases/2025-11-09/portal.conf.bak': {
      content: backup,
      owner: 'admin',
      group: 'admin',
      mode: '0644',
    },
    // A decoy backup that is NOT world-readable, so the -perm test must matter.
    '/opt/portal/releases/2025-11-09/secrets.env.bak': {
      content: 'ADMIN_TOKEN=nope\n',
      owner: 'admin',
      mode: '0600',
    },
    '/etc/portal/portal.conf': {
      content: '[database]\nuser = admin\npassword_file = /run/secrets/portal\n',
      owner: 'root',
      mode: '0644',
    },
  },
  flagHash: '6d1bb97879a2bf2c89e4e254e765db7989ec30dbd5fff8e43eb8d9452b379bc4',
  hints: [
    'You cannot read /home/admin/flag.txt as guest — check its permissions with ls -l. You need to become admin. First, find a readable backup: find / -perm -o=r -name "*.bak" 2>/dev/null',
    'Read the backup that find turns up (the world-readable one under /opt/portal). It contains a password field. Note that the config says the DB admin login reuses the admin system password.',
    'Become admin with `su admin` and enter the password from the backup (R3dOct0ber!2026). Then `cat /home/admin/flag.txt` and submit the flag.',
  ],
  parTimeSec: 360,
};
