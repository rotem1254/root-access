import { describe, expect, it } from 'vitest';
import { LINUX_COMMANDS } from '../../src/engine/commands';
import type { HostDefinition } from '../../src/engine/system/host';
import { createHarness } from '../helpers/shell';

const HOST: HostDefinition = {
  hostname: 'gw',
  users: [
    { name: 'guest', uid: 1000, password: 'guest' },
    { name: 'ops', uid: 1001, password: 'ops', groups: ['sudo'] },
  ],
  net: {
    interfaces: [{ name: 'eth0', ip: '10.10.0.1' }],
    ports: [{ port: 22 }, { port: 80, name: 'http', http: { routes: { '/': { body: 'hi\n' } } } }],
    gateway: '10.10.0.254',
  },
};

const harness = () => createHarness({ commands: LINUX_COMMANDS, host: HOST, user: 'guest' });

describe('ifconfig branches', () => {
  it('handles -a, a single interface and an unknown one', async () => {
    const h = harness();
    expect((await h.run('ifconfig -a')).stdout).toContain('eth0:');
    expect((await h.run('ifconfig lo')).stdout).toContain('lo: flags=73<UP,LOOPBACK,RUNNING>');
    expect((await h.run('ifconfig lo')).stdout).not.toContain('eth0:');
    expect(await h.run('ifconfig eth9')).toMatchObject({
      status: 1,
      stderr: 'eth9: error fetching interface information: Device not found\n',
    });
  });
});

describe('ip branches', () => {
  it('shows one device, an unknown device, and routes', async () => {
    const h = harness();
    expect((await h.run('ip addr show dev lo')).stdout).toContain('inet 127.0.0.1/8 scope host lo');
    expect((await h.run('ip a show eth9')).stderr).toContain('Device "eth9" does not exist.');
    expect((await h.run('ip route')).stdout).toContain('default via 10.10.0.254 dev eth0');
    expect((await h.run('ip route')).stdout).toContain('10.10.0.0/24 dev eth0 proto kernel');
    expect((await h.run('ip neigh')).stderr).toContain('is unknown');
  });

  it('computes the network base correctly for a non-/24 mask', async () => {
    const host: HostDefinition = {
      hostname: 'wide',
      users: [{ name: 'guest', uid: 1000 }],
      net: { interfaces: [{ name: 'eth0', ip: '10.10.5.20', netmask: '255.255.0.0' }] },
    };
    const h = createHarness({ commands: LINUX_COMMANDS, host, user: 'guest' });
    // 10.10.5.20/16 lives on the 10.10.0.0/16 network, not 10.10.5.0.
    expect((await h.run('ip route')).stdout).toContain('10.10.0.0/16 dev eth0 proto kernel');
  });
});

describe('netstat and ss programs column', () => {
  it('shows the program column only with -p', async () => {
    const h = harness();
    expect((await h.run('netstat -tln')).stdout).not.toContain('/');
    expect((await h.run('netstat -tlnp')).stdout).toMatch(/\d+\/\w+/);
    expect((await h.run('ss -tlnp')).stdout).toContain('users:((');
    expect((await h.run('ss -tln')).stdout).not.toContain('users:((');
  });
});

describe('ping option branches', () => {
  it('clamps the count and requires a destination', async () => {
    const h = harness();
    expect(await h.run('ping')).toMatchObject({ status: 2 });
    const out = await h.run('ping -c 99 -W 1 10.10.0.1');
    expect(out.stdout).toContain('10 packets transmitted');
  });
});

describe('curl branches', () => {
  it('handles -v, -u, output errors and bad URLs', async () => {
    const h = harness();
    expect((await h.run('curl -v http://gw/')).stderr).toContain('Connected to gw');
    expect((await h.run('curl :::bad')).status).toBe(3);
    expect((await h.run('curl -o /etc/x http://gw/')).status).toBe(23);
    await h.run('curl -u admin:pw http://gw/');
  });
});

describe('wget branches', () => {
  it('reports resolve failures and write errors', async () => {
    const h = harness();
    expect((await h.run('wget http://nope/')).status).toBe(4);
    expect((await h.run('wget -O /etc/x http://gw/')).status).toBe(3);
    expect((await h.run('wget')).status).toBe(1);
  });
});

describe('su and env branches', () => {
  it('su -c runs a command as another user', async () => {
    const h = harness();
    h.take();
    await h.shell.submit('su ops -c whoami');
    await h.shell.submit('ops');
    await h.shell.whenReady();
    expect(h.take().stdout).toContain('ops');
  });

  it('env with assignments but no command prints them', async () => {
    const h = harness();
    expect((await h.run('env FOO=bar')).stdout).toContain('FOO=bar');
  });
});
