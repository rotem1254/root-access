import type { Level } from '../../engine/game/level';
import { utf8Decode } from '../../engine/util/bytes';
import { unseal } from '../../engine/util/seal';
import rewardSealed from './files/reward.txt?sealed';
import { asSealed } from '../_sealed';

// The reward is never placed in the filesystem, so `cat sessions.log` shows only noise. It is
// revealed when the player collapses the log's duplicates with uniq — the skill this level teaches.
const reward = asSealed(rewardSealed);

/** A noisy connection log: a handful of machines, each connecting many times. 120 lines total. */
function buildLog(): string {
  const hosts = [
    'alpha-01',
    'bravo-02',
    'charlie-03',
    'delta-04',
    'echo-05',
    'foxtrot-06',
    'golf-07',
    'hotel-08',
  ];
  const lines: string[] = [];
  // Give each host a different number of connections, so `uniq -c | sort -rn` has a clear winner.
  const counts = [31, 24, 19, 15, 12, 9, 6, 4];
  hosts.forEach((host, index) => {
    for (let n = 0; n < (counts[index] ?? 5); n++) {
      lines.push(`connection accepted host=${host} port=22`);
    }
  });
  return lines.join('\n') + '\n';
}

const WELCOME = `Lesson 9: making sense of too much text.

Real logs have thousands of lines. You do not read them — you MEASURE and BOIL
them down with a few tools joined by pipes ( | ):

  wc -l FILE            count how many lines FILE has
  head -n 5 FILE        show the first 5 lines
  tail -n 5 FILE        show the last 5 lines
  sort FILE             put identical lines next to each other
  uniq                  collapse each run of identical lines to one
  uniq -c               ...and count how many were in each run

sessions.log is a flood of connection lines from just a few machines. Count the
flood, then collapse it to the distinct machines:

  wc -l sessions.log
  sort sessions.log | uniq -c

Collapse the noise and the analysis console gives up its flag.
`;

const line = (locale: 'en' | 'he', en: string, he: string): string => (locale === 'he' ? he : en);

export const level00i: Level = {
  id: '00i-text-processing',
  chapter: 0,
  title: 'Boiling It Down',
  briefing:
    'Real logs run to thousands of lines; you never read them, you measure and summarise them. A ' +
    'few tools joined by pipes ( | ) do it: `wc -l` counts lines, `head`/`tail` peek at the start ' +
    'or end, `sort` groups identical lines together, and `uniq` collapses each group to one (with ' +
    '`-c`, it counts them). sessions.log is a flood of connection lines from only a few machines. ' +
    'Count it with `wc -l`, then collapse it with `sort sessions.log | uniq -c` — and the analysis ' +
    'console gives up its flag.',
  objective: 'Collapse the duplicate log lines with sort | uniq to unlock the flag.',
  debrief:
    'This is the analyst pipeline: `sort file | uniq -c | sort -rn` turns a wall of log lines into a ' +
    'ranked tally, so the busiest host — or a brute-force source, or the one anomaly — jumps to the ' +
    'top. `wc` measures, `head`/`tail` sample, `sort` orders, `uniq` deduplicates. You will reach ' +
    'for this combination constantly in real security work.',
  skills: ['wc', 'head', 'tail', 'sort', 'uniq', 'pipes'],
  startUser: 'analyst',
  startHost: 'trainer',
  startCwd: '/home/analyst',
  users: [{ name: 'analyst', uid: 1000, gecos: 'Trainee' }],
  motd: 'Training console — lesson 9.\n',
  fs: {
    '/home/analyst/welcome.txt': { content: WELCOME, owner: 'analyst' },
    '/home/analyst/sessions.log': { content: buildLog(), owner: 'analyst' },
  },
  flagHash: '7883fad05ad08699c439b1e1f93d4bc0608f3ad4b3c38a8b65663f3ac947f205',
  hints: [
    'First measure the flood: `wc -l sessions.log` tells you how many lines there are (a lot).',
    'Identical lines must be adjacent before uniq can collapse them, so sort first: `sort sessions.log | uniq`.',
    'Add `-c` to count each machine: `sort sessions.log | uniq -c`. Collapsing the noise unlocks the flag; then `submit FLAG{...}`.',
  ],
  parTimeSec: 360,
  onCommand: (event, api) => {
    const say = (en: string, he: string): void =>
      api.echo(`\x1b[36m${line(api.locale, en, he)}\x1b[0m`);

    // uniq collapses the duplicates — the skill this level is about. Reward it.
    if (event.name === 'uniq' && event.exitCode === 0 && api.once('revealed')) {
      api.echo(`\x1b[32m${utf8Decode(unseal(reward))}\x1b[0m`);
      say(
        'Copy the FLAG{...} above and submit it:  submit FLAG{...}',
        'העתיקו את ה-FLAG{...} שלמעלה והגישו:  submit FLAG{...}',
      );
      return;
    }
    if (event.name === 'wc' && event.exitCode === 0 && api.once('did-wc')) {
      say(
        'That is a lot of lines. Now collapse the duplicates:  sort sessions.log | uniq -c',
        'זה הרבה שורות. עכשיו כווצו את הכפילויות:  sort sessions.log | uniq -c',
      );
      return;
    }
    // sort alone, without piping into uniq — nudge to the next stage.
    if (event.name === 'sort' && event.exitCode === 0 && api.once('did-sort')) {
      say(
        'Sorted — now the identical lines sit together. Pipe them into uniq:  sort sessions.log | uniq -c',
        'ממוין — עכשיו השורות הזהות צמודות. העבירו אותן ל-uniq:  sort sessions.log | uniq -c',
      );
      return;
    }
    // cat floods the screen and never shows a flag — steer to the tools.
    if (event.name === 'cat' && api.once('did-cat')) {
      say(
        'Too much to read, and no flag in there. Measure and collapse instead:  wc -l sessions.log',
        'יותר מדי לקרוא, ואין שם דגל. במקום זה מדדו וכווצו:  wc -l sessions.log',
      );
      return;
    }
    const guided = new Set([
      'wc',
      'head',
      'tail',
      'sort',
      'uniq',
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
        'No problem — start by counting the lines:  wc -l sessions.log',
        'אין בעיה — התחילו בספירת השורות:  wc -l sessions.log',
      );
    }
  },
};
