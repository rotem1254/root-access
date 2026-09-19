import type { Level } from '../../engine/game/level';
import { utf8Decode } from '../../engine/util/bytes';
import { unseal } from '../../engine/util/seal';
import rewardSealed from './files/reward.txt?sealed';
import { asSealed } from '../_sealed';

// The reward is NEVER placed in the filesystem, so it cannot be `cat`-ed. It is revealed only when
// the player has actually created, copied and renamed files — i.e. earned it.
const reward = asSealed(rewardSealed);

const WELCOME = `Lesson 8: shaping the filesystem.

So far you have looked at files. Now you will make and move them. Five verbs do
almost everything:

  mkdir NAME        make a new folder
  cp SRC DST        copy a file (SRC stays, a copy appears at DST)
  mv SRC DST        move OR rename a file (SRC is gone, it is now DST)
  rm FILE           delete a file (there is no undo!)
  touch FILE        create an empty file

Your task: restore a backup properly. Make a folder called vault, copy data.dat
into it, rename the copy to flag.txt, and delete the junk. Do it right and the
safe opens:

  mkdir vault
  cp data.dat vault/
  mv vault/data.dat vault/flag.txt
  rm junk.tmp
`;

const line = (locale: 'en' | 'he', en: string, he: string): string => (locale === 'he' ? he : en);

export const level00h: Level = {
  id: '00h-making-files',
  chapter: 0,
  title: 'Shaping Files',
  briefing:
    'Until now you have only looked at files; this lesson is about making and moving them. Five ' +
    'verbs cover almost everything: `mkdir` makes a folder, `cp` copies a file, `mv` moves or ' +
    'renames one, `rm` deletes one (no undo!), and `touch` creates an empty file. Your task is to ' +
    'restore a backup: make a folder called vault, copy data.dat into it, rename the copy to ' +
    'flag.txt, and delete the junk. When the workspace is clean, the safe opens.',
  objective: 'Use mkdir, cp, mv and rm to restore the backup; the safe reveals the flag.',
  debrief:
    'Creating, copying, moving and deleting files is the everyday work of using a computer from the ' +
    'command line — and the reason permissions matter so much. `mv` is both "move" and "rename"; ' +
    '`rm` is permanent, so real professionals pause before running it, especially with wildcards ' +
    'like `rm *`. `touch` is handy for creating a file or updating its timestamp.',
  skills: ['mkdir', 'cp', 'mv', 'rm', 'touch'],
  startUser: 'guest',
  startHost: 'trainer',
  startCwd: '/home/guest',
  users: [{ name: 'guest', uid: 1000, gecos: 'Trainee' }],
  motd: 'Training console — lesson 8.\n',
  fs: {
    '/home/guest/welcome.txt': { content: WELCOME, owner: 'guest' },
    // Raw material and clutter. Neither holds the flag: it is earned by doing the work.
    '/home/guest/data.dat': {
      content: 'raw backup data — nothing readable here yet\n',
      owner: 'guest',
    },
    '/home/guest/junk.tmp': { content: 'temporary junk, safe to delete\n', owner: 'guest' },
  },
  flagHash: 'd866b163e3fbe381e37c0530d9b0d9137adc66b2fc6896268028d58af1fac999',
  hints: [
    'Start by making the folder: `mkdir vault`. Then `ls` to see it appear.',
    'Copy the data in, then rename it: `cp data.dat vault/` and `mv vault/data.dat vault/flag.txt`.',
    'Renaming to vault/flag.txt opens the safe and prints the flag. Then `rm junk.tmp` to tidy up and `submit FLAG{...}`.',
  ],
  parTimeSec: 360,
  onCommand: (event, api) => {
    const say = (en: string, he: string): void =>
      api.echo(`\x1b[36m${line(api.locale, en, he)}\x1b[0m`);
    const arg = event.args.join(' ');

    // The safe opens the moment the player successfully renames the copy to vault/flag.txt —
    // which can only succeed after mkdir + cp, so reaching it proves the skills were used.
    if (
      event.name === 'mv' &&
      event.exitCode === 0 &&
      arg.includes('flag') &&
      api.once('revealed')
    ) {
      api.echo(`\x1b[32m${utf8Decode(unseal(reward))}\x1b[0m`);
      say(
        'Now clear the junk:  rm junk.tmp  — then submit the flag above.',
        'עכשיו נקו את הזבל:  rm junk.tmp  — ואז הגישו את הדגל שלמעלה.',
      );
      return;
    }
    // mv failed, usually because vault does not exist yet.
    if (event.name === 'mv' && event.exitCode !== 0 && api.once('mv-failed')) {
      say(
        'That path is not ready. Make the folder and copy the file first:  mkdir vault  then  cp data.dat vault/',
        'הנתיב לא מוכן. קודם צרו את התיקייה והעתיקו את הקובץ:  mkdir vault  ואז  cp data.dat vault/',
      );
      return;
    }
    if (event.name === 'mkdir' && event.exitCode === 0 && api.once('did-mkdir')) {
      say(
        'Folder made. Now copy the data into it:  cp data.dat vault/',
        'התיקייה נוצרה. עכשיו העתיקו אליה את הנתונים:  cp data.dat vault/',
      );
      return;
    }
    if (event.name === 'cp' && event.exitCode === 0 && api.once('did-cp')) {
      say(
        'Copied. Now rename the copy to reveal it:  mv vault/data.dat vault/flag.txt',
        'הועתק. עכשיו שנו את שם העותק כדי לחשוף אותו:  mv vault/data.dat vault/flag.txt',
      );
      return;
    }
    if (event.name === 'rm' && event.exitCode === 0 && api.once('did-rm')) {
      say(
        'Tidy. If you have the flag from the safe, submit it:  submit FLAG{...}',
        'מסודר. אם יש לכם את הדגל מהכספת, הגישו אותו:  submit FLAG{...}',
      );
      return;
    }
    const guided = new Set([
      'mkdir',
      'cp',
      'mv',
      'rm',
      'touch',
      'ls',
      'cat',
      'submit',
      'hint',
      'mission',
      'clear',
      'help',
    ]);
    if (!guided.has(event.name) && api.once('nudge')) {
      say(
        'No problem — start by making the folder:  mkdir vault',
        'אין בעיה — התחילו ביצירת התיקייה:  mkdir vault',
      );
    }
  },
};
