/**
 * POSIX path helpers. These are lexical: they never touch the filesystem or follow symlinks.
 * Physical resolution (symlinks, `..` through links) happens in VirtualFS.
 */

export function isAbsolute(path: string): boolean {
  return path.startsWith('/');
}

/** Non-empty components of a path: `/a//b/` → `['a', 'b']`. */
export function components(path: string): string[] {
  return path.split('/').filter((part) => part !== '');
}

export function hasTrailingSlash(path: string): boolean {
  return path.length > 1 && path.endsWith('/');
}

/** Collapses `//`, removes `.`, and resolves `..` lexically. `..` never climbs above `/`. */
export function normalize(path: string): string {
  const absolute = isAbsolute(path);
  const out: string[] = [];
  for (const part of components(path)) {
    if (part === '.') continue;
    if (part === '..') {
      if (out.length > 0 && out[out.length - 1] !== '..') out.pop();
      else if (!absolute) out.push('..');
      continue;
    }
    out.push(part);
  }
  if (absolute) return `/${out.join('/')}`;
  return out.length > 0 ? out.join('/') : '.';
}

export function join(...parts: string[]): string {
  const nonEmpty = parts.filter((part) => part !== '');
  return nonEmpty.length > 0 ? normalize(nonEmpty.join('/')) : '.';
}

/** Lexically resolves `path` against the absolute directory `cwd`. */
export function resolve(cwd: string, path: string): string {
  return normalize(isAbsolute(path) ? path : `${cwd}/${path}`);
}

/** Joins a directory and a name without normalizing (keeps `..` for physical resolution). */
export function joinRaw(directory: string, name: string): string {
  if (isAbsolute(name)) return name;
  return directory.endsWith('/') ? `${directory}${name}` : `${directory}/${name}`;
}

/** POSIX dirname: `/a/b` → `/a`, `a` → `.`, `/` → `/`. */
export function dirname(path: string): string {
  if (path === '') return '.';
  let end = path.length;
  while (end > 1 && path[end - 1] === '/') end -= 1;
  const trimmed = path.slice(0, end);
  const slash = trimmed.lastIndexOf('/');
  if (slash < 0) return '.';
  if (slash === 0) return '/';
  let dirEnd = slash;
  while (dirEnd > 1 && trimmed[dirEnd - 1] === '/') dirEnd -= 1;
  return trimmed.slice(0, dirEnd);
}

/** POSIX basename: `/a/b/` → `b`, `/` → `/`. */
export function basename(path: string): string {
  if (path === '') return '';
  let end = path.length;
  while (end > 1 && path[end - 1] === '/') end -= 1;
  const trimmed = path.slice(0, end);
  if (trimmed === '/') return '/';
  return trimmed.slice(trimmed.lastIndexOf('/') + 1);
}

/** Replaces a leading `$HOME` with `~`, as bash does for `\w` in the prompt. */
export function tildify(path: string, home: string): string {
  if (home.length <= 1 || home.endsWith('/')) return path;
  if (path === home) return '~';
  if (path.startsWith(`${home}/`)) return `~${path.slice(home.length)}`;
  return path;
}

/**
 * Tilde expansion for a word that starts with `~`: `~`, `~/x`, `~user`, `~user/x`.
 * Returns the word unchanged when the user is unknown (bash does the same).
 */
export function expandTilde(
  word: string,
  home: string,
  homeOf: (user: string) => string | undefined,
): string {
  if (!word.startsWith('~')) return word;
  const slash = word.indexOf('/');
  const userPart = slash < 0 ? word.slice(1) : word.slice(1, slash);
  const rest = slash < 0 ? '' : word.slice(slash);
  const base = userPart === '' ? home : homeOf(userPart);
  if (base === undefined) return word;
  if (rest === '') return base;
  return base === '/' ? rest : `${base}${rest}`;
}
