import { base64Decode } from '../util/base64';
import { type ByteString, utf8Encode } from '../util/bytes';
import { isSealed, type Sealed, unseal } from '../util/seal';
import type { HttpRequestInfo, HttpSite } from './types';

/**
 * A body as bytes. A sealed body (used so a flag in a page never appears as plaintext in the
 * bundle) is already a byte string; an author-written string is UTF-8 encoded here. Returning bytes
 * keeps callers from encoding twice, which mangled every non-ASCII character.
 */
function bodyOf(body: string | Sealed): ByteString {
  return isSealed(body) ? unseal(body) : utf8Encode(body);
}

/** Splits `/path?a=1&b=2` into its path and decoded query parameters. */
export function splitQuery(target: string): { path: string; query: Record<string, string> } {
  const mark = target.indexOf('?');
  if (mark < 0) return { path: target, query: {} };
  const query: Record<string, string> = {};
  for (const pair of target.slice(mark + 1).split('&')) {
    if (pair === '') continue;
    const equals = pair.indexOf('=');
    const rawKey = equals < 0 ? pair : pair.slice(0, equals);
    const rawValue = equals < 0 ? '' : pair.slice(equals + 1);
    try {
      query[decodeURIComponent(rawKey.replace(/\+/g, ' '))] = decodeURIComponent(
        rawValue.replace(/\+/g, ' '),
      );
    } catch {
      query[rawKey] = rawValue;
    }
  }
  return { path: target.slice(0, mark), query };
}

export interface HttpRequest {
  method: string;
  /** May include a query string; it is split out before the route is matched. */
  path: string;
  headers: Readonly<Record<string, string>>;
  /** Request body, e.g. what `curl -d` sent. */
  body?: string;
}

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  /** Byte string, ready to write to a terminal or a file without further encoding. */
  body: ByteString;
}

const STATUS_TEXT: Readonly<Record<number, string>> = {
  200: 'OK',
  301: 'Moved Permanently',
  302: 'Found',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  500: 'Internal Server Error',
};

export function statusText(status: number): string {
  return STATUS_TEXT[status] ?? 'Unknown';
}

/** Decodes an HTTP Basic `Authorization: Basic <b64>` header into user:password. */
function decodeBasicAuth(header: string | undefined): { user: string; password: string } | null {
  if (!header) return null;
  const match = /^Basic\s+(.+)$/i.exec(header.trim());
  if (!match?.[1]) return null;
  const decoded = base64Decode(match[1]);
  if (!decoded.ok) return null;
  const colon = decoded.bytes.indexOf(':');
  if (colon < 0) return null;
  return { user: decoded.bytes.slice(0, colon), password: decoded.bytes.slice(colon + 1) };
}

/** Resolves a request against a site's routes, honouring a trailing-slash and basic auth. */
/** Lower-cases header names, because HTTP header fields are case-insensitive (RFC 9110). */
function lowerKeys(headers: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) out[key.toLowerCase()] = value;
  return out;
}

export function serveHttp(site: HttpSite, request: HttpRequest): HttpResponse {
  const server = site.server ?? 'nginx/1.24.0 (Ubuntu)';
  const requestHeaders = lowerKeys(request.headers);
  const baseHeaders = (): Record<string, string> => ({
    Server: server,
    'Content-Type': 'text/html',
  });
  const { path: rawPath, query } = splitQuery(request.path);
  const path = rawPath === '' ? '/' : rawPath;
  const route =
    site.routes[path] ?? site.routes[path.replace(/\/$/, '')] ?? site.routes[`${path}/`];
  if (!route) {
    return {
      status: 404,
      statusText: statusText(404),
      headers: baseHeaders(),
      body: utf8Encode(
        `<html>\n<head><title>404 Not Found</title></head>\n<body>\n<center><h1>404 Not Found</h1></center>\n<hr><center>${server}</center>\n</body>\n</html>\n`,
      ),
    };
  }
  if (route.auth) {
    const creds = decodeBasicAuth(requestHeaders.authorization);
    if (creds?.user !== route.auth.user || creds.password !== route.auth.password) {
      return {
        status: 401,
        statusText: statusText(401),
        headers: { ...baseHeaders(), 'WWW-Authenticate': `Basic realm="${route.auth.realm}"` },
        body: utf8Encode(
          '<html>\n<head><title>401 Authorization Required</title></head>\n<body>\n<center><h1>401 Authorization Required</h1></center>\n</body>\n</html>\n',
        ),
      };
    }
  }
  if (route.handler) {
    const info: HttpRequestInfo = {
      method: request.method,
      path,
      query,
      headers: requestHeaders,
      body: request.body ?? '',
    };
    const result = route.handler(info);
    const status = result.status ?? route.status ?? 200;
    const headers: Record<string, string> = {
      ...baseHeaders(),
      ...route.headers,
      ...result.headers,
    };
    const body = bodyOf(result.body);
    headers['Content-Length'] = String(body.length);
    return { status, statusText: statusText(status), headers, body };
  }
  if (route.body === undefined) {
    return {
      status: 500,
      statusText: statusText(500),
      headers: baseHeaders(),
      body: utf8Encode('<html><head><title>500 Internal Server Error</title></head></html>\n'),
    };
  }
  const status = route.status ?? 200;
  const headers: Record<string, string> = { ...baseHeaders(), ...route.headers };
  const body = bodyOf(route.body);
  headers['Content-Length'] = String(body.length);
  return { status, statusText: statusText(status), headers, body };
}
