import type { Level } from '../../engine/game/level';
import flagSealed from './files/flag.txt?sealed';
import { asSealed } from '../_sealed';

const flag = asSealed(flagSealed);

const WELCOME = `Lesson 6: becoming root.

Every Linux system has one all-powerful account called "root" (the superuser).
Some files belong only to root, and NOBODY else may read them — not even by
changing permissions, because you do not own them.

First, get your bearings:

  whoami       print your user name
  id           show your user and the groups you belong to

You are the "cadet" account, and you are in the "sudo" group — that means you
are trusted to borrow root's power for a single command:

  sudo COMMAND     run COMMAND as root (it asks for YOUR password)
  sudo -l          list what you are allowed to run

The flag is in /root/flag.txt, which only root can read. Try to read it
normally first, see it refused, then read it with sudo.

Your password is:  cadet
`;

const line = (locale: 'en' | 'he', en: string, he: string): string => (locale === 'he' ? he : en);

export const level00f: Level = {
  id: '00f-becoming-root',
  chapter: 0,
  title: 'Becoming Root',
  briefing:
    'Every Linux system has an all-powerful superuser called "root". Some files belong only to ' +
    'root, and no permission you can set will let you read them — you simply are not root. But a ' +
    "trusted user can borrow root's power for a single command with `sudo`, after proving who they " +
    'are with their own password. You are the "cadet" account (password: cadet), a member of the ' +
    '"sudo" group. Check who you are with `whoami` and `id`, try to read /root/flag.txt normally, ' +
    'then read it with `sudo`.',
  objective: 'Read the root-only file /root/flag.txt using sudo, then submit the flag.',
  debrief:
    'sudo is how real administrators do privileged work without logging in as root all day: one ' +
    'command at a time, authenticated with your own password, and logged. `sudo -l` tells you what ' +
    'you may run, and `id` tells you which groups grant it. This is the single most important — and ' +
    'most dangerous — command on a Linux box.',
  skills: ['whoami', 'id', 'sudo', 'sudo -l', 'privilege escalation'],
  startUser: 'cadet',
  startHost: 'trainer',
  startCwd: '/home/cadet',
  users: [{ name: 'cadet', uid: 1000, gecos: 'Cadet', groups: ['sudo'], password: 'cadet' }],
  motd: 'Training console — lesson 6.\n',
  fs: {
    '/home/cadet/welcome.txt': { content: WELCOME, owner: 'cadet' },
    // root's home and the flag inside it: owned by root, unreadable to anyone else.
    '/root': { dir: true, owner: 'root', mode: '0700' },
    '/root/flag.txt': { content: flag, owner: 'root', mode: '0600' },
  },
  flagHash: '4ae00fc6335e26e5d0f258a0f48c4954660b7bd6757e61332a043348c1c9d06e',
  hints: [
    'Start with `whoami` and `id`. You are "cadet", and `id` shows you are in the "sudo" group — that is your ticket.',
    'Reading it directly fails: `cat /root/flag.txt` is denied, because the file belongs to root and you are not root.',
    "Borrow root's power for one command: `sudo cat /root/flag.txt`, then type your password (cadet). Copy the FLAG{...} and `submit` it.",
  ],
  parTimeSec: 300,
  onCommand: (event, api) => {
    const say = (en: string, he: string): void =>
      api.echo(`\x1b[36m${line(api.locale, en, he)}\x1b[0m`);
    const arg = event.args.join(' ');
    const touchesFlag = arg.includes('/root/flag') || arg.includes('flag.txt');

    // Success: the flag was read as root via sudo.
    if (event.name === 'sudo' && touchesFlag && event.exitCode === 0 && api.once('sudo-ok')) {
      say(
        'That worked — you read it as root. Copy the FLAG{...} and submit it:  submit FLAG{...}',
        'זה עבד — קראתם אותו כ-root. העתיקו את ה-FLAG{...} והגישו:  submit FLAG{...}',
      );
      return;
    }
    // cat on the root file is denied — point at sudo.
    if (event.name === 'cat' && touchesFlag && event.exitCode !== 0 && api.once('cat-denied')) {
      say(
        'Permission denied — the file belongs to root. Borrow its power:  sudo cat /root/flag.txt',
        'הגישה נדחתה — הקובץ שייך ל-root. שאלו את כוחו:  sudo cat /root/flag.txt',
      );
      return;
    }
    if (event.name === 'whoami' && api.once('did-whoami')) {
      say(
        'You are "cadet". Now check your groups:  id',
        'אתם "cadet". עכשיו בדקו את הקבוצות שלכם:  id',
      );
      return;
    }
    if (event.name === 'id' && api.once('did-id')) {
      say(
        'See "sudo" in your groups? That lets you run commands as root. Try reading the file:  cat /root/flag.txt',
        'רואים "sudo" בין הקבוצות? זה מאפשר להריץ פקודות כ-root. נסו לקרוא את הקובץ:  cat /root/flag.txt',
      );
      return;
    }
    if (event.name === 'sudo' && event.args[0] === '-l' && api.once('did-sudo-l')) {
      say(
        'Good — you may run anything. Now read the file as root:  sudo cat /root/flag.txt',
        'יופי — אתם רשאים להריץ הכול. עכשיו קראו את הקובץ כ-root:  sudo cat /root/flag.txt',
      );
      return;
    }
    const guided = new Set([
      'whoami',
      'id',
      'cat',
      'sudo',
      'submit',
      'hint',
      'mission',
      'clear',
      'help',
      'ls',
    ]);
    if (!guided.has(event.name) && api.once('nudge')) {
      say(
        'No problem — start with  whoami  to see who you are.',
        'אין בעיה — התחילו עם  whoami  כדי לראות מי אתם.',
      );
    }
  },
};
