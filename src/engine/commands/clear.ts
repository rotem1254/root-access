import { parseOptions } from './args';
import { defineCommand } from './define';

export const clear = defineCommand({
  name: 'clear',
  kind: 'binary',
  description: 'clear the terminal screen',
  usage: ['[-x]'],
  about:
    'Clear the screen and the scrollback buffer by writing terminal control\nsequences. Ctrl+L clears the screen too.',
  options: [['-x', 'do not attempt to clear the scrollback buffer']],
  examples: [['clear', 'start with a clean screen']],
  seeAlso: ['reset(1)'],
  run: async (ctx) => {
    const outcome = parseOptions(ctx.name, ctx.args, [
      { short: 'x' },
      { short: 'T', arg: 'required' },
    ]);
    if (!outcome.ok) {
      ctx.stderr(outcome.message);
      return 2;
    }
    ctx.stdout(outcome.options.has('x') ? '\x1b[H\x1b[2J' : '\x1b[H\x1b[2J\x1b[3J');
    return 0;
  },
});
