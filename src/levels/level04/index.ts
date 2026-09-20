import type { Level } from '../../engine/game/level';
import type { HostDefinition } from '../../engine/system/host';
import intranetSealed from './files/intranet.html?sealed';
import { asSealed } from '../_sealed';

const intranet = asSealed(intranetSealed);

const BRIEF = `From: alex.mercer@novacorp.example
To: you@novacorp.example
Subject: Move to the office LAN

Good work on the workstation. The files pointed at something bigger, so we moved
you onto a live analyst account on the office network: corp-ws-09.

Here is the problem. NetOps will not give us a network diagram — they say the
only current one lives "somewhere on the intranet", and nobody remembers which
machine that is. You will have to find it yourself.

Three commands is all this takes:
  ip a                  which network am I on?
  nmap 10.10.0.0/24     which hosts are alive on it, and what do they run?
  curl http://HOST/     read what a web service serves

Find the host serving HTTP and read its page.

— Alex
`;

const NOTES = `Handover notes — corp-ws-09
---------------------------
Nothing useful in my home directory; I already cleaned it out.

Everything interesting on this network is on other machines. Start by working
out which subnet this workstation sits on (ip a / ifconfig), then sweep it.

NetOps keeps an internal page with the addresses. It is not linked anywhere.
`;

/** The other machines on the office LAN. Only corp-intra serves the page we need. */
const HOSTS: readonly HostDefinition[] = [
  {
    hostname: 'corp-gw-01',
    net: {
      interfaces: [{ name: 'eth0', ip: '10.10.0.1' }],
      ports: [{ port: 22, product: 'OpenSSH', version: '8.9p1 Ubuntu-3ubuntu0.6' }],
    },
  },
  {
    hostname: 'corp-fs-01',
    net: {
      interfaces: [{ name: 'eth0', ip: '10.10.0.20' }],
      ports: [
        { port: 22, product: 'OpenSSH', version: '8.9p1 Ubuntu-3ubuntu0.6' },
        { port: 445, product: 'Samba smbd', version: '4.19.5' },
      ],
    },
  },
  {
    hostname: 'corp-intra',
    net: {
      interfaces: [{ name: 'eth0', ip: '10.10.0.30' }],
      ports: [
        { port: 22, product: 'OpenSSH', version: '8.9p1 Ubuntu-3ubuntu0.6' },
        {
          port: 80,
          product: 'nginx',
          version: '1.24.0',
          http: {
            server: 'nginx/1.24.0 (Ubuntu)',
            routes: {
              '/': { body: intranet, headers: { 'Content-Type': 'text/plain' } },
            },
          },
        },
      ],
    },
  },
  {
    hostname: 'corp-prn-04',
    net: {
      interfaces: [{ name: 'eth0', ip: '10.10.0.50' }],
      ports: [{ port: 9100, name: 'jetdirect', product: 'HP LaserJet', version: '4.20' }],
    },
  },
];

export const level04: Level = {
  id: '04-first-contact',
  chapter: 2,
  title: 'First Contact',
  briefing:
    'The investigation moves onto the network. You are on a live analyst workstation, ' +
    'corp-ws-09, somewhere inside the NovaCorp office LAN — but nobody will tell you what else ' +
    'is on that network. This is how every real engagement starts: work out which subnet you ' +
    'are on, sweep it for live hosts, and read what they expose. `ip a` shows your own address ' +
    'and netmask, `nmap` finds the neighbours, and `curl` reads a web service. NetOps keeps an ' +
    'unlinked page with the full address list; find the host serving it.',
  objective: 'Discover the host serving HTTP on your subnet and read its page.',
  debrief:
    'That is reconnaissance: you never guess addresses, you enumerate them. One `ip a` told you ' +
    'the subnet, one sweep told you who lives there, and an unlinked "internal only" page told ' +
    'you everything — including that a second segment exists that you cannot reach yet.',
  skills: ['ip a', 'nmap', 'curl'],
  startUser: 'analyst',
  startHost: 'corp-ws-09',
  startCwd: '/home/analyst',
  users: [{ name: 'analyst', uid: 1000, gecos: 'Security Analyst', password: 'analyst' }],
  fs: {
    '/home/analyst/brief.txt': { content: BRIEF, owner: 'analyst' },
    '/home/analyst/notes.txt': { content: NOTES, owner: 'analyst' },
  },
  net: {
    interfaces: [{ name: 'eth0', ip: '10.10.0.9' }],
    gateway: '10.10.0.1',
    ports: [{ port: 22, product: 'OpenSSH', version: '8.9p1 Ubuntu-3ubuntu0.6' }],
  },
  hosts: HOSTS,
  flagHash: '8c4234521dda48e1f00270ed4348b3d3c7253b1cafca138aaba5c3aeabfa9e50',
  hints: [
    'Start with `ip a` (or `ifconfig`). Look at the inet line for eth0: it tells you your address and, after the slash, the size of the network — 10.10.0.9/24 means every address 10.10.0.x is a neighbour.',
    'Sweep the whole subnet with `nmap 10.10.0.0/24`. It reports each live host and the ports it has open. One of them has port 80 (http) open.',
    'The host with 80/tcp open is 10.10.0.30. Read what it serves with `curl http://10.10.0.30/`, then submit the token on that page.',
  ],
  parTimeSec: 300,
  onCommand: (event, api) => {
    const say = (en: string, he: string): void =>
      api.echo(`\x1b[36m${api.locale === 'he' ? he : en}\x1b[0m`);
    if (event.name === 'nmap' && event.exitCode === 0 && api.once('scanned')) {
      say(
        'Scan is in. One host on your subnet answers on port 80 — open it with curl.',
        'הסריקה נכנסה. מארח אחד ברשת שלכם עונה על פורט 80 — פתחו אותו עם curl.',
      );
    }
  },
};
