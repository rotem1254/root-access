import type { Credentials } from '../fs/permissions';
import { sha256Hex } from '../util/sha256';

export interface UserRecord {
  name: string;
  uid: number;
  gid: number;
  gecos: string;
  home: string;
  shell: string;
}

export interface GroupRecord {
  name: string;
  gid: number;
  members: string[];
}

export interface UserSeed extends UserRecord {
  /** Plaintext password; `null` locks the account. */
  password: string | null;
}

/** Days since the epoch for the "last password change" field in /etc/shadow. */
const SHADOW_LAST_CHANGE = 20526;

const CRYPT_ALPHABET = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function cryptChars(hex: string, length: number): string {
  let out = '';
  for (let i = 0; out.length < length; i += 2) {
    const byte = Number.parseInt(hex.slice(i % hex.length, (i % hex.length) + 2), 16);
    out += CRYPT_ALPHABET.charAt(byte % CRYPT_ALPHABET.length);
  }
  return out;
}

/** The accounts database behind /etc/passwd, /etc/group and /etc/shadow. */
export class UserDB {
  private readonly users: UserRecord[] = [];
  private readonly groups: GroupRecord[] = [];
  private readonly passwords = new Map<string, string | null>();

  constructor(users: readonly UserSeed[], groups: readonly GroupRecord[]) {
    for (const group of groups) this.addGroup(group);
    for (const user of users) this.addUser(user);
  }

  addGroup(group: GroupRecord): void {
    if (this.groupByName(group.name)) throw new Error(`duplicate group: ${group.name}`);
    this.groups.push({ ...group, members: [...group.members] });
  }

  addUser(seed: UserSeed): void {
    if (this.byName(seed.name)) throw new Error(`duplicate user: ${seed.name}`);
    const { password, ...record } = seed;
    this.users.push(record);
    this.passwords.set(record.name, password);
  }

  setPassword(name: string, password: string | null): void {
    if (!this.byName(name)) throw new Error(`unknown user: ${name}`);
    this.passwords.set(name, password);
  }

  /** Adds `user` to the member list of `groupName`. */
  addMember(groupName: string, user: string): void {
    const group = this.groupByName(groupName);
    if (!group) throw new Error(`unknown group: ${groupName}`);
    if (!group.members.includes(user)) group.members.push(user);
  }

  allUsers(): readonly UserRecord[] {
    return this.users;
  }

  allGroups(): readonly GroupRecord[] {
    return this.groups;
  }

  byName(name: string): UserRecord | undefined {
    return this.users.find((user) => user.name === name);
  }

  byUid(uid: number): UserRecord | undefined {
    return this.users.find((user) => user.uid === uid);
  }

  groupByName(name: string): GroupRecord | undefined {
    return this.groups.find((group) => group.name === name);
  }

  groupByGid(gid: number): GroupRecord | undefined {
    return this.groups.find((group) => group.gid === gid);
  }

  /** Supplementary groups (not the primary one), sorted by gid. */
  supplementaryGroups(user: UserRecord): GroupRecord[] {
    return this.groups
      .filter((group) => group.gid !== user.gid && group.members.includes(user.name))
      .sort((a, b) => a.gid - b.gid);
  }

  credentials(user: UserRecord): Credentials {
    const groups = [user.gid, ...this.supplementaryGroups(user).map((group) => group.gid)];
    return { uid: user.uid, gid: user.gid, groups };
  }

  /** Name for a uid as `ls -l` shows it: the user name, or the number when unknown. */
  userLabel(uid: number): string {
    return this.byUid(uid)?.name ?? String(uid);
  }

  groupLabel(gid: number): string {
    return this.groupByGid(gid)?.name ?? String(gid);
  }

  isLocked(name: string): boolean {
    return (this.passwords.get(name) ?? null) === null;
  }

  checkPassword(name: string, candidate: string): boolean {
    const password = this.passwords.get(name) ?? null;
    return password !== null && password === candidate;
  }

  passwdFile(): string {
    return this.users
      .map((u) => `${u.name}:x:${u.uid}:${u.gid}:${u.gecos}:${u.home}:${u.shell}\n`)
      .join('');
  }

  groupFile(): string {
    return this.groups.map((g) => `${g.name}:x:${g.gid}:${g.members.join(',')}\n`).join('');
  }

  /** Realistic-looking yescrypt entries. The hashes are fake: nothing here can be cracked. */
  shadowFile(): string {
    return this.users
      .map((user) => {
        const password = this.passwords.get(user.name) ?? null;
        let hash = '*';
        if (password !== null) {
          const salt = cryptChars(sha256Hex(`salt:${user.name}`), 22);
          const digest = cryptChars(sha256Hex(`hash:${user.name}:${password}`), 43);
          hash = `$y$j9T$${salt}$${digest}`;
        }
        return `${user.name}:${hash}:${SHADOW_LAST_CHANGE}:0:99999:7:::\n`;
      })
      .join('');
  }
}

const NOLOGIN = '/usr/sbin/nologin';

/** System accounts present on every simulated Ubuntu host. */
export const BASE_USERS: readonly UserSeed[] = [
  {
    name: 'root',
    uid: 0,
    gid: 0,
    gecos: 'root',
    home: '/root',
    shell: '/bin/bash',
    password: null,
  },
  {
    name: 'daemon',
    uid: 1,
    gid: 1,
    gecos: 'daemon',
    home: '/usr/sbin',
    shell: NOLOGIN,
    password: null,
  },
  { name: 'bin', uid: 2, gid: 2, gecos: 'bin', home: '/bin', shell: NOLOGIN, password: null },
  { name: 'sys', uid: 3, gid: 3, gecos: 'sys', home: '/dev', shell: NOLOGIN, password: null },
  {
    name: 'sync',
    uid: 4,
    gid: 65534,
    gecos: 'sync',
    home: '/bin',
    shell: '/bin/sync',
    password: null,
  },
  {
    name: 'www-data',
    uid: 33,
    gid: 33,
    gecos: 'www-data',
    home: '/var/www',
    shell: NOLOGIN,
    password: null,
  },
  {
    name: 'backup',
    uid: 34,
    gid: 34,
    gecos: 'backup',
    home: '/var/backups',
    shell: NOLOGIN,
    password: null,
  },
  {
    name: 'nobody',
    uid: 65534,
    gid: 65534,
    gecos: 'nobody',
    home: '/nonexistent',
    shell: NOLOGIN,
    password: null,
  },
  {
    name: 'syslog',
    uid: 104,
    gid: 111,
    gecos: '',
    home: '/nonexistent',
    shell: NOLOGIN,
    password: null,
  },
  {
    name: 'sshd',
    uid: 105,
    gid: 65534,
    gecos: '',
    home: '/run/sshd',
    shell: NOLOGIN,
    password: null,
  },
];

export const BASE_GROUPS: readonly GroupRecord[] = [
  { name: 'root', gid: 0, members: [] },
  { name: 'daemon', gid: 1, members: [] },
  { name: 'bin', gid: 2, members: [] },
  { name: 'sys', gid: 3, members: [] },
  { name: 'adm', gid: 4, members: ['syslog'] },
  { name: 'tty', gid: 5, members: [] },
  { name: 'disk', gid: 6, members: [] },
  { name: 'mail', gid: 8, members: [] },
  { name: 'sudo', gid: 27, members: [] },
  { name: 'www-data', gid: 33, members: [] },
  { name: 'backup', gid: 34, members: [] },
  { name: 'shadow', gid: 42, members: [] },
  { name: 'utmp', gid: 43, members: [] },
  { name: 'staff', gid: 50, members: [] },
  { name: 'users', gid: 100, members: [] },
  { name: 'syslog', gid: 111, members: [] },
  { name: 'nogroup', gid: 65534, members: [] },
];
