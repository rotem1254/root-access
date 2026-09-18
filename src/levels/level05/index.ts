import type { Level } from '../../engine/game/level';
import type { HostDefinition } from '../../engine/system/host';
import panelSealed from './files/buildpanel.html?sealed';
import { asSealed } from '../_sealed';

const panel = asSealed(panelSealed);

const BRIEF = `From: alex.mercer@novacorp.example
To: you@novacorp.example
Subject: corp-build01

The network map you pulled lists a build server, corp-build01 (10.10.0.40).
NetOps swear it only runs ssh. I do not believe them: the export job that
touched customer data ran from that box, and something has to be driving it.

A default nmap only checks the common ports. If someone wanted a service to
stay out of the quarterly scan, they would move it somewhere unusual — high up,
out of the way. Scan properly:

  nmap -p 1-65535 corp-build01      every port (slow but complete)
  nmap -p 8000-9000 -sV corp-build01   a range, with service/version detection

-sV asks each open port what software it is running. Then read whatever you
find with curl, or grab the raw banner with nc.

— Alex
`;

const HOSTS: readonly HostDefinition[] = [
  {
    hostname: 'corp-build01',
    users: [{ name: 'build', uid: 1001 }],
    net: {
      interfaces: [{ name: 'eth0', ip: '10.10.0.40' }],
      ports: [
        { port: 22, product: 'OpenSSH', version: '8.9p1 Ubuntu-3ubuntu0.6' },
        {
          // Deliberately parked above the ports a default scan checks.
          port: 8686,
          name: 'http-alt',
          product: 'build-agent httpd',
          version: '3.4.1',
          http: {
            server: 'build-agent/3.4.1',
            routes: {
              '/': { body: panel, headers: { 'Content-Type': 'text/plain' } },
            },
          },
        },
      ],
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
];

export const level05: Level = {
  id: '05-open-ports',
  chapter: 2,
  title: 'Open Ports',
  briefing:
    'The build server corp-build01 is supposed to run nothing but ssh, yet the suspicious ' +
    'export job ran from it. A default `nmap` only checks a few hundred well-known ports, so a ' +
    'service parked on an unusual high port stays invisible to a lazy scan — which is exactly ' +
    'why people park them there. Scan the full range, use `-sV` to identify what is actually ' +
    'listening, and read it.',
  objective:
    'Find the service hiding on a non-standard port of corp-build01 and read what it serves.',
  debrief:
    '"It only runs ssh" is something you verify, never something you accept. The panel was not ' +
    'protected at all — it was merely moved somewhere a default scan does not look. Security by ' +
    'obscurity fails the moment someone scans all 65535 ports.',
  skills: ['nmap -p', 'nmap -sV', 'nc', 'curl'],
  startUser: 'analyst',
  startHost: 'corp-ws-09',
  startCwd: '/home/analyst',
  users: [{ name: 'analyst', uid: 1000, gecos: 'Security Analyst', password: 'analyst' }],
  fs: {
    '/home/analyst/brief.txt': { content: BRIEF, owner: 'analyst' },
  },
  net: {
    interfaces: [{ name: 'eth0', ip: '10.10.0.9' }],
    gateway: '10.10.0.1',
    ports: [{ port: 22, product: 'OpenSSH', version: '8.9p1 Ubuntu-3ubuntu0.6' }],
  },
  hosts: HOSTS,
  flagHash: 'c9d4f28f108a4763d7deaaaf7af53bdb5c29bc9180bf85712a5f1be6bc136641',
  hints: [
    'A plain `nmap corp-build01` only shows 22/tcp, because it checks a list of common ports. Tell it to check everything: `nmap -p 1-65535 corp-build01` (or a narrower range like `-p 8000-9000`).',
    'The full scan finds a second open port in the 8000s. Add `-sV` — `nmap -p 8000-9000 -sV corp-build01` — to see the software behind it.',
    'It is an HTTP service on port 8686. Read it with `curl http://corp-build01:8686/` (or `nc corp-build01 8686`), then submit the token on the page.',
  ],
  parTimeSec: 360,
};
