import type { Level } from '../../engine/game/level';
import badgeSealed from './files/badge.txt?sealed';
import { asSealed } from '../_sealed';

const badge = asSealed(badgeSealed);

const WELCOME = `Hi, and welcome. This is a terminal.

A terminal is a place where you type commands and the computer does them. You
type one line, press Enter, and it answers. That is the whole idea.

You just used your first command: "cat" reads a file and prints it. You typed
"cat welcome.txt" and here is the file.

Two commands is all you need for now:
  ls    -> list the files that are here
  cat   -> read a file, e.g.  cat badge.txt

There is one more file here called badge.txt. Read it the same way:

    cat badge.txt

Take your time. You cannot break anything.
`;

/** Bilingual coaching line. */
const line = (locale: 'en' | 'he', en: string, he: string): string => (locale === 'he' ? he : en);

export const level00: Level = {
  id: '00-first-lesson',
  chapter: 0,
  title: 'Your First Lesson',
  briefing:
    'Never used a terminal before? Perfect — this is the place to start, and you cannot break ' +
    'anything. A terminal is just a box where you type a command, press Enter, and read what comes ' +
    'back. In this lesson you will learn exactly three things: `ls` to see what files are here, ' +
    '`cat` to read a file, and `submit` to hand in a flag. Follow the green prompt at the bottom; ' +
    'the game will guide you after every step. Whenever you are unsure, open the Hints tab.',
  objective: 'Learn the basics: list the files, read a file, and submit your first flag.',
  debrief:
    'That is the core loop of everything ahead: look around (`ls`), read what you find (`cat`), and ' +
    'act on it (`submit`). Every later level is just this loop with new commands. You are ready.',
  skills: ['ls', 'cat', 'submit'],
  startUser: 'guest',
  startHost: 'trainer',
  startCwd: '/home/guest',
  users: [{ name: 'guest', uid: 1000, gecos: 'Trainee' }],
  motd: 'Training console. Take your time — you cannot break anything here.\n',
  fs: {
    '/home/guest/welcome.txt': { content: WELCOME, owner: 'guest' },
    '/home/guest/badge.txt': { content: badge, owner: 'guest' },
  },
  flagHash: 'e6e2bcbda20941edfb9b8b6854568b767e6477344254263600c35ecf9f65291e',
  hints: [
    'This black screen is a terminal. You type a command and press Enter. Type `ls` (just those two letters) and press Enter — it lists the files here.',
    'To read a file, type `cat` then a space and the file name. Start with `cat welcome.txt` and press Enter.',
    'Read `cat badge.txt`. It shows a flag that looks like FLAG{...}. Copy the whole thing and hand it in with `submit`, for example `submit FLAG{...}`.',
  ],
  parTimeSec: 300,
  onCommand: (event, api) => {
    const say = (en: string, he: string): void =>
      api.echo(`\x1b[36m${line(api.locale, en, he)}\x1b[0m`);
    const name = event.name;
    const arg = event.args[event.args.length - 1] ?? '';

    // The player listed the directory: praise, then point at reading a file.
    if (name === 'ls' && api.once('did-ls')) {
      say(
        'Nice — those are the files here. Now read one: type  cat welcome.txt  and press Enter.',
        'יופי — אלה הקבצים כאן. עכשיו קראו קובץ: הקלידו  cat welcome.txt  ולחצו Enter.',
      );
      return;
    }
    if (name === 'cat' && arg.includes('welcome') && api.once('did-welcome')) {
      say(
        'Great, you can read files. There is one more: type  cat badge.txt  to get your flag.',
        'מצוין, אתם יודעים לקרוא קבצים. יש עוד אחד: הקלידו  cat badge.txt  כדי לקבל את הדגל.',
      );
      return;
    }
    if (name === 'cat' && arg.includes('badge') && api.once('did-badge')) {
      say(
        'Almost there! Copy the whole FLAG{...} above and hand it in:  submit FLAG{...}',
        'כמעט סיימתם! העתיקו את כל ה-FLAG{...} שלמעלה והגישו:  submit FLAG{...}',
      );
      return;
    }
    // pwd is a common first thing to try — explain it warmly.
    if (name === 'pwd' && api.once('did-pwd')) {
      say(
        'That path is where you are right now — your home folder. Now try  ls  to see what is in it.',
        'הנתיב הזה הוא איפה שאתם נמצאים — תיקיית הבית שלכם. עכשיו נסו  ls  כדי לראות מה יש בה.',
      );
      return;
    }
    // First unrecognised / empty attempt: a gentle nudge, once.
    const guided = new Set(['ls', 'cat', 'pwd', 'submit', 'hint', 'mission', 'clear', 'help']);
    if (!guided.has(name) && api.once('first-nudge')) {
      say(
        'No problem — nothing here can break. Start simple: type  ls  and press Enter.',
        'אין בעיה — כלום כאן לא יישבר. התחילו פשוט: הקלידו  ls  ולחצו Enter.',
      );
    }
  },
};
