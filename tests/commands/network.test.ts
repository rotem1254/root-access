import { describe, expect, it } from 'vitest';
import { LINUX_COMMANDS } from '../../src/engine/commands';
import type { HostDefinition } from '../../src/engine/system/host';
import { createHarness } from '../helpers/shell';

const JUMP: HostDefinition = {
  hostname: 'jump01',
  users: [
    { name: 'guest', uid: 1000, password: 'guest' },
    { name: 'analyst', uid: 1001, password: 'an4lyst' },
  ],
  net: {
    interfaces: [
      { name: 'eth0', ip: '10.10.0.5' },
      { name: 'eth1', ip: '10.10.9.5' },
    ],
    ports: [{ port: 22, product: 'OpenSSH', version: '8.9p1 Ubuntu-3ubuntu0.6' }],
    gateway: '10.10.0.1',
  },
};
const WS: HostDefinition = {
  hostname: 'ws-14',
  users: [{ name: 'guest', uid: 1000 }],
  net: { interfaces: [{ name: 'eth0', ip: '10.10.0.14' }], ports: [{ port: 22 }] },
};
const VAULT: HostDefinition = {
  hostname: 'vault',
  users: [
    { name: 'guest', uid: 1000 },
    { name: 'admin', uid: 1001, password: 'V4ultKeeper!' },
  ],
  motd: 'NovaCorp secure vault. Authorised access only.\n',
  net: {
    interfaces: [{ name: 'eth0', ip: '10.10.9.20' }],
    ports: [
      { port: 22, product: 'OpenSSH', version: '9.6p1' },
      {
        port: 8080,
        name: 'http-proxy',
        product: 'nginx',
        version: '1.24.0',
        http: {
          server: 'nginx/1.24.0',
          routes: {
            '/': { body: 'NovaCorp vault portal\n' },
            '/status': { body: 'ok\n', headers: { 'Content-Type': 'text/plain' } },
          },
        },
      },
    ],
  },
  fs: { '/home/admin/flag.txt': { content: 'the-vault-flag\n', owner: 'admin', mode: '0600' } },
};

const harness = () =>
  createHarness({ commands: LINUX_COMMANDS, host: JUMP, hosts: [WS, VAULT], user: 'guest' });

describe('ifconfig and ip', () => {
  it('shows the current host interfaces', async () => {
    const h = harness();
    const out = (await h.run('ifconfig')).stdout;
    expect(out).toContain('eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>');
    expect(out).toContain('inet 10.10.0.5  netmask 255.255.255.0  broadcast 10.10.0.255');
    expect(out).toContain('inet 10.10.9.5');
    expect(out).toContain('lo: flags=73<UP,LOOPBACK,RUNNING>');
  });

  it('ip a shows CIDR addresses and ip route the gateway', async () => {
    const h = harness();
    const a = (await h.run('ip a')).stdout;
    expect(a).toContain('2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP>');
    expect(a).toContain('inet 10.10.0.5/24 brd 10.10.0.255 scope global eth0');
    expect((await h.run('ip addr show eth1')).stdout).toContain('inet 10.10.9.5/24');
    expect((await h.run('ip route')).stdout).toContain('default via 10.10.0.1 dev eth0');
    expect((await h.run('hostname -I')).stdout).toBe('10.10.0.5 10.10.9.5 \n');
  });
});

describe('ping', () => {
  it('reaches hosts on a connected subnet', async () => {
    const h = harness();
    const out = await h.run('ping -c 2 10.10.0.1');
    expect(out.stdout).toContain('PING 10.10.0.1 (10.10.0.1) 56(84) bytes of data.');
    // The gateway is not a defined host, so it is unreachable here; use a real host.
    const vault = await h.run('ping -c 2 vault');
    expect(vault.stdout).toContain('64 bytes from vault (10.10.9.20): icmp_seq=1 ttl=64');
    expect(vault.stdout).toContain('2 packets transmitted, 2 received, 0% packet loss');
    expect(vault.status).toBe(0);
  });

  it('fails for unreachable and unknown hosts', async () => {
    const h = createHarness({
      commands: LINUX_COMMANDS,
      host: WS,
      hosts: [JUMP, VAULT],
      user: 'guest',
    });
    const out = await h.run('ping -c 1 nope');
    expect(out.stderr).toContain('Name or service not known');
    expect(out.status).toBe(2);
    const unreachable = await h.run('ping -c 1 10.10.9.20');
    expect(unreachable.stdout).toContain('Destination Host Unreachable');
    expect(unreachable.status).toBe(1);
  });
});

describe('nmap', () => {
  it('scans a host and shows open ports', async () => {
    const h = harness();
    const out = (await h.run('nmap vault')).stdout;
    expect(out).toContain('Nmap scan report for vault (10.10.9.20)');
    expect(out).toContain('22/tcp   open  ssh');
    expect(out).toContain('8080/tcp open  http-proxy');
    expect(out).toContain('1 host up');
  });

  it('adds version info with -sV', async () => {
    const h = harness();
    const out = (await h.run('nmap -sV vault')).stdout;
    expect(out).toContain('VERSION');
    expect(out).toContain('OpenSSH 9.6p1');
    expect(out).toContain('nginx 1.24.0');
  });

  it('discovers hosts on a subnet with a CIDR target', async () => {
    const h = harness();
    const out = (await h.run('nmap 10.10.0.0/24')).stdout;
    expect(out).toContain('Nmap scan report for ws-14 (10.10.0.14)');
    expect(out).not.toContain('vault');
  });

  it('scans specific ports and reports unreachable hosts as down', async () => {
    const h = createHarness({
      commands: LINUX_COMMANDS,
      host: WS,
      hosts: [JUMP, VAULT],
      user: 'guest',
    });
    expect((await h.run('nmap -p 22 jump01')).stdout).toContain('22/tcp   open  ssh');
    const down = (await h.run('nmap 10.10.9.20')).stdout;
    expect(down).toContain('Host seems down');
  });
});

describe('netstat and ss', () => {
  it('list listening services on the current host', async () => {
    const h = harness();
    expect((await h.run('netstat -tlnp')).stdout).toContain('0.0.0.0:22');
    expect((await h.run('ss -tlnp')).stdout).toContain('LISTEN');
    const onVault = createHarness({ commands: LINUX_COMMANDS, host: VAULT, user: 'admin' });
    const out = (await onVault.run('ss -tln')).stdout;
    expect(out).toContain('0.0.0.0:22');
    expect(out).toContain('0.0.0.0:8080');
  });
});

describe('dig and nslookup', () => {
  it('resolve names and reverse lookups', async () => {
    const h = harness();
    expect((await h.run('dig +short vault')).stdout).toBe('10.10.9.20\n');
    expect((await h.run('dig +short vault.novacorp.internal')).stdout).toBe('10.10.9.20\n');
    expect((await h.run('dig -x 10.10.9.20 +short')).stdout).toBe('vault.novacorp.internal.\n');
    expect((await h.run('nslookup vault')).stdout).toContain('Address: 10.10.9.20');
    expect((await h.run('dig +short nope')).stdout).toBe('');
  });
});

describe('nc', () => {
  it('grabs a banner and tests ports', async () => {
    const h = harness();
    expect((await h.run('nc -v vault 22 < /dev/null')).stdout).toContain('SSH-2.0-OpenSSH_9.6p1');
    expect((await h.run('nc -z vault 8080')).status).toBe(0);
    expect((await h.run('nc -z vault 3306')).status).toBe(1);
  });

  it('speaks HTTP by hand', async () => {
    const h = harness();
    const out = (await h.run('printf "GET /status HTTP/1.0\\r\\n\\r\\n" | nc vault 8080')).stdout;
    expect(out).toContain('HTTP/1.1 200 OK');
    expect(out).toContain('ok');
  });
});

describe('curl and wget', () => {
  it('fetches pages, headers and writes files', async () => {
    const h = harness();
    expect((await h.run('curl http://vault:8080/')).stdout).toBe('NovaCorp vault portal\n');
    expect((await h.run('curl -I http://vault:8080/status')).stdout).toContain('HTTP/1.1 200 OK');
    expect((await h.run('curl -I http://vault:8080/status')).stdout).toContain(
      'Content-Type: text/plain',
    );
    expect((await h.run('curl http://vault:8080/missing')).stdout).toContain('404 Not Found');
    await h.run('curl -o page.html http://vault:8080/');
    expect((await h.run('cat page.html')).stdout).toBe('NovaCorp vault portal\n');
  });

  it('reports connection failures', async () => {
    const h = harness();
    expect((await h.run('curl http://vault:9999/')).stderr).toContain('Connection refused');
    expect((await h.run('curl http://nope/')).stderr).toContain('Could not resolve host');
    const ws = createHarness({ commands: LINUX_COMMANDS, host: WS, hosts: [VAULT], user: 'guest' });
    expect((await ws.run('curl http://10.10.9.20:8080/')).stderr).toContain('Connection refused');
  });

  it('wget saves to a file and to stdout', async () => {
    const h = harness();
    await h.run('wget -q http://vault:8080/status');
    expect((await h.run('cat status')).stdout).toBe('ok\n');
    expect((await h.run('wget -q -O - http://vault:8080/')).stdout).toBe('NovaCorp vault portal\n');
  });
});

describe('ssh', () => {
  async function sshIn(h: ReturnType<typeof harness>, line: string, ...answers: string[]) {
    h.take();
    await h.shell.submit(line);
    for (const answer of answers) {
      await h.shell.submit(answer);
      await h.shell.whenReady();
    }
    await h.shell.whenReady();
    return h.take();
  }

  it('connects to another host with the host-key and password prompts', async () => {
    const h = harness();
    const out = await sshIn(h, 'ssh admin@vault', 'yes', 'V4ultKeeper!');
    expect(out.stdout).toContain('NovaCorp secure vault');
    expect(h.shell.session.machine.hostname).toBe('vault');
    expect(h.shell.session.user.name).toBe('admin');
    expect((await h.run('whoami')).stdout).toBe('admin\n');
    expect((await h.run('cat /home/admin/flag.txt')).stdout).toBe('the-vault-flag\n');
    expect((await h.run('hostname')).stdout).toBe('vault\n');
    await h.run('exit');
    expect(h.shell.session.machine.hostname).toBe('jump01');
  });

  it('rejects a wrong password and a declined host key', async () => {
    const h = harness();
    const declined = await sshIn(h, 'ssh admin@vault', 'no');
    expect(declined.stderr).toContain('Host key verification failed');
    expect(h.shell.session.machine.hostname).toBe('jump01');
    const wrong = await sshIn(h, 'ssh admin@vault', 'yes', 'nope', 'nope', 'nope');
    expect(wrong.stderr).toContain('Permission denied');
    expect(h.shell.session.machine.hostname).toBe('jump01');
  });

  it('refuses to reach a host with no route', async () => {
    const ws = createHarness({
      commands: LINUX_COMMANDS,
      host: WS,
      hosts: [JUMP, VAULT],
      user: 'guest',
    });
    expect((await ws.run('ssh admin@vault')).stderr).toContain('No route to host');
    expect((await ws.run('ssh admin@nope')).stderr).toContain('Could not resolve hostname');
  });
});
