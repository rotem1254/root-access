import type { Command, CommandContext, CommandKind, ManPage } from './types';

export interface CommandSpec {
  name: string;
  kind: CommandKind;
  setuid?: boolean;
  description: string;
  /** SYNOPSIS lines without the command name, e.g. `[OPTION]... [FILE]...`. */
  usage: readonly string[];
  /** The paragraph under "Usage:" in --help, and the start of DESCRIPTION. */
  about: string;
  options?: readonly (readonly [string, string])[];
  examples?: readonly (readonly [string, string])[];
  seeAlso?: readonly string[];
  /** Extra DESCRIPTION paragraphs for the man page only. */
  details?: string;
  handlesHelp?: boolean;
  /** Man page section. Defaults to 6 for game commands and 1 otherwise. */
  section?: 1 | 6 | 8;
  run(ctx: CommandContext): Promise<number>;
}

function optionTable(options: readonly (readonly [string, string])[], indent: string): string {
  return options
    .map(([flags, text]) => {
      const left = `${indent}${flags}`;
      return left.length < 30 ? `${left.padEnd(30)}${text}` : `${left}\n${' '.repeat(30)}${text}`;
    })
    .join('\n');
}

function gnuHelp(spec: CommandSpec): string {
  const [first, ...more] = spec.usage;
  const lines = [`Usage: ${spec.name} ${first ?? ''}`.trimEnd()];
  for (const line of more) lines.push(`  or:  ${spec.name} ${line}`.trimEnd());
  let text = `${lines.join('\n')}\n${spec.about}\n`;
  const options = [...(spec.options ?? []), ['    --help', 'display this help and exit'] as const];
  text += `\n${optionTable(options, '  ')}\n`;
  if (spec.examples && spec.examples.length > 0) {
    text += `\nExamples:\n${spec.examples.map(([cmd, what]) => `  ${cmd}\n      ${what}`).join('\n')}\n`;
  }
  return text;
}

function builtinHelp(spec: CommandSpec): string {
  const indent = (text: string): string =>
    text
      .split('\n')
      .map((line) => (line === '' ? '    ' : `    ${line}`))
      .join('\n');
  let text = `${spec.name}: ${spec.name} ${spec.usage[0] ?? ''}`.trimEnd();
  text += `\n${indent(spec.description)}\n    \n${indent(spec.about)}\n`;
  if (spec.options && spec.options.length > 0) {
    text += `    \n    Options:\n${spec.options.map(([f, t]) => `      ${f}\t${t}`).join('\n')}\n`;
  }
  return text;
}

export function defineCommand(spec: CommandSpec): Command {
  const man: ManPage = {
    section: spec.section ?? (spec.kind === 'game' ? 6 : 1),
    description: spec.details ? `${spec.about}\n\n${spec.details}` : spec.about,
    ...(spec.options ? { options: spec.options } : {}),
    ...(spec.examples ? { examples: spec.examples } : {}),
    ...(spec.seeAlso ? { seeAlso: spec.seeAlso } : {}),
  };
  const command: Command = {
    name: spec.name,
    kind: spec.kind,
    description: spec.description,
    usage: spec.usage.map((line) => `${spec.name} ${line}`.trimEnd()),
    help: spec.kind === 'builtin' ? builtinHelp(spec) : gnuHelp(spec),
    man,
    run: (ctx) => spec.run(ctx),
  };
  if (spec.setuid) command.setuid = true;
  if (spec.handlesHelp === false) command.handlesHelp = false;
  return command;
}
