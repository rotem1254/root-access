import { basename, dirname, isAbsolute, resolve } from '../fs/path';
import { compareBytes } from './glob';
import { lex } from './Lexer';

/** What tab-completion needs from the world, so it stays pure and testable. */
export interface CompletionContext {
  /** Names of all runnable commands (builtins, binaries in PATH, game commands). */
  commandNames(): readonly string[];
  cwd(): string;
  home(): string;
  /** Directory entry names for an absolute path, or null if it cannot be listed. */
  readdir(absolutePath: string): readonly string[] | null;
  /** True if the absolute path is a directory. */
  isDirectory(absolutePath: string): boolean;
}

export interface CompletionResult {
  /** Full candidate words (already including any directory prefix that was typed). */
  candidates: string[];
  /** The start index in the line that a chosen candidate replaces. */
  replaceStart: number;
  /** How to finish a single unique candidate: a space, a slash, or nothing. */
  suffix: string;
}

/** Longest common prefix of a list of strings. */
export function commonPrefix(items: readonly string[]): string {
  if (items.length === 0) return '';
  let prefix = items[0] ?? '';
  for (const item of items) {
    let i = 0;
    while (i < prefix.length && i < item.length && prefix[i] === item[i]) i += 1;
    prefix = prefix.slice(0, i);
  }
  return prefix;
}

/** Finds the word being completed: everything back to the last unquoted blank or operator. */
function currentWord(line: string, point: number): { text: string; start: number } {
  let start = point;
  while (start > 0) {
    const char = line[start - 1] ?? '';
    if (
      char === ' ' ||
      char === '\t' ||
      char === '|' ||
      char === '&' ||
      char === ';' ||
      char === '<' ||
      char === '>'
    ) {
      break;
    }
    start -= 1;
  }
  return { text: line.slice(start, point), start };
}

/** Whether the current word is the command position (first word of its pipeline segment). */
function isCommandPosition(line: string, wordStart: number): boolean {
  const before = line.slice(0, wordStart);
  return /(^|[|&;])\s*$/.test(before);
}

function completePaths(
  word: string,
  context: CompletionContext,
): { names: string[]; dirPrefix: string } {
  let expanded = word;
  let displayPrefix = '';
  if (word.startsWith('~/')) {
    expanded = context.home() + word.slice(1);
  }
  const slash = expanded.lastIndexOf('/');
  const dirPart = slash < 0 ? '.' : expanded.slice(0, slash + 1) || '/';
  const namePart = slash < 0 ? expanded : expanded.slice(slash + 1);
  displayPrefix = slash < 0 ? '' : word.slice(0, word.lastIndexOf('/') + 1);
  const absoluteDir = isAbsolute(dirPart) ? dirPart : resolve(context.cwd(), dirPart);
  const entries = context.readdir(absoluteDir);
  if (!entries) return { names: [], dirPrefix: displayPrefix };
  const showHidden = namePart.startsWith('.');
  const matched = entries
    .filter((entry) => entry.startsWith(namePart) && (showHidden || !entry.startsWith('.')))
    .sort(compareBytes);
  return {
    names: matched.map((name) => `${absoluteDir.replace(/\/$/, '')}/${name}`),
    dirPrefix: displayPrefix,
  };
}

/** Computes tab-completion candidates for a command line at the cursor position. */
export function complete(
  line: string,
  point: number,
  context: CompletionContext,
): CompletionResult {
  const { text: word, start } = currentWord(line, point);

  if (isCommandPosition(line, start) && !word.includes('/')) {
    const names = context
      .commandNames()
      .filter((name) => name.startsWith(word))
      .sort(compareBytes);
    const unique = [...new Set(names)];
    return { candidates: unique, replaceStart: start, suffix: unique.length === 1 ? ' ' : '' };
  }

  const { names, dirPrefix } = completePaths(word, context);
  const candidates = names.map((absolute) => `${dirPrefix}${basename(absolute)}`);
  let suffix = '';
  if (names.length === 1) suffix = context.isDirectory(names[0] ?? '') ? '/' : ' ';
  return { candidates, replaceStart: start, suffix };
}

/** Applies a completion result to a line, returning the new line and cursor position. */
export function applyCompletion(
  line: string,
  point: number,
  result: CompletionResult,
): { line: string; point: number; listing: string[] } {
  const { candidates, replaceStart, suffix } = result;
  if (candidates.length === 0) return { line, point, listing: [] };
  if (candidates.length === 1) {
    const replacement = (candidates[0] ?? '') + suffix;
    const newLine = line.slice(0, replaceStart) + replacement + line.slice(point);
    return { line: newLine, point: replaceStart + replacement.length, listing: [] };
  }
  const prefix = commonPrefix(candidates);
  const typed = line.slice(replaceStart, point);
  if (prefix.length > typed.length) {
    const newLine = line.slice(0, replaceStart) + prefix + line.slice(point);
    return { line: newLine, point: replaceStart + prefix.length, listing: [] };
  }
  // Nothing more to insert: the caller lists the candidates (double-Tab behaviour).
  return { line, point, listing: candidates };
}

/** Used by the terminal to know whether the first word so far is a known command. */
export function firstWord(line: string): string {
  const result = lex(line);
  if (!result.ok) return '';
  const first = result.tokens[0];
  return first?.type === 'word' ? first.word.raw : '';
}
