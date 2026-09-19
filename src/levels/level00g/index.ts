import type { Level } from '../../engine/game/level';
import vaultSealed from './files/vault.bak?sealed';
import { asSealed } from '../_sealed';

const vault = asSealed(vaultSealed);

const WELCOME = `Lesson 7: finding files.

A real machine has thousands of files in nested folders. Opening them one by one
with cd and ls would take forever. Instead you SEARCH, with find:

  find . -name vault.bak       look for a file called vault.bak, here and in
                               every folder below (the . means "here")
  find . -name "*.bak"         match a pattern — every name ending in .bak
                               (put quotes around the * so the shell keeps it)

Somewhere below your home is a file named vault.bak. You do NOT know which
folder — so do not go hunting by hand. Find it by name, then read it with cat
and the path find prints.
`;

const line = (locale: 'en' | 'he', en: string, he: string): string => (locale === 'he' ? he : en);

export const level00g: Level = {
  id: '00g-finding-files',
  chapter: 0,
  title: 'The Search',
  briefing:
    'Real systems hold thousands of files in nested folders, and opening them one by one with `cd` ' +
    'and `ls` is hopeless. You search instead, with `find`: it walks a whole directory tree and ' +
    'prints every path that matches. A file named vault.bak is buried somewhere below your home ' +
    'directory — you do not know where. Use `find . -name vault.bak` to locate it, then read it ' +
    'with `cat` and the path find shows you.',
  objective: 'Locate the buried file vault.bak with find, read it, and submit the flag.',
  debrief:
    'find is how you locate anything on a real machine — configs, logs, backups. `find / -name ... ' +
    '2>/dev/null` searches the whole system and hides the "Permission denied" noise. And the move ' +
    'that builds on the last lesson: `find / -perm -4000 -type f 2>/dev/null` lists every setuid ' +
    'program (they run as their owner, often root) — the first thing an attacker checks for a way up.',
  skills: ['find', 'find -name', 'wildcards', 'file search'],
  startUser: 'guest',
  startHost: 'trainer',
  startCwd: '/home/guest',
  users: [{ name: 'guest', uid: 1000, gecos: 'Trainee' }],
  motd: 'Training console — lesson 7.\n',
  fs: {
    '/home/guest/welcome.txt': { content: WELCOME, owner: 'guest' },
    // Some decoy files and folders, so the tree is worth searching rather than eyeballing.
    '/home/guest/notes': { dir: true, owner: 'guest' },
    '/home/guest/notes/todo.txt': { content: 'buy milk\nlearn find\n', owner: 'guest' },
    '/home/guest/notes/ideas.txt': { content: 'a game that teaches Linux\n', owner: 'guest' },
    '/home/guest/archive': { dir: true, owner: 'guest' },
    '/home/guest/archive/2023': { dir: true, owner: 'guest' },
    '/home/guest/archive/2023/reports': { dir: true, owner: 'guest' },
    '/home/guest/archive/2023/reports/summary.txt': {
      content: 'nothing important here\n',
      owner: 'guest',
    },
    '/home/guest/archive/2023/backups': { dir: true, owner: 'guest' },
    // The target, buried four folders deep.
    '/home/guest/archive/2023/backups/vault.bak': { content: vault, owner: 'guest' },
  },
  flagHash: 'b497b88aaf61ffc5097e1d6e0db776cb81dade1933550181946a4d7223644273',
  hints: [
    'Do not search by hand. From your home directory, let find do it: `find . -name vault.bak` (the . means "start here and go down").',
    'find prints the path, something like `./archive/2023/backups/vault.bak`. Read it: `cat ./archive/2023/backups/vault.bak`.',
    'Copy the FLAG{...} the file shows and submit it: `submit FLAG{...}`. (Tip: `find . -name "*.bak"` finds it by pattern too.)',
  ],
  parTimeSec: 300,
  onCommand: (event, api) => {
    const say = (en: string, he: string): void =>
      api.echo(`\x1b[36m${line(api.locale, en, he)}\x1b[0m`);
    const arg = event.args.join(' ');
    const findsVault = arg.includes('vault') || arg.includes('.bak');

    // A find that targets the backup succeeded — point at reading the result.
    if (event.name === 'find' && findsVault && event.exitCode === 0 && api.once('find-ok')) {
      say(
        'That is the path. Now read it:  cat ./archive/2023/backups/vault.bak',
        'זה הנתיב. עכשיו קראו אותו:  cat ./archive/2023/backups/vault.bak',
      );
      return;
    }
    // find used but not aimed at the target yet — nudge toward the right name.
    if (event.name === 'find' && !findsVault && api.once('find-generic')) {
      say(
        'Good — that is the idea. Now search for the backup by name:  find . -name vault.bak',
        'יופי — זה הרעיון. עכשיו חפשו את הגיבוי לפי שם:  find . -name vault.bak',
      );
      return;
    }
    if (
      event.name === 'cat' &&
      arg.includes('vault.bak') &&
      event.exitCode === 0 &&
      api.once('cat-ok')
    ) {
      say(
        'There it is — copy the FLAG{...} and submit it:  submit FLAG{...}',
        'הנה הוא — העתיקו את ה-FLAG{...} והגישו:  submit FLAG{...}',
      );
      return;
    }
    // Hunting by hand with ls/cd — steer them to find.
    if ((event.name === 'ls' || event.name === 'cd') && api.once('nudge-find')) {
      say(
        'The file is buried deep — searching by hand is slow. Let find do it:  find . -name vault.bak',
        'הקובץ קבור עמוק — חיפוש ידני איטי. תנו ל-find לעשות את זה:  find . -name vault.bak',
      );
      return;
    }
    const guided = new Set([
      'find',
      'cat',
      'ls',
      'cd',
      'submit',
      'hint',
      'mission',
      'clear',
      'help',
    ]);
    if (!guided.has(event.name) && api.once('nudge')) {
      say(
        'No problem — the tool for this level is  find . -name vault.bak',
        'אין בעיה — הכלי לשלב הזה הוא  find . -name vault.bak',
      );
    }
  },
};
