import { utf8Encode } from '../../util/bytes';
import { defineCommand } from '../define';
import { wrap } from '../util';

export const hint = defineCommand({
  name: 'hint',
  kind: 'game',
  description: 'reveal the next hint for the current level',
  usage: ['[-l]'],
  about:
    'Reveal the next progressive hint for the current level. Hints go from a gentle\nnudge to a near-solution. Each hint you use reduces the score for the level, so\ntry the objective first.',
  options: [['-l, --list', 're-show the hints you have already revealed']],
  examples: [
    ['hint', 'reveal the next hint'],
    ['hint -l', 'list the hints you have already seen'],
  ],
  seeAlso: ['mission(6)', 'submit(6)'],
  run: async (ctx) => {
    const width = Math.max(40, Math.min(ctx.tty.columns, 80));
    if (ctx.args.includes('-l') || ctx.args.includes('--list')) {
      const revealed = ctx.game.revealedHints();
      if (revealed.length === 0) {
        ctx.stdout('No hints revealed yet. Type `hint` to reveal the first one.\n');
        return 0;
      }
      revealed.forEach((text, index) => {
        ctx.stdout(
          utf8Encode(`\x1b[33mHint ${index + 1}:\x1b[0m ${wrap(text, width).join('\n')}\n`),
        );
      });
      return 0;
    }
    const result = ctx.game.nextHint();
    if (result.status === 'no-level') {
      ctx.stderr('hint: no level is loaded\n');
      return 1;
    }
    if (result.status === 'exhausted') {
      ctx.stdout(
        `No more hints (you have seen all ${result.total}). You have everything you need.\n`,
      );
      return 0;
    }
    ctx.stdout(
      utf8Encode(
        `\x1b[33mHint ${result.index + 1}/${result.total}:\x1b[0m ${wrap(result.text, width).join('\n')}\n`,
      ),
    );
    return 0;
  },
});
