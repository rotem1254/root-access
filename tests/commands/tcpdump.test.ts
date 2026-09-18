import { describe, expect, it } from 'vitest';
import { LINUX_COMMANDS } from '../../src/engine/commands';
import { encodePcap, decodePcap, isPcap } from '../../src/engine/network/pcap';
import type { PcapSummary } from '../../src/engine/network/types';
import { ROOT_CREDENTIALS as ROOT } from '../../src/engine/fs/permissions';
import type { HostDefinition } from '../../src/engine/system/host';
import { createHarness } from '../helpers/shell';

const CAPTURE: PcapSummary = {
  entries: [
    {
      time: '0.000000',
      protocol: 'TCP',
      src: '10.10.0.14.51000',
      dst: '10.10.9.20.8080',
      info: 'Flags [S], seq 0',
    },
    {
      time: '0.000200',
      protocol: 'HTTP',
      src: '10.10.0.14.51000',
      dst: '10.10.9.20.8080',
      info: 'GET /admin HTTP/1.1 | Authorization: Basic YWRtaW46VjR1bHRLZWVwZXIh',
    },
    {
      time: '0.010500',
      protocol: 'HTTP',
      src: '10.10.9.20.8080',
      dst: '10.10.0.14.51000',
      info: 'HTTP/1.1 200 OK',
    },
  ],
};

const HOST: HostDefinition = {
  hostname: 'sensor',
  users: [{ name: 'guest', uid: 1000 }],
  fs: {
    '/home/guest/capture.pcap': { bytes: encodePcap(CAPTURE), owner: 'guest' },
    '/home/guest/notes.txt': { content: 'not a capture\n', owner: 'guest' },
  },
};

const harness = () => createHarness({ commands: LINUX_COMMANDS, host: HOST, user: 'guest' });

describe('pcap container', () => {
  it('round-trips a capture and is recognised as a pcap', () => {
    const bytes = encodePcap(CAPTURE);
    expect(isPcap(bytes)).toBe(true);
    expect(decodePcap(bytes)).toEqual(CAPTURE);
    expect(decodePcap('not a pcap')).toBeNull();
    expect(isPcap('plain')).toBe(false);
  });
});

describe('tcpdump', () => {
  it('reads a capture and prints the packets', async () => {
    const h = harness();
    const out = await h.run('tcpdump -r capture.pcap');
    expect(out.stderr).toContain('reading from file capture.pcap');
    expect(out.stdout).toContain(
      '0.000000 IP 10.10.0.14.51000 > 10.10.9.20.8080: Flags [S], seq 0',
    );
    expect(out.stdout).toContain('GET /admin HTTP/1.1');
    expect(out.status).toBe(0);
  });

  it('reveals a cleartext credential to grep', async () => {
    const h = harness();
    const out = await h.run('tcpdump -nr capture.pcap | grep -i authorization');
    expect(out.stdout).toContain('Authorization: Basic YWRtaW46VjR1bHRLZWVwZXIh');
  });

  it('limits with -c and reports bad or missing input', async () => {
    const h = harness();
    expect((await h.run('tcpdump -r capture.pcap -c 1')).stdout.trim().split('\n')).toHaveLength(1);
    expect((await h.run('tcpdump -r notes.txt')).stderr).toContain('unknown file format');
    expect((await h.run('tcpdump -r nope.pcap')).stderr).toContain('No such file or directory');
    expect((await h.run('tcpdump')).stderr).toContain('live capture is not supported');
  });

  it('file(1) recognises the capture as a pcap', async () => {
    const h = harness();
    expect((await h.run('file capture.pcap')).stdout).toContain('pcap capture file');
    expect(
      h.machine.fs.readFile('/home/guest/capture.pcap', ROOT).startsWith('\xd4\xc3\xb2\xa1'),
    ).toBe(true);
  });
});
