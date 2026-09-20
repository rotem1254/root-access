import type { Level } from '../../engine/game/level';
import { utf8Decode } from '../../engine/util/bytes';
import { unseal } from '../../engine/util/seal';
import rewardSealed from './files/reward.txt?sealed';
import { asSealed } from '../_sealed';

// Revealed only when the correct variable is exported, so reading config.txt is not a shortcut.
const reward = asSealed(rewardSealed);

const REQUIRED = 'BACKUP_KEY=unlock-2026';

// Not secret (it is only the config value, not the flag), so it lives inline as ordinary file text.
const CONFIG = `backup tool configuration
==========================

The backup tool refuses to run until the environment variable BACKUP_KEY is
set to the value below (this is how many real tools read their secrets):

    BACKUP_KEY = unlock-2026

Set it in your shell with:

    export BACKUP_KEY=unlock-2026
`;

const WELCOME = `Lesson 11: the environment.

Your shell keeps a set of named values called environment variables, and hands
them to every program it runs. Three commands are all you need:

  env                  list every environment variable
  echo $HOME           print ONE variable's value (the $ means "the value of")
  export NAME=value    set a variable and pass it to programs you run

Programs often read their settings and secrets from these. The backup tool here
refuses to run until BACKUP_KEY is set. The required value is written in
config.txt — read it, then export the variable:

  cat config.txt
  export BACKUP_KEY=unlock-2026
`;

const line = (locale: 'en' | 'he', en: string, he: string): string => (locale === 'he' ? he : en);

export const level00k: Level = {
  id: '00k-environment',
  chapter: 0,
  title: 'The Environment',
  briefing:
    'Your shell keeps a set of named values — environment variables — and hands them to every ' +
    'program it runs. `env` lists them, `echo $NAME` prints one, and `export NAME=value` sets one. ' +
    'Programs read their settings and secrets from them. The backup tool on this machine refuses to ' +
    'run until the variable BACKUP_KEY is set to the right value, which is written in config.txt. ' +
    'Read the config, then `export` the variable to run the tool.',
  objective: 'Read config.txt and export BACKUP_KEY with the right value to run the backup tool.',
  debrief:
    'Environment variables are how programs are configured without editing them: PATH tells the ' +
    'shell where to find commands, HOME is your directory, and countless tools read API keys, ' +
    'database URLs and options from the environment. `env` shows them, `export` sets them — and ' +
    'because secrets often live there, a leaked environment (or `env` output) can be a real find.',
  skills: ['env', 'echo $VAR', 'export', 'environment variables'],
  startUser: 'guest',
  startHost: 'trainer',
  startCwd: '/home/guest',
  users: [{ name: 'guest', uid: 1000, gecos: 'Trainee' }],
  motd: 'Training console — lesson 11.\n',
  fs: {
    '/home/guest/welcome.txt': { content: WELCOME, owner: 'guest' },
    '/home/guest/config.txt': { content: CONFIG, owner: 'guest' },
  },
  flagHash: '16f1468d9b76186468022c9a678be5f9bcb15356224671d42794c1165631c215',
  hints: [
    'See your environment variables with `env`. The tool needs one more: BACKUP_KEY.',
    'The value is in config.txt — read it: `cat config.txt`.',
    'Now set it: `export BACKUP_KEY=unlock-2026`. That runs the tool and reveals the flag; then `submit FLAG{...}`.',
  ],
  parTimeSec: 360,
  onCommand: (event, api) => {
    const say = (en: string, he: string): void =>
      api.echo(`\x1b[36m${line(api.locale, en, he)}\x1b[0m`);
    const arg = event.args.join(' ');

    // The tool unlocks the moment the correct variable is exported.
    if (event.name === 'export' && event.args.includes(REQUIRED) && api.once('revealed')) {
      api.echo(`\x1b[32m${utf8Decode(unseal(reward))}\x1b[0m`);
      say(
        'Copy the FLAG{...} above and submit it:  submit FLAG{...}',
        'העתיקו את ה-FLAG{...} שלמעלה והגישו:  submit FLAG{...}',
      );
      return;
    }
    // export of BACKUP_KEY, but the wrong value.
    if (
      event.name === 'export' &&
      arg.includes('BACKUP_KEY=') &&
      !event.args.includes(REQUIRED) &&
      api.once('wrong-value')
    ) {
      say(
        'Right variable, wrong value. The exact value is in config.txt:  cat config.txt',
        'המשתנה הנכון, ערך שגוי. הערך המדויק נמצא ב-config.txt:  cat config.txt',
      );
      return;
    }
    if (event.name === 'cat' && arg.includes('config') && api.once('did-cat')) {
      say(
        'There is the value. Set it in your shell:  export BACKUP_KEY=unlock-2026',
        'הנה הערך. הגדירו אותו ב-shell:  export BACKUP_KEY=unlock-2026',
      );
      return;
    }
    if (event.name === 'env' && api.once('did-env')) {
      say(
        'Those are your variables. The tool needs BACKUP_KEY — its value is in config.txt (cat config.txt).',
        'אלה המשתנים שלכם. הכלי צריך את BACKUP_KEY — הערך שלו נמצא ב-config.txt (cat config.txt).',
      );
      return;
    }
    const guided = new Set([
      'env',
      'echo',
      'export',
      'cat',
      'ls',
      'submit',
      'hint',
      'mission',
      'clear',
      'help',
    ]);
    if (!guided.has(event.name) && api.once('nudge')) {
      say(
        'No problem — start by listing your environment:  env',
        'אין בעיה — התחילו ברשימת הסביבה שלכם:  env',
      );
    }
  },
};
