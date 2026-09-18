import { utf8Encode } from '../../util/bytes';
import { defineCommand } from '../define';
import { wrap } from '../util';

export const mission = defineCommand({
  name: 'mission',
  kind: 'game',
  description: 'show the current mission briefing and objective',
  usage: ['[-b]'],
  about:
    'Print the objective for the current level, and with -b the full story\nbriefing. The same text is shown in the Mission panel beside the terminal.',
  options: [['-b, --briefing', 'include the full briefing text']],
  examples: [
    ['mission', 'remind yourself of the objective'],
    ['mission -b', 're-read the full briefing'],
  ],
  seeAlso: ['hint(6)', 'submit(6)', 'status(6)'],
  run: async (ctx) => {
    const info = ctx.game.mission();
    if (!info) {
      ctx.stderr('mission: no level is loaded\n');
      return 1;
    }
    const width = Math.max(40, Math.min(ctx.tty.columns, 80));
    let out = `\x1b[1mLevel ${info.number} — ${info.title}\x1b[0m\n`;
    out += `Chapter ${info.chapter}\n\n`;
    if (ctx.args.includes('-b') || ctx.args.includes('--briefing')) {
      out += `${wrap(info.briefing, width).join('\n')}\n\n`;
    }
    out += `\x1b[1mObjective:\x1b[0m\n${wrap(info.objective, width).join('\n')}\n`;
    out += `\nSkills: ${info.skills.join(', ')}\n`;
    out += `Hints used: ${info.hintsUsed}/${info.hintsTotal}`;
    out += info.completed ? '   \x1b[32m[captured]\x1b[0m\n' : '\n';
    ctx.stdout(utf8Encode(out));
    return 0;
  },
});
