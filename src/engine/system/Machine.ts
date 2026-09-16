import { baseSystemDefinition, type BinarySpec, DEFAULT_MOTD } from '../fs/baseSystem';
import { applyFsDefinition } from '../fs/definition';
import { VirtualFS } from '../fs/VirtualFS';
import type { Clock } from '../util/clock';
import type { HostDefinition } from './host';
import { BASE_SUDO_RULES, type SudoRule } from './sudoers';
import { BASE_GROUPS, BASE_USERS, UserDB } from './UserDB';

/** One simulated computer: hostname, filesystem, accounts and sudo policy. */
export class Machine {
  readonly hostname: string;
  readonly fs: VirtualFS;
  readonly users: UserDB;
  readonly sudoers: readonly SudoRule[];

  constructor(hostname: string, fs: VirtualFS, users: UserDB, sudoers: readonly SudoRule[]) {
    this.hostname = hostname;
    this.fs = fs;
    this.users = users;
    this.sudoers = sudoers;
  }
}

export function buildUserDB(host: HostDefinition): UserDB {
  const db = new UserDB(BASE_USERS, BASE_GROUPS);
  for (const group of host.groups ?? []) {
    db.addGroup({ name: group.name, gid: group.gid, members: [...(group.members ?? [])] });
  }
  for (const user of host.users ?? []) {
    if (db.byName(user.name)) {
      db.setPassword(user.name, user.password ?? null);
    } else {
      let gid = user.gid;
      if (gid === undefined) {
        const own = db.groupByName(user.name);
        if (own) {
          gid = own.gid;
        } else {
          db.addGroup({ name: user.name, gid: user.uid, members: [] });
          gid = user.uid;
        }
      }
      db.addUser({
        name: user.name,
        uid: user.uid,
        gid,
        gecos: user.gecos ?? `${user.name},,,`,
        home: user.home ?? `/home/${user.name}`,
        shell: user.shell ?? '/bin/bash',
        password: user.password ?? null,
      });
    }
    for (const group of user.groups ?? []) db.addMember(group, user.name);
  }
  return db;
}

export interface BuildMachineOptions {
  clock: Clock;
  /** Story time: the default mtime for level files. */
  time: number;
  binaries: readonly BinarySpec[];
}

export function buildMachine(host: HostDefinition, options: BuildMachineOptions): Machine {
  const users = buildUserDB(host);
  const sudoers = [...BASE_SUDO_RULES, ...(host.sudoers ?? [])];
  const fs = new VirtualFS(options.clock);
  fs.root.mtime = options.time - 120 * 24 * 60 * 60 * 1000;
  const base = baseSystemDefinition({
    hostname: host.hostname,
    users,
    sudoers,
    binaries: options.binaries,
    motd: host.motd ?? DEFAULT_MOTD,
    homeMode: host.homeMode ?? '0750',
    time: options.time,
  });
  applyFsDefinition(fs.root, base, users, options.time);
  applyFsDefinition(fs.root, host.fs ?? {}, users, options.time);
  return new Machine(host.hostname, fs, users, sudoers);
}
