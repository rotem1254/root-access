import { defineCommand } from './define';
import { isIdentifier, parseBuiltinOptions } from './util';

const READONLY = new Set(['UID', 'EUID', 'PPID', 'BASHOPTS', 'SHELLOPTS']);

export const unset = defineCommand({
  name: 'unset',
  kind: 'builtin',
  description: 'Unset values and attributes of shell variables and functions.',
  usage: ['[-v] [name ...]'],
  about: 'For each NAME, remove the corresponding variable.',
  options: [['-v', 'treat each NAME as a shell variable (default)']],
  examples: [['unset HISTFILE', 'remove a variable']],
  seeAlso: ['export(1)', 'env(1)'],
  run: async (ctx) => {
    const parsed = parseBuiltinOptions(ctx, 'vfn', 'unset [-f] [-v] [-n] [name ...]');
    if (!parsed) return 2;
    let status = 0;
    for (const name of parsed.operands) {
      if (!isIdentifier(name)) {
        ctx.stderr(`bash: unset: \`${name}': not a valid identifier\n`);
        status = 1;
      } else if (READONLY.has(name)) {
        ctx.stderr(`bash: unset: ${name}: cannot unset: readonly variable\n`);
        status = 1;
      } else {
        ctx.env.unset(name);
      }
    }
    return status;
  },
});
