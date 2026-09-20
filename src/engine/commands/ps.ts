import type { Process } from '../system/processes';
import { defineCommand } from './define';
import type { CommandContext } from './types';

/** Pads `text` on the left to `width` (right-aligned columns, like real ps numbers). */
function padStart(text: string, width: number): string {
  return text.length >= width ? text : ' '.repeat(width - text.length) + text;
}

/** Pads `text` on the right to `width` (left-aligned columns). */
function padEnd(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

/** BSD `ps aux`: USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND. */
function auxLine(p: Process): string {
  return (
    padEnd(p.user, 8) +
    ' ' +
    padStart(String(p.pid), 5) +
    ' ' +
    padStart(p.cpu.toFixed(1), 4) +
    ' ' +
    padStart(p.mem.toFixed(1), 4) +
    ' ' +
    padStart(String(p.vsz), 6) +
    ' ' +
    padStart(String(p.rss), 5) +
    ' ' +
    padEnd(p.tty, 8) +
    ' ' +
    padEnd(p.stat, 4) +
    ' ' +
    padEnd(p.start, 5) +
    ' ' +
    padStart(p.time, 6) +
    ' ' +
    p.command
  );
}

/** System V `ps -ef`: UID PID PPID C STIME TTY TIME CMD. */
function efLine(p: Process): string {
  return (
    padEnd(p.user, 8) +
    ' ' +
    padStart(String(p.pid), 5) +
    ' ' +
    padStart(String(p.ppid), 5) +
    '  0 ' +
    padEnd(p.start, 5) +
    ' ' +
    padEnd(p.tty, 8) +
    ' ' +
    padStart(p.time, 8) +
    ' ' +
    p.command
  );
}

/** Simple `ps` / `ps -e`: PID TTY TIME CMD (CMD is just the program, not the full line). */
function simpleLine(pid: number, tty: string, time: string, cmd: string): string {
  return padStart(String(pid), 6) + ' ' + padEnd(tty, 8) + ' ' + padStart(time, 8) + ' ' + cmd;
}

/** The short program name from a command line, for the simple CMD column. */
function shortName(command: string): string {
  const first = command.replace(/^\[/, '').split(' ')[0] ?? command;
  const base = first.split('/').pop() ?? first;
  return command.startsWith('[') ? command : base;
}

export const ps = defineCommand({
  name: 'ps',
  kind: 'binary',
  description: 'report a snapshot of the current processes',
  usage: ['[options]'],
  about:
    'Display information about a selection of the active processes. With no options,\nps shows the processes running in the current terminal. Use `ps aux` to see\nEVERY process on the machine, including daemons with no controlling terminal.',
  options: [
    ['aux', 'show every process (BSD syntax): user-oriented, full detail'],
    ['-e, -A', 'show every process'],
    ['-f', 'full-format listing (adds PPID and start time)'],
  ],
  details:
    'The two classic invocations are `ps aux` (BSD style) and `ps -ef` (System V\nstyle); both list every process. The COMMAND column shows the full command\nline, which is how you spot something that should not be running. Note the pid\nin the PID column — that is what you pass to kill.',
  examples: [
    ['ps', 'the processes in your terminal'],
    ['ps aux', 'every process, with CPU and memory'],
    ['ps -ef', 'every process, System V format'],
  ],
  seeAlso: ['kill(1)', 'top(1)'],
  run: async (ctx: CommandContext) => {
    const tokens = ctx.args.filter((a) => a.length > 0);
    // Collect option letters from both BSD (`aux`) and Unix (`-ef`) styles.
    const letters = new Set<string>();
    for (const token of tokens) {
      for (const ch of token.startsWith('-') ? token.slice(1) : token) letters.add(ch);
    }
    const all = letters.has('a') || letters.has('e') || letters.has('A') || letters.has('x');
    const userFormat = letters.has('u');
    const fullFormat = letters.has('f');
    const procs = ctx.machine.processes.list();

    if (all && userFormat) {
      ctx.stdout('USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\n');
      for (const p of procs) ctx.stdout(auxLine(p) + '\n');
      return 0;
    }
    if (all && fullFormat) {
      ctx.stdout('UID        PID  PPID  C STIME TTY          TIME CMD\n');
      for (const p of procs) ctx.stdout(efLine(p) + '\n');
      return 0;
    }
    if (all) {
      ctx.stdout('    PID TTY          TIME CMD\n');
      for (const p of procs)
        ctx.stdout(simpleLine(p.pid, p.tty, p.time, shortName(p.command)) + '\n');
      return 0;
    }

    // Bare ps: just this terminal's own processes — your shell and ps itself.
    ctx.stdout('    PID TTY          TIME CMD\n');
    const mine = procs.filter((p) => p.user === ctx.user.name && p.tty.startsWith('pts'));
    for (const p of mine) ctx.stdout(simpleLine(p.pid, p.tty, p.time, shortName(p.command)) + '\n');
    ctx.stdout(simpleLine(2145, 'pts/0', '00:00:00', 'bash') + '\n');
    ctx.stdout(simpleLine(2160, 'pts/0', '00:00:00', 'ps') + '\n');
    return 0;
  },
});
