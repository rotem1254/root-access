import { createCommandRegistry } from '../../src/engine/commands';
import { Game, type GameOptions } from '../../src/engine/game/Game';
import type { GameEvent } from '../../src/engine/game/events';
import type { LevelCatalog } from '../../src/engine/game/level';
import type { GameStorage } from '../../src/engine/game/storage';
import { utf8Decode } from '../../src/engine/util/bytes';
import { ManualClock } from '../../src/engine/util/clock';

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
