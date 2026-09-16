import type { UserDB } from '../system/UserDB';
import { base64Decode } from '../util/base64';
import { type ByteString, utf8Encode } from '../util/bytes';
import { isSealed, type Sealed, unseal } from '../util/seal';
import { parseOctalMode } from './mode';
import { components, normalize } from './path';
import type { DirNode, FsNode } from './types';

/** Shared metadata for declarative filesystem entries. */
export interface EntryMeta {
  /** Octal string, e.g. `"0644"` or `"4755"`. */
  mode?: string;
  /** User name. Defaults to `root`. */
  owner?: string;
  /** Group name. Defaults to the owner's primary group. */
  group?: string;
  /** ISO 8601 timestamp. Defaults to the level's story time. */
  mtime?: string;
}

/** A text file. Plain strings are UTF-8 encoded; sealed content is decoded at load time. */
export interface FileEntry extends EntryMeta {
  content: string | Sealed;
}

/** A file given as Base64-encoded bytes. */
export interface BinaryEntry extends EntryMeta {
  binary: string;
}

/** A file given as a raw byte string, optionally a simulated executable or device. */
export interface RawFileEntry extends EntryMeta {
  bytes: ByteString;
  exec?: string;
  device?: 'null';
}

export interface DirEntry extends EntryMeta {
  dir: true;
}

export interface SymlinkEntry {
  symlink: string;
  owner?: string;
  group?: string;
  mtime?: string;
}

export type FSEntry = FileEntry | BinaryEntry | RawFileEntry | DirEntry | SymlinkEntry;

/** Absolute path → entry. Missing parent directories are created as `root:root 0755`. */
export type FSDefinition = Readonly<Record<string, FSEntry>>;

export class DefinitionError extends Error {
  constructor(path: string, message: string) {
    super(`FS definition ${path}: ${message}`);
    this.name = 'DefinitionError';
  }
}

interface Ownership {
  uid: number;
  gid: number;
  mtime: number;
}

function resolveOwnership(
  path: string,
  entry: FSEntry,
  users: UserDB,
  defaultMtime: number,
): Ownership {
  const ownerName = entry.owner ?? 'root';
  const owner = users.byName(ownerName);
  if (!owner) throw new DefinitionError(path, `unknown owner '${ownerName}'`);
  let gid = owner.gid;
  if (entry.group !== undefined) {
    const group = users.groupByName(entry.group);
    if (!group) throw new DefinitionError(path, `unknown group '${entry.group}'`);
    gid = group.gid;
  }
  let mtime = defaultMtime;
  if (entry.mtime !== undefined) {
    mtime = Date.parse(entry.mtime);
    if (Number.isNaN(mtime)) throw new DefinitionError(path, `invalid mtime '${entry.mtime}'`);
  }
  return { uid: owner.uid, gid, mtime };
}

function resolveMode(path: string, text: string | undefined, fallback: number): number {
  if (text === undefined) return fallback;
  const mode = parseOctalMode(text);
  if (mode === null) throw new DefinitionError(path, `invalid mode '${text}'`);
  return mode;
}

function fileBytes(path: string, entry: FileEntry | BinaryEntry | RawFileEntry): ByteString {
  if ('bytes' in entry) return entry.bytes;
  if ('binary' in entry) {
    const decoded = base64Decode(entry.binary);
    if (!decoded.ok) throw new DefinitionError(path, 'invalid base64 in binary entry');
    return decoded.bytes;
  }
  return isSealed(entry.content) ? unseal(entry.content) : utf8Encode(entry.content);
}

function buildNode(path: string, entry: FSEntry, users: UserDB, defaultMtime: number): FsNode {
  const own = resolveOwnership(path, entry, users, defaultMtime);
  if ('symlink' in entry) {
    return { type: 'symlink', ...own, mode: 0o777, target: entry.symlink };
  }
  if ('dir' in entry) {
    return { type: 'dir', ...own, mode: resolveMode(path, entry.mode, 0o755), children: new Map() };
  }
  const node: FsNode = {
    type: 'file',
    ...own,
    mode: resolveMode(path, entry.mode, 0o644),
    data: fileBytes(path, entry),
  };
  if ('bytes' in entry) {
    if (entry.exec !== undefined) node.exec = entry.exec;
    if (entry.device !== undefined) {
      node.device = entry.device;
      node.data = '';
    }
  }
  return node;
}

/**
 * Applies a declarative definition to a tree, without permission checks. Entries are applied
 * shallowest first; an entry replaces an existing file or link, and updates an existing
 * directory's metadata while keeping its contents.
 */
export function applyFsDefinition(
  root: DirNode,
  definition: FSDefinition,
  users: UserDB,
  defaultMtime: number,
): void {
  const entries = Object.entries(definition).sort(
    ([a], [b]) => components(a).length - components(b).length,
  );
  for (const [path, entry] of entries) {
    if (!path.startsWith('/') || normalize(path) !== path || path === '/') {
      throw new DefinitionError(path, 'paths must be absolute, normalized, and not /');
    }
    const parts = components(path);
    const name = parts.pop() ?? '';
    let dir = root;
    for (const part of parts) {
      const child = dir.children.get(part);
      if (child === undefined) {
        const created: DirNode = {
          type: 'dir',
          uid: 0,
          gid: 0,
          mode: 0o755,
          mtime: defaultMtime,
          children: new Map(),
        };
        dir.children.set(part, created);
        dir = created;
      } else if (child.type === 'dir') {
        dir = child;
      } else {
        throw new DefinitionError(path, `parent '${part}' is not a directory`);
      }
    }
    const node = buildNode(path, entry, users, defaultMtime);
    const existing = dir.children.get(name);
    if (node.type === 'dir' && existing?.type === 'dir') {
      existing.uid = node.uid;
      existing.gid = node.gid;
      existing.mode = node.mode;
      existing.mtime = node.mtime;
    } else {
      dir.children.set(name, node);
    }
  }
}
