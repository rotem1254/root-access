import { serveHttp } from '../network/http';
import { basename } from '../fs/path';
import { parseOptions } from './args';
import { defineCommand } from './define';

function parseUrl(
  raw: string,
): { host: string; port: number; path: string; scheme: string } | null {
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

export const wget = defineCommand({
  name: 'wget',
  kind: 'binary',
  description: 'The non-interactive network downloader',
  usage: ['[-q] [-O file] URL'],
  about:
    'Download a URL to a file. Unlike curl, wget saves to a file by default (named\nafter the URL). Useful for pulling down a file you found on a web service.',
  options: [
    ['-O, --output-document FILE', 'write the document to FILE (- for stdout)'],
    ['-q, --quiet', 'quiet (no output)'],
  ],
  examples: [
    ['wget http://10.10.9.20:8080/backup.tar', 'download a file'],
    ['wget -O - http://vault/', 'print a page to stdout'],
  ],
  seeAlso: ['curl(1)', 'nc(1)'],
  run: async (ctx) => {
    const outcome = parseOptions(
      ctx.name,
      ctx.args,
      [
        { short: 'O', long: 'output-document', arg: 'required' },
        { short: 'q', long: 'quiet' },
      ],
      { unsupported: ['r', 'recursive', 'm', 'mirror', 'c', 'continue'] },
    );
    if (!outcome.ok) {
      ctx.stderr(outcome.message);
      return 2;
    }
    const o = outcome.options;
    const rawUrl = o.operands[0];
    if (rawUrl === undefined) {
      ctx.stderr('wget: missing URL\n');
      return 1;
    }
    const url = parseUrl(rawUrl);
    const ip = url ? ctx.network.resolve(url.host) : undefined;
    if (!url || ip === undefined) {
      ctx.stderr(`wget: unable to resolve host address '${url?.host ?? rawUrl}'\n`);
      return 4;
    }
    const target = ctx.network.machineByIp(ip);
    const service = target ? ctx.network.serviceOn(target, url.port) : undefined;
    if (!target || !ctx.network.canReach(ctx.machine, ip) || !service?.http) {
      ctx.stderr(`wget: unable to connect to ${url.host}:${url.port}: Connection refused\n`);
      return 4;
    }
    const response = serveHttp(service.http, {
      method: 'GET',
      path: url.path,
      headers: { Host: url.host, 'User-Agent': 'Wget/1.21.4' },
    });
    const quiet = o.has('quiet');
    const output = o.value('output-document');
    const bytes = response.body;
    if (output === '-') {
      ctx.stdout(response.body);
      return 0;
    }
    // A URL path of "/" (or any directory path) saves as index.html, as real wget does.
    const base = url.path.endsWith('/') ? '' : basename(url.path);
    const filename = output ?? (base === '' || base === '/' ? 'index.html' : base);
    if (!quiet) {
      ctx.stderr(
        `--2026-03-14 09:00:00--  ${rawUrl}\nResolving ${url.host} (${url.host})... ${ip}\n`,
      );
      ctx.stderr(`Connecting to ${url.host} (${url.host})|${ip}|:${url.port}... connected.\n`);
      ctx.stderr(
        `HTTP request sent, awaiting response... ${response.status} ${response.status === 200 ? 'OK' : ''}\n`.trimEnd() +
          '\n',
      );
      ctx.stderr(`Length: ${bytes.length}\nSaving to: '${filename}'\n\n`);
    }
    if (response.status >= 400) {
      if (!quiet) ctx.stderr(`${response.status} error\n`);
      return 8;
    }
    try {
      ctx.fs.writeFile(filename, bytes);
    } catch {
      ctx.stderr(`wget: cannot write to '${filename}'\n`);
      return 3;
    }
    if (!quiet) {
      ctx.stderr(
        `2026-03-14 09:00:00 (12.3 MB/s) - '${filename}' saved [${bytes.length}/${bytes.length}]\n\n`,
      );
    }
    return 0;
  },
});
