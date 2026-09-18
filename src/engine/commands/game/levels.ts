import { utf8Encode } from '../../util/bytes';
import { defineCommand } from '../define';

const STATE_LABEL: Record<string, string> = {
  completed: '\x1b[32m✓ captured\x1b[0m',
  current: '\x1b[36m▶ current\x1b[0m',
  unlocked: '  unlocked',
  locked: '\x1b[90m🔒 locked\x1b[0m',
  'coming-soon': '\x1b[90m… coming soon\x1b[0m',
};

export const levels = defineCommand({
  name: 'levels',
  kind: 'game',
  description: 'list the levels and switch to one',
  usage: ['[NUMBER|ID]'],
  about:
    'With no argument, list all levels and their status. With a level number or id,\nswitch to that level if it is unlocked. You can revisit any level you have\nunlocked.',
  examples: [
    ['levels', 'list every level'],
    ['levels 2', 'switch to level 2 (if unlocked)'],
  ],
  seeAlso: ['mission(6)', 'status(6)'],
  run: async (ctx) => {
    const all = ctx.game.levels();
    const target = ctx.args[0];
    if (target !== undefined) {
      const result = ctx.game.startLevel(target);
      switch (result) {
        case 'ok':
          ctx.stdout('Loading level…\n');
          return 0;
        case 'locked':
          ctx.stderr('levels: that level is locked. Capture the earlier levels first.\n');
          return 1;
        case 'coming-soon':
          ctx.stderr('levels: that level is not available yet.\n');
          return 1;
        default:
          ctx.stderr(`levels: no such level: ${target}\n`);
          return 1;
      }
    }
    let out = '';
    let chapter = -1;
    for (const level of all) {
      if (level.chapter !== chapter) {
        chapter = level.chapter;
        out += `${chapter > 1 ? '\n' : ''}\x1b[1mChapter ${chapter}\x1b[0m\n`;
      }
      const label = STATE_LABEL[level.state] ?? level.state;
      out += `  ${String(level.number).padStart(2)}. ${level.title.padEnd(28)} ${label}\n`;
    }
    ctx.stdout(utf8Encode(out));
    return 0;
  },
});
