import { parseOptions, tryHelp } from './args';
import { defineCommand } from './define';
import { localeQuote } from './util';

export const whoami = defineCommand({
  name: 'whoami',
  kind: 'binary',
  description: 'print effective user name',
  usage: ['[OPTION]...'],
  about: 'Print the user name associated with the current effective user ID.\nSame as id -un.',
  examples: [['whoami', 'check which account you are using, e.g. after su']],
  seeAlso: ['id(1)', 'su(1)'],
  run: async (ctx) => {
    const outcome = parseOptions(ctx.name, ctx.args, []);
    if (!outcome.ok) {
      ctx.stderr(outcome.message);
      return 1;
    }
    const extra = outcome.options.operands[0];
    if (extra !== undefined) {
      ctx.stderr(`whoami: extra operand ${localeQuote(extra)}\n${tryHelp(ctx.name)}`);
      return 1;
    }
    const user = ctx.machine.users.byUid(ctx.credentials.uid);
    if (!user) {
      ctx.stderr(`whoami: cannot find name for user ID ${ctx.credentials.uid}\n`);
      return 1;
    }
    ctx.stdout(`${user.name}\n`);
    return 0;
  },
});
