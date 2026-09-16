import type { DirNode, FsNode } from './types';

/** Compact JSON form of the tree, used for save games. Children keep their insertion order. */
export type SerializedNode =
  | { t: 'f'; u: number; g: number; m: number; mt: number; d: string; x?: string; dv?: 'null' }
  | { t: 'd'; u: number; g: number; m: number; mt: number; c: [string, SerializedNode][] }
  | { t: 'l'; u: number; g: number; m: number; mt: number; l: string };

export function serializeNode(node: FsNode): SerializedNode {
  const base = { u: node.uid, g: node.gid, m: node.mode, mt: node.mtime };
  switch (node.type) {
    case 'file': {
      const out: SerializedNode = { t: 'f', ...base, d: node.data };
      if (node.exec !== undefined) out.x = node.exec;
      if (node.device !== undefined) out.dv = node.device;
      return out;
    }
    case 'dir':
      return {
        t: 'd',
        ...base,
        c: [...node.children].map(([name, child]) => [name, serializeNode(child)]),
      };
    case 'symlink':
      return { t: 'l', ...base, l: node.target };
  }
}

export class SerializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SerializationError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isInt = (value: unknown): value is number => Number.isInteger(value);

export function deserializeNode(value: unknown): FsNode {
  if (!isRecord(value)) throw new SerializationError('node must be an object');
  const { t, u, g, m, mt } = value;
  if (!isInt(u) || !isInt(g) || !isInt(m) || typeof mt !== 'number') {
    throw new SerializationError('node metadata is invalid');
  }
  const base = { uid: u, gid: g, mode: m, mtime: mt };
  if (t === 'f') {
    if (typeof value.d !== 'string') throw new SerializationError('file data must be a string');
    const file: FsNode = { type: 'file', ...base, data: value.d };
    if (typeof value.x === 'string') file.exec = value.x;
    if (value.dv === 'null') file.device = 'null';
    return file;
  }
  if (t === 'l') {
    if (typeof value.l !== 'string')
      throw new SerializationError('symlink target must be a string');
    return { type: 'symlink', ...base, target: value.l };
  }
  if (t === 'd') {
    if (!Array.isArray(value.c))
      throw new SerializationError('directory children must be an array');
    const children = new Map<string, FsNode>();
    for (const entry of value.c as unknown[]) {
      if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') {
        throw new SerializationError('directory entry is invalid');
      }
      const [name, child] = entry as [string, unknown];
      if (name === '' || name.includes('/')) throw new SerializationError(`invalid name: ${name}`);
      children.set(name, deserializeNode(child));
    }
    return { type: 'dir', ...base, children };
  }
  throw new SerializationError('unknown node type');
}

export function deserializeRoot(value: unknown): DirNode {
  const node = deserializeNode(value);
  if (node.type !== 'dir') throw new SerializationError('root must be a directory');
  return node;
}
