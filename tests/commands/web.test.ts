import { describe, expect, it } from 'vitest';
import { LINUX_COMMANDS } from '../../src/engine/commands';
import { serveHttp, splitQuery } from '../../src/engine/network/http';
import type { HttpSite } from '../../src/engine/network/types';
import { mysqlErrorText, runQuery, SqlError, type SqlDatabase } from '../../src/engine/web/sql';
import type { HostDefinition } from '../../src/engine/system/host';
import { createHarness } from '../helpers/shell';

const DB: SqlDatabase = [
  {
    name: 'customers',
    columns: ['id', 'name', 'email'],
    rows: [
      { id: 1, name: 'Acme Ltd', email: 'ops@acme.example' },
      { id: 2, name: 'Borealis', email: 'it@borealis.example' },
    ],
  },
];

/** A deliberately vulnerable site, built the way the levels build theirs. */
const SITE: HttpSite = {
  server: 'nginx/1.24.0',
  routes: {
    '/': { body: 'NovaCorp portal\n', headers: { 'Content-Type': 'text/plain' } },
    '/robots.txt': {
      body: 'User-agent: *\nDisallow: /internal/\n',
      headers: { 'Content-Type': 'text/plain' },
    },
    '/echo': {
      handler: (request) => ({
        body: `method=${request.method} q=${request.query.q ?? ''} body=${request.body} role=${request.headers['X-Role'] ?? ''}\n`,
        headers: { 'Content-Type': 'text/plain' },
      }),
    },
    '/search': {
      handler: (request) => {
        const sql = `SELECT id, name, email FROM customers WHERE name = '${request.query.q ?? ''}'`;
        try {
          const result = runQuery(DB, sql);
          const lines = result.rows.map((row) => row.join(' | ')).join('\n');
          return { body: `${lines}\n`, headers: { 'Content-Type': 'text/plain' } };
        } catch (error) {
          return {
            status: 500,
            body: `Database error: ${mysqlErrorText(error as SqlError)}\n`,
            headers: { 'Content-Type': 'text/plain' },
          };
        }
      },
    },
    '/broken': { status: 200 },
  },
};

const HOST: HostDefinition = {
  hostname: 'portal',
  users: [{ name: 'guest', uid: 1000 }],
  net: {
    interfaces: [{ name: 'eth0', ip: '10.20.0.10' }],
    ports: [{ port: 80, product: 'nginx', version: '1.24.0', http: SITE }],
  },
};

const h = () => createHarness({ commands: LINUX_COMMANDS, host: HOST, user: 'guest' });

describe('splitQuery', () => {
  it('splits and decodes query parameters', () => {
    expect(splitQuery('/a')).toEqual({ path: '/a', query: {} });
    expect(splitQuery('/a?x=1&y=2')).toEqual({ path: '/a', query: { x: '1', y: '2' } });
    expect(splitQuery('/a?q=hello%20world')).toEqual({ path: '/a', query: { q: 'hello world' } });
    expect(splitQuery('/a?q=a+b')).toEqual({ path: '/a', query: { q: 'a b' } });
    expect(splitQuery('/a?flag')).toEqual({ path: '/a', query: { flag: '' } });
    expect(splitQuery('/a?')).toEqual({ path: '/a', query: {} });
    // A malformed escape is kept verbatim rather than throwing.
    expect(splitQuery('/a?q=%zz').query.q).toBe('%zz');
  });
});

describe('dynamic routes', () => {
  it('passes method, query, body and headers to a handler', () => {
    const response = serveHttp(SITE, {
      method: 'POST',
      path: '/echo?q=hi',
      headers: { 'X-Role': 'admin' },
      body: 'a=1',
    });
    expect(response.body).toBe('method=POST q=hi body=a=1 role=admin\n');
    expect(response.headers['Content-Type']).toBe('text/plain');
  });

  it('serves a 500 for a route with neither body nor handler', () => {
    expect(serveHttp(SITE, { method: 'GET', path: '/broken', headers: {} }).status).toBe(500);
  });
});

describe('curl against a dynamic site', () => {
  it('reads robots.txt and the endpoints it names', async () => {
    const t = h();
    const robots = await t.run('curl http://10.20.0.10/robots.txt');
    expect(robots.stdout).toContain('Disallow: /internal/');
    expect((await t.run('curl -I http://10.20.0.10/robots.txt')).stdout).toContain('text/plain');
  });

  it('sends query strings, bodies, methods and headers', async () => {
    const t = h();
    expect((await t.run('curl "http://10.20.0.10/echo?q=hello"')).stdout).toContain('q=hello');
    expect((await t.run('curl -d "a=1" http://10.20.0.10/echo')).stdout).toContain('method=POST');
    expect((await t.run('curl -d "a=1" http://10.20.0.10/echo')).stdout).toContain('body=a=1');
    expect((await t.run('curl -X PUT http://10.20.0.10/echo')).stdout).toContain('method=PUT');
    expect((await t.run("curl -H 'X-Role: admin' http://10.20.0.10/echo")).stdout).toContain(
      'role=admin',
    );
  });

  it('injects SQL through the search endpoint', async () => {
    const t = h();
    const normal = await t.run('curl "http://10.20.0.10/search?q=Acme%20Ltd"');
    expect(normal.stdout.trim()).toBe('1 | Acme Ltd | ops@acme.example');

    // The classic payload returns every row, because the query text really changed.
    const injected = await t.run(`curl "http://10.20.0.10/search?q=' OR '1'='1"`);
    expect(injected.stdout).toContain('Acme Ltd');
    expect(injected.stdout).toContain('Borealis');

    // A lone quote leaks a real database error.
    const broken = await t.run(`curl "http://10.20.0.10/search?q='"`);
    expect(broken.stdout).toContain('You have an error in your SQL syntax');
  });
});
