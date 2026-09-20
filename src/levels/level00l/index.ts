import type { Level } from '../../engine/game/level';
import type { HostDefinition } from '../../engine/system/host';
import flagSealed from './files/flag.txt?sealed';
import { asSealed } from '../_sealed';

const flag = asSealed(flagSealed);

const TARGET_IP = '10.10.0.20';

const WELCOME = `Lesson 12: talking to other machines (the network).

Real work happens across machines. Four commands take you from "what is out
there?" to "I'm in":

  ip a                 show your own network addresses
  ping ${TARGET_IP}      is that machine reachable? (Ctrl+C to stop)
  nmap ${TARGET_IP}      which services (ports) is it running?
  ssh operator@${TARGET_IP}   log in and get a shell on it

There is a machine called vault-01 at ${TARGET_IP}. Find your address, check it
is reachable, scan it to see that SSH (port 22) is open, then log in as
"operator" and read the flag on it.

  The operator password is:  network-2026
  (On the first connection ssh asks you to confirm the host key — answer "yes".)
`;

const line = (locale: 'en' | 'he', en: string, he: string): string => (locale === 'he' ? he : en);

const HOSTS: readonly HostDefinition[] = [
  {
    hostname: 'vault-01',
    users: [{ name: 'operator', uid: 1000, gecos: 'Operator', password: 'network-2026' }],
    net: {
      interfaces: [{ name: 'eth0', ip: TARGET_IP }],
      ports: [{ port: 22, product: 'OpenSSH', version: '9.6p1 Ubuntu-3ubuntu13.5' }],
    },
    fs: {
      '/home/operator/flag.txt': { content: flag, owner: 'operator', mode: '0644' },
    },
  },
];

export const level00l: Level = {
  id: '00l-networking',
  chapter: 0,
  title: 'Reach the Machine',
  briefing:
    'Real work spans machines, and four commands take you from "what is out there?" to "I am in". ' +
    '`ip a` shows your own addresses, `ping` checks whether another machine is reachable, `nmap` ' +
    'scans it for open services (ports), and `ssh` logs you into one. A machine called vault-01 ' +
    `sits at ${TARGET_IP}. Find your address, confirm it is reachable, scan it to see that SSH ` +
    '(port 22) is open, then `ssh operator@' +
    TARGET_IP +
    '` (password: network-2026) and read the flag on it.',
  objective: `Ping, scan and SSH into vault-01 (${TARGET_IP}) as operator, then read the flag.`,
  debrief:
    'That sequence — find your address, check reachability, scan for services, then connect — is the ' +
    'opening move of almost every network engagement. `nmap` is how you learn what a machine offers; ' +
    '`ssh` is how you get a shell on it; `exit` returns you to where you started. From here, whole ' +
    'chapters are about pivoting across a network like this.',
  skills: ['ip a', 'ping', 'nmap', 'ssh', 'networking'],
  startUser: 'guest',
  startHost: 'workstation',
  startCwd: '/home/guest',
  users: [{ name: 'guest', uid: 1000, gecos: 'Trainee' }],
  motd: 'Training console — lesson 12.\n',
  net: {
    interfaces: [{ name: 'eth0', ip: '10.10.0.10' }],
    ports: [{ port: 22, product: 'OpenSSH', version: '9.6p1 Ubuntu-3ubuntu13.5' }],
  },
  hosts: HOSTS,
  fs: {
    '/home/guest/welcome.txt': { content: WELCOME, owner: 'guest' },
  },
  flagHash: '5f0b34bb2fb40788bd2fb451d4e317d0e7d077ff69a71e1a824f7a6ceef8ac54',
  hints: [
    `Check your own address with \`ip a\`, then see if the vault answers: \`ping ${TARGET_IP}\` (Ctrl+C to stop it).`,
    `Scan it to see what is open: \`nmap ${TARGET_IP}\`. Port 22 (ssh) is your way in.`,
    `Log in: \`ssh operator@${TARGET_IP}\`, answer "yes", enter network-2026, then \`cat flag.txt\` and submit the flag.`,
  ],
  parTimeSec: 420,
  onCommand: (event, api) => {
    const say = (en: string, he: string): void =>
      api.echo(`\x1b[36m${line(api.locale, en, he)}\x1b[0m`);

    // Logged in successfully — ssh switched us onto the vault.
    if (event.name === 'ssh' && event.exitCode === 0 && api.once('did-ssh')) {
      say(
        'You are on vault-01 now. Read the flag:  cat flag.txt',
        'אתם על vault-01 עכשיו. קראו את הדגל:  cat flag.txt',
      );
      return;
    }
    if (event.name === 'ssh' && event.exitCode !== 0 && api.once('ssh-failed')) {
      say(
        `Not in yet. Try:  ssh operator@${TARGET_IP}  — answer "yes", then the password network-2026.`,
        `עדיין לא נכנסתם. נסו:  ssh operator@${TARGET_IP}  — ענו "yes", ואז הסיסמה network-2026.`,
      );
      return;
    }
    if (event.name === 'nmap' && event.exitCode === 0 && api.once('did-nmap')) {
      say(
        `Port 22/ssh is open. Log in:  ssh operator@${TARGET_IP}  (password: network-2026)`,
        `פורט 22/ssh פתוח. התחברו:  ssh operator@${TARGET_IP}  (סיסמה: network-2026)`,
      );
      return;
    }
    if (event.name === 'ping' && api.once('did-ping')) {
      say(
        `It answers, so it is reachable. Now see what it runs:  nmap ${TARGET_IP}`,
        `הוא עונה, אז הוא נגיש. עכשיו ראו מה הוא מריץ:  nmap ${TARGET_IP}`,
      );
      return;
    }
    if ((event.name === 'ip' || event.name === 'ifconfig') && api.once('did-ip')) {
      say(
        `That is your address (10.10.0.10). Is the vault up?  ping ${TARGET_IP}`,
        `זו הכתובת שלכם (10.10.0.10). האם הכספת פעילה?  ping ${TARGET_IP}`,
      );
      return;
    }
    if (event.name === 'cat' && event.args.join(' ').includes('flag') && event.exitCode === 0) {
      // The remote flag file already tells them to submit; no extra nudge needed.
      return;
    }
    const guided = new Set([
      'ip',
      'ifconfig',
      'ping',
      'nmap',
      'ssh',
      'cat',
      'ls',
      'exit',
      'submit',
      'hint',
      'mission',
      'clear',
      'help',
    ]);
    if (!guided.has(event.name) && api.once('nudge')) {
      say(
        'No problem — start by finding your own address:  ip a',
        'אין בעיה — התחילו במציאת הכתובת שלכם:  ip a',
      );
    }
  },
};
