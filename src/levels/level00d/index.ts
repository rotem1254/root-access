import type { Level } from '../../engine/game/level';
import type { FSEntry } from '../../engine/fs/definition';
import keycardSealed from './files/keycard.txt?sealed';
import { asSealed } from '../_sealed';

const keycard = asSealed(keycardSealed);

const WELCOME = `Lesson 4: pipes.

A pipe is the | character. It takes the output of one command and feeds it into
another, so you can combine simple tools into something powerful.

There are lots of files here — too many to scan by eye. Instead of reading the
whole "ls" list, pipe it into grep to keep only what you want:

  ls | grep key

That lists every file, then keeps only the names containing "key". One file
stands out. Read it to get your flag.
`;

const line = (locale: 'en' | 'he', en: string, he: string): string => (locale === 'he' ? he : en);

/** A pile of decoy files so the plain `ls` list is genuinely long. */
const decoys: Record<string, FSEntry> = {};
for (let i = 1; i <= 16; i++) {
  const name = String(i).padStart(2, '0');
  decoys[`/home/guest/note-${name}.txt`] = {
    content: `Routine note #${i}. Nothing important here.\n`,
    owner: 'guest',
  };
}

export const level00d: Level = {
  id: '00d-pipes',
  chapter: 0,
  title: 'Connect the Pipes',
  briefing:
    'Lesson 4, the last of the basics. The pipe symbol `|` sends one command’s output into ' +
    'another, letting you chain simple tools together. This folder has too many files to scan by ' +
    'eye, so instead of reading the whole `ls` list, pipe it into `grep` to filter it: ' +
    '`ls | grep key`. Find the file that stands out and read it.',
  objective: 'Pipe ls into grep to find the key file, then read it.',
  debrief:
    'Pipes are the heart of the command line: small tools, chained with `|`, beat one big tool. ' +
    '`ls | grep`, `cat file | grep word`, `grep x log | wc -l` — same idea every time. That is the ' +
    'end of the basics. You now know how to look, move, read, search and combine. On to the case.',
  skills: ['pipes (|)', 'grep', 'ls'],
  startUser: 'guest',
  startHost: 'trainer',
  startCwd: '/home/guest',
  users: [{ name: 'guest', uid: 1000, gecos: 'Trainee' }],
  motd: 'Training console — lesson 4.\n',
  fs: {
    '/home/guest/welcome.txt': { content: WELCOME, owner: 'guest' },
    '/home/guest/keycard.txt': { content: keycard, owner: 'guest' },
    ...decoys,
  },
  flagHash: '975c131c10af2977590d4653fe89b568a17b77a5cf3d1de646addca6a9323673',
  hints: [
    'Type `ls` — notice how many files there are. Reading them one by one is no fun.',
    'Filter the list with a pipe: `ls | grep key`. The `|` sends the file list into grep, which keeps only names containing "key".',
    'That points at keycard.txt. Read it with `cat keycard.txt` and submit the FLAG{...} inside.',
  ],
  parTimeSec: 300,
  onCommand: (event, api) => {
    const say = (en: string, he: string): void =>
      api.echo(`\x1b[36m${line(api.locale, en, he)}\x1b[0m`);
    const arg = event.args.join(' ');

    // grep running means they used a pipe (ls | grep ...); point them at the file.
    if (event.name === 'grep' && api.once('did-pipe')) {
      say(
        'That is the pipe working. It points at keycard.txt — read it:  cat keycard.txt',
        'זה הצינור בפעולה. הוא מצביע על keycard.txt — קראו אותו:  cat keycard.txt',
      );
      return;
    }
    if (event.name === 'ls' && api.once('did-ls')) {
      say(
        'That is a long list. Filter it with a pipe:  ls | grep key',
        'זו רשימה ארוכה. סננו אותה עם צינור:  ls | grep key',
      );
      return;
    }
    if (event.name === 'cat' && arg.includes('keycard') && api.once('did-keycard')) {
      say(
        'Almost there! Copy the FLAG{...} and submit it:  submit FLAG{...}',
        'כמעט סיימתם! העתיקו את ה-FLAG{...} והגישו:  submit FLAG{...}',
      );
      return;
    }
    const guided = new Set(['ls', 'grep', 'cat', 'submit', 'hint', 'mission', 'clear', 'help']);
    if (!guided.has(event.name) && api.once('nudge')) {
      say(
        'No problem — start with  ls  , then filter it:  ls | grep key',
        'אין בעיה — התחילו עם  ls  , ואז סננו:  ls | grep key',
      );
    }
  },
};
