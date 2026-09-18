import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import './styles/tokens.css';
import './styles/layout.css';
import { createCommandRegistry } from './engine/commands';
import { Game } from './engine/game';
import type { GameEvent } from './engine/game/events';
import { CAPTURE_BANNER } from './content/banners';
import { LEVELS } from './levels';
import { runBootSequence } from './ui/BootSequence';
import { el, isTouchDevice, on } from './ui/dom';
import { Panels } from './ui/Panels';
import { Terminal } from './ui/Terminal';
import { createTouchKeys } from './ui/TouchKeys';
import { KeyValueStorage } from './engine/game';

/** localStorage-backed save, guarded so a private window or blocked storage still runs. */
function makeStorage(): KeyValueStorage {
  return new KeyValueStorage({
    getItem: (key) => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem: (key, value) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* ignore */
      }
    },
    removeItem: (key) => {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  });
}

async function main(): Promise<void> {
  const app = document.getElementById('app');
  if (!app) return;

  // Ensure the terminal font is loaded before xterm measures the cell grid.
  try {
    await document.fonts.load('14px "JetBrains Mono"');
  } catch {
    /* fonts API unavailable */
  }

  const registry = createCommandRegistry();
  const terminalPane = el('div', { class: 'terminal-pane' });
  const terminalHost = el('div', { class: 'terminal-host' });
  terminalPane.append(terminalHost);

  // Build the game; its stdout/stderr flow to the terminal we are about to create.
  let terminal: Terminal | null = null;
  const game = await Game.create({
    catalog: LEVELS,
    registry,
    storage: makeStorage(),
    startPaused: true,
    columns: () => terminal?.columns ?? 80,
    io: {
      stdout: (chunk) => terminal?.write(chunk),
      stderr: (chunk) => terminal?.write(chunk),
    },
  });

  // Each level gets a fresh Shell, so the terminal resolves the current one on every use.
  terminal = new Terminal(() => game.shell);
  terminal.mount(terminalHost);

  const term = terminal;
  const panels = new Panels(game);
  panels.setFocusTerminal(() => term.focus());

  const toggle = el('button', { class: 'panel-toggle', type: 'button', text: '☰ Mission' });
  on(toggle, 'click', () => panels.root.classList.toggle('collapsed'));

  app.append(terminalPane, panels.root, toggle);
  if (isTouchDevice()) terminalPane.append(createTouchKeys(terminal));

  // Repaint the panel roughly once a second so the timer ticks.
  panels.render();
  window.setInterval(() => panels.render(), 1000);

  // Flag-capture celebration in the terminal.
  game.subscribe((event: GameEvent) => {
    if (event.type === 'flag-captured') {
      terminal.writeText(`\n\x1b[1;32m${CAPTURE_BANNER}\x1b[0m`);
    }
  });

  // Pause the play timer while the tab is hidden.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) game.pause();
    else game.resume();
  });

  // The shell drives the prompt; forward its input-request changes to the terminal.
  game.subscribe((event) => {
    if (event.type === 'prompt-changed') terminal.onInputRequest(game.shell.inputRequest);
    if (event.type === 'level-started') {
      // A new level means a new Shell on a new machine: announce it and draw its prompt.
      terminal.writeText('\n');
      terminal.motd();
      terminal.onInputRequest(game.shell.inputRequest);
    }
  });

  await runBootSequence(terminal, { full: !game.bootSeen });
  game.markBootSeen();
  await game.persist();
  terminal.motd();
  terminal.onInputRequest(game.shell.inputRequest);
  game.resume();
  terminal.focus();
  terminal.refit();
}

void main().catch((error: unknown) => {
  const app = document.getElementById('app');
  if (app) app.textContent = `ROOT_ACCESS failed to start: ${String(error)}`;
});
