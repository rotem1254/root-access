import { describe, expect, it } from 'vitest';
import { LINUX_COMMANDS } from '../../src/engine/commands';
import { ROOT_CREDENTIALS as ROOT } from '../../src/engine/fs/permissions';
import { createHarness } from '../helpers/shell';

const harness = () => createHarness({ commands: LINUX_COMMANDS });

describe('echo', () => {
  it('joins arguments with spaces', async () => {
    const h = harness();
    expect(await h.run('echo hello   "big  world"')).toEqual({
      stdout: 'hello big  world\n',
      stderr: '',
      status: 0,
    });
    expect((await h.run('echo')).stdout).toBe('\n');
  });

  it('handles -n, -e and -E like the bash builtin', async () => {
    const h = harness();
    expect((await h.run('echo -n no newline')).stdout).toBe('no newline');
    expect((await h.run("echo -e 'a\\tb\\nc\\\\d\\x41\\0101\\e[0m'")).stdout).toBe(
      'a\tb\nc\\dAA\x1b[0m\n',
    );
    expect((await h.run("echo -e 'stop\\chere'")).stdout).toBe('stop');
    expect((await h.run("echo -eE 'raw\\n'")).stdout).toBe('raw\\n\n');
    expect((await h.run("echo -e 'keep\\q \\x'")).stdout).toBe('keep\\q \\x\n');
    expect((await h.run('echo -nx -- --help')).stdout).toBe('-nx -- --help\n');
  });
});

describe('true and false', () => {
  it('return 0 and 1', async () => {
    const h = harness();
    expect((await h.run('true --help')).status).toBe(0);
    expect((await h.run('false')).status).toBe(1);
    expect((await h.run('false || echo fallback')).stdout).toBe('fallback\n');
  });
});

describe('pwd and cd', () => {
  it('prints and changes the working directory', async () => {
    const h = harness();
    expect((await h.run('pwd')).stdout).toBe('/home/guest\n');
    expect((await h.run('cd /var/log && pwd')).stdout).toBe('/var/log\n');
    expect((await h.run('cd .. && pwd')).stdout).toBe('/var\n');
    expect((await h.run('cd && pwd')).stdout).toBe('/home/guest\n');
    expect(await h.run('cd -')).toEqual({ stdout: '/var\n', stderr: '', status: 0 });
    expect(h.shell.session.env.get('OLDPWD')).toBe('/home/guest');
    expect(h.shell.session.env.get('PWD')).toBe('/var');
    expect(h.shell.prompt()).toContain(':\x1b[01;34m/var\x1b[00m$ ');
  });

  it('keeps logical paths through symlinks unless -P is used', async () => {
    const h = harness();
    expect((await h.run('cd /bin && pwd && pwd -P')).stdout).toBe('/bin\n/usr/bin\n');
    expect((await h.run('cd -P /bin && pwd')).stdout).toBe('/usr/bin\n');
    expect((await h.run('cd ""')).status).toBe(0);
  });

  it('reports errors like bash', async () => {
    const h = harness();
    expect(await h.run('cd /nope')).toEqual({
      stdout: '',
      stderr: 'bash: cd: /nope: No such file or directory\n',
      status: 1,
    });
    expect(await h.run('cd notes.txt')).toMatchObject({
      stderr: 'bash: cd: notes.txt: Not a directory\n',
      status: 1,
    });
    expect(await h.run('cd /root')).toMatchObject({
      stderr: 'bash: cd: /root: Permission denied\n',
      status: 1,
    });
    expect(await h.run('cd a b')).toMatchObject({
      stderr: 'bash: cd: too many arguments\n',
      status: 1,
    });
    expect(await h.run('cd -x')).toMatchObject({
      stderr: 'bash: cd: -x: invalid option\ncd: usage: cd [-L|[-P [-e]] [-@]] [dir]\n',
      status: 2,
    });
    await h.run('unset HOME');
    expect(await h.run('cd')).toMatchObject({ stderr: 'bash: cd: HOME not set\n', status: 1 });
    const fresh = harness();
    expect(await fresh.run('cd -')).toMatchObject({
      stderr: 'bash: cd: OLDPWD not set\n',
      status: 1,
    });
  });

  it('needs execute permission on the target directory', async () => {
    const h = harness();
    h.machine.fs.mkdir('/opt/noexec', ROOT);
    h.machine.fs.chmod('/opt/noexec', 0o744, ROOT);
    expect(await h.run('cd /opt/noexec')).toMatchObject({
      stderr: 'bash: cd: /opt/noexec: Permission denied\n',
      status: 1,
    });
  });

  it('reports a vanished working directory in pwd', async () => {
    const h = harness();
    await h.run('cd /tmp');
    h.machine.fs.mkdir('/tmp/gone', ROOT);
    await h.run('cd gone');
    h.machine.fs.rmdir('/tmp/gone', ROOT);
    const lost = await h.run('pwd');
    expect(lost.status).toBe(1);
    expect(lost.stderr).toContain('pwd: error retrieving current directory');
    expect(await h.run('pwd -Z')).toMatchObject({
      status: 2,
      stderr: 'bash: pwd: -Z: invalid option\npwd: usage: pwd [-LP]\n',
    });
  });
});

describe('export, unset and env', () => {
  it('exports variables to programs', async () => {
    const h = harness();
    await h.run('GREETING="hi there"');
    expect((await h.run('env')).stdout).not.toContain('GREETING');
    await h.run('export GREETING');
    expect((await h.run('env')).stdout).toContain('GREETING=hi there\n');
    await h.run('export -n GREETING');
    expect((await h.run('env')).stdout).not.toContain('GREETING');
    await h.run('export -n NEWVAR=x');
    expect(h.shell.session.env.get('NEWVAR')).toBe('x');
  });

  it('does not split assignment values in export arguments', async () => {
    const h = harness();
    await h.run('X="a b"');
    await h.run('export Y=$X');
    expect(h.shell.session.env.get('Y')).toBe('a b');
  });

  it('lists exports as declare -x, sorted and escaped', async () => {
    const h = harness();
    await h.run('export ZED=\'say "$x"\'');
    await h.run('export PENDING');
    const listing = (await h.run('export')).stdout;
    expect(listing).toContain('declare -x HOME="/home/guest"\n');
    expect(listing).toContain('declare -x PENDING\n');
    expect(listing).toContain('declare -x ZED="say \\"\\$x\\""\n');
    expect(listing.indexOf('HOME')).toBeLessThan(listing.indexOf('ZED'));
    expect((await h.run('export -p')).stdout).toBe(listing);
  });

  it('rejects invalid names and options', async () => {
    const h = harness();
    expect(await h.run('export 1abc=2 OK=1')).toMatchObject({
      stderr: "bash: export: `1abc=2': not a valid identifier\n",
      status: 1,
    });
    expect(h.shell.session.env.get('OK')).toBe('1');
    expect(await h.run('export -z')).toMatchObject({
      status: 2,
      stderr:
        'bash: export: -z: invalid option\nexport: usage: export [-fn] [name[=value] ...] or export -p\n',
    });
    expect(await h.run('unset 9x')).toMatchObject({
      stderr: "bash: unset: `9x': not a valid identifier\n",
      status: 1,
    });
    expect(await h.run('unset UID')).toMatchObject({
      stderr: 'bash: unset: UID: cannot unset: readonly variable\n',
      status: 1,
    });
    expect(await h.run('unset -q')).toMatchObject({ status: 2 });
  });

  it('prints the environment the way env does', async () => {
    const h = harness();
    const output = (await h.run('env')).stdout;
    expect(
      output.startsWith('SHELL=/bin/bash\nPWD=/home/guest\nLOGNAME=guest\nHOME=/home/guest\n'),
    ).toBe(true);
    expect(output.endsWith('_=/usr/bin/env\n')).toBe(true);
    expect((await h.run('env -i')).stdout).toBe('');
    expect((await h.run('env -i A=1 B=2')).stdout).toBe('A=1\nB=2\n');
    expect((await h.run('env -u HOME')).stdout).not.toContain('HOME=');
    expect((await h.run('env - C=3')).stdout).toBe('C=3\n');
  });

  it('runs commands in a modified environment', async () => {
    const h = harness();
    expect((await h.run('env GREETING=hey env')).stdout).toContain('GREETING=hey\n');
    expect(h.shell.session.env.get('GREETING')).toBeUndefined();
    expect(await h.run('env nosuch')).toMatchObject({
      stderr: 'env: ‘nosuch’: No such file or directory\n',
      status: 127,
    });
    expect(await h.run('env -i whoami')).toMatchObject({
      stderr: 'env: ‘whoami’: No such file or directory\n',
      status: 127,
    });
    const chdir = await h.run('env --chdir=/tmp pwd');
    expect(chdir.status).toBe(125);
    expect(chdir.stderr).toContain("option '--chdir' is not supported");
  });
});

describe('history', () => {
  it('numbers entries and supports N and -c', async () => {
    const h = harness();
    await h.run('echo one');
    await h.run('echo two');
    expect((await h.run('history')).stdout).toBe(
      '    1  echo one\n    2  echo two\n    3  history\n',
    );
    expect((await h.run('history 2')).stdout).toBe('    3  history\n    4  history 2\n');
    await h.run('history -c');
    expect(h.shell.history).toEqual([]);
  });

  it('reports bad arguments', async () => {
    const h = harness();
    expect(await h.run('history abc')).toMatchObject({
      stderr: 'bash: history: abc: numeric argument required\n',
      status: 1,
    });
    expect(await h.run('history 1 2')).toMatchObject({
      stderr: 'bash: history: too many arguments\n',
      status: 1,
    });
    expect((await h.run('history -z')).status).toBe(2);
  });
});

describe('whoami, id and hostname', () => {
  it('identifies the current user', async () => {
    const h = harness();
    expect(await h.run('whoami')).toEqual({ stdout: 'guest\n', stderr: '', status: 0 });
    expect(await h.run('whoami extra')).toMatchObject({
      stderr: "whoami: extra operand ‘extra’\nTry 'whoami --help' for more information.\n",
      status: 1,
    });
    expect((await h.run('whoami -q')).status).toBe(1);
  });

  it('prints ids and groups in coreutils format', async () => {
    const h = harness();
    expect((await h.run('id')).stdout).toBe('uid=1000(guest) gid=1000(guest) groups=1000(guest)\n');
    expect((await h.run('id admin')).stdout).toBe(
      'uid=1001(admin) gid=1001(admin) groups=1001(admin),27(sudo)\n',
    );
    expect((await h.run('id 1001')).stdout).toBe(
      'uid=1001(admin) gid=1001(admin) groups=1001(admin),27(sudo)\n',
    );
    expect((await h.run('id -u')).stdout).toBe('1000\n');
    expect((await h.run('id -un')).stdout).toBe('guest\n');
    expect((await h.run('id -g admin')).stdout).toBe('1001\n');
    expect((await h.run('id -gn admin')).stdout).toBe('admin\n');
    expect((await h.run('id -G admin')).stdout).toBe('1001 27\n');
    expect((await h.run('id -Gn admin')).stdout).toBe('admin sudo\n');
    expect((await h.run('id -ur')).stdout).toBe('1000\n');
  });

  it('shows the effective uid of setuid programs', async () => {
    const h = harness();
    h.machine.fs.chmod('/usr/bin/id', 0o4755, ROOT);
    expect((await h.run('id')).stdout).toBe(
      'uid=1000(guest) gid=1000(guest) euid=0(root) groups=1000(guest)\n',
    );
    h.machine.fs.chmod('/usr/bin/whoami', 0o4755, ROOT);
    expect((await h.run('whoami')).stdout).toBe('root\n');
  });

  it('reports id errors', async () => {
    const h = harness();
    expect(await h.run('id nobodyhere')).toMatchObject({
      stderr: 'id: ‘nobodyhere’: no such user\n',
      status: 1,
    });
    expect(await h.run('id -n')).toMatchObject({
      stderr: 'id: cannot print only names or real IDs in default format\n',
      status: 1,
    });
    expect(await h.run('id -u -g')).toMatchObject({
      stderr: 'id: cannot print "only" of more than one choice\n',
      status: 1,
    });
    expect((await h.run('id --bogus')).status).toBe(1);
  });

  it('prints the host name', async () => {
    const h = harness();
    expect((await h.run('hostname')).stdout).toBe('corp-web01\n');
    expect((await h.run('hostname -s')).stdout).toBe('corp-web01\n');
    expect((await h.run('hostname -f')).stdout).toBe('corp-web01\n');
    expect((await h.run('hostname -d')).stdout).toBe('\n');
    expect((await h.run('hostname -i')).stdout).toBe('127.0.1.1 \n');
    expect(await h.run('hostname evil')).toMatchObject({
      stderr: 'hostname: you must be root to change the host name\n',
      status: 1,
    });
    expect((await h.run('hostname -I')).stderr).toContain(
      "option '-I' is not supported in this simulation",
    );
  });

  it('splits dotted host names', async () => {
    const h = createHarness({
      commands: LINUX_COMMANDS,
      host: { hostname: 'db01.novacorp.internal', users: [{ name: 'guest', uid: 1000 }] },
    });
    expect((await h.run('hostname -s')).stdout).toBe('db01\n');
    expect((await h.run('hostname -d')).stdout).toBe('novacorp.internal\n');
    await h.shell.submit('true');
    const root = h.machine.users.byName('root');
    h.shell.pushSession(root!, { login: true });
    expect((await h.run('hostname newname')).stderr).toBe(
      'hostname: changing the host name is not supported in this simulation\n',
    );
  });
});

describe('clear', () => {
  it('writes the escape sequences real clear writes', async () => {
    const h = harness();
    expect((await h.run('clear')).stdout).toBe('\x1b[H\x1b[2J\x1b[3J');
    expect((await h.run('clear -x')).stdout).toBe('\x1b[H\x1b[2J');
    expect((await h.run('clear -q')).status).toBe(2);
  });
});

describe('exit and logout', () => {
  it('leaves a nested shell with a status', async () => {
    const h = harness();
    h.shell.pushSession(h.machine.users.byName('admin')!, { login: false });
    expect(await h.run('exit 3; echo not-run')).toEqual({
      stdout: '',
      stderr: 'exit\n',
      status: 3,
    });
    expect(h.shell.depth).toBe(1);
    expect(h.shell.session.env.lastStatus).toBe(3);
  });

  it('handles bad arguments like bash', async () => {
    const h = harness();
    h.shell.pushSession(h.machine.users.byName('admin')!, { login: false });
    expect(await h.run('exit 1 2')).toMatchObject({
      stderr: 'bash: exit: too many arguments\n',
      status: 1,
    });
    expect(h.shell.depth).toBe(2);
    expect(await h.run('logout')).toMatchObject({
      stderr: "bash: logout: not login shell: use `exit'\n",
      status: 1,
    });
    expect(await h.run('exit abc')).toMatchObject({
      stderr: 'exit\nbash: exit: abc: numeric argument required\n',
      status: 2,
    });
    expect(h.shell.depth).toBe(1);
  });

  it('logs out of the login shell and reconnects', async () => {
    const h = harness();
    const result = await h.run('logout');
    expect(result.stderr).toBe('logout\n');
    expect(result.stdout).toContain('Connection to corp-web01 closed.');
    expect((await h.run('exit 300')).status).toBe(44);
  });
});

describe('help and man', () => {
  it('lists commands by kind', async () => {
    const h = harness();
    const output = (await h.run('help')).stdout;
    expect(output).toContain('Shell builtins:\n');
    expect(output).toContain('  cd          Change the shell working directory.\n');
    expect(output).toContain('Programs:\n');
    expect(output).toContain('  whoami      print effective user name\n');
  });

  it('shows help for a topic and errors for unknown topics', async () => {
    const h = harness();
    expect(
      (await h.run('help cd')).stdout.startsWith(
        'cd: cd [-L|-P] [dir]\n    Change the shell working directory.\n',
      ),
    ).toBe(true);
    expect((await h.run('help id')).stdout.startsWith('Usage: id [OPTION]... [USER]...\n')).toBe(
      true,
    );
    expect(await h.run('help nope')).toMatchObject({
      stderr:
        "bash: help: no help topics match `nope'.  Try `help help' or `man -k nope' or `info nope'.\n",
      status: 1,
    });
  });

  it('renders manual pages', async () => {
    const h = harness();
    const page = (await h.run('man id')).stdout;
    expect(page).toContain('\x1b[1mNAME\x1b[22m');
    expect(page).toMatch(/^ID\(1\) +User Commands +ID\(1\)\n/);
    expect(page).toContain('       id - print real and effective user and group IDs\n');
    expect(page).toContain(
      '\x1b[1m-u, --user\x1b[22m\n              print only the effective user ID',
    );
    expect(page).toContain('SEE ALSO');
    expect(page).toMatch(/ROOT_ACCESS +March 2026 +ID\(1\)\n$/);
    const piped = (await h.run('man cd > page.txt')).status;
    expect(piped).toBe(0);
    const saved = h.machine.fs.readFile('/home/guest/page.txt', ROOT);
    expect(saved).toMatch(/^CD\(1\) +Bash Builtins +CD\(1\)/);
    expect(saved).not.toContain('\x1b[1m');
  });

  it('handles man usage errors, sections and apropos', async () => {
    const h = harness();
    expect(await h.run('man')).toMatchObject({
      stderr: "What manual page do you want?\nFor example, try 'man man'.\n",
      status: 1,
    });
    expect(await h.run('man nosuch')).toMatchObject({
      stderr: 'No manual entry for nosuch\n',
      status: 16,
    });
    expect(await h.run('man 8 id')).toMatchObject({
      stderr: 'No manual entry for id in section 8\n',
      status: 16,
    });
    expect((await h.run('man 1 id')).status).toBe(0);
    expect((await h.run('man id whoami')).stdout).toContain('WHOAMI(1)');
    expect((await h.run('man -k directory')).stdout).toContain(
      'cd (1)               - Change the shell working directory.\n',
    );
    expect(await h.run('man -k zzzz')).toMatchObject({
      stdout: 'zzzz: nothing appropriate.\n',
      status: 16,
    });
    expect(await h.run('man -k')).toMatchObject({ stderr: 'apropos what?\n', status: 1 });
    expect((await h.run('man --bogus')).status).toBe(2);
  });
});
