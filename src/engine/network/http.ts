import { base64Decode } from '../util/base64';
import { type ByteString, utf8Encode } from '../util/bytes';
import { isSealed, unseal } from '../util/seal';
import type { HttpRoute, HttpSite } from './types';

/**
 * A route body as bytes. A sealed body (used so a flag in a page never appears as plaintext in the
 * bundle) is already a byte string; an author-written string is UTF-8 encoded here. Returning bytes
 * keeps callers from encoding twice, which mangled every non-ASCII character.
 */
function bodyOf(route: HttpRoute): ByteString {
  return isSealed(route.body) ? unseal(route.body) : utf8Encode(route.body);
}

export interface HttpRequest {
  method: string;
  path: string;
  headers: Readonly<Record<string, string>>;
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
export function serveHttp(site: HttpSite, request: HttpRequest): HttpResponse {
  const server = site.server ?? 'nginx/1.24.0 (Ubuntu)';
  const baseHeaders = (): Record<string, string> => ({
    Server: server,
    'Content-Type': 'text/html',
  });
  const path = request.path === '' ? '/' : request.path;
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
    const creds = decodeBasicAuth(request.headers.authorization ?? request.headers.Authorization);
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
  const status = route.status ?? 200;
  const headers: Record<string, string> = { ...baseHeaders(), ...route.headers };
  const body = bodyOf(route);
  headers['Content-Length'] = String(body.length);
  return { status, statusText: statusText(status), headers, body };
}
