import type { Level } from '../../engine/game/level';
import type { HostDefinition } from '../../engine/system/host';
import noteSealed from './files/backup-note.txt?sealed';
import { asSealed } from '../_sealed';

const note = asSealed(noteSealed);

const BRIEF = `From: alex.mercer@novacorp.example
To: you@novacorp.example
Subject: The customer portal

New chapter, new surface. NovaCorp runs a customer portal at
portal.novacorp.internal, and the web team swear there is nothing sensitive on
it. Before you take their word for it, read what the site says about itself.

Every site can publish a robots.txt: a list of paths it asks crawlers not to
index. It is a polite request, not a control — and it is a public file. If
someone puts a path in there, they have just told you it exists and that they
would rather you did not look.

  curl http://portal.novacorp.internal/
  curl http://portal.novacorp.internal/robots.txt

Then read whatever it points at.

— Alex
`;

const HOME_PAGE = `NovaCorp Customer Portal
========================

  Sign in            /login
  Support            /support
  Status             /status

(c) NovaCorp. All rights reserved.
`;

const ROBOTS = `User-agent: *
Disallow: /internal/
Disallow: /internal/backup/
Disallow: /ops-migration-2025/
Crawl-delay: 10
`;

const HOSTS: readonly HostDefinition[] = [
  {
    hostname: 'portal',
    net: {
      interfaces: [{ name: 'eth0', ip: '10.20.0.10' }],
      ports: [
        { port: 22, product: 'OpenSSH', version: '9.6p1' },
        {
          port: 80,
          product: 'nginx',
          version: '1.24.0',
          http: {
            server: 'nginx/1.24.0 (Ubuntu)',
            routes: {
              '/': { body: HOME_PAGE, headers: { 'Content-Type': 'text/plain' } },
              '/robots.txt': { body: ROBOTS, headers: { 'Content-Type': 'text/plain' } },
              '/login': {
                body: 'Sign in\n\n(This form is not part of the current assessment.)\n',
                headers: { 'Content-Type': 'text/plain' },
              },
              '/internal/': {
                body: 'Index of /internal/\n\n  backup/\n  ops-migration-2025/\n',
                headers: { 'Content-Type': 'text/plain' },
              },
              '/internal/backup/': {
                body: 'Index of /internal/backup/\n\n  notes.txt\n  portal.sql.gz\n',
                headers: { 'Content-Type': 'text/plain' },
              },
              '/internal/backup/notes.txt': {
                body: note,
                headers: { 'Content-Type': 'text/plain' },
              },
              '/ops-migration-2025/': {
                body: 'Index of /ops-migration-2025/\n\n  (empty — migration completed)\n',
                headers: { 'Content-Type': 'text/plain' },
              },
            },
          },
        },
      ],
    },
  },
];

export const level12: Level = {
  id: '12-robots-and-secrets',
  chapter: 4,
  title: 'Robots and Secrets',
  briefing:
    'The customer portal is public and the web team insist there is nothing sensitive on it. ' +
    'Start where every web assessment starts: ask the site what it knows about itself. A ' +
    '`robots.txt` is a public file listing the paths the owner asks crawlers to skip — which ' +
    'means it is also a tidy index of everything they would rather you did not find. Read it, ' +
    'follow what it names, and see what was left in a directory the internet was merely asked ' +
    'not to visit.',
  objective: 'Read the portal’s robots.txt and retrieve what it points at.',
  debrief:
    'robots.txt is not access control — it is a signpost. Anything genuinely private needs ' +
    'authentication or to be off the web root entirely. Here it advertised a backup directory ' +
    'holding staging credentials, with an "move this" ticket open for eighteen months.',
  skills: ['curl', 'robots.txt', 'web enumeration'],
  startUser: 'analyst',
  startHost: 'corp-audit',
  startCwd: '/home/analyst',
  users: [{ name: 'analyst', uid: 1000, gecos: 'Security Analyst', password: 'analyst' }],
  fs: {
    '/home/analyst/brief.txt': { content: BRIEF, owner: 'analyst' },
  },
  net: {
    interfaces: [{ name: 'eth0', ip: '10.20.0.9' }],
    gateway: '10.20.0.1',
    ports: [{ port: 22, product: 'OpenSSH', version: '9.6p1' }],
  },
  hosts: HOSTS,
  network: { dns: { 'portal.novacorp.internal': '10.20.0.10' } },
  flagHash: '91a19c8c9d0a476d89447a32ee10e609246dfab8bead150f8d77c1c84e305059',
  hints: [
    'Fetch the front page first with `curl http://portal.novacorp.internal/`. It links only to the obvious pages — nothing sensitive there.',
    'Now ask the site what it hides: `curl http://portal.novacorp.internal/robots.txt`. Each `Disallow:` line names a path the owner did not want indexed.',
    'Follow the backup path: `curl http://portal.novacorp.internal/internal/backup/` lists its files, and `curl http://portal.novacorp.internal/internal/backup/notes.txt` has the audit token.',
  ],
  parTimeSec: 300,
};
