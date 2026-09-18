import type { Level } from '../../engine/game/level';
import { encodePcap } from '../../engine/network/pcap';
import type { PcapSummary } from '../../engine/network/types';
import type { HostDefinition } from '../../engine/system/host';
import portalSealed from './files/portal.html?sealed';
import { asSealed } from '../_sealed';

const portal = asSealed(portalSealed);

/**
 * The capture the sensor recorded while the nightly export ran. The portal speaks plain HTTP, so
 * its Basic-auth header — base64 of `svc-export:Exp0rt-Str3am-2026` — is right there on the wire.
 * Not a flag, so it may sit in the source; the flag itself is sealed in the portal page.
 */
const CAPTURE: PcapSummary = {
  entries: [
    {
      time: '0.000000',
      protocol: 'DNS',
      src: '10.10.9.20.51423',
      dst: '10.10.9.1.53',
      info: 'A? corp-portal.novacorp.internal. (42)',
    },
    {
      time: '0.000318',
      protocol: 'DNS',
      src: '10.10.9.1.53',
      dst: '10.10.9.20.51423',
      info: 'A corp-portal.novacorp.internal. A 10.10.9.30 (58)',
    },
    {
      time: '0.001204',
      protocol: 'TCP',
      src: '10.10.9.20.51424',
      dst: '10.10.9.30.8080',
      info: 'Flags [S], seq 2847193, win 64240, length 0',
    },
    {
      time: '0.001455',
      protocol: 'TCP',
      src: '10.10.9.30.8080',
      dst: '10.10.9.20.51424',
      info: 'Flags [S.], seq 91827364, ack 2847194, win 65160, length 0',
    },
    {
      time: '0.002011',
      protocol: 'HTTP',
      src: '10.10.9.20.51424',
      dst: '10.10.9.30.8080',
      info: 'GET /admin HTTP/1.1',
    },
    {
      time: '0.002012',
      protocol: 'HTTP',
      src: '10.10.9.20.51424',
      dst: '10.10.9.30.8080',
      info: 'Host: corp-portal:8080',
    },
    {
      time: '0.002013',
      protocol: 'HTTP',
      src: '10.10.9.20.51424',
      dst: '10.10.9.30.8080',
      info: 'User-Agent: export-runner/2.2',
    },
    {
      time: '0.002014',
      protocol: 'HTTP',
      src: '10.10.9.20.51424',
      dst: '10.10.9.30.8080',
      info: 'Authorization: Basic c3ZjLWV4cG9ydDpFeHAwcnQtU3RyM2FtLTIwMjY=',
    },
    {
      time: '0.014903',
      protocol: 'HTTP',
      src: '10.10.9.30.8080',
      dst: '10.10.9.20.51424',
      info: 'HTTP/1.1 200 OK',
    },
    {
      time: '0.014904',
      protocol: 'HTTP',
      src: '10.10.9.30.8080',
      dst: '10.10.9.20.51424',
      info: 'Content-Type: text/plain',
    },
    {
      time: '0.031200',
      protocol: 'TCP',
      src: '10.10.9.20.51424',
      dst: '10.10.9.30.8080',
      info: 'Flags [F.], seq 2847612, ack 91829001, length 0',
    },
    {
      time: '1.884300',
      protocol: 'FTP',
      src: '10.10.9.20.51500',
      dst: '10.10.9.40.21',
      info: 'Request: USER backup',
    },
    {
      time: '1.884910',
      protocol: 'FTP',
      src: '10.10.9.40.21',
      dst: '10.10.9.20.51500',
      info: 'Response: 331 Password required',
    },
    {
      time: '1.885402',
      protocol: 'FTP',
      src: '10.10.9.20.51500',
      dst: '10.10.9.40.21',
      info: 'Request: PASS r0tate-me-please',
    },
    {
      time: '1.886001',
      protocol: 'FTP',
      src: '10.10.9.40.21',
      dst: '10.10.9.20.51500',
      info: 'Response: 230 Login successful',
    },
  ],
};

const BRIEF = `From: alex.mercer@novacorp.example
To: you@novacorp.example
Subject: What the sensor saw

Last piece. The export job talks to an internal "export portal" on
corp-portal:8080, and nobody will give us the service account.

We do not need them to. NetOps run a passive sensor on the server segment, and
you are logged into it. There is a capture from the night of the export in
/var/captures. The portal still speaks plain HTTP — no TLS — which means the
credentials it used are in that capture in clear text.

  tcpdump -r /var/captures/export-run.pcap        read the capture
  ... | grep -i authorization                     find the login header

HTTP Basic auth is not encryption. It is base64 of "user:password", and you
already know how to undo base64.

Then log in to the portal yourself:
  curl -u USER:PASSWORD http://corp-portal:8080/admin

— Alex
`;

const HOSTS: readonly HostDefinition[] = [
  {
    hostname: 'corp-portal',
    net: {
      interfaces: [{ name: 'eth0', ip: '10.10.9.30' }],
      ports: [
        { port: 22, product: 'OpenSSH', version: '9.6p1' },
        {
          port: 8080,
          name: 'http-proxy',
          product: 'gunicorn',
          version: '21.2.0',
          http: {
            server: 'gunicorn/21.2.0',
            routes: {
              '/': {
                body: 'NovaCorp Export Portal\n\nNothing to see here. Try /admin (staff only).\n',
                headers: { 'Content-Type': 'text/plain' },
              },
              '/admin': {
                body: portal,
                headers: { 'Content-Type': 'text/plain' },
                auth: {
                  realm: 'Export Portal',
                  user: 'svc-export',
                  password: 'Exp0rt-Str3am-2026',
                },
              },
            },
          },
        },
      ],
    },
  },
  {
    hostname: 'corp-db01',
    net: {
      interfaces: [{ name: 'eth0', ip: '10.10.9.20' }],
      ports: [
        { port: 22, product: 'OpenSSH', version: '9.6p1' },
        { port: 5432, product: 'PostgreSQL DB', version: '16.2' },
      ],
    },
  },
];

export const level07: Level = {
  id: '07-packet-trail',
  chapter: 2,
  title: 'Packet Trail',
  briefing:
    'You are on the NetOps sensor inside the server segment, and it recorded the night the ' +
    'customer export ran. The export portal it talked to still speaks plain HTTP, which means ' +
    'every credential it sent crossed the wire in the clear. Read the capture with `tcpdump -r`, ' +
    'find the Authorization header, and remember what HTTP Basic auth actually is: base64 of ' +
    '"user:password", not encryption. Recover the service account and use it yourself.',
  objective:
    'Recover the portal credentials from the capture and read http://corp-portal:8080/admin.',
  debrief:
    'This is why "internal only" is not a security control and why plain HTTP still matters. ' +
    'Anyone who can see the traffic — a sensor, a switch, a compromised host on the path — reads ' +
    'Basic auth as easily as you just did. The same capture also leaked an FTP password in the ' +
    'clear. TLS exists precisely to make this trick fail.',
  skills: ['tcpdump -r', 'base64 -d', 'curl -u', 'reading captures'],
  startUser: 'analyst',
  startHost: 'corp-sensor',
  startCwd: '/home/analyst',
  users: [{ name: 'analyst', uid: 1000, gecos: 'Security Analyst', password: 'analyst' }],
  groups: [{ name: 'netops', gid: 1500, members: ['analyst'] }],
  fs: {
    '/home/analyst/brief.txt': { content: BRIEF, owner: 'analyst' },
    '/var/captures': { dir: true, mode: '0750', owner: 'root', group: 'netops' },
    '/var/captures/export-run.pcap': {
      bytes: encodePcap(CAPTURE),
      owner: 'root',
      group: 'netops',
      mode: '0640',
    },
  },
  net: {
    interfaces: [{ name: 'eth0', ip: '10.10.9.60' }],
    gateway: '10.10.9.1',
    ports: [{ port: 22, product: 'OpenSSH', version: '9.6p1' }],
  },
  hosts: HOSTS,
  flagHash: '3dab9bd85d1d214459feff3006fc10e60dee5023669ad0a2fc3cdcd4efe85ab0',
  hints: [
    'Read the capture with `tcpdump -r /var/captures/export-run.pcap`. It is a plain-HTTP conversation, so the request headers are all visible. Narrow it down with `| grep -i authorization`.',
    'The header is `Authorization: Basic c3ZjLWV4cG9ydDpFeHAwcnQtU3RyM2FtLTIwMjY=`. Basic auth is just base64 of "user:password" — decode it with `echo c3ZjLWV4cG9ydDpFeHAwcnQtU3RyM2FtLTIwMjY= | base64 -d`.',
    'That gives you svc-export and its password. Use them: `curl -u svc-export:Exp0rt-Str3am-2026 http://corp-portal:8080/admin`, then submit the master token from the page.',
  ],
  parTimeSec: 420,
};
