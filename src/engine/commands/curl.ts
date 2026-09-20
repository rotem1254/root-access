import { base64Encode } from '../util/base64';
import { serveHttp, statusText } from '../network/http';
import { parseOptions } from './args';
import { defineCommand } from './define';

interface ParsedUrl {
  scheme: string;
  host: string;
  port: number;
  path: string;
}

function parseUrl(raw: string): ParsedUrl | null {
  const withScheme = /^[a-z]+:\/\//i.test(raw) ? raw : `http://${raw}`;
  const match = /^([a-z]+):\/\/([^/:]+)(?::(\d+))?(\/.*)?$/i.exec(withScheme);
  if (!match) return null;
  const scheme = (match[1] ?? 'http').toLowerCase();
  return {
    scheme,
    host: match[2] ?? '',
    port: match[3] ? Number(match[3]) : scheme === 'https' ? 443 : 80,
    path: match[4] ?? '/',
  };
}

/** Resolves a redirect's Location against the current URL (absolute, root-relative or relative). */
function resolveLocation(location: string, base: ParsedUrl): ParsedUrl | null {
  if (/^[a-z]+:\/\//i.test(location)) return parseUrl(location);
  if (location.startsWith('/')) return { ...base, path: location };
  const dir = base.path.slice(0, base.path.lastIndexOf('/') + 1) || '/';
  return { ...base, path: dir + location };
}

export const curl = defineCommand({
  name: 'curl',
  kind: 'binary',
  description: 'transfer a URL',
  usage: ['[-sIL] [-X METHOD] [-d DATA] [-H HEADER] [-u user:pass] [-o file] URL'],
  about:
    'Fetch a URL and print the response body. curl is the quickest way to talk to a\nweb service you have found: read a page, inspect the headers, or send simple\nrequests. With no options it prints the body of a GET request.',
  options: [
    ['-I, --head', 'fetch the headers only'],
    ['-s, --silent', 'silent mode (no progress meter)'],
    ['-v, --verbose', 'show the request and response headers'],
    ['-u, --user USER:PASS', 'server user and password for HTTP basic auth'],
    ['-o, --output FILE', 'write the body to FILE instead of stdout'],
    ['-L, --location', 'follow redirects'],
    ['-A, --user-agent NAME', 'the User-Agent string to send'],
    ['-X, --request METHOD', 'the request method to use (GET, POST, ...)'],
    ['-d, --data DATA', 'send DATA as the request body; implies POST'],
    ['-H, --header LINE', "add a request header, e.g. -H 'X-Role: admin'"],
    ['-b, --cookie DATA', 'send a cookie header'],
  ],
  details:
    'The URL is http://host[:port]/path, and it may carry a query string:\n  curl "http://site/search?q=acme"\nQuote the URL when it contains & or ? so the shell does not eat them.\n\nOther common forms:\n  curl -I http://vault/                       headers only\n  curl -u admin:secret http://vault/admin     HTTP basic auth\n  curl -d "user=x&pass=y" http://site/login   send a form (implies POST)\n  curl -H \'X-Role: admin\' http://site/me      add a request header\nUse curl -v to see the status line and headers, which often reveal the server\nand what it wants.',
  examples: [
    ['curl http://10.10.0.5/', 'fetch a web page'],
    ['curl -I http://vault:8080/', 'just the response headers'],
    ['curl "http://site/item?id=7"', 'pass a query parameter'],
    ['curl -d "q=acme" http://site/search', 'send a form body'],
  ],
  seeAlso: ['wget(1)', 'nc(1)', 'nmap(1)'],
  run: async (ctx) => {
    const outcome = parseOptions(
      ctx.name,
      ctx.args,
      [
        { short: 'I', long: 'head' },
        { short: 's', long: 'silent' },
        { short: 'v', long: 'verbose' },
        { short: 'u', long: 'user', arg: 'required' },
        { short: 'o', long: 'output', arg: 'required' },
        { short: 'L', long: 'location' },
        { short: 'A', long: 'user-agent', arg: 'required' },
        { short: 'X', long: 'request', arg: 'required' },
        { short: 'd', long: 'data', arg: 'required' },
        { short: 'H', long: 'header', arg: 'required' },
        { short: 'b', long: 'cookie', arg: 'required' },
        { short: 'k', long: 'insecure' },
      ],
      { unsupported: ['F', 'form', 'data-binary', 'T', 'upload-file'] },
    );
    if (!outcome.ok) {
      ctx.stderr(outcome.message);
      return 2;
    }
    const o = outcome.options;
    const rawUrl = o.operands[0];
    if (rawUrl === undefined) {
      ctx.stderr("curl: try 'curl --help' for more information\n");
      return 2;
    }
    let url = parseUrl(rawUrl);
    if (!url) {
      ctx.stderr(`curl: (3) URL using bad/illegal format or missing URL\n`);
      return 3;
    }

    // Headers that persist across redirects. Host is set per hop, inside the loop.
    const userAgent = o.value('user-agent') ?? 'curl/8.5.0';
    const extra: Record<string, string> = {};
    const user = o.value('user');
    if (user !== undefined) extra.Authorization = `Basic ${base64Encode(user)}`;
    const cookie = o.value('cookie');
    if (cookie !== undefined) extra.Cookie = cookie;
    for (const header of o.values('header')) {
      const colon = header.indexOf(':');
      if (colon > 0) extra[header.slice(0, colon).trim()] = header.slice(colon + 1).trim();
    }
    // -d implies POST with a form content type, exactly like the real tool.
    let data = o.value('data');
    let method = o.value('request') ?? (data !== undefined ? 'POST' : 'GET');

    const REDIRECTS = new Set([301, 302, 303, 307, 308]);
    const MAX_REDIRECTS = 50;
    let response: ReturnType<typeof serveHttp> | undefined;

    for (let hop = 0; ; hop++) {
      const ip = ctx.network.resolve(url.host);
      if (ip === undefined) {
        ctx.stderr(`curl: (6) Could not resolve host: ${url.host}\n`);
        return 6;
      }
      const target = ctx.network.machineByIp(ip);
      const service = target ? ctx.network.serviceOn(target, url.port) : undefined;
      if (!target || !ctx.network.canReach(ctx.machine, ip) || !service?.http) {
        ctx.stderr(
          `curl: (7) Failed to connect to ${url.host} port ${url.port} after 0 ms: Connection refused\n`,
        );
        return 7;
      }

      const requestHeaders: Record<string, string> = {
        Host: url.host,
        'User-Agent': userAgent,
        Accept: '*/*',
        ...extra,
        ...(data !== undefined ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      };
      if (o.has('verbose')) {
        ctx.stderr(
          `*   Trying ${ip}:${url.port}...\n* Connected to ${url.host} (${ip}) port ${url.port}\n`,
        );
        ctx.stderr(`> ${method} ${url.path} HTTP/1.1\n`);
        for (const [key, value] of Object.entries(requestHeaders))
          ctx.stderr(`> ${key}: ${value}\n`);
        ctx.stderr('>\n');
      }
      response = serveHttp(service.http, {
        method,
        path: url.path,
        headers: requestHeaders,
        ...(data !== undefined ? { body: data } : {}),
      });
      if (o.has('verbose')) {
        ctx.stderr(`< HTTP/1.1 ${response.status} ${statusText(response.status)}\n`);
        for (const [key, value] of Object.entries(response.headers))
          ctx.stderr(`< ${key}: ${value}\n`);
        ctx.stderr('<\n');
      }

      const location = response.headers.Location;
      if (!o.has('location') || !REDIRECTS.has(response.status) || location === undefined) break;
      if (hop >= MAX_REDIRECTS) {
        ctx.stderr(`curl: (47) Maximum (${MAX_REDIRECTS}) redirects followed\n`);
        return 47;
      }
      const next = resolveLocation(location, url);
      if (!next) break;
      url = next;
      // 301/302/303 drop to a bodyless GET; 307/308 preserve the method and body.
      if (response.status !== 307 && response.status !== 308) {
        method = 'GET';
        data = undefined;
      }
    }

    if (o.has('head')) {
      const statusLine = `HTTP/1.1 ${response.status} ${statusText(response.status)}`;
      ctx.stdout(`${statusLine}\r\n`);
      for (const [key, value] of Object.entries(response.headers))
        ctx.stdout(`${key}: ${value}\r\n`);
      ctx.stdout('\r\n');
      return 0;
    }

    const output = o.value('output');
    if (output !== undefined && output !== '-') {
      try {
        ctx.fs.writeFile(output, response.body);
      } catch {
        ctx.stderr(`curl: (23) Failed writing body\n`);
        return 23;
      }
      return 0;
    }
    ctx.stdout(response.body);
    return 0;
  },
});
