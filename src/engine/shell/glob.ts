/**
 * Glob patterns (`*`, `?`, `[abc]`, `[!a-z]`, `[[:digit:]]`) as used by the shell and `find -name`.
 * A backslash makes the next character literal; quoted text reaches here already escaped.
 */

export interface GlobOptions {
  /** When false (the shell), a leading `.` in a name must be matched by a literal `.`. */
  dotMatchesWildcard?: boolean;
  caseInsensitive?: boolean;
}

const CLASSES: Readonly<Record<string, string>> = {
  alpha: 'A-Za-z',
  digit: '0-9',
  alnum: 'A-Za-z0-9',
  upper: 'A-Z',
  lower: 'a-z',
  space: ' \\t\\n\\r\\f\\v',
  blank: ' \\t',
  punct: '!-\\/:-@\\[-`{-~',
  xdigit: '0-9A-Fa-f',
  print: ' -~',
  graph: '!-~',
  cntrl: '\\x00-\\x1f\\x7f',
};

const escapeRegex = (char: string): string => char.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');

/** True if the pattern has an unescaped `*`, `?` or `[`. */
export function hasGlobChars(pattern: string): boolean {
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern.charAt(i);
    if (c === '\\') i += 1;
    else if (c === '*' || c === '?' || c === '[') return true;
  }
  return false;
}

/** Removes glob escaping: `\*` → `*`. */
export function unescapeGlob(pattern: string): string {
  return pattern.replace(/\\(.)/gs, '$1');
}

/** Escapes characters that are special in glob patterns. */
export function escapeGlob(text: string): string {
  return text.replace(/[*?[\]\\]/g, '\\$&');
}

/** Parses a bracket expression starting at `start` (the `[`). Returns null if unterminated. */
function bracket(pattern: string, start: number): { source: string; end: number } | null {
  let i = start + 1;
  let negate = false;
  if (pattern.charAt(i) === '!' || pattern.charAt(i) === '^') {
    negate = true;
    i += 1;
  }
  let body = '';
  let first = true;
  while (i < pattern.length) {
    const c = pattern.charAt(i);
    if (c === ']' && !first) {
      return { source: `[${negate ? '^' : ''}${body}]`, end: i + 1 };
    }
    first = false;
    if (c === '[' && pattern.charAt(i + 1) === ':') {
      const close = pattern.indexOf(':]', i + 2);
      const name = close >= 0 ? pattern.slice(i + 2, close) : '';
      const cls = CLASSES[name];
      if (cls !== undefined) {
        body += cls;
        i = close + 2;
        continue;
      }
    }
    if (c === '\\' && i + 1 < pattern.length) {
      body += escapeRegex(pattern.charAt(i + 1));
      i += 2;
      continue;
    }
    if (c === '-' && body !== '' && pattern.charAt(i + 1) !== ']') {
      body += '-';
      i += 1;
      continue;
    }
    body += escapeRegex(c);
    i += 1;
  }
  return null;
}

export function globToRegExp(pattern: string, options: GlobOptions = {}): RegExp {
  let source = '';
  let i = 0;
  while (i < pattern.length) {
    const c = pattern.charAt(i);
    if (c === '\\' && i + 1 < pattern.length) {
      source += escapeRegex(pattern.charAt(i + 1));
      i += 2;
    } else if (c === '*') {
      source += '.*';
      i += 1;
    } else if (c === '?') {
      source += '.';
      i += 1;
    } else if (c === '[') {
      const parsed = bracket(pattern, i);
      if (parsed) {
        source += parsed.source;
        i = parsed.end;
      } else {
        source += '\\[';
        i += 1;
      }
    } else {
      source += escapeRegex(c);
      i += 1;
    }
  }
  return new RegExp(`^${source}$`, options.caseInsensitive ? 'is' : 's');
}

export function matchGlob(pattern: string, name: string, options: GlobOptions = {}): boolean {
  if (!options.dotMatchesWildcard && name.startsWith('.')) {
    const literalDot = pattern.startsWith('.') || pattern.startsWith('\\.');
    if (!literalDot) return false;
  }
  return globToRegExp(pattern, options).test(name);
}

/** Byte-order comparison, like `LC_COLLATE=C`. */
export function compareBytes(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** The filesystem operations pathname expansion needs. Both return null on any error. */
export interface GlobFileSystem {
  readdir(absolutePath: string): string[] | null;
  isDirectory(absolutePath: string): boolean;
  exists(absolutePath: string): boolean;
}

/**
 * Pathname expansion. Returns sorted matches written the way the pattern was (relative patterns
 * give relative paths), or null when nothing matches.
 */
export function expandPathname(pattern: string, cwd: string, fs: GlobFileSystem): string[] | null {
  if (!hasGlobChars(pattern)) return null;
  const absolute = pattern.startsWith('/');
  const trailingSlash = pattern.endsWith('/');
  const parts = pattern.split('/').filter((part) => part !== '');
  let candidates: { shown: string; path: string }[] = [
    { shown: absolute ? '/' : '', path: absolute ? '/' : cwd },
  ];
  const join = (base: string, name: string): string =>
    base === '' ? name : base.endsWith('/') ? `${base}${name}` : `${base}/${name}`;

  for (const part of parts) {
    const next: { shown: string; path: string }[] = [];
    if (!hasGlobChars(part)) {
      const name = unescapeGlob(part);
      for (const candidate of candidates) {
        next.push({ shown: join(candidate.shown, name), path: join(candidate.path, name) });
      }
    } else {
      for (const candidate of candidates) {
        const names = fs.readdir(candidate.path);
        if (!names) continue;
        for (const name of [...names].sort(compareBytes)) {
          if (matchGlob(part, name)) {
            next.push({ shown: join(candidate.shown, name), path: join(candidate.path, name) });
          }
        }
      }
    }
    candidates = next;
    if (candidates.length === 0) return null;
  }

  const matches = candidates
    .filter((candidate) =>
      trailingSlash ? fs.isDirectory(candidate.path) : fs.exists(candidate.path),
    )
    .map((candidate) => (trailingSlash ? `${candidate.shown}/` : candidate.shown))
    .sort(compareBytes);
  return matches.length > 0 ? matches : null;
}
