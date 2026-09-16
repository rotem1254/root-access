import { expandTilde } from '../fs/path';
import type { Word } from './ast';
import { escapeGlob, hasGlobChars, unescapeGlob } from './glob';

export interface ExpansionContext {
  /** Variable or special parameter value; undefined when unset. */
  lookup(name: string): string | undefined;
  home(): string;
  homeOf(user: string): string | undefined;
  /** Pathname expansion; null when nothing matches. */
  glob(pattern: string): string[] | null;
}

interface Segment {
  text: string;
  quoted: boolean;
}

/** One field before pathname expansion: pieces of text that remember whether they were quoted. */
type Field = Segment[];

const IFS_WHITESPACE = /[ \t\n]+/;

/** Tilde, parameter expansion and word splitting. */
function splitFields(word: Word, context: ExpansionContext, split: boolean): Field[] {
  const fields: Field[] = [];
  let current: Field = [];
  let hasContent = false;
  const finish = (): void => {
    if (hasContent) fields.push(current);
    current = [];
    hasContent = false;
  };

  for (const part of word.parts) {
    if (part.kind === 'text') {
      current.push({ text: part.value, quoted: part.quoted });
      if (part.quoted || part.value !== '') hasContent = true;
      continue;
    }
    if (part.kind === 'tilde') {
      const suffix = part.user === '' ? '' : part.user;
      const expanded = expandTilde(`~${suffix}`, context.home(), (user) => context.homeOf(user));
      current.push({ text: expanded, quoted: expanded !== `~${suffix}` });
      hasContent = true;
      continue;
    }
    const value = context.lookup(part.name) ?? '';
    if (part.quoted || !split) {
      current.push({ text: value, quoted: true });
      if (part.quoted || value !== '') hasContent = true;
      continue;
    }
    // Unquoted expansion: split on whitespace; the pieces are not re-parsed for quotes.
    const pieces = value.split(IFS_WHITESPACE);
    pieces.forEach((piece, index) => {
      if (index > 0) finish();
      if (piece !== '') {
        current.push({ text: piece, quoted: false });
        hasContent = true;
      }
    });
  }
  finish();
  return fields;
}

function fieldText(field: Field): string {
  return field.map((segment) => segment.text).join('');
}

function globPattern(field: Field): string | null {
  const unquotedGlob = field.some((segment) => !segment.quoted && hasGlobChars(segment.text));
  if (!unquotedGlob) return null;
  return field
    .map((segment) => (segment.quoted ? escapeGlob(segment.text) : segment.text))
    .join('');
}

/** Full expansion of command words: tilde, parameters, word splitting, globbing, quote removal. */
export function expandWords(words: readonly Word[], context: ExpansionContext): string[] {
  const out: string[] = [];
  for (const word of words) {
    for (const field of splitFields(word, context, true)) {
      const pattern = globPattern(field);
      const matches = pattern === null ? null : context.glob(pattern);
      if (matches) out.push(...matches);
      else out.push(pattern === null ? fieldText(field) : unescapeGlob(pattern));
    }
  }
  return out;
}

/** Assignment values: tilde and parameter expansion only, no splitting or globbing. */
export function expandAssignment(word: Word, context: ExpansionContext): string {
  return splitFields(word, context, false).map(fieldText).join('');
}
