/**
 * A pure readline-style line editor. It owns the current input buffer, the cursor, and the
 * history cursor, and turns key events into buffer changes. The Terminal renders it; this file
 * has no DOM, so it can be unit-tested in Node.
 */
export interface LineState {
  line: string;
  /** Cursor position (0..line.length). */
  point: number;
}

export interface KeyEvent {
  /** A printable string to insert, or a named key like "Enter"/"ArrowLeft". */
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  meta?: boolean;
}

export type EditorAction = 'submit' | 'interrupt' | 'eof' | 'clear' | 'complete' | 'none';

const WORD = /[A-Za-z0-9_]/;
const CONTROL = /^[\x00-\x1f]$/;

export class LineEditor {
  line = '';
  point = 0;
  private killRing = '';
  private readonly history: readonly string[];
  private historyIndex: number;
  /** The line being edited before the user started browsing history. */
  private stash = '';

  constructor(history: readonly string[] = []) {
    this.history = history;
    this.historyIndex = history.length;
  }

  get state(): LineState {
    return { line: this.line, point: this.point };
  }

  reset(line = ''): void {
    this.line = line;
    this.point = line.length;
    this.historyIndex = this.history.length;
    this.stash = '';
  }

  insert(text: string): void {
    this.line = this.line.slice(0, this.point) + text + this.line.slice(this.point);
    this.point += text.length;
  }

  private backspace(): void {
    if (this.point === 0) return;
    this.line = this.line.slice(0, this.point - 1) + this.line.slice(this.point);
    this.point -= 1;
  }

  private deleteChar(): void {
    if (this.point >= this.line.length) return;
    this.line = this.line.slice(0, this.point) + this.line.slice(this.point + 1);
  }

  private wordLeft(): number {
    let i = this.point;
    while (i > 0 && !WORD.test(this.line[i - 1] ?? '')) i -= 1;
    while (i > 0 && WORD.test(this.line[i - 1] ?? '')) i -= 1;
    return i;
  }

  private wordRight(): number {
    let i = this.point;
    while (i < this.line.length && !WORD.test(this.line[i] ?? '')) i += 1;
    while (i < this.line.length && WORD.test(this.line[i] ?? '')) i += 1;
    return i;
  }

  private killTo(start: number, end: number): void {
    this.killRing = this.line.slice(start, end);
    this.line = this.line.slice(0, start) + this.line.slice(end);
    this.point = start;
  }

  historyPrev(): void {
    if (this.historyIndex === this.history.length) this.stash = this.line;
    if (this.historyIndex > 0) {
      this.historyIndex -= 1;
      this.line = this.history[this.historyIndex] ?? '';
      this.point = this.line.length;
    }
  }

  historyNext(): void {
    if (this.historyIndex < this.history.length) {
      this.historyIndex += 1;
      this.line =
        this.historyIndex === this.history.length
          ? this.stash
          : (this.history[this.historyIndex] ?? '');
      this.point = this.line.length;
    }
  }

  private handleControl(key: string): EditorAction {
    switch (key) {
      case 'a':
        this.point = 0;
        return 'none';
      case 'e':
        this.point = this.line.length;
        return 'none';
      case 'b':
        if (this.point > 0) this.point -= 1;
        return 'none';
      case 'f':
        if (this.point < this.line.length) this.point += 1;
        return 'none';
      case 'k':
        this.killTo(this.point, this.line.length);
        return 'none';
      case 'u':
        this.killTo(0, this.point);
        return 'none';
      case 'w':
        this.killTo(this.wordLeft(), this.point);
        return 'none';
      case 'y':
        this.insert(this.killRing);
        return 'none';
      case 'd':
        if (this.line === '') return 'eof';
        this.deleteChar();
        return 'none';
      case 'c':
        return 'interrupt';
      case 'l':
        return 'clear';
      case 'h':
        this.backspace();
        return 'none';
      case 'p':
        this.historyPrev();
        return 'none';
      case 'n':
        this.historyNext();
        return 'none';
      default:
        return 'none';
    }
  }

  private handleMeta(key: string): EditorAction {
    switch (key) {
      case 'b':
        this.point = this.wordLeft();
        return 'none';
      case 'f':
        this.point = this.wordRight();
        return 'none';
      case 'd':
        this.killTo(this.point, this.wordRight());
        return 'none';
      case 'Backspace':
        this.killTo(this.wordLeft(), this.point);
        return 'none';
      default:
        return 'none';
    }
  }

  /** Applies a key event. Returns an action the Terminal should carry out, if any. */
  handle(event: KeyEvent): EditorAction {
    const { key, ctrl, alt, meta } = event;
    if (ctrl && !alt) return this.handleControl(key);
    if (alt ?? meta) return this.handleMeta(key);
    switch (key) {
      case 'Enter':
        return 'submit';
      case 'Tab':
        return 'complete';
      case 'Backspace':
        this.backspace();
        return 'none';
      case 'Delete':
        this.deleteChar();
        return 'none';
      case 'ArrowLeft':
        if (this.point > 0) this.point -= 1;
        return 'none';
      case 'ArrowRight':
        if (this.point < this.line.length) this.point += 1;
        return 'none';
      case 'ArrowUp':
        this.historyPrev();
        return 'none';
      case 'ArrowDown':
        this.historyNext();
        return 'none';
      case 'Home':
        this.point = 0;
        return 'none';
      case 'End':
        this.point = this.line.length;
        return 'none';
      default:
        if (key.length >= 1 && !CONTROL.test(key)) this.insert(key);
        return 'none';
    }
  }
}
