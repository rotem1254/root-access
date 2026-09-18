import { decodePcap } from '../network/pcap';
import { isFsError, strerror } from '../errors';
import { parseOptions } from './args';
import { defineCommand } from './define';

export const tcpdump = defineCommand({
  name: 'tcpdump',
  kind: 'binary',
  description: 'dump traffic on a network',
  usage: ['-r file [-n] [-c count]', '[-n] [expression]'],
  about:
    'Read and print a saved packet capture. Live capture is not available in this\nsimulation, so tcpdump is used with -r to read a .pcap file recorded earlier.\nCleartext protocols (HTTP, FTP) show their contents — including any credentials.',
  options: [
    ['-r file', 'read packets from a .pcap file instead of the network'],
    ['-n', "don't convert addresses to names"],
    ['-c count', 'exit after reading count packets'],
    ['-A', 'print each packet in ASCII (accepted)'],
  ],
  details:
    'Read a capture and look for cleartext secrets:\n  tcpdump -r capture.pcap\n  tcpdump -nr capture.pcap | grep -i pass\nA GET request or a login over plain HTTP or FTP puts the credentials right in\nthe capture.',
  examples: [
    ['tcpdump -r capture.pcap', 'read a saved capture'],
    ['tcpdump -nr capture.pcap | grep -i authorization', 'hunt for credentials'],
  ],
  seeAlso: ['nc(1)', 'curl(1)', 'file(1)'],
  run: async (ctx) => {
    const outcome = parseOptions(
      ctx.name,
      ctx.args,
      [
        { short: 'r', arg: 'required' },
        { short: 'n' },
        { short: 'c', arg: 'required' },
        { short: 'A' },
        { short: 'X' },
        { short: 'v' },
      ],
      { unsupported: ['i', 'w', 's', 'e'] },
    );
    if (!outcome.ok) {
      ctx.stderr(outcome.message);
      return 1;
    }
    const o = outcome.options;
    const file = o.value('r');
    if (file === undefined) {
      ctx.stderr('tcpdump: live capture is not supported in this simulation; use -r <file.pcap>\n');
      return 1;
    }
    let data: string;
    try {
      data = ctx.fs.readFile(file);
    } catch (error) {
      ctx.stderr(`tcpdump: ${file}: ${isFsError(error) ? strerror(error.code) : 'read error'}\n`);
      return 1;
    }
    const capture = decodePcap(data);
    if (!capture) {
      ctx.stderr(`tcpdump: ${file}: unknown file format\n`);
      return 1;
    }
    ctx.stderr(`reading from file ${file}, link-type EN10MB (Ethernet), snapshot length 262144\n`);
    const limit = o.value('c') ? Number(o.value('c')) : capture.entries.length;
    capture.entries.slice(0, limit).forEach((packet) => {
      ctx.stdout(`${packet.time} IP ${packet.src} > ${packet.dst}: ${packet.info}\n`);
    });
    return 0;
  },
});
