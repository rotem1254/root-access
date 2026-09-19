import { digestHex } from '../../engine/crypto/digest';
import { opensslEncrypt } from '../../engine/crypto/openssl';
import { encodePcap } from '../../engine/network/pcap';
import type { PcapSummary } from '../../engine/network/types';
import type { Level } from '../../engine/game/level';
import type { HostDefinition } from '../../engine/system/host';
import { base64Encode } from '../../engine/util/base64';

const README = `Practice sandbox — no goals, no scoring, nothing to break.

This is a free playground with a bit of everything, so you can try any command
you have learned (or want to learn). Nothing here is graded, and \`reset\`
restores it all if you make a mess.

Things to try
-------------
  ls -la                     see everything, including hidden files
  cd projects && ls          move around folders
  cat logbook.txt            read a file
  grep WARN logbook.txt      search inside a file
  cat logbook.txt | grep ok  pipe one command into another
  ls -l                      look at file permissions
  chmod +x script.sh         change permissions
  base64 -d secret.b64       decode base64
  xxd archive.enc | head     look at raw bytes
  file archive.enc           identify a file
  sha256sum README.txt       fingerprint a file
  ip a                       your network address
  nmap 10.9.9.0/24           scan the practice network
  curl http://practice-web/  read a web page
  ssh guest@practice-web     log in to the neighbour (password: practice)

Passwords in this sandbox: your own is "guest"; there is also an "admin" account
(password "admin123") you can \`su admin\` into. The archive.enc passphrase is
"sandbox".

Have fun. Type \`levels\` when you want to go back to the missions.
`;

const NOTES = `Shopping list:
- coffee
- more coffee
- practice more grep
`;

const LOGBOOK = `2026-03-11 01:11 INFO service ok\n2026-03-12 02:22 INFO service ok\n2026-03-13 03:33 INFO service ok\n2026-03-14 04:44 INFO service ok\n2026-03-15 05:55 INFO service ok\n2026-03-16 06:06 INFO service ok\n2026-03-14 03:11 WARN failed login for user practice\n2026-03-17 07:17 INFO service ok\n2026-03-18 08:28 INFO service ok\n2026-03-10 00:30 INFO service ok\n2026-03-11 01:41 INFO service ok\n2026-03-12 02:52 INFO service ok\n2026-03-13 03:03 INFO service ok\n2026-03-14 04:14 INFO service ok\n`;

const CAPTURE: PcapSummary = {
  entries: [
    {
      time: '0.000000',
      protocol: 'TCP',
      src: '10.9.9.5.51000',
      dst: '10.9.9.10.80',
      info: 'Flags [S]',
    },
    {
      time: '0.000200',
      protocol: 'HTTP',
      src: '10.9.9.5.51000',
      dst: '10.9.9.10.80',
      info: 'GET / HTTP/1.1',
    },
    {
      time: '0.010500',
      protocol: 'HTTP',
      src: '10.9.9.10.80',
      dst: '10.9.9.5.51000',
      info: 'HTTP/1.1 200 OK',
    },
  ],
};

/** A neighbour host so nmap / curl / ssh / ping all have something to talk to. */
const HOSTS: readonly HostDefinition[] = [
  {
    hostname: 'practice-web',
    users: [{ name: 'guest', uid: 1000, password: 'practice' }],
    motd: 'practice-web — a friendly box for trying ssh.\n',
    net: {
      interfaces: [{ name: 'eth0', ip: '10.9.9.10' }],
      ports: [
        { port: 22, product: 'OpenSSH', version: '9.6p1' },
        {
          port: 80,
          product: 'nginx',
          version: '1.24.0',
          http: {
            server: 'nginx/1.24.0',
            routes: {
              '/': {
                body: 'Hello from practice-web!\n\nYou reached this page with curl. Nice.\n',
                headers: { 'Content-Type': 'text/plain' },
              },
            },
          },
        },
      ],
    },
  },
];

export const sandbox: Level = {
  id: 'sandbox',
  chapter: 0,
  practice: true,
  title: 'Practice Sandbox',
  briefing:
    'A free playground — no objective, no scoring, nothing to break. Everything you have learned ' +
    'is available here: files and folders to explore, a log to grep, an encrypted file to open, a ' +
    'capture to read, and a small network to scan and ssh into. Read README.txt for ideas, and use ' +
    '`reset` if you want a clean slate. Type `levels` to go back to the missions.',
  objective: 'Nothing to capture here — just explore and try any command you like.',
  debrief: '',
  skills: ['everything'],
  startUser: 'guest',
  startHost: 'sandbox',
  startCwd: '/home/guest',
  users: [
    { name: 'guest', uid: 1000, gecos: 'Trainee', password: 'guest' },
    { name: 'admin', uid: 1001, gecos: 'Admin', password: 'admin123', groups: ['sudo'] },
  ],
  motd: 'Practice sandbox — experiment freely. Read README.txt to get started.\n',
  fs: {
    '/home/guest/README.txt': { content: README, owner: 'guest' },
    '/home/guest/notes.txt': { content: NOTES, owner: 'guest' },
    '/home/guest/logbook.txt': { content: LOGBOOK, owner: 'guest' },
    '/home/guest/secret.b64': {
      content: `${base64Encode('You decoded base64. Well done!\n')}\n`,
      owner: 'guest',
    },
    '/home/guest/script.sh': {
      content: '#!/bin/bash\necho "hello from a script"\n',
      owner: 'guest',
      mode: '0644',
    },
    '/home/guest/archive.enc': {
      bytes: opensslEncrypt('This was inside an AES-encrypted archive.\n', 'sandbox', {
        salt: new Uint8Array([0x73, 0x61, 0x6e, 0x64, 0x62, 0x6f, 0x78, 0x21]),
      }),
      owner: 'guest',
      mode: '0644',
    },
    '/home/guest/hashes.txt': { content: `${digestHex('md5', 'sunshine')}\n`, owner: 'guest' },
    '/home/guest/wordlist.txt': { content: 'password\nsunshine\nletmein\n', owner: 'guest' },
    '/home/guest/capture.pcap': { bytes: encodePcap(CAPTURE), owner: 'guest', mode: '0644' },
    '/home/guest/projects': { dir: true, owner: 'guest' },
    '/home/guest/projects/hello.txt': { content: 'A file inside a folder.\n', owner: 'guest' },
    '/home/guest/downloads': { dir: true, owner: 'guest' },
    '/home/guest/.hidden-note': {
      content: 'You found a hidden file with ls -la!\n',
      owner: 'guest',
    },
  },
  net: {
    interfaces: [{ name: 'eth0', ip: '10.9.9.5' }],
    gateway: '10.9.9.1',
    ports: [{ port: 22, product: 'OpenSSH', version: '9.6p1' }],
  },
  hosts: HOSTS,
  network: { dns: { 'practice-web.novacorp.internal': '10.9.9.10' } },
  hints: [
    'This is free practice — there is no flag. Try `cat README.txt` for a list of things to experiment with.',
    'Mix commands together, e.g. `cat logbook.txt | grep WARN`, or scan the network with `nmap 10.9.9.0/24`.',
    'Done practising? Type `levels` to see the missions and jump back in.',
  ],
  parTimeSec: 0,
};
