import { SIGNALS } from '../system/processes';
import { defineCommand } from './define';
import type { CommandContext } from './types';

interface ResolvedSignal {
  name: string;
  terminating: boolean;
  force: boolean;
}

const NON_TERMINATING = new Set(['STOP', 'CONT', 'TSTP', 'CHLD', 'TTIN', 'TTOU', 'URG', 'WINCH']);

/** Resolves a signal spec (a name like KILL/SIGKILL or a number like 9) to how it behaves. */
function resolveSignal(spec: string): ResolvedSignal | null {
  let name: string | undefined;
  if (/^\d+$/.test(spec)) {
    name = SIGNALS[Number(spec) - 1];
  } else {
    const upper = spec.toUpperCase().replace(/^SIG/, '');
    if (SIGNALS.includes(upper)) name = upper;
  }
  if (name === undefined) return null;
  return {
    name,
    terminating: !NON_TERMINATING.has(name),
    force: name === 'KILL',
  };
}

export const kill = defineCommand({
  name: 'kill',
  kind: 'builtin',
  description: 'send a signal to a process',
  usage: ['[-s SIGNAL | -SIGNAL] PID...', '-l'],
  about:
    'Send a signal to each process identified by PID. The default signal is TERM\n(15), a polite "please exit". A process may ignore it; SIGKILL (9), which\ncannot be ignored, forces the process to stop: `kill -9 PID`.',
  options: [
    ['-s SIGNAL', 'the signal to send, by name or number (default TERM)'],
    ['-SIGNAL', 'shorthand, e.g. -9 or -KILL'],
    ['-l', 'list the signal names'],
  ],
  details:
    'Find the pid with `ps` first. `kill 4321` asks process 4321 to terminate;\nif it keeps running, `kill -9 4321` ends it for certain. You may only signal\nyour own processes unless you are root.',
  examples: [
    ['kill 4321', 'ask process 4321 to exit (SIGTERM)'],
    ['kill -9 4321', 'force it to stop (SIGKILL)'],
    ['kill -l', 'list the signal names'],
  ],
  seeAlso: ['ps(1)', 'pkill(1)'],
  run: async (ctx: CommandContext) => {
    const args = [...ctx.args];
    if (args.length === 0) {
      ctx.stderr(
        'kill: usage: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ... or kill -l [sigspec]\n',
      );
      return 1;
    }

    if (args[0] === '-l' || args[0] === '--list') {
      ctx.stdout(
        SIGNALS.map((name, index) => `${String(index + 1).padStart(2)}) SIG${name}`).join('\t') +
          '\n',
      );
      return 0;
    }

    let signal: ResolvedSignal = { name: 'TERM', terminating: true, force: false };
    let index = 0;
    if (args[0] === '-s' || args[0] === '-n') {
      const spec = args[1];
      if (spec === undefined) {
        ctx.stderr('bash: kill: -s: option requires an argument\n');
        return 1;
      }
      const resolved = resolveSignal(spec);
      if (!resolved) {
        ctx.stderr(`bash: kill: ${spec}: invalid signal specification\n`);
        return 1;
      }
      signal = resolved;
      index = 2;
    } else if (args[0]?.startsWith('-') && args[0] !== '--') {
      const spec = args[0].slice(1);
      const resolved = resolveSignal(spec);
      if (!resolved) {
        ctx.stderr(`bash: kill: ${spec}: invalid signal specification\n`);
        return 1;
      }
      signal = resolved;
      index = 1;
    }

    const pids = args.slice(index);
    if (pids.length === 0) {
      ctx.stderr('bash: kill: not enough arguments\n');
      return 1;
    }

    const isRoot = ctx.credentials.uid === 0;
    let status = 0;
    for (const token of pids) {
      if (!/^-?\d+$/.test(token)) {
        ctx.stderr(`bash: kill: ${token}: arguments must be process or job IDs\n`);
        status = 1;
        continue;
      }
      const result = ctx.machine.processes.signal(
        Number(token),
        { terminating: signal.terminating, force: signal.force },
        ctx.user.name,
        isRoot,
      );
      if (!result.ok) {
        const reason =
          result.reason === 'no-such-process' ? 'No such process' : 'Operation not permitted';
        ctx.stderr(`bash: kill: (${token}) - ${reason}\n`);
        status = 1;
      }
    }
    return status;
  },
});
