import { defineCommand } from '../define';
import type { RunSummary } from '../../game/api';
import { print } from '../util';

function clock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** A medal for the run, so the screen ends on something other than a number. */
function rank(summary: RunSummary): string {
  if (!summary.complete) return 'In progress';
  const ratio = summary.maxScore === 0 ? 0 : summary.totalScore / summary.maxScore;
  if (ratio >= 0.9) return 'Rank: OPERATOR';
  if (ratio >= 0.75) return 'Rank: ANALYST';
  if (ratio >= 0.5) return 'Rank: TRAINEE';
  return 'Rank: RECRUIT';
}

export function renderSummary(summary: RunSummary, columns: number): string {
  const lines: string[] = [];
  const width = Math.min(Math.max(columns - 2, 48), 72);
  const rule = '─'.repeat(width);
  lines.push('');
  lines.push(`\x1b[1;32mRUN SUMMARY\x1b[0m`);
  lines.push(rule);
  lines.push(
    `\x1b[1m${'#'.padEnd(3)}${'LEVEL'.padEnd(width - 30)}${'TIME'.padStart(7)}${'HINTS'.padStart(7)}${'SCORE'.padStart(7)}\x1b[0m`,
  );
  let chapter = 0;
  for (const row of summary.rows) {
    if (row.chapter !== chapter) {
      chapter = row.chapter;
      lines.push(`\x1b[2mChapter ${chapter}\x1b[0m`);
    }
    const mark = row.completed ? '\x1b[32m✓\x1b[0m' : '\x1b[2m·\x1b[0m';
    const title =
      row.title.length > width - 32 ? `${row.title.slice(0, width - 35)}...` : row.title;
    lines.push(
      `${String(row.number).padEnd(3)}${mark} ${title.padEnd(width - 32)}${clock(row.elapsedMs).padStart(7)}${String(row.hintsUsed).padStart(7)}${String(row.score).padStart(7)}`,
    );
  }
  lines.push(rule);
  lines.push(
    `${'TOTAL'.padEnd(width - 27)}${clock(summary.totalMs).padStart(7)}${String(summary.totalHints).padStart(7)}${String(summary.totalScore).padStart(7)}`,
  );
  lines.push(
    `\x1b[2mLevels captured ${summary.levelsCompleted}/${summary.levelsTotal}  ·  ${summary.totalScore} of a possible ${summary.maxScore}\x1b[0m`,
  );
  lines.push(`\x1b[1;36m${rank(summary)}\x1b[0m`);
  lines.push('');
  return lines.join('\n');
}

export const summary = defineCommand({
  name: 'summary',
  kind: 'game',
  description: 'show the scoring screen for the whole run',
  usage: ['summary'],
  about:
    'Print a table of every level: the time you spent, the hints you revealed and\nthe score you earned, plus the totals for the run.',
  details:
    'The score for a level is 100 points, minus the cost of any hints you revealed,\nplus up to 50 for finishing inside the par time. A captured level never scores\nless than 25. Use `status` for the level you are on right now.',
  examples: [['summary', 'show the run so far']],
  seeAlso: ['status(6)', 'levels(6)', 'mission(6)'],
  run: async (ctx) => {
    print(ctx, renderSummary(ctx.game.runSummary(), ctx.tty.columns));
    return 0;
  },
});
