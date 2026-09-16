import './styles/tokens.css';
import { createCommandRegistry } from './engine/commands';
import { Game } from './engine/game';
import { LEVELS } from './levels';

/** Temporary bootstrap: proves the engine + levels load in the browser. The real UI lands next. */
async function boot(): Promise<void> {
  const app = document.getElementById('app');
  if (!app) return;
  const game = await Game.create({
    catalog: LEVELS,
    registry: createCommandRegistry(),
    io: { stdout: () => undefined, stderr: () => undefined },
    columns: () => 80,
  });
  const mission = game.api.mission();
  app.textContent = `ROOT_ACCESS ready — ${game.levels().length} levels, first: ${mission?.title ?? '?'}`;
}

void boot();
