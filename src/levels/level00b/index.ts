import type { Level } from '../../engine/game/level';
import secretSealed from './files/secret.txt?sealed';
import { asSealed } from '../_sealed';

const secret = asSealed(secretSealed);

const WELCOME = `Lesson 2: moving between folders.

Files are kept inside folders (also called directories). Right now you are in
your home folder. Look at the list from "ls": one of the items is a folder
called "projects" — folders usually have no dot-extension.

  cd projects   step INTO the projects folder
  ls            list what is inside it
  cd ..         step back OUT to where you were
  pwd           print where you are right now

Go into "projects" and read the file you find there.
`;

const line = (locale: 'en' | 'he', en: string, he: string): string => (locale === 'he' ? he : en);
const inProjects = (cwd: string): boolean => cwd.endsWith('/projects');

export const level00b: Level = {
  id: '00b-moving-around',
  chapter: 0,
  title: 'Moving Around',
  briefing:
    'Lesson 2. Files live inside folders (directories), and you move between them with `cd`. ' +
    '`cd projects` steps into a folder, `ls` shows what is inside, `cd ..` steps back out, and ' +
    '`pwd` prints where you are. Your task: step into the "projects" folder and read the file ' +
    'waiting there. The game will guide you at each step.',
  objective: 'Step into the projects folder with cd and read the file inside it.',
  debrief:
    'That is how you navigate a machine: `ls` to look, `cd` to move in, `cd ..` to move out, `pwd` ' +
    'when you lose track. Folders can nest as deep as you like, and these four commands get you ' +
    'anywhere.',
  skills: ['cd', 'ls', 'pwd'],
  startUser: 'guest',
  startHost: 'trainer',
  startCwd: '/home/guest',
  users: [{ name: 'guest', uid: 1000, gecos: 'Trainee' }],
  motd: 'Training console — lesson 2.\n',
  fs: {
    '/home/guest/welcome.txt': { content: WELCOME, owner: 'guest' },
    '/home/guest/projects': { dir: true, owner: 'guest' },
    '/home/guest/projects/secret.txt': { content: secret, owner: 'guest' },
  },
  flagHash: '82953b52d3680a89f75d7bfd2c667c069d1bfa19ef735ce8c4a0e7874a1a1256',
  hints: [
    'Type `ls` to see what is here. One item, "projects", is a folder. Step into it with `cd projects`.',
    'Now that you are inside projects, type `ls` again to see the file there. (Type `pwd` any time to check where you are.)',
    'Read the file with `cat secret.txt`, then submit the FLAG{...} it shows with `submit FLAG{...}`.',
  ],
  parTimeSec: 300,
  onCommand: (event, api) => {
    const say = (en: string, he: string): void =>
      api.echo(`\x1b[36m${line(api.locale, en, he)}\x1b[0m`);
    const arg = event.args[event.args.length - 1] ?? '';

    if (event.name === 'cd' && inProjects(event.cwd) && api.once('did-cd')) {
      say(
        'You are inside the projects folder now. Type  ls  to see what is in it.',
        'אתם עכשיו בתוך תיקיית projects. הקלידו  ls  כדי לראות מה יש בה.',
      );
      return;
    }
    if (event.name === 'ls') {
      if (inProjects(event.cwd) && api.once('ls-projects')) {
        say(
          'There it is — secret.txt. Read it with  cat secret.txt',
          'הנה הוא — secret.txt. קראו אותו עם  cat secret.txt',
        );
      } else if (!inProjects(event.cwd) && api.once('ls-home')) {
        say(
          '"projects" is a folder. Step into it with  cd projects',
          '"projects" היא תיקייה. היכנסו אליה עם  cd projects',
        );
      }
      return;
    }
    if (event.name === 'cat' && arg.includes('secret') && api.once('did-secret')) {
      say(
        'Almost done! Copy the FLAG{...} above and submit it:  submit FLAG{...}',
        'כמעט סיימתם! העתיקו את ה-FLAG{...} שלמעלה והגישו:  submit FLAG{...}',
      );
      return;
    }
    if (event.name === 'pwd' && api.once('did-pwd')) {
      say(
        'That line is your current folder. Use  cd projects  to go in, or  ls  to look around.',
        'השורה הזו היא התיקייה הנוכחית שלכם. השתמשו ב-  cd projects  כדי להיכנס, או ב-  ls  כדי להסתכל.',
      );
      return;
    }
    const guided = new Set([
      'ls',
      'cd',
      'pwd',
      'cat',
      'submit',
      'hint',
      'mission',
      'clear',
      'help',
    ]);
    if (!guided.has(event.name) && api.once('nudge')) {
      say(
        'No problem — start with  ls  to see what is here, then  cd projects  to go in.',
        'אין בעיה — התחילו עם  ls  כדי לראות מה יש, ואז  cd projects  כדי להיכנס.',
      );
    }
  },
};
