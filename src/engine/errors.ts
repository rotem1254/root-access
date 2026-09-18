/** errno-style codes used by the virtual filesystem, with glibc's `strerror` wording. */
export type Errno =
  | 'ENOENT'
  | 'EACCES'
  | 'EPERM'
  | 'ENOTDIR'
  | 'EISDIR'
  | 'EEXIST'
  | 'ENOTEMPTY'
  | 'ELOOP'
  | 'EINVAL'
  | 'EBUSY'
  | 'ENAMETOOLONG';

export const STRERROR: Readonly<Record<Errno, string>> = {
  ENOENT: 'No such file or directory',
  EACCES: 'Permission denied',
  EPERM: 'Operation not permitted',
  ENOTDIR: 'Not a directory',
  EISDIR: 'Is a directory',
  EEXIST: 'File exists',
  ENOTEMPTY: 'Directory not empty',
  ELOOP: 'Too many levels of symbolic links',
  EINVAL: 'Invalid argument',
  EBUSY: 'Device or resource busy',
  ENAMETOOLONG: 'File name too long',
};

export function strerror(code: Errno): string {
  return STRERROR[code];
}

/** Thrown by filesystem operations. `path` is the path as the caller passed it. */
export class FsError extends Error {
  readonly code: Errno;
  readonly path: string;

  constructor(code: Errno, path: string) {
    super(`${path}: ${STRERROR[code]}`);
    this.name = 'FsError';
    this.code = code;
    this.path = path;
  }
}

export function isFsError(error: unknown): error is FsError {
  return error instanceof FsError;
}
