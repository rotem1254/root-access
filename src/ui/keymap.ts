import type { KeyEvent } from './LineEditor';

/**
 * Decodes an xterm `onData` chunk into a sequence of editor key events. xterm delivers keystrokes
 * as terminal bytes — Enter is "\r", Backspace is "\x7f", arrows are escape sequences, Ctrl-C is
 * "\x03", and so on — which is far more reliable across browsers than reading `keydown`. This
 * function is pure, so the mapping is unit-tested in Node.
 */

const CTRL_LETTER: Readonly<Record<number, string>> = {
  0x01: 'a',
  0x02: 'b',
  0x05: 'e',
  0x06: 'f',
  0x0b: 'k',
  0x0e: 'n',
  0x10: 'p',
  0x15: 'u',
  0x17: 'w',
  0x19: 'y',
};

const CSI_KEYS: Readonly<Record<string, string>> = {
  A: 'ArrowUp',
  B: 'ArrowDown',
  C: 'ArrowRight',
  D: 'ArrowLeft',
  H: 'Home',
  F: 'End',
};

const CSI_TILDE: Readonly<Record<string, string>> = {
  '1': 'Home',
  '3': 'Delete',
  '4': 'End',
  '7': 'Home',
  '8': 'End',
};

/** Parses an escape sequence starting at `i` (data[i] === ESC). Returns the event and its length. */
function parseEscape(data: string, i: number): { event: KeyEvent | null; length: number } {
  const next = data.charAt(i + 1);
  if (next === '[' || next === 'O') {
    const third = data.charAt(i + 2);
    const named = CSI_KEYS[third];
    if (named) return { event: { key: named }, length: 3 };
    // CSI sequences like \x1b[3~
    const match = new RegExp(String.raw`^\x1b\[(\d+)~`).exec(data.slice(i));
    if (match) {
      const key = CSI_TILDE[match[1] ?? ''];
      return { event: key ? { key } : null, length: match[0].length };
    }
    return { event: null, length: 2 };
  }
  if (next === 'b' || next === 'f' || next === 'd')
    return { event: { key: next, alt: true }, length: 2 };
  if (next === '\x7f' || next === '\b')
    return { event: { key: 'Backspace', alt: true }, length: 2 };
  // A lone ESC (or an unrecognized sequence): ignore the ESC itself.
  return { event: null, length: 1 };
}

export function decodeInput(data: string): KeyEvent[] {
  const events: KeyEvent[] = [];
  let text = '';
  const flushText = (): void => {
    if (text !== '') {
      events.push({ key: text });
      text = '';
    }
  };

  for (let i = 0; i < data.length;) {
    const code = data.charCodeAt(i);
    if (code === 0x1b) {
      flushText();
      const { event, length } = parseEscape(data, i);
      if (event) events.push(event);
      i += length;
      continue;
    }
    if (code === 0x0d || code === 0x0a) {
      flushText();
      events.push({ key: 'Enter' });
      i += 1;
      continue;
    }
    if (code === 0x09) {
      flushText();
      events.push({ key: 'Tab' });
      i += 1;
      continue;
    }
    if (code === 0x7f || code === 0x08) {
      flushText();
      events.push({ key: 'Backspace' });
      i += 1;
      continue;
    }
    if (code === 0x03) {
      flushText();
      events.push({ key: 'c', ctrl: true });
      i += 1;
      continue;
    }
    if (code === 0x04) {
      flushText();
      events.push({ key: 'd', ctrl: true });
      i += 1;
      continue;
    }
    if (code === 0x0c) {
      flushText();
      events.push({ key: 'l', ctrl: true });
      i += 1;
      continue;
    }
    const ctrlLetter = CTRL_LETTER[code];
    if (ctrlLetter !== undefined) {
      flushText();
      events.push({ key: ctrlLetter, ctrl: true });
      i += 1;
      continue;
    }
    if (code < 0x20) {
      // Other control bytes are ignored.
      i += 1;
      continue;
    }
    text += data.charAt(i);
    i += 1;
  }
  flushText();
  return events;
}
