import { el, on } from './dom';
import type { Terminal } from './Terminal';

interface TouchKey {
  label: string;
  /** Spoken name for screen readers, since the glyph alone (↑, |) is not descriptive. */
  name: string;
  key: { key: string; ctrl?: boolean };
}

const KEYS: TouchKey[] = [
  { label: 'Tab', name: 'Tab', key: { key: 'Tab' } },
  { label: '↑', name: 'Up arrow', key: { key: 'ArrowUp' } },
  { label: '↓', name: 'Down arrow', key: { key: 'ArrowDown' } },
  { label: '←', name: 'Left arrow', key: { key: 'ArrowLeft' } },
  { label: '→', name: 'Right arrow', key: { key: 'ArrowRight' } },
  { label: 'Ctrl-C', name: 'Control C', key: { key: 'c', ctrl: true } },
  { label: 'Ctrl-L', name: 'Control L, clear', key: { key: 'l', ctrl: true } },
  { label: '|', name: 'Pipe', key: { key: '|' } },
  { label: '/', name: 'Slash', key: { key: '/' } },
  { label: '-', name: 'Dash', key: { key: '-' } },
  { label: '~', name: 'Tilde', key: { key: '~' } },
  { label: '*', name: 'Asterisk', key: { key: '*' } },
];

/** An on-screen key bar for tablets, which lack Tab, arrows and Ctrl on their keyboards. */
export function createTouchKeys(terminal: Terminal, label: string): HTMLElement {
  const bar = el('div', {
    class: 'touch-keys',
    attrs: { role: 'toolbar', 'aria-label': label, dir: 'ltr' },
  });
  for (const { label: text, name, key } of KEYS) {
    const button = el('button', {
      class: 'touch-key',
      text,
      type: 'button',
      attrs: { 'aria-label': name },
    });
    on(button, 'pointerdown', (event) => {
      event.preventDefault();
      terminal.dispatch(key);
      terminal.focus();
    });
    bar.append(button);
  }
  return bar;
}
