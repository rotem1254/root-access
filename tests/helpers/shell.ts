import type { Command } from '../../src/engine/commands/types';
import { CommandRegistry } from '../../src/engine/commands/types';
import { type GameAPI, NULL_GAME } from '../../src/engine/game/api';
import type { Network } from '../../src/engine/network/Network';
import { Shell, type ShellHooks } from '../../src/engine/shell/Shell';
import type { HostDefinition } from '../../src/engine/system/host';
import { buildNetwork, type Machine } from '../../src/engine/system/Machine';
import { utf8Decode } from '../../src/engine/util/bytes';
import { ManualClock } from '../../src/engine/util/clock';

export const STORY_TIME = Date.parse('2026-03-14T09:00:00Z');

export const DEFAULT_HOST: HostDefinition = {
  hostname: 'corp-web01',
  users: [
    { name: 'guest', uid: 1000, password: 'guest' },
    { name: 'admin', uid: 1001, password: 'S3cret!', groups: ['sudo'] },
  ],
  fs: {
    '/home/guest/notes.txt': { content: 'hello\nworld\n', owner: 'guest' },
  },
};

export interface RunResult {
  stdout: string;
  stderr: string;
  status: number;
}

export interface Harness {
  shell: Shell;
  machine: Machine;
  network: Network;
  clock: ManualClock;
  /** Submits a line and returns what it printed and `$?` of the session that ran it. */
  run(line: string): Promise<RunResult>;
  /** Everything printed since the last call. */
  take(): { stdout: string; stderr: string };
}

export interface HarnessOptions {
  commands?: readonly Command[];
  host?: HostDefinition;
  /** Additional machines on the network. */
  hosts?: readonly HostDefinition[];
  user?: string;
  cwd?: string;
  game?: GameAPI;
  hooks?: ShellHooks;
  columns?: number;
}

export function createHarness(options: HarnessOptions = {}): Harness {
  const registry = new CommandRegistry().register(...(options.commands ?? []));
  const clock = new ManualClock(STORY_TIME);
  const primary = options.host ?? DEFAULT_HOST;
  const network = buildNetwork([primary, ...(options.hosts ?? [])], {
    clock,
    time: STORY_TIME,
    binaries: registry.binaries(),
  });
  const machine = network.machineByHostname(primary.hostname);
  if (!machine) throw new Error('harness: no primary machine');
  let stdout = '';
  let stderr = '';
  const shell = new Shell({
    network,
    host: primary.hostname,
    registry,
    game: options.game ?? NULL_GAME,
    user: options.user ?? 'guest',
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
    io: {
      stdout: (chunk) => {
        stdout += chunk;
      },
      stderr: (chunk) => {
        stderr += chunk;
      },
      columns: () => options.columns ?? 80,
    },
    ...(options.hooks ? { hooks: options.hooks } : {}),
  });
  const take = (): { stdout: string; stderr: string } => {
    const result = { stdout: utf8Decode(stdout), stderr: utf8Decode(stderr) };
    stdout = '';
    stderr = '';
    return result;
  };
  return {
    shell,
    machine,
    network,
    clock,
    take,
    run: async (line) => {
      take();
      const session = shell.session;
      await shell.submit(line);
      return { ...take(), status: session.env.lastStatus };
    },
  };
}
