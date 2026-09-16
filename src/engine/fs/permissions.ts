/** Who is asking: effective uid, primary gid and supplementary group ids. */
export interface Credentials {
  uid: number;
  gid: number;
  groups: readonly number[];
}

export type Access = 'r' | 'w' | 'x';

export const ROOT_CREDENTIALS: Credentials = Object.freeze({ uid: 0, gid: 0, groups: [0] });

export interface Ownership {
  uid: number;
  gid: number;
  mode: number;
}

export function inGroup(credentials: Credentials, gid: number): boolean {
  return credentials.gid === gid || credentials.groups.includes(gid);
}

const ACCESS_BIT: Readonly<Record<Access, number>> = { r: 4, w: 2, x: 1 };

/**
 * Linux discretionary access control.
 *
 * - The first matching class decides: owner bits if you own it, else group bits if you are in its
 *   group, else other bits. A group member is denied even when "other" would allow.
 * - root may read and write anything and search any directory, but may only execute a regular
 *   file that has at least one execute bit set.
 */
export function canAccess(
  node: Ownership,
  isDirectory: boolean,
  credentials: Credentials,
  access: Access,
): boolean {
  if (credentials.uid === 0) {
    if (access !== 'x' || isDirectory) return true;
    return (node.mode & 0o111) !== 0;
  }
  let shift = 0;
  if (credentials.uid === node.uid) shift = 6;
  else if (inGroup(credentials, node.gid)) shift = 3;
  return ((node.mode >> shift) & ACCESS_BIT[access]) !== 0;
}

export function isOwnerOrRoot(node: Ownership, credentials: Credentials): boolean {
  return credentials.uid === 0 || credentials.uid === node.uid;
}
