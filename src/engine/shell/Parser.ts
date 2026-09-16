import type { Assignment, CommandList, ListItem, Pipeline, SimpleCommand, Word } from './ast';
import { lex, type Operator, type Token } from './Lexer';
import { syntaxError, UNSUPPORTED } from './messages';

export type ParseResult =
  | { ok: true; list: CommandList }
  /** More input is needed (open quote, trailing `|` or `&&`): show the `> ` prompt. */
  | { ok: false; incomplete: true }
  | { ok: false; incomplete: false; error: string };

const REDIRECTIONS = new Set<Operator>([
  '<',
  '>',
  '>>',
  '>|',
  '<<',
  '<<<',
  '<&',
  '>&',
  '&>',
  '&>>',
]);

class Stop extends Error {
  readonly result: ParseResult;
  constructor(result: ParseResult) {
    super('shell input stopped');
    this.result = result;
  }
}

const INCOMPLETE = new Stop({ ok: false, incomplete: true });
const fail = (error: string): Stop => new Stop({ ok: false, incomplete: false, error });

function tokenText(token: Token | undefined): string {
  if (!token) return 'newline';
  if (token.type === 'word') return token.word.raw;
  if (token.type === 'io') return token.raw;
  return token.op === '\n' ? 'newline' : token.op;
}

function asAssignment(word: Word): Assignment | null {
  const [first, ...rest] = word.parts;
  if (first?.kind !== 'text' || first.quoted) return null;
  const match = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(first.value);
  if (!match?.[1]) return null;
  const remainder = first.value.slice(match[0].length);
  const parts = remainder === '' ? rest : [{ ...first, value: remainder }, ...rest];
  return { name: match[1], value: { parts, raw: word.raw.slice(match[0].length) } };
}

class Parser {
  private pos = 0;
  private readonly tokens: Token[];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private isOp<T extends Operator>(
    token: Token | undefined,
    ...ops: T[]
  ): token is { type: 'op'; op: T } {
    return token?.type === 'op' && (ops as Operator[]).includes(token.op);
  }

  private skipNewlines(): void {
    while (this.isOp(this.peek(), '\n')) this.pos += 1;
  }

  parse(): ParseResult {
    const items: ListItem[] = [];
    this.skipNewlines();
    while (this.peek()) {
      const pipeline = this.parsePipeline();
      const token = this.peek();
      if (!token) {
        items.push({ pipeline, next: null });
        break;
      }
      if (this.isOp(token, ';', '\n')) {
        this.pos += 1;
        items.push({ pipeline, next: ';' });
        this.skipNewlines();
        continue;
      }
      if (this.isOp(token, '&&', '||')) {
        this.pos += 1;
        this.skipNewlines();
        if (!this.peek()) throw INCOMPLETE;
        items.push({ pipeline, next: token.op === '&&' ? '&&' : '||' });
        continue;
      }
      if (this.isOp(token, '&')) throw fail(UNSUPPORTED.background);
      throw fail(syntaxError(tokenText(token)));
    }
    return { ok: true, list: { items } };
  }

  private parsePipeline(): Pipeline {
    const commands = [this.parseCommand()];
    for (;;) {
      const token = this.peek();
      if (!this.isOp(token, '|', '|&')) break;
      this.pos += 1;
      if (token.op === '|&')
        commands[commands.length - 1]?.redirects.push({ kind: 'dup', fd: 2, to: 1 });
      this.skipNewlines();
      if (!this.peek()) throw INCOMPLETE;
      commands.push(this.parseCommand());
    }
    return { commands };
  }

  private parseCommand(): SimpleCommand {
    const command: SimpleCommand = { assignments: [], words: [], redirects: [] };
    const isEmpty = (): boolean =>
      command.words.length === 0 &&
      command.assignments.length === 0 &&
      command.redirects.length === 0;
    for (;;) {
      const token = this.peek();
      if (!token) break;
      if (token.type === 'word') {
        this.pos += 1;
        const assignment = command.words.length === 0 ? asAssignment(token.word) : null;
        if (assignment) command.assignments.push(assignment);
        else command.words.push(token.word);
        continue;
      }
      if (token.type === 'io') {
        this.pos += 1;
        this.parseRedirect(command, token.fd);
        continue;
      }
      if (REDIRECTIONS.has(token.op)) {
        this.parseRedirect(command, null);
        continue;
      }
      if (token.op === '(' && isEmpty()) throw fail(UNSUPPORTED.subshell);
      break;
    }
    if (isEmpty()) throw fail(syntaxError(tokenText(this.peek())));
    return command;
  }

  private parseRedirect(command: SimpleCommand, fd: number | null): void {
    const token = this.peek();
    if (token?.type !== 'op') throw fail(syntaxError(tokenText(token)));
    this.pos += 1;
    const op = token.op;
    if (op === '<<') throw fail(UNSUPPORTED.hereDocument);
    if (op === '<<<') throw fail(UNSUPPORTED.hereString);
    if (op === '<&') throw fail(UNSUPPORTED.inputDuplication);
    const next = this.peek();
    if ((op === '<' || op === '>') && this.isOp(next, '('))
      throw fail(UNSUPPORTED.processSubstitution);
    if (next?.type !== 'word') throw fail(syntaxError(tokenText(next)));
    this.pos += 1;
    const target = next.word;
    switch (op) {
      case '<':
        command.redirects.push({ kind: 'file', fd: fd ?? 0, op: '<', target });
        return;
      case '>':
      case '>|':
        command.redirects.push({ kind: 'file', fd: fd ?? 1, op: '>', target });
        return;
      case '>>':
        command.redirects.push({ kind: 'file', fd: fd ?? 1, op: '>>', target });
        return;
      case '&>':
      case '&>>':
        command.redirects.push({ kind: 'both', append: op === '&>>', target });
        return;
      default: {
        // '>&'
        const unquoted = target.parts.every((part) => part.kind === 'text' && !part.quoted);
        if (unquoted && /^\d+$/.test(target.raw)) {
          command.redirects.push({ kind: 'dup', fd: fd ?? 1, to: Number(target.raw) });
        } else if (unquoted && target.raw === '-') {
          throw fail(UNSUPPORTED.closeDescriptor);
        } else if (fd === null) {
          command.redirects.push({ kind: 'both', append: false, target });
        } else {
          throw fail(`bash: ${target.raw}: ambiguous redirect`);
        }
      }
    }
  }
}

export function parse(input: string): ParseResult {
  const lexed = lex(input);
  if (!lexed.ok) return lexed;
  try {
    return new Parser(lexed.tokens).parse();
  } catch (error) {
    if (error instanceof Stop) return error.result;
    throw error;
  }
}
