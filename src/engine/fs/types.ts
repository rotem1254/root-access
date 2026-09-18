import type { ByteString } from '../util/bytes';

/** Permission bits including setuid/setgid/sticky, like `st_mode & 07777`. */
export type Mode = number;

export type NodeType = 'file' | 'dir' | 'symlink';

interface NodeBase {
  uid: number;
  gid: number;
  mode: Mode;
  /** Modification time, ms since the epoch, on the in-game clock. */
  mtime: number;
}

export interface FileNode extends NodeBase {
  type: 'file';
  /** Contents as a byte string (one UTF-16 code unit per byte). */
  data: ByteString;
  /** When set, this file is a simulated binary that runs the registered command with this name. */
  exec?: string;
  /** Character devices such as /dev/null. */
  device?: 'null';
}

export interface DirNode extends NodeBase {
  type: 'dir';
  children: Map<string, FsNode>;
}

export interface SymlinkNode extends NodeBase {
  type: 'symlink';
  target: string;
}

export type FsNode = FileNode | DirNode | SymlinkNode;

export interface Stat {
  type: NodeType;
  mode: Mode;
  uid: number;
  gid: number;
  /** Bytes. Directories report 4096, symlinks the length of their target. */
  size: number;
  nlink: number;
  mtime: number;
  exec?: string;
  device?: 'null';
  target?: string;
}

export function statOf(node: FsNode): Stat {
  const base = { mode: node.mode, uid: node.uid, gid: node.gid, mtime: node.mtime };
  switch (node.type) {
    case 'file': {
      const stat: Stat = {
        ...base,
        type: 'file',
        size: node.device ? 0 : node.data.length,
        nlink: 1,
      };
      if (node.exec !== undefined) stat.exec = node.exec;
      if (node.device !== undefined) stat.device = node.device;
      return stat;
    }
    case 'dir': {
      let subdirectories = 0;
      for (const child of node.children.values()) if (child.type === 'dir') subdirectories += 1;
      return { ...base, type: 'dir', size: 4096, nlink: 2 + subdirectories };
    }
    case 'symlink':
      return { ...base, type: 'symlink', size: node.target.length, nlink: 1, target: node.target };
  }
}
