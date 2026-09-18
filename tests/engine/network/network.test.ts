import { describe, expect, it } from 'vitest';
import { compareIp, Network } from '../../../src/engine/network/Network';
import { parsePortRange, serviceName } from '../../../src/engine/network/services';
import { serveHttp } from '../../../src/engine/network/http';
import type { HttpSite } from '../../../src/engine/network/types';
import { buildNetwork } from '../../../src/engine/system/Machine';
import { CommandRegistry } from '../../../src/engine/commands/types';
import type { HostDefinition } from '../../../src/engine/system/host';
import { ManualClock } from '../../../src/engine/util/clock';

const TIME = Date.parse('2026-03-14T09:00:00Z');

function net(...hosts: HostDefinition[]): Network {
  return buildNetwork(hosts, {
    clock: new ManualClock(TIME),
    time: TIME,
    binaries: new CommandRegistry().binaries(),
  });
}

const JUMP: HostDefinition = {
  hostname: 'jump01',
  users: [{ name: 'guest', uid: 1000 }],
  net: {
    interfaces: [
      { name: 'eth0', ip: '10.10.0.5' },
      { name: 'eth1', ip: '10.10.9.5' },
    ],
    ports: [{ port: 22, product: 'OpenSSH', version: '8.9p1' }],
  },
};
const WORKSTATION: HostDefinition = {
  hostname: 'ws-14',
  users: [{ name: 'guest', uid: 1000 }],
  net: { interfaces: [{ name: 'eth0', ip: '10.10.0.14' }], ports: [{ port: 22 }] },
};
const VAULT: HostDefinition = {
  hostname: 'vault',
  users: [{ name: 'guest', uid: 1000 }],
  net: {
    interfaces: [{ name: 'eth0', ip: '10.10.9.20' }],
    ports: [{ port: 22 }, { port: 8080, name: 'http-proxy', product: 'nginx', version: '1.24.0' }],
  },
};

describe('services helpers', () => {
  it('names well-known ports and parses ranges', () => {
    expect(serviceName(22)).toBe('ssh');
    expect(serviceName(8080)).toBe('http-proxy');
    expect(serviceName(9999)).toBe('unknown');
    expect(serviceName(80, 'http-alt')).toBe('http-alt');
    expect(parsePortRange('22')).toEqual([22]);
    expect(parsePortRange('22,80,443')).toEqual([22, 80, 443]);
    expect(parsePortRange('20-22')).toEqual([20, 21, 22]);
    expect(parsePortRange('1-2,5,5')).toEqual([1, 2, 5]);
    expect(parsePortRange('bad')).toBeNull();
    expect(parsePortRange('70000')).toBeNull();
    expect(parsePortRange('-')).toHaveLength(65535);
  });

  it('orders IPv4 addresses numerically', () => {
    expect(['10.10.0.20', '10.10.0.3', '10.10.0.1'].sort(compareIp)).toEqual([
      '10.10.0.1',
      '10.10.0.3',
      '10.10.0.20',
    ]);
  });
});

describe('Network reachability and DNS', () => {
  const network = net(JUMP, WORKSTATION, VAULT);
  const jump = network.machineByHostname('jump01')!;
  const ws = network.machineByHostname('ws-14')!;
  const vault = network.machineByHostname('vault')!;

  it('resolves hostnames, .internal names and IPs', () => {
    expect(network.resolve('vault')).toBe('10.10.9.20');
    expect(network.resolve('vault.novacorp.internal')).toBe('10.10.9.20');
    expect(network.resolve('10.10.0.14')).toBe('10.10.0.14');
    expect(network.resolve('nope')).toBeUndefined();
    expect(network.hostnameOf('10.10.9.20')).toBe('vault');
    expect(network.hostnameOf('10.10.9.99')).toBeNull();
  });

  it('reaches hosts on a shared subnet only', () => {
    // The jump host is dual-homed, so it reaches both segments.
    expect(network.canReach(jump, '10.10.0.14')).toBe(true);
    expect(network.canReach(jump, '10.10.9.20')).toBe(true);
    // The workstation is only on 10.10.0.0/24 and cannot reach the vault segment.
    expect(network.canReach(ws, '10.10.0.5')).toBe(true);
    expect(network.canReach(ws, '10.10.9.20')).toBe(false);
    // The vault is only on 10.10.9.0/24.
    expect(network.canReach(vault, '10.10.0.14')).toBe(false);
    expect(network.canReach(vault, '10.10.9.5')).toBe(true);
    expect(network.canReach(ws, '127.0.0.1')).toBe(true);
  });

  it('lists reachable hosts for a ping sweep', () => {
    expect(network.reachableIps(jump)).toEqual(['10.10.0.14', '10.10.9.20']);
    expect(network.reachableIps(ws)).toEqual(['10.10.0.5']);
  });

  it('reports interfaces and the ssh service', () => {
    expect(network.interfacesOf(jump).map((i) => i.name)).toEqual(['lo', 'eth0', 'eth1']);
    expect(network.sshServiceOf(vault)?.port).toBe(22);
    expect(network.ttlOf(jump)).toBe(64);
  });

  it('scans reachable hosts and reports version info', () => {
    const scan = network.scan(jump, '10.10.9.20');
    expect(scan.up).toBe(true);
    expect(scan.hostname).toBe('vault');
    expect(scan.ports.map((p) => p.port)).toEqual([22, 8080]);
    const http = scan.ports.find((p) => p.port === 8080);
    expect(http).toMatchObject({ service: 'http-proxy', version: 'nginx 1.24.0' });
  });

  it('reports an unreachable host as down', () => {
    expect(network.scan(ws, '10.10.9.20').up).toBe(false);
    expect(network.scan(jump, '10.10.0.99').up).toBe(false);
  });

  it('scans only the requested ports', () => {
    expect(network.scan(jump, '10.10.9.20', [22]).ports.map((p) => p.port)).toEqual([22]);
    expect(network.scan(jump, '10.10.9.20', [443]).ports).toEqual([]);
  });

  it('defaults a host without net metadata to a single eth0', () => {
    const solo = net({ hostname: 'solo', users: [{ name: 'guest', uid: 1000 }] });
    const machine = solo.machineByHostname('solo')!;
    expect(solo.interfacesOf(machine).map((i) => i.ip)).toEqual(['127.0.0.1', '10.0.2.15']);
  });
});

describe('serveHttp', () => {
  const site: HttpSite = {
    server: 'nginx/1.24.0',
    routes: {
      '/': { body: '<h1>NovaCorp Portal</h1>' },
      '/admin': { body: 'secret', auth: { realm: 'Admin', user: 'admin', password: 'hunter2' } },
      '/robots.txt': {
        headers: { 'Content-Type': 'text/plain' },
        body: 'User-agent: *\nDisallow: /admin\n',
      },
    },
  };

  it('serves routes, 404s, and trailing-slash variants', () => {
    expect(serveHttp(site, { method: 'GET', path: '/', headers: {} })).toMatchObject({
      status: 200,
    });
    expect(serveHttp(site, { method: 'GET', path: '/robots.txt', headers: {} }).body).toContain(
      'Disallow',
    );
    expect(serveHttp(site, { method: 'GET', path: '/admin/', headers: {} }).status).toBe(401);
    expect(serveHttp(site, { method: 'GET', path: '/nope', headers: {} }).status).toBe(404);
  });

  it('enforces basic auth', () => {
    const unauth = serveHttp(site, { method: 'GET', path: '/admin', headers: {} });
    expect(unauth.status).toBe(401);
    expect(unauth.headers['WWW-Authenticate']).toContain('Basic realm="Admin"');
    // admin:hunter2 => YWRtaW46aHVudGVyMg==
    const ok = serveHttp(site, {
      method: 'GET',
      path: '/admin',
      headers: { authorization: 'Basic YWRtaW46aHVudGVyMg==' },
    });
    expect(ok).toMatchObject({ status: 200, body: 'secret' });
  });
});
