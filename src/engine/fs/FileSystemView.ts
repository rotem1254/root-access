import { FsError, isFsError } from '../errors';
import type { ByteString } from '../util/bytes';
import { isAbsolute, joinRaw } from './path';
import type { Access, Credentials } from './permissions';
import type { Stat } from './types';
import type { VirtualFS, WriteOptions } from './VirtualFS';

/**
 * What commands receive: the filesystem as seen by the current user, with relative paths
 * resolved against the working directory. Errors carry the path exactly as the caller wrote it,
 * so commands can print `cat: notes.txt: Permission denied`.
 */
export interface FileSystem {
  /** Absolute path used for a (possibly relative) argument. `..` is left for physical resolution. */
  absolute(path: string): string;
  stat(path: string): Stat;
  lstat(path: string): Stat;
  exists(path: string, follow?: boolean): boolean;
  realpath(path: string): string;
  readlink(path: string): string;
  access(path: string, access: Access): boolean;
  readFile(path: string): ByteString;
  readdir(path: string): string[];
  writeFile(path: string, data: ByteString, options?: WriteOptions): void;
  touch(path: string): void;
  mkdir(path: string, mode?: number): void;
  symlink(target: string, path: string): void;
  unlink(path: string): void;
  rmdir(path: string): void;
  rename(from: string, to: string): void;
  chmod(path: string, mode: number): void;
  readonly umask: number;
}

export function createFileSystemView(
  vfs: VirtualFS,
  credentials: () => Credentials,
  cwd: () => string,
): FileSystem {
  const absolute = (path: string): string => {
    if (path === '') throw new FsError('ENOENT', path);
    return isAbsolute(path) ? path : joinRaw(cwd(), path);
  };

  /** Runs an operation and re-labels errors with the caller's path. */
  const run = <T>(path: string, operation: (absolutePath: string) => T): T => {
    try {
      return operation(absolute(path));
    } catch (error) {
      if (isFsError(error)) throw new FsError(error.code, path);
      throw error;
    }
  };

  return {
    absolute,
    stat: (path) => run(path, (p) => vfs.stat(p, credentials())),
    lstat: (path) => run(path, (p) => vfs.lstat(p, credentials())),
    exists: (path, follow = false) =>
      path !== '' && vfs.exists(absolute(path), credentials(), follow),
    realpath: (path) => run(path, (p) => vfs.realpath(p, credentials())),
    readlink: (path) => run(path, (p) => vfs.readlink(p, credentials())),
    access: (path, access) => path !== '' && vfs.access(absolute(path), credentials(), access),
    readFile: (path) => run(path, (p) => vfs.readFile(p, credentials())),
    readdir: (path) => run(path, (p) => vfs.readdir(p, credentials())),
    writeFile: (path, data, options) =>
      run(path, (p) => {
        vfs.writeFile(p, data, credentials(), options);
      }),
    touch: (path) =>
      run(path, (p) => {
        vfs.touch(p, credentials());
      }),
    mkdir: (path, mode) =>
      run(path, (p) => {
        vfs.mkdir(p, credentials(), mode);
      }),
    symlink: (target, path) =>
      run(path, (p) => {
        vfs.symlink(target, p, credentials());
      }),
    unlink: (path) =>
      run(path, (p) => {
        vfs.unlink(p, credentials());
      }),
    rmdir: (path) =>
      run(path, (p) => {
        vfs.rmdir(p, credentials());
      }),
    rename: (from, to) => {
      try {
        vfs.rename(absolute(from), absolute(to), credentials());
      } catch (error) {
        if (!isFsError(error)) throw error;
        throw new FsError(error.code, error.path === absolute(to) ? to : from);
      }
    },
    chmod: (path, mode) =>
      run(path, (p) => {
        vfs.chmod(p, mode, credentials());
      }),
    get umask() {
      return vfs.umask;
    },
  };
}
