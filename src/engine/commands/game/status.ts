import { utf8Encode } from '../../util/bytes';
import { defineCommand } from '../define';

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

export const status = defineCommand({
  name: 'status',
  kind: 'game',
  description: 'show your progress on the current level and overall',
  usage: [],
  about:
    'Show the current level, time spent, hints used, wrong submissions, and your\ntotal score across all captured levels.',
  examples: [['status', 'check your progress and score']],
  seeAlso: ['mission(6)', 'levels(6)'],
  run: async (ctx) => {
    const info = ctx.game.status();
    if (!info) {
      ctx.stderr('status: no level is loaded\n');
      return 1;
    }
    let out = `\x1b[1mLevel ${info.number}:\x1b[0m ${info.title} (chapter ${info.chapter})`;
    out += info.completed ? '  \x1b[32m[captured]\x1b[0m\n' : '\n';
    out += `Time on level:   ${formatDuration(info.elapsedMs)}\n`;
    out += `Hints used:      ${info.hintsUsed}/${info.hintsTotal}\n`;
    out += `Wrong flags:     ${info.wrongSubmissions}\n`;
    if (info.score) out += `Level score:     ${info.score.total}\n`;
    out += `\nProgress:        ${info.levelsCompleted}/${info.levelsTotal} levels captured\n`;
    out += `Total score:     ${info.totalScore}\n`;
    ctx.stdout(utf8Encode(out));
    return 0;
  },
});
