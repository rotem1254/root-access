/** Permission bits, like `st_mode & 07777`. */
export const S_ISUID = 0o4000;
export const S_ISGID = 0o2000;
export const S_ISVTX = 0o1000;
export const PERMISSION_BITS = 0o7777;

/** Parses an octal mode such as `644`, `0644`, `4755` or `01777`. Returns null when invalid. */
export function parseOctalMode(text: string): number | null {
  if (!/^[0-7]{1,5}$/.test(text)) return null;
  const value = Number.parseInt(text, 8);
  return value <= PERMISSION_BITS ? value : null;
}

export function formatOctalMode(mode: number): string {
  return (mode & PERMISSION_BITS).toString(8).padStart(4, '0');
}

export type ModeFileType = 'file' | 'dir' | 'symlink' | 'chardev';

const TYPE_CHAR: Readonly<Record<ModeFileType, string>> = {
  file: '-',
  dir: 'd',
  symlink: 'l',
  chardev: 'c',
};

/** `ls -l` permission string, including s/S and t/T for special bits: `-rwsr-xr-x`. */
export function formatModeString(type: ModeFileType, mode: number): string {
  const triplet = (shift: number, special: number, specialChar: string): string => {
    const r = mode & (4 << shift) ? 'r' : '-';
    const w = mode & (2 << shift) ? 'w' : '-';
    const x = (mode & (1 << shift)) !== 0;
    let third: string;
    if (mode & special) third = x ? specialChar : specialChar.toUpperCase();
    else third = x ? 'x' : '-';
    return `${r}${w}${third}`;
  };
  return (
    TYPE_CHAR[type] + triplet(6, S_ISUID, 's') + triplet(3, S_ISGID, 's') + triplet(0, S_ISVTX, 't')
  );
}

const WHO_MASK: Readonly<Record<string, number>> = {
  u: S_ISUID | 0o700,
  g: S_ISGID | 0o070,
  o: S_ISVTX | 0o007,
};

/**
 * Applies a chmod-style symbolic mode (`u+x`, `go-w`, `a=r,u+s`, `+X`, `g=u`) to `current`.
 * Returns null when the specification is invalid.
 *
 * As in GNU chmod, an omitted "who" means `a`, except that bits set in the umask are not changed.
 */
export function applySymbolicMode(
  spec: string,
  current: number,
  options: { isDirectory: boolean; umask: number },
): number | null {
  let mode = current & PERMISSION_BITS;
  for (const clause of spec.split(',')) {
    const match = /^([ugoa]*)((?:[-+=](?:[rwxXst]*|[ugo]))+)$/.exec(clause);
    if (!match) return null;
    const whoText = match[1] ?? '';
    const actions = match[2] ?? '';
    const explicitWho = whoText !== '';
    const who = explicitWho ? whoText.replace('a', 'ugo') : 'ugo';

    let whoMask = 0;
    for (const w of who) whoMask |= WHO_MASK[w] ?? 0;
    const umaskFilter = explicitWho ? PERMISSION_BITS : ~options.umask & PERMISSION_BITS;

    for (const action of actions.matchAll(/([-+=])([ugo]|[rwxXst]*)/g)) {
      const op = action[1] ?? '+';
      const perms = action[2] ?? '';
      let bits = 0;
      if (/^[ugo]$/.test(perms)) {
        const shift = perms === 'u' ? 6 : perms === 'g' ? 3 : 0;
        const source = (mode >> shift) & 0o7;
        bits = (source << 6) | (source << 3) | source;
      } else {
        for (const p of perms) {
          if (p === 'r') bits |= 0o444;
          else if (p === 'w') bits |= 0o222;
          else if (p === 'x') bits |= 0o111;
          else if (p === 'X') {
            if (options.isDirectory || (mode & 0o111) !== 0) bits |= 0o111;
          } else if (p === 's') bits |= S_ISUID | S_ISGID;
          else bits |= S_ISVTX;
        }
      }
      const affected = bits & whoMask & umaskFilter;
      if (op === '+') mode |= affected;
      else if (op === '-') mode &= ~affected;
      else {
        const clearMask = whoMask & 0o777 & (explicitWho ? PERMISSION_BITS : umaskFilter);
        const specialClear = options.isDirectory ? 0 : whoMask & (S_ISUID | S_ISGID | S_ISVTX);
        mode = (mode & ~clearMask & ~specialClear) | affected;
      }
    }
  }
  return mode & PERMISSION_BITS;
}
