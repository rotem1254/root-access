import { describe, expect, it } from 'vitest';
import type { CommandList, SimpleCommand, Word } from '../../../src/engine/shell/ast';
import { lex } from '../../../src/engine/shell/Lexer';
import { parse } from '../../../src/engine/shell/Parser';

/** Renders a word as literal text, marking quoted text with «», params with $, tildes with ~. */
function show(word: Word): string {
  return word.parts
    .map((part) => {
      if (part.kind === 'text') return part.quoted ? `«${part.value}»` : part.value;
      if (part.kind === 'param') return part.quoted ? `«$${part.name}»` : `$${part.name}`;
      return `~${part.user}`;
    })
    .join('');
}

function ok(input: string): CommandList {
  const result = parse(input);
  if (!result.ok) throw new Error(`parse failed: ${JSON.stringify(result)}`);
  return result.list;
}

function command(input: string, item = 0, index = 0): SimpleCommand {
  const cmd = ok(input).items[item]?.pipeline.commands[index];
  if (!cmd) throw new Error('no such command');
  return cmd;
}

const words = (input: string): string[] => command(input).words.map(show);

describe('lexer: words and quoting', () => {
  it('splits on blanks', () => {
    expect(words('ls   -la\t/home')).toEqual(['ls', '-la', '/home']);
  });

  it('keeps single-quoted text literal', () => {
    expect(words("echo 'a  $HOME \\n'")).toEqual(['echo', '«a  $HOME \\n»']);
  });

  it('expands parameters inside double quotes but not special characters', () => {
    expect(words('echo "hi $USER, it\'s *"')).toEqual(['echo', "«hi »«$USER»«, it's *»"]);
  });

  it('handles backslash escapes outside and inside double quotes', () => {
    expect(words('echo a\\ b \\$HOME')).toEqual(['echo', 'a« »b', '«$»HOME']);
    expect(words('echo "\\$x \\"q\\" \\\\ \\n"')).toEqual(['echo', '«$x "q" \\ \\n»']);
  });

  it('joins adjacent quoted and unquoted pieces into one word', () => {
    expect(words(`echo pre'fix'"$HOME"post`)).toEqual(['echo', 'pre«fix»«$HOME»post']);
  });

  it('keeps empty quoted words', () => {
    expect(words(`printf "" ''`)).toEqual(['printf', '«»', '«»']);
  });

  it('recognizes $NAME, ${NAME} and special parameters', () => {
    expect(words('echo $HOME${USER}x $? $$ $1 $#')).toEqual([
      'echo',
      '$HOME$USERx',
      '$?',
      '$$',
      '$1',
      '$#',
    ]);
    expect(words('echo $ cost$')).toEqual(['echo', '$', 'cost$']);
  });

  it("supports $'...' C escapes", () => {
    expect(words("echo $'a\\tb\\x41\\101\\n\\q'")).toEqual(['echo', '«a\tbAA\n\\q»']);
  });

  it('treats $"..." like double quotes', () => {
    expect(words('echo $"hi"')).toEqual(['echo', '«hi»']);
  });

  it('recognizes tildes only where bash expands them', () => {
    expect(words('ls ~ ~/docs ~admin/x a~b "~" ~user"x"')).toEqual([
      'ls',
      '~',
      '~/docs',
      '~admin/x',
      'a~b',
      '«~»',
      '~user«x»',
    ]);
    expect(command('PATH=~/bin ls').assignments.map((a) => show(a.value))).toEqual(['~/bin']);
  });

  it('keeps FLAG braces literal', () => {
    expect(words('submit FLAG{h1dd3n_f1l3s}')).toEqual(['submit', 'FLAG{h1dd3n_f1l3s}']);
  });

  it('ignores comments at the start of a word only', () => {
    expect(words('echo a#b # comment')).toEqual(['echo', 'a#b']);
    expect(ok('# just a comment').items).toEqual([]);
  });

  it('continues lines after a backslash-newline', () => {
    expect(words('echo one \\\ntwo')).toEqual(['echo', 'one', 'two']);
    expect(words('echo "a\\\nb"')).toEqual(['echo', '«ab»']);
  });
});

describe('lexer: operators and descriptors', () => {
  it('tokenizes operators, longest first', () => {
    const result = lex('a|b||c&&d;e>f>>g<h&>i&>>j 2>&1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ops = result.tokens
      .filter((t) => t.type !== 'word')
      .map((t) => (t.type === 'op' ? t.op : `io${t.fd}`));
    expect(ops).toEqual(['|', '||', '&&', ';', '>', '>>', '<', '&>', '&>>', 'io2', '>&']);
  });

  it('only treats digits as a descriptor right before < or >', () => {
    expect(words('echo 2 >out')).toEqual(['echo', '2']);
    expect(words('echo a2>out')).toEqual(['echo', 'a2']);
    expect(command('echo 2>out').redirects).toHaveLength(1);
  });
});

describe('parser: lists and pipelines', () => {
  it('builds pipelines and lists with their operators', () => {
    const list = ok('cat auth.log | grep Failed | wc -l && echo done || echo fail; ls');
    expect(list.items.map((item) => [item.pipeline.commands.length, item.next])).toEqual([
      [3, '&&'],
      [1, '||'],
      [1, ';'],
      [1, null],
    ]);
  });

  it('accepts a trailing semicolon and newlines as separators', () => {
    expect(ok('ls;').items.map((i) => i.next)).toEqual([';']);
    expect(ok('ls\npwd\n').items).toHaveLength(2);
  });

  it('lets pipelines and lists continue on the next line', () => {
    expect(ok('ls |\n wc -l').items[0]?.pipeline.commands).toHaveLength(2);
    expect(ok('true &&\n\n echo ok').items).toHaveLength(2);
  });

  it('turns |& into 2>&1 on the left command', () => {
    expect(command('make |& less').redirects).toEqual([{ kind: 'dup', fd: 2, to: 1 }]);
  });
});

describe('parser: assignments and redirects', () => {
  it('parses leading assignments', () => {
    const cmd = command('A=1 B="x y" env');
    expect(cmd.assignments.map((a) => [a.name, show(a.value)])).toEqual([
      ['A', '1'],
      ['B', '«x y»'],
    ]);
    expect(cmd.words.map(show)).toEqual(['env']);
    expect(command('echo A=1').assignments).toEqual([]);
    expect(command('X=').assignments[0]?.value.parts).toEqual([]);
    expect(command('"A"=1 cmd').assignments).toEqual([]);
  });

  it('parses file, append, input, both and dup redirects in order', () => {
    const cmd = command('grep x < in.txt > out 2>> err 2>&1 &> all &>> more >&2');
    expect(
      cmd.redirects.map((r) =>
        r.kind === 'dup'
          ? `${r.fd}>&${r.to}`
          : r.kind === 'both'
            ? `&${r.append ? '>>' : '>'}${r.target.raw}`
            : `${r.fd}${r.op}${r.target.raw}`,
      ),
    ).toEqual(['0<in.txt', '1>out', '2>>err', '2>&1', '&>all', '&>>more', '1>&2']);
  });

  it('treats >| as > and >&file as &>', () => {
    expect(command('echo >| f').redirects[0]).toMatchObject({ kind: 'file', op: '>', fd: 1 });
    expect(command('echo >&log').redirects[0]).toMatchObject({ kind: 'both', append: false });
  });

  it('allows redirects before the command name and alone', () => {
    expect(command('>out echo hi').words.map(show)).toEqual(['echo', 'hi']);
    expect(command('> empty.txt').redirects).toHaveLength(1);
  });
});

describe('parser: errors', () => {
  it.each([
    ['| ls', "bash: syntax error near unexpected token `|'"],
    ['ls | | wc', "bash: syntax error near unexpected token `|'"],
    ['; ls', "bash: syntax error near unexpected token `;'"],
    ['ls ;; pwd', "bash: syntax error near unexpected token `;;'"],
    ['echo >', "bash: syntax error near unexpected token `newline'"],
    ['echo > | x', "bash: syntax error near unexpected token `|'"],
    ['ls )', "bash: syntax error near unexpected token `)'"],
    ['echo hi 3>&file', 'bash: file: ambiguous redirect'],
    [
      'echo ${HOME:x}',
      'bash: parameter expansion with operators like ${VAR:-default} is not supported in this simulation',
    ],
    ['echo ${1abc}', 'bash: ${1abc}: bad substitution'],
    ['echo $(whoami)', 'bash: command substitution $(...) is not supported in this simulation'],
    ['echo `whoami`', 'bash: command substitution `...` is not supported in this simulation'],
    ['echo "`id`"', 'bash: command substitution `...` is not supported in this simulation'],
    ['echo $((1+2))', 'bash: arithmetic expansion $((...)) is not supported in this simulation'],
    ['echo ${#HOME}', 'bash: ${#VAR} (string length) is not supported in this simulation'],
    ['sleep 5 &', 'bash: running jobs in the background (&) is not supported in this simulation'],
    [
      '(cd /tmp)',
      'bash: grouping commands in a subshell ( ... ) is not supported in this simulation',
    ],
    ['cat <<EOF', 'bash: here-documents (<<) is not supported in this simulation'],
    ['cat <<< hi', 'bash: here-strings (<<<) is not supported in this simulation'],
    ['diff <(ls) x', 'bash: process substitution <(...) is not supported in this simulation'],
    ['cat <&3', 'bash: duplicating input descriptors (<&) is not supported in this simulation'],
    ['echo x >&-', 'bash: closing file descriptors (>&-) is not supported in this simulation'],
    ['echo (', "bash: syntax error near unexpected token `('"],
  ])('%j', (input, error) => {
    expect(parse(input)).toEqual({ ok: false, incomplete: false, error });
  });

  it.each([
    "echo 'open",
    'echo "open',
    'echo trailing\\',
    'ls |',
    'ls &&',
    'ls ||\n',
    'echo ${HOME',
    "echo $'x",
    'echo "\\',
  ])('asks for more input after %j', (input) => {
    expect(parse(input)).toEqual({ ok: false, incomplete: true });
  });

  it('parses empty input to an empty list', () => {
    expect(ok('   ').items).toEqual([]);
    expect(ok('\n\n').items).toEqual([]);
  });
});
