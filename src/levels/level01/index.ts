import type { Level } from '../../engine/game/level';
import handoverSealed from './files/handover.txt?sealed';
import { asSealed } from '../_sealed';

const handover = asSealed(handoverSealed);

const WELCOME = `From: alex.mercer@novacorp.example
To: you@novacorp.example
Subject: Your first day

Welcome to the NovaCorp security team. We think someone inside the company has
been leaking customer data, and the previous analyst left in a hurry.

You're logged into one of their old workstations as the "guest" account. The
analyst told me they always left notes for whoever came next — but they liked
to keep them out of sight. Have a look around your home directory.

Everything you need for this first task is right here. Start with the files.

— Alex
`;

// base64 of the analyst's note; decodes to the second half of the flag.
const MEMO_B64 =
  'TmljZSB3b3JrIC0geW91IGZvdW5kIHRoZSBoaWRkZW4gaGFuZG92ZXIgZmlsZS4KClRoZSBTRUNP' +
  'TkQgaGFsZiBvZiB0aGUgZmxhZyBpczogIHBsNDFuX3MxZ2h0fQoKSm9pbiBpdCB0byB0aGUgZmly' +
  'c3QgaGFsZiBmcm9tIC5oYW5kb3ZlciBhbmQgc3VibWl0IHRoZSB3aG9sZSB0aGluZzoKICBzdWJt' +
  'aXQgRkxBR3suLi59Cg==\n';

export const level01: Level = {
  id: '01-hidden-in-plain-sight',
  chapter: 1,
  title: 'Hidden in Plain Sight',
  briefing:
    'NovaCorp suspects an insider is leaking customer data. You have inherited the previous ' +
    "analyst's workstation, logged in as the guest account. They were careful people who left " +
    'notes for whoever came next — but they liked to keep those notes hidden. Your first job is ' +
    'simply to find what they left you. On Linux, files whose names begin with a dot are hidden ' +
    'from a normal listing; `ls -la` shows them. Some notes are also encoded so they do not stand ' +
    'out at a glance.',
  objective: 'Find the hidden handover note, decode the memo, and submit the full flag.',
  debrief:
    'That is the whole game in miniature: look past what is shown by default, and decode what ' +
    'has been obscured. The leaker relied on people not looking closely. You looked closely.',
  skills: ['ls -la', 'cat', 'base64 -d'],
  startUser: 'guest',
  startHost: 'corp-ws-07',
  startCwd: '/home/guest',
  users: [{ name: 'guest', uid: 1000, gecos: 'Guest Analyst' }],
  fs: {
    '/home/guest/welcome.txt': { content: WELCOME, owner: 'guest' },
    '/home/guest/.handover': { content: handover, owner: 'guest', mode: '0600' },
    '/home/guest/memo.txt': { content: MEMO_B64, owner: 'guest' },
  },
  flagHash: '52761b8813f3faede4925c7054e3abc41730bc854fe54815858f807c964c61a6',
  hints: [
    'A plain `ls` hides some files. Try `ls -la` in your home directory to see everything, including names that start with a dot.',
    'Read the hidden file with `cat .handover`. It gives you the first half of the flag and tells you where the second half is.',
    'Decode the memo with `base64 -d memo.txt` to reveal the second half. Put it directly after the first half shown in `.handover`, then submit the whole thing, e.g. `submit FLAG{...}`.',
  ],
  parTimeSec: 120,
};
