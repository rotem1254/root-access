import { parseOptions } from './args';
import { defineCommand } from './define';

export const ping = defineCommand({
  name: 'ping',
  kind: 'binary',
  description: 'send ICMP ECHO_REQUEST to network hosts',
  usage: ['[-c count] destination'],
  about:
    'Test whether a host is reachable across the network. ping sends echo requests\nand reports the replies and round-trip times. A host that does not reply is\neither down or unreachable from where you are.',
  options: [
    ['-c count', 'stop after sending (and receiving) count packets (default 4 here)'],
    ['-W timeout', 'time to wait for a response (accepted, ignored)'],
  ],
  details:
    'In this simulation ping stops after 4 packets by default (a real ping runs\nuntil you press Ctrl+C). Reachability follows the network layout: you can only\nping hosts on a network your machine is connected to.',
  examples: [
    ['ping -c 4 10.10.0.1', 'check the gateway is reachable'],
    ['ping vault', 'ping a host by name'],
  ],
  seeAlso: ['ip(8)', 'nmap(1)', 'traceroute(8)'],
  run: async (ctx) => {
    const outcome = parseOptions(
      ctx.name,
      ctx.args,
      [
        { short: 'c', arg: 'required' },
        { short: 'W', arg: 'required' },
        { short: 'i', arg: 'required' },
        { short: 's', arg: 'required' },
      ],
      { unsupported: ['4', '6', 'f'] },
    );
    if (!outcome.ok) {
      ctx.stderr(outcome.message);
      return 2;
    }
    const target = outcome.options.operands[0];
    if (target === undefined) {
      ctx.stderr('ping: usage error: Destination address required\n');
      return 2;
    }
    const countText = outcome.options.value('c') ?? '4';
    const count = Math.min(Number(countText) || 4, 10);
    const ip = ctx.network.resolve(target);
    if (ip === undefined) {
      ctx.stderr(`ping: ${target}: Name or service not known\n`);
      return 2;
    }
    const label = ctx.network.hostnameOf(ip) ?? target;
    const shown = label === ip ? ip : `${label} (${ip})`;
    ctx.stdout(`PING ${target} (${ip}) 56(84) bytes of data.\n`);

    const reachable = ctx.network.canReach(ctx.machine, ip);
    const ttl = ctx.network.ttlOf(ctx.machine);
    let received = 0;
    const times: number[] = [];
    for (let seq = 1; seq <= count; seq++) {
      await ctx.tty.sleep(seq === 1 ? 0 : 200);
      if (ctx.tty.interrupted) break;
      if (reachable) {
        const time = Number((0.03 + ctx.network.latencyMs * (0.8 + (seq % 3) * 0.1)).toFixed(3));
        times.push(time);
        received += 1;
        ctx.stdout(`64 bytes from ${shown}: icmp_seq=${seq} ttl=${ttl} time=${time} ms\n`);
      } else {
        ctx.stdout(`From ${ip} icmp_seq=${seq} Destination Host Unreachable\n`);
      }
    }
    const transmitted = Math.min(count, received || count);
    const loss = Math.round(((transmitted - received) / transmitted) * 100);
    ctx.stdout(`\n--- ${target} ping statistics ---\n`);
    ctx.stdout(
      `${transmitted} packets transmitted, ${received} received, ${loss}% packet loss, time ${(transmitted - 1) * 200}ms\n`,
    );
    if (received > 0) {
      const min = Math.min(...times).toFixed(3);
      const max = Math.max(...times).toFixed(3);
      const avg = (times.reduce((a, b) => a + b, 0) / times.length).toFixed(3);
      ctx.stdout(`rtt min/avg/max/mdev = ${min}/${avg}/${max}/0.010 ms\n`);
    }
    return received > 0 ? 0 : 1;
  },
});
