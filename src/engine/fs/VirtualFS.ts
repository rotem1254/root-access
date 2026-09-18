import { FsError } from '../errors';
import type { ByteString } from '../util/bytes';
import type { Clock } from '../util/clock';
import { PERMISSION_BITS, S_ISGID, S_ISVTX } from './mode';
import { components, hasTrailingSlash, isAbsolute, joinRaw } from './path';
import { type Access, type Credentials, canAccess, inGroup, isOwnerOrRoot } from './permissions';
import { type DirNode, type FileNode, type FsNode, type Stat, statOf } from './types';

/** Linux gives up after 40 symlinks in one lookup. */
const MAX_SYMLINKS = 40;

export interface WriteOptions {
  append?: boolean;
  /** Mode for a newly created file, before the umask is applied. Defaults to 0666. */
  createMode?: number;
}

interface Resolved {
  node: FsNode;
  /** Physical, canonical absolute path. */
  path: string;
}

interface ResolvedParent {
  parent: DirNode;
  parentPath: string;
  name: string;
}

/**
 * The simulated filesystem: a tree of nodes with owners, modes and mtimes, and real Linux
 * permission checks on every operation. Paths given to VirtualFS must be absolute; the per-user
 * FileSystem view resolves relative paths against the working directory.
 */
export class VirtualFS {
  readonly root: DirNode;
  umask = 0o022;
  private readonly clock: Clock;

  constructor(clock: Clock, root?: DirNode) {
    this.clock = clock;
    this.root = root ?? {
      type: 'dir',
      uid: 0,
      gid: 0,
      mode: 0o755,
      mtime: clock.now(),
      children: new Map(),
    };
  }

  now(): number {
    return this.clock.now();
  }

  // ── Lookup ──────────────────────────────────────────────────────────────

  /** Walks `path` physically: follows symlinks (the last one only if `followLast`), handles `..`. */
  private walk(path: string, credentials: Credentials, followLast: boolean): Resolved {
    if (!isAbsolute(path)) throw new FsError('ENOENT', path);
    const pending = components(path);
    const mustBeDirectory = hasTrailingSlash(path);
    const dirs: DirNode[] = [this.root];
    const names: string[] = [];
    let node: FsNode = this.root;
    let links = 0;

    while (pending.length > 0) {
      const part = pending.shift() ?? '';
      if (node.type !== 'dir') throw new FsError('ENOTDIR', path);
      const dir: DirNode = node;
      if (!canAccess(dir, true, credentials, 'x')) throw new FsError('EACCES', path);
      if (part === '.') continue;
      if (part === '..') {
        if (dirs.length > 1) {
          dirs.pop();
          names.pop();
        }
        node = dirs[dirs.length - 1] ?? this.root;
        continue;
      }
      const child = dir.children.get(part);
      if (!child) throw new FsError('ENOENT', path);
      const isLast = pending.length === 0;
      if (child.type === 'symlink' && (!isLast || followLast || mustBeDirectory)) {
        links += 1;
        if (links > MAX_SYMLINKS) throw new FsError('ELOOP', path);
        if (isAbsolute(child.target)) {
          dirs.length = 1;
          names.length = 0;
          node = this.root;
        }
        pending.unshift(...components(child.target));
        continue;
      }
      names.push(part);
      if (child.type === 'dir') dirs.push(child);
      node = child;
    }

    if (mustBeDirectory && node.type !== 'dir') throw new FsError('ENOTDIR', path);
    return { node, path: `/${names.join('/')}` };
  }

  /** Resolves everything but the last component, which must be a real name (not `.` or `..`). */
  private walkParent(path: string, credentials: Credentials): ResolvedParent {
    if (!isAbsolute(path)) throw new FsError('ENOENT', path);
    const parts = components(path);
    const name = parts.pop();
    if (name === undefined) throw new FsError('EEXIST', path);
    const parentPath = `/${parts.join('/')}`;
    const { node, path: canonical } = this.walk(parentPath, credentials, true);
    if (node.type !== 'dir') throw new FsError('ENOTDIR', path);
    if (!canAccess(node, true, credentials, 'x')) throw new FsError('EACCES', path);
    return { parent: node, parentPath: canonical, name };
  }

  lookup(path: string, credentials: Credentials, follow = true): Resolved {
    return this.walk(path, credentials, follow);
  }

  stat(path: string, credentials: Credentials): Stat {
    return statOf(this.walk(path, credentials, true).node);
  }

  lstat(path: string, credentials: Credentials): Stat {
    return statOf(this.walk(path, credentials, false).node);
  }

  exists(path: string, credentials: Credentials, follow = false): boolean {
    try {
      this.walk(path, credentials, follow);
      return true;
    } catch {
      return false;
    }
  }

  realpath(path: string, credentials: Credentials): string {
    return this.walk(path, credentials, true).path;
  }

  readlink(path: string, credentials: Credentials): string {
    const { node } = this.walk(path, credentials, false);
    if (node.type !== 'symlink') throw new FsError('EINVAL', path);
    return node.target;
  }

  access(path: string, credentials: Credentials, access: Access): boolean {
    try {
      const { node } = this.walk(path, credentials, true);
      return canAccess(node, node.type === 'dir', credentials, access);
    } catch {
      return false;
    }
  }

  // ── Reading ─────────────────────────────────────────────────────────────

  readFile(path: string, credentials: Credentials): ByteString {
    const { node } = this.walk(path, credentials, true);
    if (node.type === 'dir') throw new FsError('EISDIR', path);
    if (node.type !== 'file') throw new FsError('EINVAL', path);
    if (!canAccess(node, false, credentials, 'r')) throw new FsError('EACCES', path);
    return node.device === 'null' ? '' : node.data;
  }

  /** Entry names in insertion order (callers sort). Needs read permission on the directory. */
  readdir(path: string, credentials: Credentials): string[] {
    const { node } = this.walk(path, credentials, true);
    if (node.type !== 'dir') throw new FsError('ENOTDIR', path);
    if (!canAccess(node, true, credentials, 'r')) throw new FsError('EACCES', path);
    return [...node.children.keys()];
  }

  // ── Writing ─────────────────────────────────────────────────────────────

  writeFile(
    path: string,
    data: ByteString,
    credentials: Credentials,
    options: WriteOptions = {},
  ): void {
    this.writeFileInternal(path, data, credentials, options, 0);
  }

  private writeFileInternal(
    path: string,
    data: ByteString,
    credentials: Credentials,
    options: WriteOptions,
    depth: number,
  ): void {
    if (depth > MAX_SYMLINKS) throw new FsError('ELOOP', path);
    if (hasTrailingSlash(path)) {
      const exists = this.exists(path, credentials, true);
      throw new FsError(exists ? 'EISDIR' : 'ENOTDIR', path);
    }
    const { parent, parentPath, name } = this.walkParent(path, credentials);
    if (name === '.' || name === '..') throw new FsError('EISDIR', path);
    const existing = parent.children.get(name);
    if (existing?.type === 'symlink') {
      const target = isAbsolute(existing.target)
        ? existing.target
        : joinRaw(parentPath, existing.target);
      this.writeFileInternal(target, data, credentials, options, depth + 1);
      return;
    }
    if (existing?.type === 'dir') throw new FsError('EISDIR', path);
    if (existing) {
      if (!canAccess(existing, false, credentials, 'w')) throw new FsError('EACCES', path);
      if (existing.device === 'null') return;
      existing.data = options.append ? existing.data + data : data;
      existing.mtime = this.now();
      return;
    }
    if (!canAccess(parent, true, credentials, 'w')) throw new FsError('EACCES', path);
    const file: FileNode = {
      type: 'file',
      uid: credentials.uid,
      gid: parent.mode & S_ISGID ? parent.gid : credentials.gid,
      mode: (options.createMode ?? 0o666) & ~this.umask & PERMISSION_BITS,
      mtime: this.now(),
      data,
    };
    parent.children.set(name, file);
    parent.mtime = this.now();
  }

  /** `touch`: update mtime (owner, root or write permission) or create an empty file. */
  touch(path: string, credentials: Credentials): void {
    let node: FsNode | undefined;
    try {
      node = this.walk(path, credentials, true).node;
    } catch (error) {
      if (!(error instanceof FsError) || error.code !== 'ENOENT') throw error;
    }
    if (!node) {
      this.writeFile(path, '', credentials, { append: true });
      return;
    }
    if (
      !isOwnerOrRoot(node, credentials) &&
      !canAccess(node, node.type === 'dir', credentials, 'w')
    ) {
      throw new FsError('EACCES', path);
    }
    node.mtime = this.now();
  }

  mkdir(path: string, credentials: Credentials, mode = 0o777): void {
    const { parent, name } = this.walkParent(path, credentials);
    if (name === '.' || name === '..' || parent.children.has(name))
      throw new FsError('EEXIST', path);
    if (!canAccess(parent, true, credentials, 'w')) throw new FsError('EACCES', path);
    const inheritGroup = (parent.mode & S_ISGID) !== 0;
    parent.children.set(name, {
      type: 'dir',
      uid: credentials.uid,
      gid: inheritGroup ? parent.gid : credentials.gid,
      mode: ((mode & ~this.umask) | (inheritGroup ? S_ISGID : 0)) & PERMISSION_BITS,
      mtime: this.now(),
      children: new Map(),
    });
    parent.mtime = this.now();
  }

  symlink(target: string, path: string, credentials: Credentials): void {
    const { parent, name } = this.walkParent(path, credentials);
    if (name === '.' || name === '..' || parent.children.has(name))
      throw new FsError('EEXIST', path);
    if (!canAccess(parent, true, credentials, 'w')) throw new FsError('EACCES', path);
    parent.children.set(name, {
      type: 'symlink',
      uid: credentials.uid,
      gid: credentials.gid,
      mode: 0o777,
      mtime: this.now(),
      target,
    });
    parent.mtime = this.now();
  }

  // ── Removing and moving ────────────────────────────────────────────────

  /** Sticky directories (like /tmp) only let owners (of the file or the directory) delete entries. */
  private checkDeletable(
    parent: DirNode,
    child: FsNode,
    path: string,
    credentials: Credentials,
  ): void {
    if (!canAccess(parent, true, credentials, 'w')) throw new FsError('EACCES', path);
    if (
      parent.mode & S_ISVTX &&
      credentials.uid !== 0 &&
      credentials.uid !== child.uid &&
      credentials.uid !== parent.uid
    ) {
      throw new FsError('EPERM', path);
    }
  }

  unlink(path: string, credentials: Credentials): void {
    const { parent, name } = this.walkParent(path, credentials);
    if (name === '.' || name === '..') throw new FsError('EISDIR', path);
    const child = parent.children.get(name);
    if (!child) throw new FsError('ENOENT', path);
    if (child.type === 'dir') throw new FsError('EISDIR', path);
    this.checkDeletable(parent, child, path, credentials);
    parent.children.delete(name);
    parent.mtime = this.now();
  }

  rmdir(path: string, credentials: Credentials): void {
    if (components(path).length === 0) throw new FsError('EBUSY', path);
    const { parent, name } = this.walkParent(path, credentials);
    if (name === '.') throw new FsError('EINVAL', path);
    if (name === '..') throw new FsError('ENOTEMPTY', path);
    const child = parent.children.get(name);
    if (!child) throw new FsError('ENOENT', path);
    if (child.type !== 'dir') throw new FsError('ENOTDIR', path);
    if (child.children.size > 0) throw new FsError('ENOTEMPTY', path);
    this.checkDeletable(parent, child, path, credentials);
    parent.children.delete(name);
    parent.mtime = this.now();
  }

  rename(from: string, to: string, credentials: Credentials): void {
    const source = this.walkParent(from, credentials);
    if (source.name === '.' || source.name === '..') throw new FsError('EBUSY', from);
    const node = source.parent.children.get(source.name);
    if (!node) throw new FsError('ENOENT', from);
    const destination = this.walkParent(to, credentials);
    if (destination.name === '.' || destination.name === '..') throw new FsError('EBUSY', to);
    if (source.parent === destination.parent && source.name === destination.name) return;
    this.checkDeletable(source.parent, node, from, credentials);
    if (!canAccess(destination.parent, true, credentials, 'w')) throw new FsError('EACCES', to);

    if (node.type === 'dir') {
      const sourcePath = joinRaw(source.parentPath, source.name);
      const destinationPath = joinRaw(destination.parentPath, destination.name);
      if (destinationPath === sourcePath || destinationPath.startsWith(`${sourcePath}/`)) {
        throw new FsError('EINVAL', to);
      }
    }
    const existing = destination.parent.children.get(destination.name);
    if (existing) {
      if (node.type === 'dir' && existing.type !== 'dir') throw new FsError('ENOTDIR', to);
      if (node.type !== 'dir' && existing.type === 'dir') throw new FsError('EISDIR', to);
      if (existing.type === 'dir' && existing.children.size > 0) throw new FsError('ENOTEMPTY', to);
      this.checkDeletable(destination.parent, existing, to, credentials);
    }
    source.parent.children.delete(source.name);
    destination.parent.children.set(destination.name, node);
    source.parent.mtime = this.now();
    destination.parent.mtime = this.now();
  }

  // ── Metadata ────────────────────────────────────────────────────────────

  chmod(path: string, mode: number, credentials: Credentials): void {
    const { node } = this.walk(path, credentials, true);
    if (!isOwnerOrRoot(node, credentials)) throw new FsError('EPERM', path);
    let next = mode & PERMISSION_BITS;
    // The kernel silently drops setgid when a non-member who isn't root changes a file's mode.
    if (credentials.uid !== 0 && node.type !== 'dir' && !inGroup(credentials, node.gid)) {
      next &= ~S_ISGID;
    }
    node.mode = next;
  }

  chown(path: string, uid: number, gid: number, credentials: Credentials, follow = true): void {
    const { node } = this.walk(path, credentials, follow);
    if (credentials.uid !== 0) throw new FsError('EPERM', path);
    node.uid = uid;
    node.gid = gid;
  }

  setMtime(path: string, mtime: number, credentials: Credentials, follow = true): void {
    const { node } = this.walk(path, credentials, follow);
    if (!isOwnerOrRoot(node, credentials)) throw new FsError('EPERM', path);
    node.mtime = mtime;
  }
}
