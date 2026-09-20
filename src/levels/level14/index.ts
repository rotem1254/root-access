import type { Level } from '../../engine/game/level';
import type { HttpRouteResult } from '../../engine/network/types';
import type { HostDefinition } from '../../engine/system/host';
import { mysqlErrorText, runQuery, type SqlDatabase, SqlError } from '../../engine/web/sql';
import { unseal } from '../../engine/util/seal';
import secretSealed from './files/staff-secret.txt?sealed';
import { asSealed } from '../_sealed';

/** The flag is the staff "secret", unsealed at load so it never sits in the bundle as plaintext. */
const STAFF_SECRET = unseal(asSealed(secretSealed));

const BRIEF = `From: alex.mercer@novacorp.example
To: you@novacorp.example
Subject: The product search

Last web target: the shop at shop.novacorp.internal. Its product search puts
whatever you type straight into a database query. Watch what happens when the
input is not a plain word.

  curl "http://shop.novacorp.internal/search?q=Acme"     a normal search
  curl "http://shop.novacorp.internal/search?q='"        a single quote

That single quote breaks the query and the site leaks the database error — that
is your confirmation it is injectable. From there:

  ' OR '1'='1                        make the WHERE always true (dump the table)
  ' UNION SELECT a, b, c FROM other  pull columns from a different table

There is a "staff" table with a "secret" column. A UNION has to match the number
of columns the search returns (three here). Quote the whole URL so the shell
leaves your payload alone.

— Alex
`;

/** The shop's database. The staff.secret column holds the flag (kept sealed until load). */
const DB: SqlDatabase = [
  {
    name: 'products',
    columns: ['name', 'category', 'price'],
    rows: [
      { name: 'Acme Widget', category: 'hardware', price: '19.99' },
      { name: 'Acme Cable', category: 'hardware', price: '4.50' },
      { name: 'Borealis License', category: 'software', price: '499.00' },
      { name: 'NovaCorp Sticker Pack', category: 'swag', price: '3.00' },
    ],
  },
  {
    name: 'staff',
    columns: ['username', 'secret', 'role'],
    rows: [
      { username: 'jhoskins', secret: 'not-the-one', role: 'support' },
      { username: 'root', secret: STAFF_SECRET, role: 'admin' },
    ],
  },
];

/** The vulnerable endpoint: it concatenates q straight into the SQL, then leaks driver errors. */
function searchHandler(q: string): HttpRouteResult {
  const sql = `SELECT name, category, price FROM products WHERE name = '${q}'`;
  try {
    const result = runQuery(DB, sql);
    if (result.rows.length === 0) {
      return { body: 'No products found.\n', headers: { 'Content-Type': 'text/plain' } };
    }
    const lines = result.rows.map((row) => row.join('  |  ')).join('\n');
    return { body: `${lines}\n`, headers: { 'Content-Type': 'text/plain' } };
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

const HOME = `NovaCorp Shop
=============

  Product search : /search?q=NAME

Try searching for a product by name.
`;

const HOSTS: readonly HostDefinition[] = [
  {
    hostname: 'shop',
    net: {
      interfaces: [{ name: 'eth0', ip: '10.20.0.14' }],
      ports: [
        {
          port: 80,
          product: 'Apache httpd',
          version: '2.4.58',
          http: {
            server: 'Apache/2.4.58 (Ubuntu)',
            routes: {
              '/': { body: HOME, headers: { 'Content-Type': 'text/plain' } },
              '/search': { handler: (request) => searchHandler(request.query.q ?? '') },
              '/staff': {
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

export const level14: Level = {
  id: '14-injection',
  chapter: 4,
  title: 'Injection',
  briefing:
    'The shop’s product search drops whatever you type straight into a SQL query and hands the ' +
    'raw database error back when the query breaks. That is SQL injection, still one of the most ' +
    "damaging web flaws there is. A single quote confirms it; `' OR '1'='1` turns the WHERE " +
    'clause always-true; and a `UNION SELECT` pulls columns out of a completely different table. ' +
    'The prize is the `secret` column of the `staff` table — but a UNION must return the same ' +
    'number of columns as the search does.',
  objective: 'Use SQL injection to read the secret from the staff table.',
  debrief:
    'This works for one reason: your input became part of the query instead of staying data. The ' +
    'fix is parameterised queries (prepared statements), where the input can never change the ' +
    'query’s structure — not blacklisting quotes, which attackers slip past. Leaking the raw SQL ' +
    'error made it trivial; a real target may make you work blind.',
  skills: ['curl', 'SQL injection', 'UNION SELECT'],
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
  network: { dns: { 'shop.novacorp.internal': '10.20.0.14' } },
  flagHash: '9352f22e9e7d5e668d9101c40d8c39d44657b852345ac86463b9e7769ed25891',
  hints: [
    'Confirm the flaw: `curl "http://shop.novacorp.internal/search?q=\'"`. A single quote makes the site return a MySQL syntax error, which means your input is reaching the query unescaped.',
    "See the shape of the results first — `?q=' OR '1'='1` dumps the products table, and you can count the columns it returns (three: name, category, price).",
    'UNION across to the staff table with a matching three columns: `curl "http://shop.novacorp.internal/search?q=\' UNION SELECT username, secret, role FROM staff -- "`. The root row’s secret is the flag.',
  ],
  parTimeSec: 480,
  onCommand: (event, api) => {
    const say = (en: string, he: string): void =>
      api.echo(`\x1b[36m${api.locale === 'he' ? he : en}\x1b[0m`);
    const arg = event.args.join(' ');
    if (event.name === 'curl' && /union\s+select/i.test(arg) && api.once('dumped')) {
      say(
        'The UNION worked — that is the staff table talking. The secret column is your flag.',
        'ה-UNION עבד — זו טבלת הצוות מדברת. עמודת ה-secret היא הדגל שלכם.',
      );
      return;
    }
    // The classic first probe: a lone quote that breaks the query proves it is injectable.
    if (event.name === 'curl' && /search\?q='(?!.*union)/i.test(arg) && api.once('injectable')) {
      say(
        "A single quote broke the SQL — the endpoint is injectable. Balance it (' OR '1'='1) then add a UNION SELECT.",
        "גרש בודד שבר את ה-SQL — נקודת הקצה פגיעה. אזנו אותו (' OR '1'='1) ואז הוסיפו UNION SELECT.",
      );
    }
  },
};
