import { el, on } from './dom';
import type { Terminal } from './Terminal';

interface TouchKey {
  label: string;
  key: { key: string; ctrl?: boolean };
}

const KEYS: TouchKey[] = [
  { label: 'Tab', key: { key: 'Tab' } },
  { label: '↑', key: { key: 'ArrowUp' } },
  { label: '↓', key: { key: 'ArrowDown' } },
  { label: '←', key: { key: 'ArrowLeft' } },
  { label: '→', key: { key: 'ArrowRight' } },
  { label: 'Ctrl-C', key: { key: 'c', ctrl: true } },
  { label: 'Ctrl-L', key: { key: 'l', ctrl: true } },
  { label: '|', key: { key: '|' } },
  { label: '/', key: { key: '/' } },
  { label: '-', key: { key: '-' } },
  { label: '~', key: { key: '~' } },
  { label: '*', key: { key: '*' } },
];

/** An on-screen key bar for tablets, which lack Tab, arrows and Ctrl on their keyboards. */
export function createTouchKeys(terminal: Terminal): HTMLElement {
  const bar = el('div', { class: 'touch-keys' });
  for (const { label, key } of KEYS) {
    const button = el('button', { class: 'touch-key', text: label, type: 'button' });
    on(button, 'pointerdown', (event) => {
      event.preventDefault();
      terminal.dispatch(key);
      terminal.focus();
    });
    bar.append(button);
  }
  return bar;
}
