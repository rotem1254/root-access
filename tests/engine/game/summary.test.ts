import { describe, expect, it } from 'vitest';
import { renderSummary } from '../../../src/engine/commands/game/summary';
import type { RunSummary } from '../../../src/engine/game/api';
import { isStub } from '../../../src/engine/game/level';
import { LEVELS } from '../../../src/levels';
import { SOLUTION as SOLUTION1 } from '../../../src/levels/level01/solution';
import { createGame, storageStartingAt } from '../../helpers/game';

const MISSIONS = LEVELS.filter((e) => !isStub(e) && !e.practice);
const LAST_MISSION = MISSIONS[MISSIONS.length - 1]!;

const ROW = {
  id: 'x',
  number: 1,
  chapter: 1,
  title: 'A Level',
  completed: true,
  hintsUsed: 1,
  elapsedMs: 65_000,
  score: 90,
};

describe('renderSummary', () => {
  it('renders every level, the totals and a rank', () => {
    const summary: RunSummary = {
      rows: [ROW, { ...ROW, id: 'y', number: 2, chapter: 2, title: 'Another', score: 100 }],
      levelsCompleted: 2,
      levelsTotal: 2,
      totalScore: 190,
      maxScore: 300,
      totalHints: 2,
      totalMs: 130_000,
      complete: true,
    };
    const text = renderSummary(summary, 80);
    expect(text).toContain('RUN SUMMARY');
    expect(text).toContain('A Level');
    expect(text).toContain('Another');
    expect(text).toContain('Chapter 1');
    expect(text).toContain('Chapter 2');
    expect(text).toContain('1:05'); // per-level time
    expect(text).toContain('2:10'); // total time
    expect(text).toContain('Levels captured 2/2');
    expect(text).toContain('Rank: TRAINEE'); // 190/300 is 63%
  });

  it('ranks by the share of the maximum score', () => {
    const base: RunSummary = {
      rows: [],
      levelsCompleted: 1,
      levelsTotal: 1,
      totalScore: 0,
      maxScore: 100,
      totalHints: 0,
      totalMs: 0,
      complete: true,
    };
    expect(renderSummary({ ...base, totalScore: 95 }, 80)).toContain('OPERATOR');
    expect(renderSummary({ ...base, totalScore: 80 }, 80)).toContain('ANALYST');
    expect(renderSummary({ ...base, totalScore: 60 }, 80)).toContain('TRAINEE');
    expect(renderSummary({ ...base, totalScore: 10 }, 80)).toContain('RECRUIT');
    expect(renderSummary({ ...base, complete: false }, 80)).toContain('In progress');
    expect(renderSummary({ ...base, maxScore: 0 }, 80)).toContain('RECRUIT');
  });

  it('truncates a long title and survives a narrow terminal', () => {
    const summary: RunSummary = {
      rows: [{ ...ROW, title: 'A very long level title that will not fit in a narrow column' }],
      levelsCompleted: 1,
      levelsTotal: 1,
      totalScore: 90,
      maxScore: 150,
      totalHints: 1,
      totalMs: 65_000,
      complete: true,
    };
    expect(renderSummary(summary, 40)).toContain('...');
    expect(renderSummary(summary, 200)).toContain('A very long level title');
  });
});

describe('game.runSummary()', () => {
  it('reports an empty run, then the captured level', async () => {
    // Start on level 1 (after the level-0 tutorial) so SOLUTION1 applies.
    const h = await createGame(LEVELS, {
      storage: await storageStartingAt(LEVELS, '01-hidden-in-plain-sight'),
    });
    const before = h.game.runSummary();
    expect(before.levelsTotal).toBe(MISSIONS.length);
    expect(before.complete).toBe(false);
    expect(before.maxScore).toBe(MISSIONS.length * 150);

    for (const line of SOLUTION1) await h.run(line);
    const after = h.game.runSummary();
    expect(after.rows.find((r) => r.id === '01-hidden-in-plain-sight')).toMatchObject({
      completed: true,
    });
    expect(after.totalScore).toBeGreaterThan(0);
    expect(after.complete).toBe(false);
  });

  it('the summary command prints the table', async () => {
    const h = await createGame(LEVELS);
    const out = await h.run('summary');
    expect(out.stdout).toContain('RUN SUMMARY');
    expect(out.stdout).toContain('Hidden in Plain Sight');
    expect(out.stdout).toContain(`Levels captured 0/${MISSIONS.length}`);
  });

  it('emits run-complete and reports complete once the last level is captured', async () => {
    // Start on the final level with every earlier one already captured.
    const lastId = LAST_MISSION.id;
    const h = await createGame(LEVELS, { storage: await storageStartingAt(LEVELS, lastId) });
    expect(h.game.runSummary().complete).toBe(false);
    expect(h.game.runSummary().levelsCompleted).toBe(MISSIONS.length - 1);

    const { FLAG } = await import('../../../src/levels/level15/solution');
    await h.run(`submit ${FLAG}`);
    const summary = h.game.runSummary();
    expect(summary.complete).toBe(true);
    expect(summary.levelsCompleted).toBe(MISSIONS.length);
    expect(h.events).toContainEqual({ type: 'run-complete', totalScore: summary.totalScore });
    // The scoring screen now shows the finished run.
    expect((await h.run('summary')).stdout).toContain(
      `Levels captured ${MISSIONS.length}/${MISSIONS.length}`,
    );
  });
});
