import type { Level } from '../../engine/game/level';
import lockedSealed from './files/locked.txt?sealed';
import { asSealed } from '../_sealed';

const locked = asSealed(lockedSealed);

const WELCOME = `Lesson 5: permissions.

Type  ls -l  and look at the start of each line — something like  -rw-r--r-- .
Those letters are the file's permissions: r = read, w = write, x = run. They are
listed for the owner, then the group, then everyone else.

The file locked.txt has NO permissions at all ( ---------- ), so even you cannot
read it yet. But you own it, so you are allowed to change that:

  chmod +r locked.txt      add read permission
  chmod 644 locked.txt     set read/write for you, read for others

Add read permission, then read the file.
`;

const line = (locale: 'en' | 'he', en: string, he: string): string => (locale === 'he' ? he : en);

export const level00e: Level = {
  id: '00e-permissions',
  chapter: 0,
  title: 'Who Can Read It',
  briefing:
    'Lesson 5, and the last of the basics. Every file carries permissions — who may read (r), ' +
    'write (w) and run (x) it — shown at the start of each `ls -l` line, like `-rw-r--r--`. The ' +
    'file locked.txt has none at all, so even you cannot read it; but you own it, so you can grant ' +
    'yourself read access with `chmod`. Add read permission, then read the file.',
  objective: 'Give yourself read permission on locked.txt with chmod, then read it.',
  debrief:
    'Permissions are the backbone of Linux security: they decide who can touch what. `ls -l` reads ' +
    'them, `chmod` changes them, and you can only change files you own. Later levels turn this ' +
    'around — files you are NOT allowed to read are the whole challenge.',
  skills: ['ls -l', 'chmod', 'permissions'],
  startUser: 'guest',
  startHost: 'trainer',
  startCwd: '/home/guest',
  users: [{ name: 'guest', uid: 1000, gecos: 'Trainee' }],
  motd: 'Training console — lesson 5.\n',
  fs: {
    '/home/guest/welcome.txt': { content: WELCOME, owner: 'guest' },
    // No permissions at all: the owner must add read access before cat works.
    '/home/guest/locked.txt': { content: locked, owner: 'guest', mode: '0000' },
  },
  flagHash: 'c69e5897ce7f4370a41cb5131c41d07de5471feb5a657273a9d61c9cfd1ab09f',
  hints: [
    'Type `ls -l` and look at locked.txt — the `----------` at the start means it has no permissions, not even read.',
    'You own the file, so you can add read permission: `chmod +r locked.txt` (or `chmod 644 locked.txt`).',
    'Now `cat locked.txt` works. Copy the FLAG{...} it shows and submit it with `submit FLAG{...}`.',
  ],
  parTimeSec: 300,
  onCommand: (event, api) => {
    const say = (en: string, he: string): void =>
      api.echo(`\x1b[36m${line(api.locale, en, he)}\x1b[0m`);
    const arg = event.args.join(' ');

    if (event.name === 'chmod' && event.exitCode === 0 && api.once('did-chmod')) {
      say(
        'Permission added. Now read it:  cat locked.txt',
        'ההרשאה נוספה. עכשיו קראו אותו:  cat locked.txt',
      );
      return;
    }
    // cat before chmod fails (no read permission) — explain what to do.
    if (
      event.name === 'cat' &&
      arg.includes('locked') &&
      event.exitCode !== 0 &&
      api.once('cat-denied')
    ) {
      say(
        'It has no read permission yet. Add it first:  chmod +r locked.txt',
        'עדיין אין לו הרשאת קריאה. הוסיפו אותה קודם:  chmod +r locked.txt',
      );
      return;
    }
    if (
      event.name === 'cat' &&
      arg.includes('locked') &&
      event.exitCode === 0 &&
      api.once('cat-ok')
    ) {
      say(
        'There it is — copy the FLAG{...} and submit it:  submit FLAG{...}',
        'הנה הוא — העתיקו את ה-FLAG{...} והגישו:  submit FLAG{...}',
      );
      return;
    }
    if (event.name === 'ls' && api.once('did-ls')) {
      say(
        'See the ---------- next to locked.txt? That is "no permissions". Add read:  chmod +r locked.txt',
        'רואים את ה---------- ליד locked.txt? זה "אין הרשאות". הוסיפו קריאה:  chmod +r locked.txt',
      );
      return;
    }
    const guided = new Set(['ls', 'chmod', 'cat', 'submit', 'hint', 'mission', 'clear', 'help']);
    if (!guided.has(event.name) && api.once('nudge')) {
      say(
        'No problem — start with  ls -l  to see the permissions.',
        'אין בעיה — התחילו עם  ls -l  כדי לראות את ההרשאות.',
      );
    }
  },
};
