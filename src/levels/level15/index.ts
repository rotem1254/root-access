import { opensslEncrypt } from '../../engine/crypto/openssl';
import type { Level } from '../../engine/game/level';
import type { HttpRouteResult } from '../../engine/network/types';
import type { HostDefinition } from '../../engine/system/host';
import { base64Encode } from '../../engine/util/base64';
import { mysqlErrorText, runQuery, type SqlDatabase, SqlError } from '../../engine/web/sql';
import flagSealed from './files/root-access.txt?sealed';
import { asSealed } from '../_sealed';

const flagFile = asSealed(flagSealed);

/** The deploy account's ssh password and the passphrase protecting its encrypted copy. */
const DEPLOY_PASSWORD = 'd3pl0y-3ac9f1';
const VAULT_PASSPHRASE = 'Vault-Core-2026';

/** The credential as it sits in the vault: real AES-256-CBC, base64-armoured, built at load. */
const DEPLOY_CRED_B64 = base64Encode(
  opensslEncrypt(`${DEPLOY_PASSWORD}\n`, VAULT_PASSPHRASE, {
    salt: new Uint8Array([0x63, 0x6f, 0x72, 0x65, 0x32, 0x30, 0x32, 0x36]),
  }),
);

const BRIEF = `From: alex.mercer@novacorp.example
To: you@novacorp.example
Subject: The last door

One machine left: corp-core, the deploy box that pushed every change into
production. If we can stand in front of it, we can prove the whole story. This
one uses everything you have learned — no new tricks, just the chain.

  1. recon    nmap corp-core.novacorp.internal    (what does it run?)
  2. web      read robots.txt, then find the injectable endpoint it hides
  3. crypto   the injection gives you an encrypted deploy credential; open it
  4. pivot    ssh in with it, and read the flag

The vault the search can reach stores the deploy credential encrypted, with its
passphrase alongside. Decrypt it (it is base64-wrapped openssl), then log in.

Finish this and the investigation is closed.

— Alex
`;

/** The corp-core database. The vault holds the (encrypted) deploy credential. */
const DB: SqlDatabase = [
  {
    name: 'products',
    columns: ['name', 'category', 'price'],
    rows: [
      { name: 'Core Runner', category: 'internal', price: '0.00' },
      { name: 'Deploy Agent', category: 'internal', price: '0.00' },
    ],
  },
  {
    name: 'vault',
    columns: ['label', 'value', 'note'],
    rows: [
      {
        label: 'deploy.cred.enc',
        value: DEPLOY_CRED_B64,
        note: 'aes-256-cbc, base64 (openssl -a)',
      },
      {
        label: 'deploy.cred.pass',
        value: VAULT_PASSPHRASE,
        note: 'passphrase for deploy.cred.enc',
      },
    ],
  },
];

function searchHandler(q: string): HttpRouteResult {
  const sql = `SELECT name, category, price FROM products WHERE name = '${q}'`;
  try {
    const result = runQuery(DB, sql);
    const body = result.rows.length
      ? `${result.rows.map((row) => row.join('  |  ')).join('\n')}\n`
      : 'No products found.\n';
    return { body, headers: { 'Content-Type': 'text/plain' } };
  } catch (error) {
    if (error instanceof SqlError) {
      return {
        status: 500,
        body: `Database error: ${mysqlErrorText(error)}\n`,
        headers: { 'Content-Type': 'text/plain' },
      };
    }
    throw error;
  }
}

const HOME = `NovaCorp Core — deploy console
==============================

  Product search : /api/search?q=NAME

Internal use only.
`;

const ROBOTS = `User-agent: *
Disallow: /api/search
Disallow: /vault
`;

const HOSTS: readonly HostDefinition[] = [
  {
    hostname: 'corp-core',
    users: [{ name: 'deploy', uid: 1005, gecos: 'Deploy Bot', password: DEPLOY_PASSWORD }],
    motd: 'corp-core — production deploy host. Every session is logged.\n',
    homeMode: '0755',
    fs: {
      '/home/deploy/root-access.txt': { content: flagFile, owner: 'deploy', mode: '0600' },
    },
    net: {
      interfaces: [{ name: 'eth0', ip: '10.30.0.10' }],
      ports: [
        { port: 22, product: 'OpenSSH', version: '9.6p1 Ubuntu-3ubuntu13.5' },
        {
          port: 80,
          product: 'Apache httpd',
          version: '2.4.58',
          http: {
            server: 'Apache/2.4.58 (Ubuntu)',
            routes: {
              '/': { body: HOME, headers: { 'Content-Type': 'text/plain' } },
              '/robots.txt': { body: ROBOTS, headers: { 'Content-Type': 'text/plain' } },
              '/api/search': { handler: (request) => searchHandler(request.query.q ?? '') },
              '/vault': {
                status: 403,
                body: '403 Forbidden\n',
                headers: { 'Content-Type': 'text/plain' },
              },
            },
          },
        },
      ],
    },
  },
];

export const level15: Level = {
  id: '15-the-last-door',
  chapter: 5,
  title: 'The Last Door',
  briefing:
    'The finale, and it uses everything: recon, web, crypto and lateral movement, chained. ' +
    'corp-core is the deploy host that pushed every change to production. Scan it, read its ' +
    'robots.txt, inject the endpoint it tries to hide to pull an encrypted deploy credential ' +
    'from the vault, decrypt that credential with openssl, and ssh in with it. No new ' +
    'techniques — just the chain, the way a real intrusion is built from ordinary weaknesses.',
  objective: 'Chain recon, injection, decryption and ssh to get a shell on corp-core.',
  debrief:
    'That is the whole game in one level, and the whole lesson of the investigation: no single ' +
    'exploit did this. A public robots.txt, an unparameterised query, a credential encrypted but ' +
    'stored next to its passphrase, and a reused deploy login — each ordinary, each preventable, ' +
    'lethal only in a chain. The best defenders break the chain, not just the last link.',
  skills: ['nmap', 'SQL injection', 'openssl enc -d', 'ssh', 'chaining'],
  startUser: 'analyst',
  startHost: 'corp-audit',
  startCwd: '/home/analyst',
  users: [{ name: 'analyst', uid: 1000, gecos: 'Security Analyst', password: 'analyst' }],
  fs: {
    '/home/analyst/brief.txt': { content: BRIEF, owner: 'analyst' },
  },
  net: {
    interfaces: [{ name: 'eth0', ip: '10.30.0.9' }],
    gateway: '10.30.0.1',
    ports: [{ port: 22, product: 'OpenSSH', version: '9.6p1' }],
  },
  hosts: HOSTS,
  network: { dns: { 'corp-core.novacorp.internal': '10.30.0.10' } },
  flagHash: 'bf350be58a73d58c3c592b5db7f9ad50770a5049d6b730def176269965378e92',
  hints: [
    'Start with recon: `nmap corp-core.novacorp.internal` shows ssh and http. Read `curl http://corp-core.novacorp.internal/robots.txt` — it hides an /api/search endpoint.',
    'The search is injectable. Confirm with a single quote, then UNION into the vault table (three columns): `curl "http://corp-core.novacorp.internal/api/search?q=\' UNION SELECT label, value, note FROM vault -- "`. You get a base64 blob and its passphrase.',
    "Decrypt the blob (it is base64-wrapped openssl): `echo '<blob>' | openssl enc -d -a -aes-256-cbc -k Vault-Core-2026`. That prints the deploy password. Then `ssh deploy@corp-core.novacorp.internal`, `cat root-access.txt`, and submit the flag.",
  ],
  parTimeSec: 900,
  onCommand: (event, api) => {
    const say = (en: string, he: string): void =>
      api.echo(`\x1b[36m${api.locale === 'he' ? he : en}\x1b[0m`);
    const arg = event.args.join(' ');
    if (event.name === 'curl' && /union\s+select/i.test(arg) && api.once('vault')) {
      say(
        'The injection dumped the vault: a base64 blob and its passphrase. Decode and decrypt it to recover the deploy password.',
        'ההזרקה שלפה את הכספת: בלוק base64 והסיסמה שלו. פענחו וחשפו אותו כדי לשחזר את סיסמת ה-deploy.',
      );
      return;
    }
    if (event.name === 'ssh' && event.exitCode === 0 && api.once('on-core')) {
      say(
        'You are on corp-core — root access granted. Read the final file:  cat root-access.txt',
        'אתם על corp-core — הושגה גישת root. קראו את הקובץ האחרון:  cat root-access.txt',
      );
    }
  },
};
