import { baseSystemDefinition, type BinarySpec, DEFAULT_MOTD } from '../fs/baseSystem';
import { applyFsDefinition } from '../fs/definition';
import { VirtualFS } from '../fs/VirtualFS';
import { Network } from '../network/Network';
import type { HostNetwork, NetworkDefinition } from '../network/types';
import type { Clock } from '../util/clock';
import type { HostDefinition } from './host';
import { buildProcessTable, ProcessTable } from './processes';
import { BASE_SUDO_RULES, type SudoRule } from './sudoers';
import { BASE_GROUPS, BASE_USERS, UserDB } from './UserDB';

/** One simulated computer: hostname, filesystem, accounts and sudo policy. */
export class Machine {
  readonly hostname: string;
  readonly fs: VirtualFS;
  readonly users: UserDB;
  readonly sudoers: readonly SudoRule[];
  /** The running processes, listed by `ps` and ended by `kill`. */
  readonly processes: ProcessTable;

  constructor(
    hostname: string,
    fs: VirtualFS,
    users: UserDB,
    sudoers: readonly SudoRule[],
    processes: ProcessTable,
  ) {
    this.hostname = hostname;
    this.fs = fs;
    this.users = users;
    this.sudoers = sudoers;
    this.processes = processes;
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
  return new Machine(host.hostname, fs, users, sudoers, buildProcessTable(host.processes));
}

/** A host's network metadata, defaulting to a single eth0 when the level does not specify one. */
function hostNetwork(host: HostDefinition, fallbackIp: string): HostNetwork {
  return host.net ?? { interfaces: [{ name: 'eth0', ip: fallbackIp }] };
}

/**
 * Builds a Network from the primary host and any additional hosts. Hosts without explicit network
 * metadata get a default eth0 (10.0.2.15, 10.0.2.16, …), so single-machine levels still show a
 * believable `ip a`.
 */
export function buildNetwork(
  hosts: readonly HostDefinition[],
  options: BuildMachineOptions & { network?: NetworkDefinition },
): Network {
  const network = new Network(options.network ?? {});
  hosts.forEach((host, index) => {
    const machine = buildMachine(host, options);
    network.add(machine, hostNetwork(host, `10.0.2.${15 + index}`));
  });
  return network;
}
