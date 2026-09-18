import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal as XTerm } from '@xterm/xterm';
import xtermCss from '@xterm/xterm/css/xterm.css?inline';
import { applyCompletion, complete, type CompletionContext } from '../engine/shell/complete';
import type { InputRequest, Shell } from '../engine/shell/Shell';
import type { KeyEvent } from './LineEditor';
import { utf8Decode, utf8Encode } from '../engine/util/bytes';
import { LineEditor } from './LineEditor';
import { decodeInput } from './keymap';
import { on } from './dom';

const THEME = {
  background: '#05080a',
  foreground: '#c8f7d8',
  cursor: '#39ff88',
  cursorAccent: '#05080a',
  selectionBackground: '#1f5133',
  black: '#0b0f12',
  red: '#ff6b6b',
  green: '#39ff88',
  yellow: '#ffd166',
  blue: '#4aa3ff',
  magenta: '#c792ea',
  cyan: '#4be0d2',
  white: '#c8f7d8',
  brightBlack: '#5c6773',
  brightRed: '#ff8787',
  brightGreen: '#7dffb0',
  brightYellow: '#ffe08a',
  brightBlue: '#82c0ff',
  brightMagenta: '#e0b3ff',
  brightCyan: '#8ff0e6',
  brightWhite: '#eafff2',
};

const ANSI_SGR = new RegExp(String.raw`\x1b\[[0-9;]*m`, 'g');

/** Number of visible columns a string occupies, ignoring ANSI escape sequences. */
function visibleLength(text: string): number {
  return text.replace(ANSI_SGR, '').length;
}

/**
 * The terminal surface: an xterm.js instance driven by the engine Shell. It renders the shell's
 * output, edits the current input line with a LineEditor, and translates keystrokes into
 * shell.submit / interrupt / eof. Tab completion is backed by the machine filesystem.
 */
export class Terminal {
  readonly xterm: XTerm;
  private readonly fit = new FitAddon();
  /**
   * Resolved on every use: the Game builds a fresh Shell for each level, so holding the instance
   * would leave the terminal driving the previous level's shell after a level change.
   */
  private readonly currentShell: () => Shell;
  private editor: LineEditor;
  private secret = false;
  /** Cursor row within the current input block, remembered so we can repaint in place. */
  private cursorRow = 0;
  private rendered = false;
  private disposers: (() => void)[] = [];

  constructor(shell: Shell | (() => Shell)) {
    this.currentShell = typeof shell === 'function' ? shell : (): Shell => shell;
    this.editor = new LineEditor(this.shell.history);
    this.xterm = new XTerm({
      convertEol: true,
      cursorBlink: true,
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      fontSize: 14,
      lineHeight: 1.2,
      theme: THEME,
      scrollback: 5000,
      // Mirrors output into an ARIA live region so screen readers announce it.
      screenReaderMode: true,
    });
    this.xterm.loadAddon(this.fit);
    this.xterm.loadAddon(new WebLinksAddon((_event, uri) => this.openLink(uri)));
  }

  private get shell(): Shell {
    return this.currentShell();
  }

  /** Mounts the terminal, injecting xterm's stylesheet once. */
  mount(container: HTMLElement): void {
    if (!document.getElementById('xterm-css')) {
      const style = document.createElement('style');
      style.id = 'xterm-css';
      style.textContent = xtermCss;
      document.head.append(style);
    }
    this.xterm.open(container);
    this.fit.fit();
    this.disposers.push(on(window, 'resize', () => this.fit.fit()));
    this.xterm.onData((data) => this.onData(data));
  }

  focus(): void {
    this.xterm.focus();
  }

  get columns(): number {
    return this.xterm.cols || 80;
  }

  /** Writes engine output (a byte string) to the screen, then repaints the input line. */
  write(bytes: string): void {
    this.clearInput();
    this.xterm.write(utf8Decode(bytes));
    this.renderPrompt(true);
  }

  /** Called when the shell's input request changes (new prompt, continuation, or password read). */
  onInputRequest(request: InputRequest): void {
    if (request.kind === 'busy') return;
    if (request.kind === 'prompt') {
      this.editor = new LineEditor(this.shell.history);
      this.secret = false;
    } else if (request.kind === 'read') {
      this.editor = new LineEditor([]);
      this.secret = request.secret;
    } else {
      this.editor = new LineEditor([]);
      this.secret = false;
    }
    this.rendered = false;
    this.renderPrompt(true);
  }

  private promptText(): string {
    const request = this.shell.inputRequest;
    if (request.kind === 'prompt') return this.shell.prompt();
    if (request.kind === 'continuation' || request.kind === 'read') return request.prompt;
    return '';
  }

  /** Repaints the prompt and the current input line, positioning the cursor at the edit point. */
  private renderPrompt(fresh = false): void {
    const request = this.shell.inputRequest;
    if (request.kind === 'busy') return;
    const prompt = this.promptText();
    if (!fresh && this.rendered) {
      this.moveToInputStart();
    }
    this.xterm.write('\r\x1b[J');
    const shownLine = this.secret ? '' : this.editor.line;
    this.xterm.write(prompt + shownLine);
    const promptCols = visibleLength(prompt);
    const point = this.secret ? 0 : this.editor.point;
    this.placeCursor(promptCols, point, promptCols + (this.secret ? 0 : this.editor.line.length));
    this.rendered = true;
  }

  private clearInput(): void {
    if (!this.rendered) return;
    this.moveToInputStart();
    this.xterm.write('\r\x1b[J');
    this.rendered = false;
  }

  private moveToInputStart(): void {
    if (this.cursorRow > 0) this.xterm.write(`\x1b[${this.cursorRow}A`);
    this.xterm.write('\r');
  }

  private placeCursor(promptCols: number, point: number, endTotal: number): void {
    const cols = this.columns;
    const endRow = Math.floor(endTotal / cols);
    const targetRow = Math.floor((promptCols + point) / cols);
    const targetCol = (promptCols + point) % cols;
    if (endRow > targetRow) this.xterm.write(`\x1b[${endRow - targetRow}A`);
    this.xterm.write('\r');
    if (targetCol > 0) this.xterm.write(`\x1b[${targetCol}C`);
    this.cursorRow = targetRow;
  }

  private completionContext(): CompletionContext {
    const shell = this.shell;
    const fs = shell.machine.fs;
    const names = shell.registry.all().map((command) => command.name);
    const cwd = shell.session.env.cwd;
    return {
      commandNames: () => names,
      cwd: () => cwd,
      home: () => shell.session.env.get('HOME') ?? '/',
      readdir: (path) => {
        try {
          return fs.readdir(path, shell.machine.users.credentials(shell.session.user));
        } catch {
          return null;
        }
      },
      isDirectory: (path) => {
        try {
          return fs.stat(path, shell.machine.users.credentials(shell.session.user)).type === 'dir';
        } catch {
          return false;
        }
      },
    };
  }

  private doComplete(): void {
    const context = this.completionContext();
    const result = complete(this.editor.line, this.editor.point, context);
    const applied = applyCompletion(this.editor.line, this.editor.point, result);
    if (applied.listing.length > 0) {
      this.clearInput();
      this.xterm.write('\r\n' + applied.listing.join('  ') + '\r\n');
      this.renderPrompt(true);
      return;
    }
    this.editor.reset(applied.line);
    this.editor.point = applied.point;
    this.renderPrompt();
  }

  private submit(): void {
    const line = this.editor.line;
    if (!this.secret) {
      // Move the cursor to the end of the line before breaking, so nothing is overwritten.
      this.renderPrompt();
    }
    this.xterm.write('\r\n');
    this.rendered = false;
    this.cursorRow = 0;
    void this.shell.submit(line);
  }

  /** All keyboard input arrives here as a terminal byte stream and is decoded to key events. */
  private onData(data: string): void {
    for (const event of decodeInput(data)) this.dispatch(event);
  }

  /** Feeds a key event (from the byte-stream decoder or the touch key bar). */
  dispatch(key: KeyEvent): void {
    if (this.shell.inputRequest.kind === 'busy') {
      if (key.ctrl && key.key.toLowerCase() === 'c') this.shell.interrupt();
      return;
    }
    if (key.key.length === 1 && !key.ctrl && !key.alt && !key.meta) {
      this.editor.insert(key.key);
      this.renderPrompt();
      return;
    }
    const action = this.editor.handle(key);
    switch (action) {
      case 'submit':
        this.submit();
        break;
      case 'interrupt':
        if (!this.secret) this.renderPrompt();
        this.xterm.write('^C\r\n');
        this.rendered = false;
        this.cursorRow = 0;
        this.shell.interrupt();
        this.renderPrompt(true);
        break;
      case 'eof':
        this.xterm.write('\r\n');
        this.rendered = false;
        this.cursorRow = 0;
        void this.shell.eof();
        break;
      case 'clear':
        this.xterm.write('\x1b[H\x1b[2J\x1b[3J');
        this.rendered = false;
        this.cursorRow = 0;
        this.renderPrompt(true);
        break;
      case 'complete':
        this.doComplete();
        break;
      default:
        this.renderPrompt();
    }
  }

  /** Copies text (Ctrl+C with a selection) or nothing. */
  copySelection(): boolean {
    const selection = this.xterm.getSelection();
    if (selection) {
      void navigator.clipboard.writeText(selection).catch(() => undefined);
      return true;
    }
    return false;
  }

  private openLink(uri: string): void {
    // Only open explicitly allowlisted, reserved documentation domains.
    if (/^https?:\/\/(www\.)?(example\.(com|org|net)|.*\.example|.*\.internal)(\/|$)/.test(uri)) {
      window.open(uri, '_blank', 'noopener,noreferrer');
    }
  }

  /** Writes a banner (already ANSI-coloured) followed by a newline. */
  writeText(text: string): void {
    this.write(utf8Encode(text.endsWith('\n') ? text : `${text}\n`));
  }

  motd(): void {
    const motd = this.shell.motd();
    if (motd) this.write(motd);
  }

  reset(): void {
    this.xterm.write('\x1b[H\x1b[2J\x1b[3J');
    this.rendered = false;
    this.cursorRow = 0;
  }

  refit(): void {
    try {
      this.fit.fit();
    } catch {
      // container not laid out yet
    }
  }

  dispose(): void {
    for (const dispose of this.disposers) dispose();
    this.disposers = [];
    this.xterm.dispose();
  }
}
