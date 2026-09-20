import { describe, expect, it } from 'vitest';
import { LINUX_COMMANDS } from '../../src/engine/commands';
import type { HostDefinition } from '../../src/engine/system/host';
import { createHarness } from '../helpers/shell';

const HOST: HostDefinition = {
  hostname: 'trainer',
  users: [
    { name: 'guest', uid: 1000, password: 'guest' },
    { name: 'admin', uid: 1001, password: 'S3cret!', groups: ['sudo'] },
  ],
  processes: [
    {
      pid: 1337,
      user: 'guest',
      command: './cryptominer --stealth',
      cpu: 98.7,
      tty: '?',
      stubborn: true,
    },
    { pid: 900, user: 'guest', command: '-bash', tty: 'pts/0', stat: 'Ss' },
    { pid: 700, user: 'admin', command: '/usr/bin agent', tty: '?' },
  ],
  fs: {},
};

const harness = (user = 'guest') => createHarness({ commands: LINUX_COMMANDS, host: HOST, user });

describe('ps', () => {
  it('ps aux lists every process with the full command line', async () => {
    const out = (await harness().run('ps aux')).stdout;
    expect(out).toContain('USER');
    expect(out).toContain('%CPU');
    expect(out).toContain('/sbin/init'); // a base-system process
    expect(out).toContain('./cryptominer --stealth'); // the rogue, full command line
    expect(out).toContain('1337');
  });

  it('ps -ef uses the System V header', async () => {
    const out = (await harness().run('ps -ef')).stdout;
    expect(out).toContain('UID');
    expect(out).toContain('PPID');
    expect(out).toContain('CMD');
    expect(out).toContain('1337');
  });

  it('bare ps shows only this terminal, hiding the detached rogue', async () => {
    const out = (await harness().run('ps')).stdout;
    expect(out).toContain('bash');
    expect(out).toContain('ps');
    // The rogue has tty '?', so a bare ps does not reveal it — you need `ps aux`.
    expect(out).not.toContain('cryptominer');
  });
});

describe('kill', () => {
  it('a stubborn process survives SIGTERM but not SIGKILL', async () => {
    const h = harness();
    // Plain kill (TERM) is reported as sent, but the stubborn process keeps running.
    const term = await h.run('kill 1337');
    expect(term.status).toBe(0);
    expect((await h.run('ps aux')).stdout).toContain('cryptominer');
    // -9 (KILL) cannot be ignored.
    const force = await h.run('kill -9 1337');
    expect(force.status).toBe(0);
    expect((await h.run('ps aux')).stdout).not.toContain('cryptominer');
  });

  it('reports an unknown pid like bash', async () => {
    const out = await harness().run('kill 4242');
    expect(out.stderr).toBe('bash: kill: (4242) - No such process\n');
    expect(out.status).toBe(1);
  });

  it('refuses to signal another user’s process unless root', async () => {
    const out = await harness().run('kill 700');
    expect(out.stderr).toBe('bash: kill: (700) - Operation not permitted\n');
    expect(out.status).toBe(1);
  });

  it('rejects a non-numeric target', async () => {
    const out = await harness().run('kill firefox');
    expect(out.stderr).toBe('bash: kill: firefox: arguments must be process or job IDs\n');
    expect(out.status).toBe(1);
  });

  it('kill -l lists signal names including KILL and TERM', async () => {
    const out = (await harness().run('kill -l')).stdout;
    expect(out).toContain('SIGKILL');
    expect(out).toContain('SIGTERM');
  });

  it('accepts -KILL by name', async () => {
    const h = harness();
    expect((await h.run('kill -KILL 1337')).status).toBe(0);
    expect((await h.run('ps aux')).stdout).not.toContain('cryptominer');
  });
});
