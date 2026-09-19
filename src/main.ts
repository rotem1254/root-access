import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import './styles/tokens.css';
import './styles/layout.css';
import { createCommandRegistry } from './engine/commands';
import { Game } from './engine/game';
import { strings } from './content/strings';
import { LEVELS } from './levels';
import { runBootSequence } from './ui/BootSequence';
import { el, isTouchDevice, on } from './ui/dom';
import { Panels } from './ui/Panels';
import { Terminal } from './ui/Terminal';
import { createTouchKeys } from './ui/TouchKeys';
import { Settings } from './ui/settings';
import { openWelcome } from './ui/Welcome';
import { KeyValueStorage } from './engine/game';

const WELCOME_KEY = 'root-access:welcome-seen';

/** Whether the how-to-play overlay has been dismissed before (a per-viewer UI convenience). */
function welcomeSeen(): boolean {
  try {
    return localStorage.getItem(WELCOME_KEY) === '1';
  } catch {
    return false;
  }
}

function markWelcomeSeen(): void {
  try {
    localStorage.setItem(WELCOME_KEY, '1');
  } catch {
    /* ignore */
  }
}

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
  const terminalPane = el('div', { class: 'terminal-pane', attrs: { dir: 'ltr' } });
  const terminalHost = el('div', {
    class: 'terminal-host',
    attrs: { role: 'group', 'aria-label': strings('en').a11y.terminalLabel, tabindex: '-1' },
  });
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
  // Clicking a command in the guide scaffolds it into the terminal (the player presses Enter).
  panels.setInsertCommand((text) => term.setInput(text));

  // Applies the current language to the whole document; the terminal pane is forced LTR in CSS.
  const applyLocale = (): void => {
    const ui = strings(game.locale);
    document.documentElement.lang = game.locale;
    document.documentElement.dir = ui.dir;
    terminalHost.setAttribute('aria-label', ui.a11y.terminalLabel);
    toggle.setAttribute('aria-label', ui.a11y.togglePanel);
    toggle.textContent = `☰ ${ui.tabs.mission}`;
    language.textContent = ui.buttons.language;
    language.setAttribute('aria-label', ui.a11y.languageLabel);
    skip.textContent = ui.a11y.skipToTerminal;
    help.setAttribute('aria-label', ui.welcome.reopen);
    help.title = ui.welcome.reopen;
    practice.textContent = `🧪 ${ui.buttons.practice}`;
    practice.setAttribute('aria-label', ui.buttons.practice);
    settingsButton.setAttribute('aria-label', ui.settings.open);
    settingsButton.title = ui.settings.open;
  };

  // Skip link: first Tab stop, jumps straight to the terminal.
  const skip = el('a', { class: 'skip-link', attrs: { href: '#panel-body' } });
  on(skip, 'click', (event) => {
    event.preventDefault();
    term.focus();
  });

  const toggle = el('button', { class: 'panel-toggle', type: 'button' });
  on(toggle, 'click', () => {
    const collapsed = panels.root.classList.toggle('collapsed');
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  });
  toggle.setAttribute('aria-controls', 'panel-body');
  toggle.setAttribute('aria-expanded', 'true');

  const language = el('button', { class: 'lang-toggle', type: 'button' });
  on(language, 'click', () => {
    game.setLocale(game.locale === 'he' ? 'en' : 'he');
    term.focus();
  });

  // A small "?" button reopens the how-to-play overlay at any time.
  const help = el('button', { class: 'help-toggle', type: 'button', text: '?' });
  on(help, 'click', () => {
    void openWelcome(game).then(() => term.focus());
  });

  // Jump into the free practice sandbox at any time.
  const practice = el('button', { class: 'practice-toggle', type: 'button' });
  on(practice, 'click', () => {
    game.goToLevel('sandbox');
    term.focus();
  });

  // Accessibility: adjustable text size and high contrast, applied live and persisted.
  const settings = new Settings(term, () => game.locale);
  const settingsButton = el('button', { class: 'settings-toggle', type: 'button', text: '⚙' });
  on(settingsButton, 'click', () => {
    void settings.open().then(() => term.focus());
  });

  panels.setLocaleChangeHandler(applyLocale);
  app.append(skip, terminalPane, panels.root, toggle, language, help, practice, settingsButton);
  if (isTouchDevice())
    terminalPane.append(createTouchKeys(terminal, strings(game.locale).a11y.touchKeysLabel));
  applyLocale();

  // Apply saved accessibility preferences (text size, contrast) now that the terminal is mounted.
  settings.apply();

  // Repaint the panel roughly once a second so the timer ticks.
  panels.render();
  window.setInterval(() => panels.render(), 1000);

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

  // First visit: explain the game before the boot sequence. Reopen any time with the "?" button.
  if (!welcomeSeen()) {
    await openWelcome(game);
    markWelcomeSeen();
  }

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
