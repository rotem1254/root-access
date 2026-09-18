import { defineCommand } from './define';
import { parseBuiltinOptions } from './util';

export const history = defineCommand({
  name: 'history',
  kind: 'builtin',
  description: 'Display or manipulate the history list.',
  usage: ['[-c] [n]'],
  about:
    'Display the history list with line numbers. An argument of N lists only\nthe last N entries.',
  options: [['-c', 'clear the history list by deleting all of the entries']],
  details:
    'Lines that start with a space are not saved, and a command repeated right after itself is saved once (HISTCONTROL=ignoreboth). Use the up and down arrow keys to recall earlier commands.',
  examples: [
    ['history 10', 'show the last ten commands'],
    ['history | grep ssh', 'search your history'],
  ],
  seeAlso: ['bash(1)'],
  run: async (ctx) => {
    const parsed = parseBuiltinOptions(
      ctx,
      'c',
      'history [-c] [-d offset] [n] or history -anrw [filename] or history -ps arg [arg...]',
    );
    if (!parsed) return 2;
    if (parsed.flags.has('c')) {
      ctx.shell.clearHistory();
      return 0;
    }
    if (parsed.operands.length > 1) {
      ctx.stderr('bash: history: too many arguments\n');
      return 1;
    }
    const entries = ctx.shell.history;
    let start = 0;
    const count = parsed.operands[0];
    if (count !== undefined) {
      if (!/^\d+$/.test(count)) {
        ctx.stderr(`bash: history: ${count}: numeric argument required\n`);
        return 1;
      }
      start = Math.max(0, entries.length - Number(count));
    }
    for (let index = start; index < entries.length; index++) {
      ctx.stdout(`${String(index + 1).padStart(5)}  ${entries[index] ?? ''}\n`);
    }
    return 0;
  },
});
