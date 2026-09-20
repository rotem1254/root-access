import type { Level } from '../../engine/game/level';
import type { HostDefinition } from '../../engine/system/host';
import { utf8Decode } from '../../engine/util/bytes';
import { unseal } from '../../engine/util/seal';
import rewardSealed from './files/reward.txt?sealed';
import { asSealed } from '../_sealed';

// The flag is echoed only once the staged file is recovered, so nothing on disk can be cat-ed for it.
const reward = asSealed(rewardSealed);

const RECOVER_TOKEN = 'nova-7731';

const BRIEF = `From: alex.mercer@novacorp.example
To: you@novacorp.example
Subject: corp-web-03 is still owned

We contained the pivot, but corp-web-03 is still compromised — something on it
keeps phoning out. Log in and clean it up, the way an incident responder would:

  ssh webadmin@corp-web-03        password: w3b-adm1n-2026  (answer "yes" first)

Once you are on the box:
  1. See what is actually running:   ps aux
     One process does not belong — an "exfil-agent". Note its PID and the
     --conf path in its command line, then stop it for good:  kill -9 <pid>
  2. Read the dropper's config the agent pointed at (cat it). It tells you where
     the agent staged the stolen file, and how NetOps wants it recovered.
  3. Follow that: set the recovery name in your environment, make a workspace,
     and move the staged file into it. Recovering it cleanly is your proof.

— Alex
`;

const AGENT_CONF = `# exfil-agent configuration — DO NOT DISTRIBUTE
spool_dir = /var/spool/nova
staged_file = /var/spool/nova/staged.dat
callback = 198.51.100.44:8443

# NetOps recovery procedure (ticket NOVA-7731):
#   export RECOVER_AS=${RECOVER_TOKEN}
#   mkdir ~/recovered
#   mv /var/spool/nova/staged.dat ~/recovered/$RECOVER_AS
`;

const HOSTS: readonly HostDefinition[] = [
  {
    hostname: 'corp-web-03',
    users: [{ name: 'webadmin', uid: 1001, gecos: 'Web Admin', password: 'w3b-adm1n-2026' }],
    motd: 'corp-web-03 — production web node. Authorised access only.\n',
    net: {
      interfaces: [{ name: 'eth0', ip: '10.10.0.33' }],
      ports: [{ port: 22, product: 'OpenSSH', version: '9.6p1 Ubuntu-3ubuntu13.5' }],
    },
    // The attacker's foothold: a beacon whose command line points at its own config.
    processes: [
      { pid: 742, user: 'webadmin', command: '-bash', tty: 'pts/0', stat: 'Ss', start: '09:03' },
      {
        pid: 680,
        user: 'root',
        command: '/usr/sbin/nginx -g daemon off;',
        tty: '?',
        start: '09:00',
      },
      {
        pid: 4021,
        user: 'webadmin',
        command: './exfil-agent --conf /etc/nova/agent.conf',
        cpu: 71.2,
        mem: 3.4,
        tty: '?',
        stat: 'Rl',
        start: '09:14',
        time: '5:31',
      },
    ],
    fs: {
      '/etc/nova': { dir: true, owner: 'root', mode: '0755' },
      '/etc/nova/agent.conf': { content: AGENT_CONF, owner: 'root', mode: '0644' },
      '/var/spool/nova': { dir: true, owner: 'webadmin', mode: '0755' },
      // The staged file itself is not the flag — recovering it correctly is what proves the clean-up.
      '/var/spool/nova/staged.dat': {
        content: 'raw staged blob — the agent kept re-queuing this for exfiltration\n',
        owner: 'webadmin',
        mode: '0644',
      },
    },
  },
];

export const level07b: Level = {
  id: '07b-persistence',
  chapter: 2,
  title: 'Persistence',
  briefing:
    'The pivot is contained, but corp-web-03 is still compromised — a process on it keeps phoning ' +
    'out. This is post-exploitation clean-up on a host you have reached: log in over ssh, use ' +
    '`ps aux` to spot the attacker’s "exfil-agent", `kill -9` it, read the dropper config its ' +
    'command line points at, then recover the file it staged — setting the recovery name in an ' +
    'environment variable and moving the file into a workspace you create. It exercises the whole ' +
    'local toolkit on a live box.',
  objective: 'On corp-web-03, kill the exfil beacon and recover the file it staged.',
  debrief:
    'That is incident response on a live host: see what runs (ps), stop what should not (kill), read ' +
    'what the intruder dropped, and recover the evidence with everyday file tools. Processes, ' +
    'environment variables and file management are not just tutorial exercises — they are the daily ' +
    'work of holding, and cleaning, a machine.',
  skills: ['ssh', 'ps', 'kill', 'env / export', 'mkdir', 'mv'],
  startUser: 'analyst',
  startHost: 'corp-ws-12',
  startCwd: '/home/analyst',
  users: [{ name: 'analyst', uid: 1000, gecos: 'Security Analyst', password: 'analyst' }],
  motd: 'corp-ws-12 — analyst workstation.\n',
  fs: {
    '/home/analyst/brief.txt': { content: BRIEF, owner: 'analyst' },
  },
  net: {
    interfaces: [{ name: 'eth0', ip: '10.10.0.12' }],
    gateway: '10.10.0.1',
    ports: [{ port: 22, product: 'OpenSSH', version: '9.6p1 Ubuntu-3ubuntu13.5' }],
  },
  hosts: HOSTS,
  flagHash: '8475d994e8777b7ed69bae12b5ccabf399a9ceb6d0f24d80be63426ce49f071a',
  hints: [
    'Log in first: `ssh webadmin@corp-web-03` (answer "yes", password w3b-adm1n-2026). Then `ps aux` — the "exfil-agent" line is the intruder; note its PID (4021) and the --conf path, and `kill -9 4021`.',
    'Read the config the agent used: `cat /etc/nova/agent.conf`. It gives the staged file path and the exact recovery steps (ticket NOVA-7731).',
    `Recover it: \`export RECOVER_AS=${RECOVER_TOKEN}\`, \`mkdir ~/recovered\`, then \`mv /var/spool/nova/staged.dat ~/recovered/$RECOVER_AS\`. That reveals the flag; then submit it.`,
  ],
  parTimeSec: 540,
  onCommand: (event, api) => {
    const say = (en: string, he: string): void =>
      api.echo(`\x1b[36m${api.locale === 'he' ? he : en}\x1b[0m`);
    const arg = event.args.join(' ');

    // Recovering the staged file to the ticket name is the proof — and needs every prior step.
    if (
      event.name === 'mv' &&
      event.exitCode === 0 &&
      arg.includes('staged.dat') &&
      arg.includes(RECOVER_TOKEN) &&
      api.once('recovered')
    ) {
      api.echo(`\x1b[32m${utf8Decode(unseal(reward))}\x1b[0m`);
      say(
        'Recovered cleanly. Copy the FLAG{...} above and submit it.',
        'שוחזר כראוי. העתיקו את ה-FLAG{...} שלמעלה והגישו אותו.',
      );
      return;
    }
    if (event.name === 'ssh' && event.exitCode === 0 && api.once('on-host')) {
      say(
        'You are on corp-web-03. See what is running:  ps aux',
        'אתם על corp-web-03. ראו מה רץ:  ps aux',
      );
      return;
    }
    if (
      event.name === 'kill' &&
      event.exitCode === 0 &&
      arg.includes('4021') &&
      api.once('killed')
    ) {
      say(
        'Beacon stopped. Read the config it used:  cat /etc/nova/agent.conf',
        'ה-beacon נעצר. קראו את הקונפיג שבו הוא השתמש:  cat /etc/nova/agent.conf',
      );
      return;
    }
    if (
      event.name === 'cat' &&
      arg.includes('agent.conf') &&
      event.exitCode === 0 &&
      api.once('read-conf')
    ) {
      say(
        'That is the recovery procedure (ticket NOVA-7731). Follow it: export RECOVER_AS, mkdir a workspace, and mv the staged file in.',
        'זו נוהל השחזור (כרטיס NOVA-7731). בצעו אותו: export RECOVER_AS, צרו תיקיית עבודה ב-mkdir, והעבירו את הקובץ עם mv.',
      );
    }
  },
};
