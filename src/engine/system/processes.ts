/**
 * A tiny, mutable process table for the simulated machine. It exists so `ps` can list processes and
 * `kill` can end them — the everyday, transferable skill of finding and stopping a running program.
 * It is deliberately simple: enough columns for a believable `ps aux`, and a single "stubborn" flag
 * so a level can teach the difference between SIGTERM and SIGKILL.
 */

/** A process as a level (or the base system) declares it. Most columns default to believable values. */
export interface ProcessDefinition {
  pid: number;
  /** Owning user name. */
  user: string;
  /** The full command line, as `ps` shows it in the COMMAND column. */
  command: string;
  /** %CPU (default 0.0). */
  cpu?: number;
  /** %MEM (default 0.0). */
  mem?: number;
  /** Virtual memory size in KiB (default derived). */
  vsz?: number;
  /** Resident set size in KiB (default derived). */
  rss?: number;
  /** Controlling terminal, e.g. `pts/0`; `?` for a daemon with none (default `?`). */
  tty?: string;
  /** Process state, e.g. `Ss`, `S`, `R+`, `Sl` (default `S`). */
  stat?: string;
  /** START column, e.g. `09:14` (default `09:00`). */
  start?: string;
  /** TIME column, cumulative CPU time, e.g. `0:03` (default `0:00`). */
  time?: string;
  /** Parent pid, for `ps -ef` (default 1). */
  ppid?: number;
  /** If true, the process ignores SIGTERM: a plain `kill` leaves it running; only `kill -9` ends it. */
  stubborn?: boolean;
}

/** A resolved process with every column filled in. */
export interface Process {
  pid: number;
  ppid: number;
  user: string;
  command: string;
  cpu: number;
  mem: number;
  vsz: number;
  rss: number;
  tty: string;
  stat: string;
  start: string;
  time: string;
  stubborn: boolean;
}

function resolve(def: ProcessDefinition): Process {
  return {
    pid: def.pid,
    ppid: def.ppid ?? 1,
    user: def.user,
    command: def.command,
    cpu: def.cpu ?? 0,
    mem: def.mem ?? 0,
    vsz: def.vsz ?? 2048,
    rss: def.rss ?? 1024,
    tty: def.tty ?? '?',
    stat: def.stat ?? 'S',
    start: def.start ?? '09:00',
    time: def.time ?? '0:00',
    stubborn: def.stubborn ?? false,
  };
}

export type KillResult =
  { ok: true; ended: boolean } | { ok: false; reason: 'no-such-process' | 'not-permitted' };

/** How `kill` describes the signal it is delivering to the table. */
export interface SignalEffect {
  /** True for terminating signals (TERM, INT, QUIT, HUP, KILL); false for STOP/CONT/USR1/… */
  terminating: boolean;
  /** True only for SIGKILL, which cannot be ignored — it ends even a stubborn process. */
  force: boolean;
}

/** The signals `kill -l` prints, in the usual numeric order (a useful subset). */
export const SIGNALS: readonly string[] = [
  'HUP',
  'INT',
  'QUIT',
  'ILL',
  'TRAP',
  'ABRT',
  'BUS',
  'FPE',
  'KILL',
  'USR1',
  'SEGV',
  'USR2',
  'PIPE',
  'ALRM',
  'TERM',
  'STKFLT',
  'CHLD',
  'CONT',
  'STOP',
  'TSTP',
  'TTIN',
  'TTOU',
];

/** The default processes every machine runs, so `ps aux` looks believable without any level data. */
function baseProcesses(): ProcessDefinition[] {
  return [
    {
      pid: 1,
      ppid: 0,
      user: 'root',
      command: '/sbin/init',
      stat: 'Ss',
      start: '08:59',
      vsz: 168000,
      rss: 12800,
    },
    {
      pid: 420,
      user: 'root',
      command: '/usr/sbin/sshd -D',
      stat: 'Ss',
      start: '08:59',
      vsz: 15600,
      rss: 8200,
    },
    {
      pid: 512,
      user: 'root',
      command: '/lib/systemd/systemd-journald',
      stat: 'Ss',
      start: '08:59',
      vsz: 34000,
      rss: 9400,
    },
  ];
}

export class ProcessTable {
  private procs: Process[];

  constructor(defs: readonly ProcessDefinition[]) {
    this.procs = defs.map(resolve).sort((a, b) => a.pid - b.pid);
  }

  /** Every process, ordered by pid. */
  list(): readonly Process[] {
    return this.procs;
  }

  byPid(pid: number): Process | undefined {
    return this.procs.find((p) => p.pid === pid);
  }

  /**
   * Delivers a signal to `pid` on behalf of `byUser` (root may signal anything). SIGKILL (force)
   * always ends the process; other terminating signals end it unless it is stubborn.
   */
  signal(pid: number, effect: SignalEffect, byUser: string, isRoot: boolean): KillResult {
    const proc = this.byPid(pid);
    if (!proc) return { ok: false, reason: 'no-such-process' };
    if (!isRoot && proc.user !== byUser) return { ok: false, reason: 'not-permitted' };
    const ends = effect.terminating && (effect.force || !proc.stubborn);
    if (ends) {
      this.procs = this.procs.filter((p) => p.pid !== pid);
      return { ok: true, ended: true };
    }
    return { ok: true, ended: false };
  }
}

/** Builds a machine's process table from the base processes plus a host's own. */
export function buildProcessTable(
  hostProcesses: readonly ProcessDefinition[] | undefined,
): ProcessTable {
  return new ProcessTable([...baseProcesses(), ...(hostProcesses ?? [])]);
}
