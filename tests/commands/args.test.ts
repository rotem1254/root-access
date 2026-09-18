import { describe, expect, it } from 'vitest';
import { type OptionSpec, parseOptions } from '../../src/engine/commands/args';
import { defineCommand } from '../../src/engine/commands/define';
import { CommandRegistry } from '../../src/engine/commands/types';

const SPECS: OptionSpec[] = [
  { short: 'a', long: 'all' },
  { short: 'A', long: 'almost-all' },
  { short: 'l' },
  { short: 'n', long: 'lines', arg: 'required' },
  { long: 'color', arg: 'optional' },
  { short: 'h', long: 'human-readable', key: 'human' },
];

function parse(argv: string[], config = {}) {
  const outcome = parseOptions('ls', argv, SPECS, config);
  if (!outcome.ok) throw new Error(outcome.message);
  return outcome.options;
}

function error(argv: string[], config = {}): string {
  const outcome = parseOptions('ls', argv, SPECS, config);
  if (outcome.ok) throw new Error('expected an error');
  return outcome.message;
}

describe('parseOptions', () => {
  it('parses clustered short flags and permutes operands', () => {
    const options = parse(['-la', '/tmp', '-h', 'x']);
    expect(options.has('all')).toBe(true);
    expect(options.has('l')).toBe(true);
    expect(options.has('human')).toBe(true);
    expect(options.operands).toEqual(['/tmp', 'x']);
  });

  it('reads option values in every accepted form', () => {
    expect(parse(['-n', '5']).value('lines')).toBe('5');
    expect(parse(['-n5']).value('lines')).toBe('5');
    expect(parse(['-ln5']).value('lines')).toBe('5');
    expect(parse(['--lines', '7']).value('lines')).toBe('7');
    expect(parse(['--lines=9', '--lines=10']).values('lines')).toEqual(['9', '10']);
    expect(parse(['--lines=9', '--lines=10']).value('lines')).toBe('10');
    expect(parse(['--color']).has('color')).toBe(true);
    expect(parse(['--color']).value('color')).toBeUndefined();
    expect(parse(['--color=never']).value('color')).toBe('never');
  });

  it('accepts unambiguous long prefixes', () => {
    expect(parse(['--human']).has('human')).toBe(true);
    expect(error(['--al'])).toBe(
      "ls: option '--al' is ambiguous; possibilities: '--all' '--almost-all'\nTry 'ls --help' for more information.\n",
    );
  });

  it('stops at -- and treats - as an operand', () => {
    expect(parse(['--', '-la']).operands).toEqual(['-la']);
    expect(parse(['-', '-a']).operands).toEqual(['-']);
  });

  it('records --help', () => {
    expect(parse(['-a', '--help']).has('help')).toBe(true);
  });

  it('supports -NUM shortcuts and stopping at the first operand', () => {
    expect(parseOptions('head', ['-5', 'f'], [], { numericKey: 'lines' })).toMatchObject({
      ok: true,
    });
    const outcome = parseOptions('head', ['-5'], [], { numericKey: 'lines' });
    expect(outcome.ok && outcome.options.value('lines')).toBe('5');
    expect(parse(['cmd', '-a'], { stopAtOperand: true }).operands).toEqual(['cmd', '-a']);
  });

  it('prints glibc-style errors', () => {
    expect(error(['-z'])).toBe(
      "ls: invalid option -- 'z'\nTry 'ls --help' for more information.\n",
    );
    expect(error(['--bogus'])).toBe(
      "ls: unrecognized option '--bogus'\nTry 'ls --help' for more information.\n",
    );
    expect(error(['-n'])).toBe(
      "ls: option requires an argument -- 'n'\nTry 'ls --help' for more information.\n",
    );
    expect(error(['--lines'])).toBe(
      "ls: option '--lines' requires an argument\nTry 'ls --help' for more information.\n",
    );
    expect(error(['--all=yes'])).toBe(
      "ls: option '--all' doesn't allow an argument\nTry 'ls --help' for more information.\n",
    );
  });

  it('is honest about real options the simulation lacks', () => {
    expect(error(['-R'], { unsupported: ['R'] })).toBe(
      "ls: option '-R' is not supported in this simulation\nTry 'ls --help' for more information.\n",
    );
    expect(error(['--recursive'], { unsupported: ['recursive'] })).toContain(
      "option '--recursive' is not supported",
    );
  });
});

describe('defineCommand and the registry', () => {
  const noop = async (): Promise<number> => 0;

  it('formats GNU --help text with aligned options', () => {
    const command = defineCommand({
      name: 'demo',
      kind: 'binary',
      description: 'demonstrate help',
      usage: ['[OPTION]... [FILE]...', '-x'],
      about: 'Demonstrate things.',
      options: [
        ['-a, --all', 'show all'],
        ['    --a-very-long-option-name=WHEN', 'wraps to the next line'],
      ],
      examples: [['demo -a', 'show everything']],
      run: noop,
    });
    expect(command.help).toBe(
      [
        'Usage: demo [OPTION]... [FILE]...',
        '  or:  demo -x',
        'Demonstrate things.',
        '',
        '  -a, --all                   show all',
        '      --a-very-long-option-name=WHEN',
        '                              wraps to the next line',
        '      --help                  display this help and exit',
        '',
        'Examples:',
        '  demo -a',
        '      show everything',
        '',
      ].join('\n'),
    );
    expect(command.usage).toEqual(['demo [OPTION]... [FILE]...', 'demo -x']);
    expect(command.man).toMatchObject({ section: 1, description: 'Demonstrate things.' });
  });

  it('formats builtin help like bash', () => {
    const command = defineCommand({
      name: 'cd',
      kind: 'builtin',
      description: 'Change the shell working directory.',
      usage: ['[dir]'],
      about: 'Change the current directory to DIR.\nThe default DIR is HOME.',
      options: [['-P', 'use the physical directory structure']],
      details: 'More detail for man.',
      handlesHelp: true,
      run: noop,
    });
    expect(command.help).toBe(
      'cd: cd [dir]\n    Change the shell working directory.\n    \n    Change the current directory to DIR.\n    The default DIR is HOME.\n    \n    Options:\n      -P\tuse the physical directory structure\n',
    );
    expect(command.man.description).toBe(
      'Change the current directory to DIR.\nThe default DIR is HOME.\n\nMore detail for man.',
    );
  });

  it('puts game commands in man section 6 and keeps setuid/help flags', () => {
    const game = defineCommand({
      name: 'hint',
      kind: 'game',
      description: 'd',
      usage: [],
      about: 'a',
      run: noop,
    });
    expect(game.man.section).toBe(6);
    const sudo = defineCommand({
      name: 'sudo',
      kind: 'binary',
      setuid: true,
      section: 8,
      description: 'd',
      usage: [],
      about: 'a',
      handlesHelp: false,
      run: noop,
    });
    expect(sudo).toMatchObject({ setuid: true, handlesHelp: false, man: { section: 8 } });
  });

  it('registers commands, rejects duplicates and lists binaries to install', () => {
    const a = defineCommand({
      name: 'zeta',
      kind: 'binary',
      description: 'z',
      usage: [],
      about: 'z',
      run: noop,
    });
    const b = defineCommand({
      name: 'alpha',
      kind: 'builtin',
      description: 'a',
      usage: [],
      about: 'a',
      run: noop,
    });
    const c = defineCommand({
      name: 'su',
      kind: 'binary',
      setuid: true,
      description: 's',
      usage: [],
      about: 's',
      run: noop,
    });
    const registry = new CommandRegistry().register(a, b, c);
    expect(registry.all().map((command) => command.name)).toEqual(['alpha', 'su', 'zeta']);
    expect(registry.binaries()).toEqual([
      { name: 'su', description: 's', setuid: true },
      { name: 'zeta', description: 'z' },
    ]);
    expect(() => registry.register(a)).toThrow('duplicate command: zeta');
  });
});
