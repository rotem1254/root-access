import type { Level } from '../../engine/game/level';
import type { HttpRouteResult } from '../../engine/network/types';
import type { HostDefinition } from '../../engine/system/host';
import ticket1Sealed from './files/ticket1.txt?sealed';
import { asSealed } from '../_sealed';

const ticket1 = asSealed(ticket1Sealed);

const BRIEF = `From: alex.mercer@novacorp.example
To: you@novacorp.example
Subject: The help desk

The support portal, helpdesk.novacorp.internal, lets a signed-in user read their
own ticket by number. We are logged in as a customer whose ticket is #4187.

Look closely at how it fetches a ticket:

  curl "http://helpdesk.novacorp.internal/ticket?id=4187"

The ticket number is right there in the URL, and the server trusts it. It checks
that you are logged in, but not that the ticket is yours. That is a broken access
control — an "insecure direct object reference". The interesting records are the
low, early numbers. Count down.

— Alex
`;

/** Ordinary customer tickets, plus the internal ticket #1 whose body is sealed. */
const TICKETS: Readonly<Record<string, { subject: string; body: string }>> = {
  '4187': { subject: 'Cannot download my invoice', body: 'Your invoice is attached. — Support\n' },
  '4186': { subject: 'Change billing email', body: 'Done, thanks for confirming. — Support\n' },
  '2050': { subject: 'API rate limit', body: 'Raised your limit to 5000/hour. — Support\n' },
  '2': { subject: 'Welcome to NovaCorp Support', body: 'Thanks for signing up!\n' },
};

function ticketHandler(id: string): HttpRouteResult {
  if (id === '1') {
    return { body: ticket1, headers: { 'Content-Type': 'text/plain' } };
  }
  const ticket = TICKETS[id];
  if (!ticket) {
    return {
      status: 404,
      body: `Ticket #${id} not found.\n`,
      headers: { 'Content-Type': 'text/plain' },
    };
  }
  return {
    body: `Ticket #${id}\nSubject : ${ticket.subject}\n\n${ticket.body}`,
    headers: { 'Content-Type': 'text/plain' },
  };
}

const HOME = `NovaCorp Help Desk
==================

You are signed in as customer c-4187.

  Your ticket : /ticket?id=4187

Enter a ticket number to view it.
`;

const HOSTS: readonly HostDefinition[] = [
  {
    hostname: 'helpdesk',
    net: {
      interfaces: [{ name: 'eth0', ip: '10.20.0.12' }],
      ports: [
        {
          port: 80,
          product: 'gunicorn',
          version: '21.2.0',
          http: {
            server: 'gunicorn/21.2.0',
            routes: {
              '/': { body: HOME, headers: { 'Content-Type': 'text/plain' } },
              '/ticket': {
                handler: (request) => ticketHandler(request.query.id ?? ''),
              },
              '/admin': {
                status: 403,
                body: '403 Forbidden — admin console requires the break-glass token.\n',
                headers: { 'Content-Type': 'text/plain' },
              },
            },
          },
        },
      ],
    },
  },
];

export const level13: Level = {
  id: '13-broken-access',
  chapter: 4,
  title: 'Broken Access',
  briefing:
    'The help desk lets a signed-in customer read their own ticket by number — and the number ' +
    'is right there in the URL. The server checks that you are logged in but never that the ' +
    'ticket belongs to you, so changing the id reads someone else’s record. This is an insecure ' +
    'direct object reference (IDOR), one of the most common real-world web flaws. You are ' +
    'customer c-4187; the sensitive records are the low, early ticket numbers.',
  objective: 'Read the internal ticket you were never meant to see (hint: count down to #1).',
  debrief:
    'IDOR is entirely about authorization, not authentication. You were a legitimate user the ' +
    'whole time — the server simply never asked whether ticket #1 was yours to read. The fix is ' +
    'an ownership check on every object, every time, not a number that is hard to guess.',
  skills: ['curl', 'IDOR', 'broken access control'],
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
  network: { dns: { 'helpdesk.novacorp.internal': '10.20.0.12' } },
  flagHash: '4a9f6c842898b80e5be57865a25db961a45f2f475bff50cc2c506bec14cb7671',
  hints: [
    'Read your own ticket first so you see the shape of the response: `curl "http://helpdesk.novacorp.internal/ticket?id=4187"`. Quote the URL so the shell does not treat ? and & specially.',
    'The id in the URL is the only thing choosing the ticket, and the server does not check it is yours. Try other numbers — the low ones are the oldest, most privileged records.',
    'Ticket #1 is the internal one: `curl "http://helpdesk.novacorp.internal/ticket?id=1"`. The break-glass token in it is the flag.',
  ],
  parTimeSec: 300,
};
