import { describe, expect, it } from 'vitest';
import { mysqlErrorText, runQuery, SqlError, type SqlDatabase } from '../../../src/engine/web/sql';

const DB: SqlDatabase = [
  {
    name: 'customers',
    columns: ['id', 'name', 'email', 'plan'],
    rows: [
      { id: 1, name: 'Acme Ltd', email: 'ops@acme.example', plan: 'growth' },
      { id: 2, name: 'Borealis', email: 'it@borealis.example', plan: 'enterprise' },
      { id: 3, name: "O'Hara Foods", email: 'admin@ohara.example', plan: 'starter' },
    ],
  },
  {
    name: 'staff',
    columns: ['id', 'username', 'token'],
    rows: [
      { id: 1, username: 'mreyes', token: 'tok-abc' },
      { id: 2, username: 'root', token: 'tok-root' },
    ],
  },
];

/** How a vulnerable app builds its query: straight concatenation of user input. */
const vulnerable = (input: string): string =>
  `SELECT id, name, email FROM customers WHERE name = '${input}'`;

describe('runQuery basics', () => {
  it('selects columns, all columns and filters', () => {
    expect(runQuery(DB, 'SELECT name FROM customers WHERE id = 2').rows).toEqual([['Borealis']]);
    expect(runQuery(DB, 'SELECT * FROM customers').rows).toHaveLength(3);
    expect(runQuery(DB, 'SELECT * FROM customers').columns).toEqual([
      'id',
      'name',
      'email',
      'plan',
    ]);
    expect(runQuery(DB, "SELECT id FROM customers WHERE plan = 'starter'").rows).toEqual([[3]]);
  });

  it('handles AND, OR, NOT, parentheses and comparisons', () => {
    expect(runQuery(DB, 'SELECT id FROM customers WHERE id > 1 AND id < 3').rows).toEqual([[2]]);
    expect(runQuery(DB, 'SELECT id FROM customers WHERE id = 1 OR id = 3').rows).toEqual([
      [1],
      [3],
    ]);
    expect(runQuery(DB, 'SELECT id FROM customers WHERE NOT id = 1').rows).toEqual([[2], [3]]);
    expect(
      runQuery(DB, 'SELECT id FROM customers WHERE (id = 1 OR id = 2) AND id > 1').rows,
    ).toEqual([[2]]);
    expect(runQuery(DB, 'SELECT id FROM customers WHERE id <> 1').rows).toEqual([[2], [3]]);
  });

  it('understands escaped quotes and comments', () => {
    expect(runQuery(DB, "SELECT id FROM customers WHERE name = 'O''Hara Foods'").rows).toEqual([
      [3],
    ]);
    expect(
      runQuery(DB, 'SELECT id FROM customers WHERE id = 1 -- and the rest is ignored').rows,
    ).toEqual([[1]]);
    expect(runQuery(DB, 'SELECT id FROM customers WHERE id = 1 # comment').rows).toEqual([[1]]);
  });
});

describe('injection works because the query text really changes', () => {
  it('a normal search returns one row', () => {
    const result = runQuery(DB, vulnerable('Borealis'));
    expect(result.rows).toEqual([[2, 'Borealis', 'it@borealis.example']]);
  });

  it("' OR '1'='1 returns every row", () => {
    const result = runQuery(DB, vulnerable("' OR '1'='1"));
    expect(result.rows).toHaveLength(3);
  });

  it('an OR with a comment also works', () => {
    expect(runQuery(DB, vulnerable("' OR 1=1 -- ")).rows).toHaveLength(3);
  });

  it('a UNION reaches another table entirely', () => {
    const payload = "' UNION SELECT id, username, token FROM staff -- ";
    const result = runQuery(DB, vulnerable(payload));
    expect(result.rows).toEqual([
      [1, 'mreyes', 'tok-abc'],
      [2, 'root', 'tok-root'],
    ]);
  });

  it('a lone quote produces a real syntax error, which is how you find the flaw', () => {
    expect(() => runQuery(DB, vulnerable("'"))).toThrow(SqlError);
    try {
      runQuery(DB, vulnerable("'"));
    } catch (error) {
      expect(mysqlErrorText(error as SqlError)).toContain('You have an error in your SQL syntax');
    }
  });

  it('escaping the input defeats the same payload', () => {
    // What the fix looks like: the quote is escaped, so the payload becomes ordinary text.
    const safe = (input: string): string =>
      `SELECT id, name FROM customers WHERE name = '${input.replace(/'/g, "''")}'`;
    expect(runQuery(DB, safe("' OR '1'='1")).rows).toEqual([]);
  });
});

describe('errors', () => {
  it('reports unknown tables and columns the way MySQL does', () => {
    expect(() => runQuery(DB, 'SELECT * FROM nope')).toThrow(/doesn't exist/);
    expect(() => runQuery(DB, 'SELECT * FROM customers WHERE nope = 1')).toThrow(/Unknown column/);
    try {
      runQuery(DB, 'SELECT * FROM customers WHERE nope = 1');
    } catch (error) {
      expect(mysqlErrorText(error as SqlError)).toContain("Unknown column 'nope'");
    }
  });

  it('rejects malformed statements', () => {
    expect(() => runQuery(DB, 'SELEC * FROM customers')).toThrow(SqlError);
    expect(() => runQuery(DB, 'SELECT * FROM')).toThrow(SqlError);
    expect(() => runQuery(DB, 'SELECT * FROM customers WHERE (id = 1')).toThrow(SqlError);
    expect(() => runQuery(DB, 'SELECT * FROM customers extra')).toThrow(SqlError);
    expect(() => runQuery(DB, 'SELECT * FROM customers WHERE id = @')).toThrow(SqlError);
    expect(() => runQuery(DB, '')).toThrow(SqlError);
  });
});

describe('UNION column count', () => {
  it('refuses arms of different widths, the way MySQL does', () => {
    const three = "SELECT id, name, email FROM customers WHERE name = ''";
    expect(() => runQuery(DB, `${three} UNION SELECT id FROM staff -- `)).toThrow(
      /different number of columns/,
    );
    expect(() => runQuery(DB, `${three} UNION SELECT id, username FROM staff -- `)).toThrow(
      /different number of columns/,
    );
    // The right width works, which is how the column count is discovered.
    expect(
      runQuery(DB, `${three} UNION SELECT id, username, token FROM staff -- `).rows,
    ).toHaveLength(2);
  });
});
