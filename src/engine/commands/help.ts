import { defineCommand } from './define';
import type { Command, CommandKind } from './types';
import { print } from './util';

const GROUPS: readonly (readonly [CommandKind, string])[] = [
  ['game', 'Game commands'],
  ['builtin', 'Shell builtins'],
  ['binary', 'Programs'],
];

function overview(commands: readonly Command[]): string {
  let text = 'ROOT_ACCESS: a simulated Ubuntu server running bash 5.2.\n';
  text += 'Commands work like they do on a real Linux system.\n';
  for (const [kind, title] of GROUPS) {
    const group = commands.filter((command) => command.kind === kind);
    if (group.length === 0) continue;
    text += `\n${title}:\n`;
    for (const command of group) text += `  ${command.name.padEnd(10)}  ${command.description}\n`;
  }
  text += '\nType `man NAME` or `NAME --help` to learn more about a command.\n';
  text +=
    'Keys: Tab completes, Up/Down browse history, Ctrl+C cancels, Ctrl+L clears the screen.\n';
  return text;
}

export const help = defineCommand({
  name: 'help',
  kind: 'builtin',
  description: 'Display information about commands.',
  usage: ['[pattern ...]'],
  about:
    'Without arguments, list the available commands. With PATTERN, show the\nhelp text for each matching command.',
  examples: [
    ['help', 'list every command'],
    ['help cd', 'show help for one command'],
  ],
  seeAlso: ['man(1)'],
  run: async (ctx) => {
    const commands = ctx.shell.commands.all();
    if (ctx.args.length === 0) {
      print(ctx, overview(commands));
      return 0;
    }
    let status = 0;
    for (const topic of ctx.args) {
      const command = ctx.shell.commands.get(topic);
      if (!command) {
        ctx.stderr(
          `bash: help: no help topics match \`${topic}'.  Try \`help help' or \`man -k ${topic}' or \`info ${topic}'.\n`,
        );
        status = 1;
        continue;
      }
      print(ctx, command.help);
    }
    return status;
  },
});
