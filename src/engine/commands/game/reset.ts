import { defineCommand } from '../define';

export const resetLevel = defineCommand({
  name: 'reset',
  kind: 'game',
  description: 'restore the current level to its starting state',
  usage: ['[-y]'],
  about:
    'Undo every change you have made to the files in this level and start over.\nThis does not reset your hints used or the timer. It asks for confirmation\nunless you pass -y.',
  options: [['-y, --yes', 'do not ask for confirmation']],
  examples: [['reset', 'start the level over after breaking something']],
  seeAlso: ['mission(6)', 'levels(6)'],
  run: async (ctx) => {
    if (!ctx.args.includes('-y') && !ctx.args.includes('--yes')) {
      const answer = await ctx.tty.readLine('Reset this level to its starting state? [y/N] ');
      if (answer === null || !/^y(es)?$/i.test(answer.trim())) {
        ctx.stdout('Reset cancelled.\n');
        return 0;
      }
    }
    ctx.game.resetLevel();
    ctx.stdout('Restoring the level…\n');
    return 0;
  },
});
