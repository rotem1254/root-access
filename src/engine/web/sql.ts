/**
 * A small but genuine SQL engine: enough of SELECT to make string-concatenation injection work for
 * the real reason. The vulnerable endpoints build their query text by concatenating user input and
 * hand the result here, so any valid payload works and a broken one produces a real syntax error.
 *
 * Supported: SELECT <cols|*> FROM <table> [WHERE <expr>] [UNION [ALL] SELECT ...],
 * literals (single-quoted strings with '' escapes, numbers), columns, comparisons
 * (= != <> < <= > >=), AND / OR / NOT, parentheses, and `--` / `#` comments.
 */

export type SqlValue = string | number | null;
export type SqlRow = Readonly<Record<string, SqlValue>>;

export interface SqlTable {
  name: string;
  columns: readonly string[];
  rows: readonly SqlRow[];
}

export type SqlDatabase = readonly SqlTable[];

export interface SqlResult {
  columns: readonly string[];
  rows: readonly (readonly SqlValue[])[];
}

export class SqlError extends Error {
  readonly near: string;
  constructor(message: string, near = '') {
    super(message);
    this.name = 'SqlError';
    this.near = near;
  }
}

// ── Tokenizer ────────────────────────────────────────────────────────────────

type TokenType = 'ident' | 'string' | 'number' | 'op' | 'punct' | 'eof';

interface Token {
  type: TokenType;
  value: string;
  /** Source text from this token on, for "near '...'" error messages. */
  rest: string;
}

const OPERATORS = ['<=', '>=', '<>', '!=', '=', '<', '>'];

function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const push = (type: TokenType, value: string, start: number): void => {
    tokens.push({ type, value, rest: sql.slice(start) });
  };
  while (i < sql.length) {
    const char = sql[i] ?? '';
    if (/\s/.test(char)) {
      i += 1;
      continue;
    }
    // Comments run to end of line: `-- text` or `# text`.
    if (sql.startsWith('--', i) || char === '#') {
      const newline = sql.indexOf('\n', i);
      i = newline < 0 ? sql.length : newline + 1;
      continue;
    }
    if (char === "'") {
      const start = i;
      i += 1;
      let value = '';
      let closed = false;
      while (i < sql.length) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            value += "'";
            i += 2;
            continue;
          }
          closed = true;
          i += 1;
          break;
        }
        value += sql.charAt(i);
        i += 1;
      }
      if (!closed) throw new SqlError('unterminated string literal', sql.slice(start));
      push('string', value, start);
      continue;
    }
    if (/[0-9]/.test(char)) {
      const start = i;
      while (i < sql.length && /[0-9.]/.test(sql[i] ?? '')) i += 1;
      push('number', sql.slice(start, i), start);
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      const start = i;
      while (i < sql.length && /[A-Za-z0-9_.]/.test(sql[i] ?? '')) i += 1;
      push('ident', sql.slice(start, i), start);
      continue;
    }
    const operator = OPERATORS.find((op) => sql.startsWith(op, i));
    if (operator) {
      push('op', operator, i);
      i += operator.length;
      continue;
    }
    if (char === '(' || char === ')' || char === ',' || char === '*' || char === ';') {
      push('punct', char, i);
      i += 1;
      continue;
    }
    throw new SqlError('syntax error', sql.slice(i));
  }
  tokens.push({ type: 'eof', value: '', rest: '' });
  return tokens;
}

// ── Expressions ──────────────────────────────────────────────────────────────

type Expr =
  | { kind: 'literal'; value: SqlValue }
  | { kind: 'column'; name: string }
  | { kind: 'compare'; op: string; left: Expr; right: Expr }
  | { kind: 'and'; left: Expr; right: Expr }
  | { kind: 'or'; left: Expr; right: Expr }
  | { kind: 'not'; value: Expr };

interface Select {
  columns: readonly string[] | '*';
  table: string;
  where: Expr | null;
}

class Parser {
  private readonly tokens: Token[];
  private position = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.position] ?? { type: 'eof', value: '', rest: '' };
  }

  private next(): Token {
    const token = this.peek();
    this.position += 1;
    return token;
  }

  private isKeyword(word: string): boolean {
    const token = this.peek();
    return token.type === 'ident' && token.value.toUpperCase() === word;
  }

  private expectKeyword(word: string): void {
    if (!this.isKeyword(word)) throw new SqlError('syntax error', this.peek().rest);
    this.next();
  }

  /** Parses a full statement: one or more SELECTs joined by UNION. */
  parseStatement(): Select[] {
    const selects = [this.parseSelect()];
    while (this.isKeyword('UNION')) {
      this.next();
      if (this.isKeyword('ALL')) this.next();
      selects.push(this.parseSelect());
    }
    const token = this.peek();
    if (token.type === 'punct' && token.value === ';') this.next();
    if (this.peek().type !== 'eof') throw new SqlError('syntax error', this.peek().rest);
    return selects;
  }

  private parseSelect(): Select {
    this.expectKeyword('SELECT');
    let columns: readonly string[] | '*';
    if (this.peek().type === 'punct' && this.peek().value === '*') {
      this.next();
      columns = '*';
    } else {
      const names: string[] = [];
      for (;;) {
        const token = this.next();
        if (token.type !== 'ident' && token.type !== 'string' && token.type !== 'number') {
          throw new SqlError('syntax error', token.rest);
        }
        names.push(token.value);
        if (this.peek().type === 'punct' && this.peek().value === ',') {
          this.next();
          continue;
        }
        break;
      }
      columns = names;
    }
    this.expectKeyword('FROM');
    const table = this.next();
    if (table.type !== 'ident') throw new SqlError('syntax error', table.rest);
    let where: Expr | null = null;
    if (this.isKeyword('WHERE')) {
      this.next();
      where = this.parseOr();
    }
    return { columns, table: table.value, where };
  }

  private parseOr(): Expr {
    let left = this.parseAnd();
    while (this.isKeyword('OR')) {
      this.next();
      left = { kind: 'or', left, right: this.parseAnd() };
    }
    return left;
  }

  private parseAnd(): Expr {
    let left = this.parseNot();
    while (this.isKeyword('AND')) {
      this.next();
      left = { kind: 'and', left, right: this.parseNot() };
    }
    return left;
  }

  private parseNot(): Expr {
    if (this.isKeyword('NOT')) {
      this.next();
      return { kind: 'not', value: this.parseNot() };
    }
    return this.parseComparison();
  }

  private parseComparison(): Expr {
    const left = this.parsePrimary();
    const token = this.peek();
    if (token.type === 'op') {
      this.next();
      return { kind: 'compare', op: token.value, left, right: this.parsePrimary() };
    }
    return left;
  }

  private parsePrimary(): Expr {
    const token = this.next();
    if (token.type === 'punct' && token.value === '(') {
      const inner = this.parseOr();
      const close = this.next();
      if (close.type !== 'punct' || close.value !== ')')
        throw new SqlError('syntax error', close.rest);
      return inner;
    }
    if (token.type === 'string') return { kind: 'literal', value: token.value };
    if (token.type === 'number') return { kind: 'literal', value: Number(token.value) };
    if (token.type === 'ident') {
      const upper = token.value.toUpperCase();
      if (upper === 'NULL') return { kind: 'literal', value: null };
      if (upper === 'TRUE') return { kind: 'literal', value: 1 };
      if (upper === 'FALSE') return { kind: 'literal', value: 0 };
      return { kind: 'column', name: token.value };
    }
    throw new SqlError('syntax error', token.rest);
  }
}

// ── Evaluation ───────────────────────────────────────────────────────────────

/** SQL truthiness: a non-zero number or a non-empty numeric-looking string. */
function truthy(value: SqlValue): boolean {
  if (value === null) return false;
  if (typeof value === 'number') return value !== 0;
  return Number.parseFloat(value) !== 0;
}

function compare(op: string, left: SqlValue, right: SqlValue): boolean {
  if (left === null || right === null) return false;
  // MySQL compares a string to a number numerically, which is what makes `'1'='1'` work.
  const bothNumeric =
    typeof left === 'number' || typeof right === 'number'
      ? true
      : !Number.isNaN(Number(left)) && !Number.isNaN(Number(right)) && left !== '' && right !== '';
  const a: SqlValue = bothNumeric ? Number(left) : left;
  const b: SqlValue = bothNumeric ? Number(right) : right;
  switch (op) {
    case '=':
      return a === b;
    case '!=':
    case '<>':
      return a !== b;
    case '<':
      return a < b;
    case '<=':
      return a <= b;
    case '>':
      return a > b;
    case '>=':
      return a >= b;
    default:
      throw new SqlError('syntax error', op);
  }
}

function evaluate(expr: Expr, row: SqlRow): SqlValue {
  switch (expr.kind) {
    case 'literal':
      return expr.value;
    case 'column': {
      const name = expr.name.includes('.') ? (expr.name.split('.').pop() ?? '') : expr.name;
      if (!(name in row)) throw new SqlError(`Unknown column '${expr.name}' in 'where clause'`);
      return row[name] ?? null;
    }
    case 'compare':
      return compare(expr.op, evaluate(expr.left, row), evaluate(expr.right, row)) ? 1 : 0;
    case 'and':
      return truthy(evaluate(expr.left, row)) && truthy(evaluate(expr.right, row)) ? 1 : 0;
    case 'or':
      return truthy(evaluate(expr.left, row)) || truthy(evaluate(expr.right, row)) ? 1 : 0;
    case 'not':
      return truthy(evaluate(expr.value, row)) ? 0 : 1;
  }
}

function runSelect(database: SqlDatabase, select: Select): SqlResult {
  const table = database.find((candidate) => candidate.name === select.table);
  if (!table) throw new SqlError(`Table 'novacorp.${select.table}' doesn't exist`);
  const columns = select.columns === '*' ? table.columns : select.columns;
  const rows: SqlValue[][] = [];
  for (const row of table.rows) {
    // A WHERE clause with no column reference (e.g. '1'='1') is evaluated against the row anyway.
    if (select.where && !truthy(evaluate(select.where, row))) continue;
    rows.push(
      columns.map((column) => {
        if (column in row) return row[column] ?? null;
        // A literal in the column list (as a UNION payload uses) selects itself. Recognise the SQL
        // keyword literals so the classic `UNION SELECT NULL,NULL,...` column-count probe blanks out
        // instead of printing the word "NULL".
        const upper = column.toUpperCase();
        if (upper === 'NULL') return null;
        if (upper === 'TRUE') return 1;
        if (upper === 'FALSE') return 0;
        const asNumber = Number(column);
        return Number.isNaN(asNumber) ? column : asNumber;
      }),
    );
  }
  return { columns, rows };
}

/** Runs a SELECT (or a UNION of them) against the database. Throws SqlError on bad SQL. */
export function runQuery(database: SqlDatabase, sql: string): SqlResult {
  const selects = new Parser(tokenize(sql)).parseStatement();
  const results = selects.map((select) => runSelect(database, select));
  const first = results[0];
  if (!first) throw new SqlError('syntax error');
  // MySQL refuses a UNION whose arms have different widths — which is exactly how an attacker
  // works out the column count, one guess at a time.
  for (const result of results) {
    if (result.columns.length !== first.columns.length) {
      throw new SqlError('The used SELECT statements have a different number of columns');
    }
  }
  const rows = results.flatMap((result) => result.rows);
  return { columns: first.columns, rows };
}

/** The message a careless app leaks when it passes the driver error straight through. */
export function mysqlErrorText(error: SqlError): string {
  if (
    error.message.startsWith('Unknown column') ||
    error.message.includes("doesn't exist") ||
    error.message.startsWith('The used SELECT statements')
  ) {
    return error.message;
  }
  const near = error.near.slice(0, 32);
  return `You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near '${near}' at line 1`;
}
