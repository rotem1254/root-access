/** Syntax tree produced by the parser. */

export type WordPart =
  /** Literal text. `quoted` is true for text inside quotes or escaped with a backslash. */
  | { kind: 'text'; value: string; quoted: boolean }
  /** `$NAME`, `${NAME}`, `$?`, `$1` … */
  | { kind: 'param'; name: string; quoted: boolean }
  /** An unquoted `~` or `~user` at the start of a word (or right after `NAME=`). */
  | { kind: 'tilde'; user: string };

export interface Word {
  parts: WordPart[];
  /** The word as typed, for error messages. */
  raw: string;
}

export type Redirect =
  | { kind: 'file'; fd: number; op: '<' | '>' | '>>'; target: Word }
  /** `2>&1`: make `fd` refer to whatever `to` currently refers to. */
  | { kind: 'dup'; fd: number; to: number }
  /** `&> file` and `&>> file`: stdout and stderr to the same file. */
  | { kind: 'both'; append: boolean; target: Word };

export interface Assignment {
  name: string;
  value: Word;
}

export interface SimpleCommand {
  assignments: Assignment[];
  words: Word[];
  redirects: Redirect[];
}

export interface Pipeline {
  commands: SimpleCommand[];
}

export interface ListItem {
  pipeline: Pipeline;
  /** The operator after this pipeline, which decides whether the next one runs. */
  next: ';' | '&&' | '||' | null;
}

export interface CommandList {
  items: ListItem[];
}
