import { createCommandRegistry } from '../../src/engine/commands';
import { Game, type GameOptions } from '../../src/engine/game/Game';
import type { GameEvent } from '../../src/engine/game/events';
import { isStub, type LevelCatalog } from '../../src/engine/game/level';
import { emptySave, type GameStorage, MemoryStorage } from '../../src/engine/game/storage';
import { utf8Decode } from '../../src/engine/util/bytes';
import { ManualClock } from '../../src/engine/util/clock';

/**
 * Storage seeded so every playable level before `levelId` counts as completed, which is how the
 * game unlocks later levels. Lets a level test start where it means to without replaying the
 * whole catalog.
 */
export async function storageStartingAt(
  catalog: LevelCatalog,
  levelId: string,
): Promise<GameStorage> {
  const save = emptySave(levelId);
  for (const entry of catalog) {
    if (entry.id === levelId) break;
    if (isStub(entry)) continue;
    save.progress[entry.id] = {
      hintsUsed: 0,
      activeMs: 0,
      wrongSubmissions: 0,
      completedAt: new Date(0).toISOString(),
    };
  }
  save.currentLevelId = levelId;
  const storage = new MemoryStorage();
  await storage.save(save);
  return storage;
}

export interface GameHarness {
  game: Game;
  clock: ManualClock;
  events: GameEvent[];
  /** Submits a terminal line and returns everything printed since the last call. */
  run(line: string): Promise<{ stdout: string; stderr: string }>;
  take(): { stdout: string; stderr: string };
}

export async function createGame(
  catalog: LevelCatalog,
  options: { storage?: GameStorage; startAt?: number } = {},
): Promise<GameHarness> {
  const registry = createCommandRegistry();
  const clock = new ManualClock(0);
  let stdout = '';
  let stderr = '';
  const events: GameEvent[] = [];
  const gameOptions: GameOptions = {
    catalog,
    registry,
    clock,
    io: {
      stdout: (chunk) => {
        stdout += chunk;
      },
      stderr: (chunk) => {
        stderr += chunk;
      },
    },
    ...(options.storage ? { storage: options.storage } : {}),
  };
  const game = await Game.create(gameOptions);
  game.subscribe((event) => events.push(event));
  const take = (): { stdout: string; stderr: string } => {
    const result = { stdout: utf8Decode(stdout), stderr: utf8Decode(stderr) };
    stdout = '';
    stderr = '';
    return result;
  };
  return {
    game,
    clock,
    events,
    take,
    run: async (line) => {
      take();
      await game.shell.submit(line);
      // Let the deferred afterLine() persist/reset settle.
      await game.shell.whenReady();
      return take();
    },
  };
}
