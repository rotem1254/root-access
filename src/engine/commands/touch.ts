import { parseOptions } from './args';
import { defineCommand } from './define';
import { errorText } from './util';

export const touch = defineCommand({
  name: 'touch',
  kind: 'binary',
  description: 'change file timestamps',
  usage: ['[OPTION]... FILE...'],
  about:
    'Update the access and modification times of each FILE to the current time.\nA FILE argument that does not exist is created empty, unless -c is supplied.',
  options: [
    ['-c, --no-create', 'do not create any files'],
    ['-a', 'change only the access time'],
    ['-m', 'change only the modification time'],
  ],
  examples: [
    ['touch newfile', 'create an empty file or update its timestamp'],
    ['touch a b c', 'create several files at once'],
  ],
  seeAlso: ['ls(1)', 'stat(1)'],
  run: async (ctx) => {
    const outcome = parseOptions(
      ctx.name,
      ctx.args,
      [{ short: 'c', long: 'no-create' }, { short: 'a' }, { short: 'm' }],
      { unsupported: ['r', 't', 'd', 'reference', 'date', 'h', 'no-dereference'] },
    );
    if (!outcome.ok) {
      ctx.stderr(outcome.message);
      return 1;
    }
    const o = outcome.options;
    if (o.operands.length === 0) {
      ctx.stderr(`touch: missing file operand\nTry 'touch --help' for more information.\n`);
      return 1;
    }
    let status = 0;
    for (const path of o.operands) {
      if (o.has('no-create') && !ctx.fs.exists(path, true)) continue;
      try {
        ctx.fs.touch(path);
      } catch (error) {
        ctx.stderr(`touch: cannot touch '${path}': ${errorText(error)}\n`);
        status = 1;
      }
    }
    return status;
  },
});
