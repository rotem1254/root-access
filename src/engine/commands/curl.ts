import { base64Encode } from '../util/base64';
import { serveHttp, statusText } from '../network/http';
import { utf8Encode } from '../util/bytes';
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

export const curl = defineCommand({
  name: 'curl',
  kind: 'binary',
  description: 'transfer a URL',
  usage: ['[-sIL] [-u user:pass] [-o file] URL'],
  about:
    'Fetch a URL and print the response body. curl is the quickest way to talk to a\nweb service you have found: read a page, inspect the headers, or send simple\nrequests. With no options it prints the body of a GET request.',
  options: [
    ['-I, --head', 'fetch the headers only'],
    ['-s, --silent', 'silent mode (no progress meter)'],
    ['-v, --verbose', 'show the request and response headers'],
    ['-u, --user USER:PASS', 'server user and password for HTTP basic auth'],
    ['-o, --output FILE', 'write the body to FILE instead of stdout'],
    ['-L, --location', 'follow redirects'],
  ],
  details:
    'The URL is http://host[:port]/path. Point curl at a port you found with nmap:\n  curl http://10.10.9.20:8080/\n  curl -I http://vault/\n  curl -u admin:secret http://vault/admin\nUse curl -v to see the status line and headers, which often reveal the server\nand what it wants.',
  examples: [
    ['curl http://10.10.0.5/', 'fetch a web page'],
    ['curl -I http://vault:8080/', 'just the response headers'],
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
      ],
      { unsupported: ['X', 'd', 'data', 'H', 'header', 'k', 'insecure', 'F', 'form'] },
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
    const url = parseUrl(rawUrl);
    if (!url) {
      ctx.stderr(`curl: (3) URL using bad/illegal format or missing URL\n`);
      return 3;
    }
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

    const headers: Record<string, string> = {
      Host: url.host,
      'User-Agent': 'curl/8.5.0',
      Accept: '*/*',
    };
    const user = o.value('user');
    if (user !== undefined) headers.Authorization = `Basic ${base64Encode(user)}`;
    if (o.has('verbose')) {
      ctx.stderr(
        `*   Trying ${ip}:${url.port}...\n* Connected to ${url.host} (${ip}) port ${url.port}\n`,
      );
      ctx.stderr(`> GET ${url.path} HTTP/1.1\n> Host: ${url.host}\n> User-Agent: curl/8.5.0\n>\n`);
    }
    const response = serveHttp(service.http, { method: 'HEAD', path: url.path, headers });

    if (o.has('verbose') || o.has('head')) {
      const statusLine = `HTTP/1.1 ${response.status} ${statusText(response.status)}`;
      ctx.stdout(o.has('head') ? `${statusLine}\r\n` : '');
      if (o.has('verbose')) ctx.stderr(`< ${statusLine}\n`);
      for (const [key, value] of Object.entries(response.headers)) {
        if (o.has('head')) ctx.stdout(`${key}: ${value}\r\n`);
        if (o.has('verbose')) ctx.stderr(`< ${key}: ${value}\n`);
      }
      if (o.has('head')) ctx.stdout('\r\n');
      if (o.has('head')) return 0;
    }

    const output = o.value('output');
    if (output !== undefined && output !== '-') {
      try {
        ctx.fs.writeFile(output, utf8Encode(response.body));
      } catch {
        ctx.stderr(`curl: (23) Failed writing body\n`);
        return 23;
      }
      return 0;
    }
    ctx.stdout(utf8Encode(response.body));
    return 0;
  },
});
