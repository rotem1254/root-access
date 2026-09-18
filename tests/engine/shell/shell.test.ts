import { describe, expect, it } from 'vitest';
import { defineCommand } from '../../../src/engine/commands/define';
import type { Command, CommandContext } from '../../../src/engine/commands/types';
import { ROOT_CREDENTIALS as ROOT } from '../../../src/engine/fs/permissions';
import type { ExecutedCommand } from '../../../src/engine/shell/Executor';
import { createHarness } from '../../helpers/shell';

const binary = (
  name: string,
  run: (ctx: CommandContext) => Promise<number>,
  extra: Partial<Command> = {},
): Command => ({
  ...defineCommand({
    name,
    kind: 'binary',
    description: `${name} test command`,
    usage: ['[ARG]...'],
    about: `Test ${name}.`,
    run,
  }),
  ...extra,
});

const emit = binary('emit', async (ctx) => {
  let status = 0;
  for (const arg of ctx.args) {
    if (arg.startsWith('err:')) ctx.stderr(`${arg.slice(4)}\n`);
    else if (arg.startsWith('status=')) status = Number(arg.slice(7));
    else ctx.stdout(`${arg}\n`);
  }
  return status;
});
const readall = binary('readall', async (ctx) => {
  const data = await ctx.stdin.readAll();
  if (data === null) return 130;
  ctx.stdout(`[${data}]\n`);
  return 0;
});
const readlines = binary('readlines', async (ctx) => {
  let count = 0;
  while ((await ctx.stdin.readLine()) !== null) count += 1;
  ctx.stdout(`${count} lines\n`);
  return 0;
});
const ask = binary('ask', async (ctx) => {
  const answer = await ctx.tty.readLine('Password: ', { secret: true });
  if (answer === null) return ctx.tty.interrupted ? 130 : 1;
  ctx.stdout(`got ${answer}\n`);
  return 0;
});
const env = binary('showenv', async (ctx) => {
  for (const name of ctx.args)
    ctx.stdout(`${name}=${ctx.env.get(name) ?? '<unset>'} exported=${ctx.env.isExported(name)}\n`);
  return 0;
});
const me = binary('me', async (ctx) => {
  ctx.stdout(
    `${ctx.user.name} euid=${ctx.credentials.uid} tty=${ctx.tty.stdoutIsTTY} cols=${ctx.tty.columns}\n`,
  );
  return 0;
});
const slow = binary('slow', async (ctx) => {
  await ctx.tty.sleep(5000);
  if (ctx.tty.interrupted) return 130;
  ctx.stdout('done\n');
  return 0;
});
const boom = binary('boom', async () => {
  throw new Error('kaboom');
});
const becomeAdmin = binary('become', async (ctx) => {
  const target = ctx.machine.users.byName(ctx.args[0] ?? 'admin');
  if (!target) return 1;
  ctx.shell.pushSession(target, { login: ctx.args[1] === '-' });
  return 0;
});
const leave = defineCommand({
  name: 'leave',
  kind: 'builtin',
  description: 'exit',
  usage: [],
  about: 'Leave.',
  run: async (ctx) => {
    ctx.shell.exit(Number(ctx.args[0] ?? '0'));
    return 0;
  },
});
const setvar = defineCommand({
  name: 'setvar',
  kind: 'builtin',
  description: 'set',
  usage: [],
  about: 'Set.',
  run: async (ctx) => {
    ctx.env.set('FROM_BUILTIN', ctx.env.get('X') ?? '');
    return 0;
  },
});
const sudoish = binary('asroot', async (ctx) => {
  const root = ctx.machine.users.byName('root')!;
  const io = {
    stdin: null,
    stdout: (chunk: string) => ctx.stdout(chunk),
    stderr: (chunk: string) => ctx.stderr(chunk),
    stdoutIsTTY: ctx.tty.stdoutIsTTY,
  };
  if (ctx.args[0] === '-c')
    return ctx.shell.runLineAs(root, ctx.args[1] ?? '', io, ctx.shell.loginEnvironment(root));
  return ctx.shell.runAs(root, '/usr/bin/me', ['me'], io, ctx.shell.loginEnvironment(root));
});

const commands = [
  emit,
  readall,
  readlines,
  ask,
  env,
  me,
  slow,
  boom,
  becomeAdmin,
  leave,
  setvar,
  sudoish,
];

describe('Shell: running commands', () => {
  it('runs installed binaries with expanded arguments', async () => {
    const h = createHarness({ commands });
    expect(await h.run('emit "hello world" $HOME ~/x')).toEqual({
      stdout: 'hello world\n/home/guest\n/home/guest/x\n',
      stderr: '',
      status: 0,
    });
  });

  it('reports unknown commands like bash', async () => {
    const h = createHarness({ commands });
    expect(await h.run('nosuchthing --flag')).toEqual({
      stdout: '',
      stderr: 'bash: nosuchthing: command not found\n',
      status: 127,
    });
    expect(await h.run('""')).toMatchObject({ stderr: 'bash: : command not found\n', status: 127 });
  });

  it('runs binaries by path and reports path errors', async () => {
    const h = createHarness({ commands });
    expect((await h.run('/usr/bin/emit ok')).stdout).toBe('ok\n');
    expect((await h.run('/bin/emit via-symlink')).stdout).toBe('via-symlink\n');
    expect(await h.run('./missing')).toMatchObject({
      stderr: 'bash: ./missing: No such file or directory\n',
      status: 127,
    });
    expect(await h.run('/tmp')).toMatchObject({
      stderr: 'bash: /tmp: Is a directory\n',
      status: 126,
    });
    expect(await h.run('./notes.txt')).toMatchObject({
      stderr: 'bash: ./notes.txt: Permission denied\n',
      status: 126,
    });
    expect(await h.run('/root/x')).toMatchObject({
      stderr: 'bash: /root/x: Permission denied\n',
      status: 126,
    });
    expect(await h.run('notes.txt/x/y')).toMatchObject({
      stderr: 'bash: notes.txt/x/y: Not a directory\n',
      status: 126,
    });
  });

  it('explains scripts and foreign binaries it cannot run', async () => {
    const h = createHarness({ commands });
    h.machine.fs.writeFile('/home/guest/run.sh', '#!/bin/bash\necho hi\n', ROOT);
    h.machine.fs.chmod('/home/guest/run.sh', 0o755, ROOT);
    h.machine.fs.writeFile('/home/guest/a.out', '\x7fELF\x02\x01', ROOT);
    h.machine.fs.chmod('/home/guest/a.out', 0o755, ROOT);
    expect(await h.run('./run.sh')).toMatchObject({
      stderr: 'bash: running scripts such as ./run.sh is not supported in this simulation\n',
      status: 126,
    });
    expect(await h.run('./a.out')).toMatchObject({
      stderr: 'bash: ./a.out: cannot execute binary file: Exec format error\n',
      status: 126,
    });
  });

  it('searches $PATH and respects the execute bit', async () => {
    const h = createHarness({ commands });
    await h.run('PATH=/nowhere');
    expect((await h.run('emit x')).status).toBe(127);
    await h.run('PATH=/usr/bin');
    h.machine.fs.chmod('/usr/bin/emit', 0o700, ROOT);
    expect(await h.run('emit x')).toMatchObject({
      stderr: 'bash: emit: Permission denied\n',
      status: 126,
    });
  });

  it('runs setuid-root binaries with root credentials', async () => {
    const h = createHarness({ commands });
    expect((await h.run('me')).stdout).toBe('guest euid=1000 tty=true cols=80\n');
    h.machine.fs.chmod('/usr/bin/me', 0o4755, ROOT);
    expect((await h.run('me')).stdout).toBe('guest euid=0 tty=true cols=80\n');
  });

  it('prints --help for commands that handle it', async () => {
    const h = createHarness({ commands });
    const result = await h.run('emit --help');
    expect(result.stdout).toContain('Usage: emit [ARG]...');
    expect(result.stdout).toContain('--help');
    expect((await h.run('emit -- --help')).stdout).toBe('--\n--help\n');
  });

  it('captures internal errors instead of crashing', async () => {
    const h = createHarness({ commands });
    expect(await h.run('boom')).toMatchObject({ stderr: 'boom: internal error\n', status: 1 });
    expect(h.shell.internalErrors[0]).toContain('kaboom');
  });

  it('reports each finished command to hooks', async () => {
    const seen: ExecutedCommand[] = [];
    const h = createHarness({ commands, hooks: { onCommand: (c) => seen.push(c) } });
    await h.run('emit a status=3; nosuch');
    expect(seen).toEqual([
      { name: 'emit', args: ['a', 'status=3'], exitCode: 3, user: 'guest', cwd: '/home/guest' },
    ]);
  });
});

describe('Shell: pipes and redirects', () => {
  it('pipes stdout between commands, not stderr', async () => {
    const h = createHarness({ commands });
    expect(await h.run('emit one err:oops two | readall')).toEqual({
      stdout: '[one\ntwo\n]\n',
      stderr: 'oops\n',
      status: 0,
    });
    expect((await h.run('emit a b c | readlines')).stdout).toBe('3 lines\n');
    expect((await h.run('emit x | me')).stdout).toBe('guest euid=1000 tty=true cols=80\n');
    expect((await h.run('me | readall')).stdout).toBe('[guest euid=1000 tty=false cols=80\n]\n');
  });

  it('uses the exit status of the last command in a pipeline', async () => {
    const h = createHarness({ commands });
    expect((await h.run('emit status=1 | emit ok')).status).toBe(0);
    expect((await h.run('emit ok | emit status=4')).status).toBe(4);
  });

  it('writes, appends and reads files', async () => {
    const h = createHarness({ commands });
    await h.run('emit one > out.txt');
    await h.run('emit two >> out.txt');
    expect(h.machine.fs.readFile('/home/guest/out.txt', ROOT)).toBe('one\ntwo\n');
    expect((await h.run('readall < out.txt')).stdout).toBe('[one\ntwo\n]\n');
    expect(h.machine.fs.stat('/home/guest/out.txt', ROOT)).toMatchObject({
      uid: 1000,
      mode: 0o644,
    });
  });

  it('truncates the target before the command runs', async () => {
    const h = createHarness({ commands });
    await h.run('readall < notes.txt > notes.txt');
    expect(h.machine.fs.readFile('/home/guest/notes.txt', ROOT)).toBe('[]\n');
  });

  it('redirects stderr, merges streams and discards into /dev/null', async () => {
    const h = createHarness({ commands });
    expect(await h.run('emit out err:bad 2> err.txt')).toMatchObject({
      stdout: 'out\n',
      stderr: '',
    });
    expect(h.machine.fs.readFile('/home/guest/err.txt', ROOT)).toBe('bad\n');
    await h.run('emit a err:b c > both.txt 2>&1');
    expect(h.machine.fs.readFile('/home/guest/both.txt', ROOT)).toBe('a\nb\nc\n');
    expect(await h.run('emit a err:b 2>&1 > only-out.txt')).toMatchObject({
      stdout: 'b\n',
      stderr: '',
    });
    expect(h.machine.fs.readFile('/home/guest/only-out.txt', ROOT)).toBe('a\n');
    await h.run('emit x err:y &> all.txt');
    expect(h.machine.fs.readFile('/home/guest/all.txt', ROOT)).toBe('x\ny\n');
    await h.run('emit z &>> all.txt');
    expect(h.machine.fs.readFile('/home/guest/all.txt', ROOT)).toBe('x\ny\nz\n');
    expect(await h.run('emit hidden err:gone > /dev/null 2>/dev/null')).toMatchObject({
      stdout: '',
      stderr: '',
    });
    expect(await h.run('emit to-stderr >&2')).toMatchObject({ stdout: '', stderr: 'to-stderr\n' });
    expect((await h.run('emit a err:b 2>&1 | readall')).stdout).toBe('[a\nb\n]\n');
  });

  it('reports redirect failures like bash and skips the command', async () => {
    const h = createHarness({ commands });
    expect(await h.run('emit x > /etc/passwd')).toEqual({
      stdout: '',
      stderr: 'bash: /etc/passwd: Permission denied\n',
      status: 1,
    });
    expect(await h.run('emit x > nodir/file')).toMatchObject({
      stderr: 'bash: nodir/file: No such file or directory\n',
      status: 1,
    });
    expect(await h.run('emit x > /tmp')).toMatchObject({
      stderr: 'bash: /tmp: Is a directory\n',
      status: 1,
    });
    expect(await h.run('readall < missing.txt')).toMatchObject({
      stderr: 'bash: missing.txt: No such file or directory\n',
      status: 1,
    });
    expect(await h.run('readall < /etc/shadow')).toMatchObject({
      stderr: 'bash: /etc/shadow: Permission denied\n',
      status: 1,
    });
    await h.run('emit a > a.log; emit b > b.log');
    expect(await h.run('emit x > *.log')).toMatchObject({
      stderr: 'bash: *.log: ambiguous redirect\n',
      status: 1,
    });
    expect(await h.run('emit x 2>&7')).toMatchObject({
      stderr: 'bash: 7: Bad file descriptor\n',
      status: 1,
    });
  });

  it('creates a file for a redirect with no command', async () => {
    const h = createHarness({ commands });
    expect((await h.run('> empty.txt')).status).toBe(0);
    expect(h.machine.fs.readFile('/home/guest/empty.txt', ROOT)).toBe('');
  });
});

describe('Shell: lists, variables and status', () => {
  it('follows && and || using exit codes', async () => {
    const h = createHarness({ commands });
    expect((await h.run('emit status=1 && emit no || emit yes')).stdout).toBe('yes\n');
    expect((await h.run('emit a && emit b; emit c')).stdout).toBe('a\nb\nc\n');
    expect((await h.run('emit status=2 || emit status=0 && emit reached')).stdout).toBe(
      'reached\n',
    );
    expect((await h.run('emit ok || emit skipped && emit also')).stdout).toBe('ok\nalso\n');
  });

  it('exposes $? and other special parameters', async () => {
    const h = createHarness({ commands });
    await h.run('emit status=7');
    expect((await h.run('emit $?')).stdout).toBe('7\n');
    expect((await h.run('emit $0 $# "$@"')).stdout).toBe('-bash\n0\n\n');
    expect((await h.run('emit $$')).stdout).toMatch(/^\d+\n$/);
    expect((await h.run('emit $RANDOM')).stdout).toMatch(/^\d+\n$/);
    expect((await h.run('emit "[$1]" $-')).stdout).toBe('[]\nhimBHs\n');
  });

  it('sets shell variables and exports prefix assignments only to the command', async () => {
    const h = createHarness({ commands });
    await h.run('X=hello');
    expect((await h.run('showenv X')).stdout).toBe('X=hello exported=false\n');
    expect((await h.run('X=temp Y=1 showenv X Y')).stdout).toBe(
      'X=temp exported=true\nY=1 exported=true\n',
    );
    expect((await h.run('showenv X Y')).stdout).toBe(
      'X=hello exported=false\nY=<unset> exported=false\n',
    );
    await h.run('X=kept setvar');
    expect(h.shell.session.env.get('FROM_BUILTIN')).toBe('kept');
  });

  it('starts login sessions with an Ubuntu-like environment', async () => {
    const h = createHarness({ commands });
    const result = await h.run('showenv HOME USER SHELL PATH LANG PWD SHLVL HOSTNAME');
    expect(result.stdout).toContain('HOME=/home/guest exported=true');
    expect(result.stdout).toContain(
      'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games:/snap/bin exported=true',
    );
    expect(result.stdout).toContain('LANG=C.UTF-8 exported=true');
    expect(result.stdout).toContain('HOSTNAME=corp-web01 exported=false');
  });

  it('prints syntax errors with status 2', async () => {
    const h = createHarness({ commands });
    expect(await h.run('emit a | | emit b')).toEqual({
      stdout: '',
      stderr: "bash: syntax error near unexpected token `|'\n",
      status: 2,
    });
  });
});

describe('Shell: interaction', () => {
  it('shows a colored prompt that tracks the user and directory', () => {
    const h = createHarness({ commands });
    expect(h.shell.inputRequest).toEqual({
      kind: 'prompt',
      prompt: '\x1b[01;32mguest@corp-web01\x1b[00m:\x1b[01;34m~\x1b[00m$ ',
    });
    h.shell.session.env.cwd = '/var/log';
    expect(h.shell.prompt()).toContain(':\x1b[01;34m/var/log\x1b[00m$ ');
  });

  it('continues incomplete input on the next line', async () => {
    const h = createHarness({ commands });
    await h.shell.submit("emit 'first");
    expect(h.shell.inputRequest).toEqual({ kind: 'continuation', prompt: '> ' });
    await h.shell.submit("second'");
    expect(h.take().stdout).toBe('first\nsecond\n');
    expect(h.shell.history).toEqual(["emit 'first second'"]);
  });

  it('reads from the terminal for prompts like su', async () => {
    const h = createHarness({ commands });
    await h.shell.submit('ask');
    expect(h.shell.inputRequest).toEqual({ kind: 'read', prompt: 'Password: ', secret: true });
    await h.shell.submit('hunter2');
    expect(h.take().stdout).toBe('got hunter2\n');
    expect(h.shell.inputRequest.kind).toBe('prompt');
    expect(h.shell.history).toEqual(['ask']);
  });

  it('reads stdin from the terminal until Ctrl+D', async () => {
    const h = createHarness({ commands });
    await h.shell.submit('readall');
    expect(h.shell.inputRequest).toEqual({ kind: 'read', prompt: '', secret: false });
    await h.shell.submit('line one');
    await h.shell.submit('line two');
    await h.shell.eof();
    expect(h.take().stdout).toBe('[line one\nline two\n]\n');
  });

  it('interrupts reads, sleeps and the input line with Ctrl+C', async () => {
    const h = createHarness({ commands });
    await h.shell.submit('ask; emit after');
    h.shell.interrupt();
    await h.shell.whenReady();
    expect(h.take().stdout).toBe('');
    expect(h.shell.session.env.lastStatus).toBe(130);

    let release = (): void => undefined;
    const h2 = createHarness({ commands });
    (h2.shell as unknown as { sleepImpl: () => Promise<void> }).sleepImpl = () =>
      new Promise<void>((resolve) => {
        release = resolve;
      });
    const running = h2.shell.submit('slow && emit next');
    h2.shell.interrupt();
    await running;
    release();
    expect(h2.take().stdout).toBe('');
    expect(h2.shell.session.env.lastStatus).toBe(130);

    await h2.shell.submit('emit "unfinished');
    h2.shell.interrupt();
    expect(h2.shell.inputRequest.kind).toBe('prompt');
    expect(h2.shell.session.env.lastStatus).toBe(130);
  });

  it('ignores input while busy and when Ctrl+D ends a continuation', async () => {
    const h = createHarness({ commands });
    await h.shell.submit('emit "open');
    await h.shell.eof();
    expect(h.take().stderr).toContain('bash: syntax error: unexpected end of file');
    expect(h.shell.inputRequest.kind).toBe('prompt');
  });

  it('keeps history like HISTCONTROL=ignoreboth', async () => {
    const h = createHarness({ commands });
    await h.run('emit a');
    await h.run('emit a');
    await h.run(' emit secret');
    await h.run('');
    await h.run('emit b');
    expect(h.shell.history).toEqual(['emit a', 'emit b']);
  });
});

describe('Shell: sessions', () => {
  it('nests a non-login shell for su and returns on exit', async () => {
    const h = createHarness({ commands });
    await h.run('become admin; me');
    expect(h.take().stdout).toBe('');
    expect(h.shell.depth).toBe(2);
    expect(h.shell.prompt()).toContain('admin@corp-web01');
    expect(h.shell.session.env.cwd).toBe('/home/guest');
    expect((await h.run('showenv USER HOME SHLVL')).stdout).toBe(
      'USER=admin exported=true\nHOME=/home/admin exported=true\nSHLVL=2 exported=true\n',
    );
    await h.run('leave 5');
    expect(h.shell.depth).toBe(1);
    expect(h.shell.session.env.lastStatus).toBe(5);
    expect(h.shell.prompt()).toContain('guest@corp-web01');
  });

  it('runs the rest of a command line as the original user', async () => {
    const h = createHarness({ commands });
    expect((await h.run('become admin && me')).stdout).toBe('guest euid=1000 tty=true cols=80\n');
  });

  it('starts login shells in the home directory and marks root with #', async () => {
    const h = createHarness({ commands });
    await h.run('become root -');
    expect(h.shell.session.env.cwd).toBe('/root');
    expect(h.shell.prompt()).toMatch(/root@corp-web01.*~.*# $/);
  });

  it('logs out and reconnects when the login shell exits', async () => {
    const h = createHarness({
      commands,
      host: {
        hostname: 'corp-web01',
        users: [{ name: 'guest', uid: 1000 }],
        motd: 'Welcome back.\n',
      },
    });
    await h.run('become guest');
    await h.shell.eof();
    expect(h.take().stderr).toBe('exit\n');
    expect(h.shell.depth).toBe(1);
    await h.shell.eof();
    expect(h.take()).toEqual({
      stdout: 'Connection to corp-web01 closed.\n\nWelcome back.\n',
      stderr: 'logout\n',
    });
    expect(h.shell.depth).toBe(1);
    expect(h.shell.motd()).toBe('Welcome back.\n');
  });

  it('runs commands and command lines as another user', async () => {
    const h = createHarness({ commands });
    expect((await h.run('asroot')).stdout).toBe(
      'me euid=0 tty=true cols=80\n'.replace('me', 'root'),
    );
    expect((await h.run("asroot -c 'me; emit $HOME'")).stdout).toBe(
      'root euid=0 tty=true cols=80\n/root\n',
    );
    expect(await h.run("asroot -c 'emit | |'")).toMatchObject({
      stderr: "bash: syntax error near unexpected token `|'\n",
      status: 2,
    });
    expect(await h.run("asroot -c 'emit \"open'")).toMatchObject({
      stderr: 'bash: syntax error: unexpected end of file\n',
      status: 2,
    });
  });

  it('snapshots and restores sessions and history', async () => {
    const h = createHarness({ commands });
    await h.run('X=42');
    await h.run('become admin');
    const snapshot = h.shell.snapshot();
    const fresh = createHarness({ commands });
    fresh.shell.restore(snapshot);
    expect(fresh.shell.depth).toBe(2);
    expect(fresh.shell.session.user.name).toBe('admin');
    expect(fresh.shell.history).toEqual(['X=42', 'become admin']);
    await fresh.run('leave');
    expect(fresh.shell.session.env.get('X')).toBe('42');
    fresh.shell.restore({
      sessions: [
        { host: 'corp-web01', user: 'ghost', login: true, cwd: '/', lastStatus: 0, vars: [] },
      ],
      history: [],
    });
    expect(fresh.shell.session.user.name).toBe('guest');
  });
});
