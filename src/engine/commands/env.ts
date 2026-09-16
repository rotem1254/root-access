import { Environment } from '../shell/Environment';
import { parseOptions } from './args';
import { defineCommand } from './define';
import { findInPath, localeQuote } from './util';

export const env = defineCommand({
  name: 'env',
  kind: 'binary',
  description: 'run a program in a modified environment',
  usage: ['[OPTION]... [-] [NAME=VALUE]... [COMMAND [ARG]...]'],
  about:
    'Set each NAME to VALUE in the environment and run COMMAND.\nWith no COMMAND, print the resulting environment.',
  options: [
    ['-i, --ignore-environment', 'start with an empty environment'],
    ['-u, --unset=NAME', 'remove variable from the environment'],
  ],
  examples: [
    ['env', 'list exported environment variables'],
    ['env | grep PATH', 'find one variable'],
    ['env -i PATH=/usr/bin printenv', 'run a command with a minimal environment'],
  ],
  seeAlso: ['export(1)'],
  run: async (ctx) => {
    const outcome = parseOptions(
      ctx.name,
      ctx.args,
      [
        { short: 'i', long: 'ignore-environment' },
        { short: 'u', long: 'unset', arg: 'required' },
      ],
      { stopAtOperand: true, unsupported: ['0', 'null', 'S', 'split-string', 'C', 'chdir'] },
    );
    if (!outcome.ok) {
      ctx.stderr(outcome.message);
      return 125;
    }
    const { options } = outcome;
    const operands = [...options.operands];
    let ignore = options.has('ignore-environment');
    if (operands[0] === '-') {
      ignore = true;
      operands.shift();
    }
    const environment = new Environment(ctx.env.cwd);
    if (!ignore) for (const [name, value] of ctx.env.exported()) environment.export(name, value);
    for (const name of options.values('unset')) environment.unset(name);
    while (operands.length > 0 && /^[^=]+=/.test(operands[0] ?? '')) {
      const assignment = operands.shift() ?? '';
      const eq = assignment.indexOf('=');
      environment.export(assignment.slice(0, eq), assignment.slice(eq + 1));
    }

    const [command, ...args] = operands;
    if (command === undefined) {
      for (const [name, value] of environment.exported()) ctx.stdout(`${name}=${value}\n`);
      if (!ignore) ctx.stdout('_=/usr/bin/env\n');
      return 0;
    }
    const path = findInPath(ctx, command, environment.get('PATH') ?? '');
    if (path === null) {
      ctx.stderr(`env: ${localeQuote(command)}: No such file or directory\n`);
      return 127;
    }
    return ctx.shell.runAs(
      ctx.user,
      path,
      [command, ...args],
      {
        stdin: ctx.stdin.isTTY ? null : ((await ctx.stdin.readAll()) ?? ''),
        stdout: (chunk) => ctx.stdout(chunk),
        stderr: (chunk) => ctx.stderr(chunk),
        stdoutIsTTY: ctx.tty.stdoutIsTTY,
      },
      environment,
    );
  },
});
