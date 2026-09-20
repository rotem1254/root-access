import type { Level } from '../../engine/game/level';
import { utf8Decode } from '../../engine/util/bytes';
import { unseal } from '../../engine/util/seal';
import rewardSealed from './files/reward.txt?sealed';
import { asSealed } from '../_sealed';

// Revealed only when the miner is actually killed, so there is nothing to `cat` as a shortcut.
const reward = asSealed(rewardSealed);

const ROGUE_PID = 1337;

const WELCOME = `Lesson 10: running programs (processes).

Every program that runs is a "process" with a number, its PID. Two commands let
you see them and stop them:

  ps aux         list EVERY process: who owns it, how much CPU it uses, and the
                 full command line (the last column)
  kill PID       ask a process to exit  (a polite request it may ignore)
  kill -9 PID    force a process to stop (a request it CANNOT ignore)

Something on this machine is pegging the CPU. Find the process that does not
belong — check the %CPU and COMMAND columns — note its PID, and stop it. If a
polite kill does not work, force it with kill -9.

  ps aux
  kill <pid>        (then, if it is still there)  kill -9 <pid>
`;

const line = (locale: 'en' | 'he', en: string, he: string): string => (locale === 'he' ? he : en);

/** True when the kill event carried SIGKILL (by number or name), the only thing that ends the miner. */
function isForce(args: readonly string[]): boolean {
  if (
    args.some((a) => a === '-9' || a.toUpperCase() === '-KILL' || a.toUpperCase() === '-SIGKILL')
  ) {
    return true;
  }
  return args[0] === '-s' && ['9', 'KILL', 'SIGKILL'].includes((args[1] ?? '').toUpperCase());
}

export const level00j: Level = {
  id: '00j-processes',
  chapter: 0,
  title: 'Kill the Process',
  briefing:
    'Every running program is a process with a number, its PID. `ps aux` lists every process on the ' +
    'machine — its owner, its CPU and memory use, and its full command line — and `kill` stops one ' +
    'by PID. Something on this machine is pegging the CPU. Use `ps aux` to find the process that ' +
    'does not belong (watch the %CPU and COMMAND columns), then stop it with `kill`. A polite ' +
    '`kill` sends SIGTERM, which a process may ignore; `kill -9` sends SIGKILL, which it cannot.',
  objective: 'Find the rogue process with ps and stop it with kill; ending it reveals the flag.',
  debrief:
    'This is incident response in miniature: `ps aux` to see everything, spot the anomaly by its ' +
    'command line and CPU use, and stop it by PID. SIGTERM (plain kill) asks nicely; SIGKILL ' +
    '(kill -9) cannot be caught or ignored, so it always works — but it gives the program no chance ' +
    'to clean up, so reach for a plain kill first. `top` shows the same data, updating live.',
  skills: ['ps', 'ps aux', 'kill', 'kill -9', 'processes', 'signals'],
  startUser: 'guest',
  startHost: 'trainer',
  startCwd: '/home/guest',
  users: [{ name: 'guest', uid: 1000, gecos: 'Trainee' }],
  motd: 'Training console — lesson 10.\n',
  processes: [
    { pid: 880, user: 'guest', command: '-bash', tty: 'pts/0', stat: 'Ss', start: '09:02' },
    {
      pid: ROGUE_PID,
      user: 'guest',
      command: './kdevtmpfsi -o pool.example:3333',
      cpu: 97.4,
      mem: 6.1,
      vsz: 730400,
      rss: 90200,
      tty: '?',
      stat: 'Rl',
      start: '09:07',
      time: '7:42',
      stubborn: true,
    },
    { pid: 645, user: 'guest', command: '/usr/bin/gpg-agent --daemon', tty: '?', start: '09:02' },
  ],
  fs: {
    '/home/guest/welcome.txt': { content: WELCOME, owner: 'guest' },
  },
  flagHash: '18228cedc57b79f3294e4a8dd0a90736941ed515d7be02c1dbb65d2d7f2fa8ef',
  hints: [
    'List every process and look at the %CPU column: `ps aux`. One process is using almost all the CPU — that is the intruder.',
    'That line is a crypto-miner (./kdevtmpfsi …). Note its PID in the second column (1337) and stop it: `kill 1337`.',
    'It ignores a polite kill, so force it: `kill -9 1337`. That ends it and reveals the flag; then `submit FLAG{...}`.',
  ],
  parTimeSec: 360,
  onCommand: (event, api) => {
    const say = (en: string, he: string): void =>
      api.echo(`\x1b[36m${line(api.locale, en, he)}\x1b[0m`);
    const pid = String(ROGUE_PID);
    const killedRogue = event.name === 'kill' && event.exitCode === 0 && event.args.includes(pid);

    // SIGKILL on the miner ends it — the win.
    if (killedRogue && isForce(event.args) && api.once('revealed')) {
      api.echo(`\x1b[32m${utf8Decode(unseal(reward))}\x1b[0m`);
      say(
        'Copy the FLAG{...} above and submit it:  submit FLAG{...}',
        'העתיקו את ה-FLAG{...} שלמעלה והגישו:  submit FLAG{...}',
      );
      return;
    }
    // A polite kill: the stubborn miner shrugs it off. Point at kill -9.
    if (killedRogue && !isForce(event.args) && api.once('term-tried')) {
      say(
        `It ignored SIGTERM and is still running. Force it:  kill -9 ${pid}`,
        `הוא התעלם מ-SIGTERM ועדיין רץ. אלצו אותו:  kill -9 ${pid}`,
      );
      return;
    }
    // kill an unknown/other pid.
    if (event.name === 'kill' && event.exitCode !== 0 && api.once('kill-miss')) {
      say(
        `That is not the right process. Find the miner's PID again with  ps aux  — it is ${pid}.`,
        `זה לא התהליך הנכון. מצאו שוב את ה-PID של הכורה עם  ps aux  — הוא ${pid}.`,
      );
      return;
    }
    if (event.name === 'ps') {
      const bareOnly = !event.args.some((a) => /[aeAx]/.test(a.startsWith('-') ? a.slice(1) : a));
      if (bareOnly && api.once('bare-ps')) {
        say(
          'That only shows your terminal. See EVERY process:  ps aux',
          'זה מציג רק את הטרמינל שלכם. ראו את כל התהליכים:  ps aux',
        );
        return;
      }
      if (!bareOnly && api.once('ps-aux')) {
        say(
          `See the line using ~97% CPU (./kdevtmpfsi …)? That is the miner, PID ${pid}. Stop it:  kill ${pid}`,
          `רואים את השורה שמשתמשת ב-~97% CPU (./kdevtmpfsi …)? זה הכורה, PID ${pid}. עצרו אותו:  kill ${pid}`,
        );
        return;
      }
    }
    const guided = new Set([
      'ps',
      'kill',
      'top',
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
        'No problem — start by listing the processes:  ps aux',
        'אין בעיה — התחילו ברשימת התהליכים:  ps aux',
      );
    }
  },
};
