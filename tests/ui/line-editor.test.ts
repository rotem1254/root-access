import { describe, expect, it } from 'vitest';
import { LineEditor } from '../../src/ui/LineEditor';

const type = (editor: LineEditor, text: string): void => {
  for (const ch of text) editor.handle({ key: ch });
};

describe('LineEditor', () => {
  it('inserts printable characters and tracks the cursor', () => {
    const editor = new LineEditor();
    type(editor, 'echo hi');
    expect(editor.state).toEqual({ line: 'echo hi', point: 7 });
  });

  it('moves the cursor and edits in the middle', () => {
    const editor = new LineEditor();
    type(editor, 'echo');
    editor.handle({ key: 'ArrowLeft' });
    editor.handle({ key: 'ArrowLeft' });
    editor.handle({ key: 'X' });
    expect(editor.line).toBe('ecXho');
    editor.handle({ key: 'Home' });
    expect(editor.point).toBe(0);
    editor.handle({ key: 'End' });
    expect(editor.point).toBe(5);
    editor.handle({ key: 'Delete' });
    expect(editor.line).toBe('ecXho');
  });

  it('handles Backspace and Delete', () => {
    const editor = new LineEditor();
    type(editor, 'abc');
    editor.handle({ key: 'Backspace' });
    expect(editor.line).toBe('ab');
    editor.handle({ key: 'Home' });
    editor.handle({ key: 'Delete' });
    expect(editor.line).toBe('b');
  });

  it('supports emacs-style control keys', () => {
    const editor = new LineEditor();
    type(editor, 'one two three');
    editor.handle({ key: 'a', ctrl: true });
    expect(editor.point).toBe(0);
    editor.handle({ key: 'e', ctrl: true });
    expect(editor.point).toBe(13);
    editor.handle({ key: 'w', ctrl: true });
    expect(editor.line).toBe('one two ');
    editor.handle({ key: 'u', ctrl: true });
    expect(editor.line).toBe('');
    editor.handle({ key: 'y', ctrl: true });
    expect(editor.line).toBe('one two ');
    editor.handle({ key: 'a', ctrl: true });
    editor.handle({ key: 'k', ctrl: true });
    expect(editor.line).toBe('');
  });

  it('moves and kills by word with alt', () => {
    const editor = new LineEditor();
    type(editor, 'alpha beta gamma');
    editor.handle({ key: 'b', alt: true });
    expect(editor.point).toBe(11);
    editor.handle({ key: 'Backspace', alt: true });
    expect(editor.line).toBe('alpha gamma');
  });

  it('reports actions for special keys', () => {
    const editor = new LineEditor();
    expect(editor.handle({ key: 'Enter' })).toBe('submit');
    expect(editor.handle({ key: 'Tab' })).toBe('complete');
    expect(editor.handle({ key: 'c', ctrl: true })).toBe('interrupt');
    expect(editor.handle({ key: 'l', ctrl: true })).toBe('clear');
    expect(editor.handle({ key: 'd', ctrl: true })).toBe('eof');
    type(editor, 'x');
    editor.handle({ key: 'Home' });
    expect(editor.handle({ key: 'd', ctrl: true })).toBe('none');
    expect(editor.line).toBe('');
  });

  it('browses history with the arrow keys', () => {
    const editor = new LineEditor(['first', 'second']);
    type(editor, 'draft');
    editor.handle({ key: 'ArrowUp' });
    expect(editor.line).toBe('second');
    editor.handle({ key: 'ArrowUp' });
    expect(editor.line).toBe('first');
    editor.handle({ key: 'ArrowUp' });
    expect(editor.line).toBe('first');
    editor.handle({ key: 'ArrowDown' });
    expect(editor.line).toBe('second');
    editor.handle({ key: 'ArrowDown' });
    expect(editor.line).toBe('draft');
  });

  it('resets for a new prompt', () => {
    const editor = new LineEditor(['old']);
    type(editor, 'work');
    editor.reset();
    expect(editor.state).toEqual({ line: '', point: 0 });
    editor.handle({ key: 'ArrowUp' });
    expect(editor.line).toBe('old');
  });

  it('ignores unhandled control characters', () => {
    const editor = new LineEditor();
    editor.handle({ key: '\x00' });
    editor.handle({ key: 'z', ctrl: true });
    expect(editor.line).toBe('');
  });
});
