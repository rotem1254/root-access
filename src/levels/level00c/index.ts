import type { Level } from '../../engine/game/level';
import logbookSealed from './files/logbook.txt?sealed';
import { asSealed } from '../_sealed';

const logbook = asSealed(logbookSealed);

const WELCOME = `Lesson 3: searching inside a file.

The file logbook.txt has lots of lines, and reading all of them to find one is
slow. That is what "grep" is for: it prints only the lines that contain a word
you give it.

  grep WORD FILE      show only the lines in FILE that contain WORD

For example:  grep token logbook.txt
That prints just the line that mentions a token — and that line has your flag.
`;

const line = (locale: 'en' | 'he', en: string, he: string): string => (locale === 'he' ? he : en);

export const level00c: Level = {
  id: '00c-finding-text',
  chapter: 0,
  title: 'Finding a Needle',
  briefing:
    'Lesson 3. Files can be long, and scrolling through them to find one line is slow. `grep` ' +
    'searches for you: `grep WORD FILE` prints only the lines that contain WORD. The logbook here ' +
    'has many lines but only one mentions a "token" — search for it instead of reading everything.',
  objective: 'Use grep to find the one important line in logbook.txt.',
  debrief:
    'grep is how you find a needle in a haystack — a word in a file, a file full of files, or, ' +
    'later, an attacker in a log. Search first, read second.',
  skills: ['grep', 'cat'],
  startUser: 'guest',
  startHost: 'trainer',
  startCwd: '/home/guest',
  users: [{ name: 'guest', uid: 1000, gecos: 'Trainee' }],
  motd: 'Training console — lesson 3.\n',
  fs: {
    '/home/guest/welcome.txt': { content: WELCOME, owner: 'guest' },
    '/home/guest/logbook.txt': { content: logbook, owner: 'guest' },
  },
  flagHash: '1f3a4aca97efb8f36a600740b75d2159b009c3930c84e1cdd2824f1db0e2c1ac',
  hints: [
    'First read `cat welcome.txt` to see how to search. Then note that logbook.txt is long — you do not want to read all of it.',
    'Search the file for the important line: `grep token logbook.txt`. grep prints only the lines that contain the word "token".',
    'That line contains a FLAG{...}. Copy it and submit with `submit FLAG{...}`.',
  ],
  parTimeSec: 300,
  onCommand: (event, api) => {
    const say = (en: string, he: string): void =>
      api.echo(`\x1b[36m${line(api.locale, en, he)}\x1b[0m`);
    const arg = event.args.join(' ');

    if (event.name === 'cat' && arg.includes('logbook') && api.once('did-cat')) {
      say(
        'That is a lot of lines. Search it instead:  grep token logbook.txt',
        'אלה הרבה שורות. חפשו במקום זאת:  grep token logbook.txt',
      );
      return;
    }
    if (event.name === 'grep' && event.exitCode === 0 && api.once('did-grep')) {
      say(
        'That is the line — copy the FLAG{...} and submit it:  submit FLAG{...}',
        'זו השורה — העתיקו את ה-FLAG{...} והגישו:  submit FLAG{...}',
      );
      return;
    }
    if (event.name === 'cat' && arg.includes('welcome') && api.once('did-welcome')) {
      say(
        'Now try searching the logbook:  grep token logbook.txt',
        'עכשיו נסו לחפש ביומן:  grep token logbook.txt',
      );
      return;
    }
    const guided = new Set(['grep', 'cat', 'ls', 'submit', 'hint', 'mission', 'clear', 'help']);
    if (!guided.has(event.name) && api.once('nudge')) {
      say(
        'No problem — try  grep token logbook.txt  to find the important line.',
        'אין בעיה — נסו  grep token logbook.txt  כדי למצוא את השורה החשובה.',
      );
    }
  },
};
