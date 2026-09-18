import { describe, expect, it } from 'vitest';
import { LINUX_COMMANDS } from '../../src/engine/commands';
import type { HostDefinition } from '../../src/engine/system/host';
import { createHarness } from '../helpers/shell';

const HOST: HostDefinition = {
  hostname: 'corp-web01',
  users: [
    { name: 'guest', uid: 1000 },
    { name: 'admin', uid: 1001, password: 'S3cret!' },
    { name: 'ops', uid: 1002, password: 'opsPass', groups: ['sudo'] },
    { name: 'deploy', uid: 1003, password: 'deployPass' },
  ],
  sudoers: [
    {
      who: 'deploy',
      runAs: 'root',
      commands: ['/usr/bin/id', '/usr/bin/cat /var/log/*'],
      nopasswd: false,
    },
  ],
  fs: {
    '/home/admin/flag.txt': { content: 'admin-secret\n', owner: 'admin', mode: '0600' },
    '/var/log/deploy.log': {
      content: 'deploy events\n',
      owner: 'root',
      mode: '0640',
      group: 'adm',
    },
  },
};

/** Drives su/sudo: submit the command, answer the password prompt, wait for the shell. */
async function withPassword(h: ReturnType<typeof createHarness>, line: string, password: string) {
  h.take();
  await h.shell.submit(line);
  expect(h.shell.inputRequest.kind).toBe('read');
  await h.shell.submit(password);
  await h.shell.whenReady();
  return h.take();
}

const harness = (user = 'guest') => createHarness({ commands: LINUX_COMMANDS, host: HOST, user });

describe('su', () => {
  it('switches user after a correct password', async () => {
    const h = harness();
    const out = await withPassword(h, 'su admin', 'S3cret!');
    expect(out.stdout).toBe('');
    expect(h.shell.depth).toBe(2);
    expect(h.shell.session.user.name).toBe('admin');
    expect((await h.run('whoami')).stdout).toBe('admin\n');
    expect((await h.run('cat /home/admin/flag.txt')).stdout).toBe('admin-secret\n');
  });

  it('keeps the directory for su and resets it for su -', async () => {
    const h = harness();
    await h.run('cd /tmp');
    await withPassword(h, 'su admin', 'S3cret!');
    expect(h.shell.session.env.cwd).toBe('/tmp');
    await h.run('exit');
    await withPassword(h, 'su - admin', 'S3cret!');
    expect(h.shell.session.env.cwd).toBe('/home/admin');
  });

  it('rejects a wrong password', async () => {
    const h = harness();
    const out = await withPassword(h, 'su admin', 'wrong');
    expect(out.stderr).toBe('su: Authentication failure\n');
    expect(h.shell.depth).toBe(1);
  });

  it('fails for a locked account after prompting', async () => {
    const h = harness();
    const out = await withPassword(h, 'su', 'anything');
    expect(out.stderr).toBe('su: Authentication failure\n');
    expect(h.shell.depth).toBe(1);
  });

  it('runs a single command with -c', async () => {
    const h = harness();
    const out = await withPassword(h, 'su admin -c whoami', 'S3cret!');
    expect(out.stdout).toBe('admin\n');
    expect(h.shell.depth).toBe(1);
  });

  it('reports unknown users and cancellation', async () => {
    const h = harness();
    expect((await h.run('su ghost')).stderr).toContain('su: user ghost does not exist');
    h.take();
    await h.shell.submit('su admin');
    h.shell.interrupt();
    await h.shell.whenReady();
    expect(h.shell.depth).toBe(1);
  });
});

describe('sudo', () => {
  it('lists a full-access user’s privileges', async () => {
    const h = harness('ops');
    const out = await withPassword(h, 'sudo -l', 'opsPass');
    expect(out.stdout).toContain('User ops may run the following commands');
    expect(out.stdout).toContain('(ALL : ALL) ALL');
  });

  it('runs a command as root for a sudo-group member', async () => {
    const h = harness('ops');
    const out = await withPassword(h, 'sudo id -u', 'opsPass');
    expect(out.stdout).toBe('0\n');
  });

  it('refuses a user with no sudo rights', async () => {
    const h = harness();
    expect(await h.run('sudo -l')).toMatchObject({
      stderr: 'Sorry, user guest may not run sudo on corp-web01.\n',
      status: 1,
    });
    const denied = await h.run('sudo cat /home/admin/flag.txt');
    expect(denied.stderr).toContain('may not run sudo');
  });

  it('enforces per-command policy', async () => {
    const h = harness('deploy');
    expect((await withPassword(h, 'sudo -l', 'deployPass')).stdout).toContain('/usr/bin/id');
    expect((await withPassword(h, 'sudo id -u', 'deployPass')).stdout).toBe('0\n');
    expect((await withPassword(h, 'sudo cat /var/log/deploy.log', 'deployPass')).stdout).toBe(
      'deploy events\n',
    );
    const forbidden = await withPassword(h, 'sudo cat /home/admin/flag.txt', 'deployPass');
    expect(forbidden.stderr).toContain('not allowed to execute');
  });

  it('rejects a wrong password', async () => {
    const h = harness('ops');
    const out = await withPassword(h, 'sudo id', 'wrong');
    expect(out.stderr).toContain('sudo: 1 incorrect password attempt');
  });
});
