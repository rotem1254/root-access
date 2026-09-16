import { utf8Encode } from '../../util/bytes';
import { CAPTURE_BANNER } from '../../../content/banners';
import { defineCommand } from '../define';

export const submit = defineCommand({
  name: 'submit',
  kind: 'game',
  description: 'submit a captured flag',
  usage: ['FLAG'],
  about:
    'Submit a flag you have found to complete the level. Flags look like\nFLAG{some_text}. If it is correct, the level is captured and the next one\nunlocks.',
  examples: [['submit FLAG{h1dd3n_1n_pl41n_s1ght}', 'submit a flag you found']],
  seeAlso: ['mission(6)', 'hint(6)', 'status(6)'],
  run: async (ctx) => {
    const candidate = ctx.args.join(' ').trim();
    if (candidate === '') {
      ctx.stderr('submit: usage: submit FLAG{...}\n');
      return 2;
    }
    const result = await ctx.game.submitFlag(candidate);
    switch (result.status) {
      case 'no-level':
        ctx.stderr('submit: no level is loaded\n');
        return 1;
      case 'invalid-format':
        ctx.stderr('submit: that does not look like a flag. Flags look like FLAG{...}.\n');
        return 1;
      case 'already-captured':
        ctx.stdout('You have already captured this level. Type `levels` to see what is next.\n');
        return 0;
      case 'incorrect':
        ctx.stdout(
          '\x1b[31m✗ Incorrect flag.\x1b[0m Keep looking — check `hint` if you are stuck.\n',
        );
        return 1;
      case 'captured': {
        let out = `\x1b[32m${CAPTURE_BANNER}\x1b[0m\n`;
        out += `\x1b[1mLevel captured!\x1b[0m  Score: ${result.score.total} `;
        out += `(base ${result.score.base} - hints ${result.score.hintPenalty} + speed ${result.score.speedBonus})\n`;
        out += result.nextLevelId
          ? 'The next level is unlocked. Type `levels` to see it, or `mission` after it loads.\n'
          : 'That was the last available level. More are coming soon — type `levels`.\n';
        ctx.stdout(utf8Encode(out));
        return 0;
      }
    }
  },
});
