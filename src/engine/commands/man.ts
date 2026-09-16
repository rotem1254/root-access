import { utf8Encode } from '../util/bytes';
import { parseOptions } from './args';
import { defineCommand } from './define';
import type { Command, CommandContext } from './types';
import { wrap } from './util';

const SECTION_TITLES: Readonly<Record<number, string>> = {
  1: 'User Commands',
  6: 'Games',
  8: 'System Administration',
};

/** Where the in-game manual says it was written. */
const FOOTER_DATE = 'March 2026';

function center(left: string, middle: string, right: string, width: number): string {
  const space = Math.max(2, width - left.length - middle.length - right.length);
  const leftPad = Math.floor(space / 2);
  return `${left}${' '.repeat(leftPad)}${middle}${' '.repeat(space - leftPad)}${right}`;
}

/** Keeps indented lines and list items as written; reflows ordinary prose. */
function paragraph(text: string, width: number, indent: string): string[] {
  const out: string[] = [];
  let prose: string[] = [];
  const flush = (): void => {
    if (prose.length > 0) out.push(...wrap(prose.join(' '), width).map((l) => `${indent}${l}`));
    prose = [];
  };
  for (const line of text.split('\n')) {
    if (/^\s|^[-*•]/.test(line)) {
      flush();
      out.push(`${indent}${line}`);
    } else {
      prose.push(line);
    }
  }
  flush();
  return out;
}

export function renderManPage(command: Command, columns: number, bold: boolean): string {
  const width = Math.max(50, Math.min(columns, 100));
  const b = (text: string): string => (bold ? `\x1b[1m${text}\x1b[22m` : text);
  const { man } = command;
  const title = `${command.name.toUpperCase()}(${man.section})`;
  const heading =
    command.kind === 'builtin' ? 'Bash Builtins' : (SECTION_TITLES[man.section] ?? '');
  const indent = '       ';
  const body = width - indent.length - 1;
  const lines: string[] = [center(title, heading, title, width), ''];

  lines.push(b('NAME'), `${indent}${command.name} - ${command.description}`, '');
  lines.push(b('SYNOPSIS'));
  for (const usage of command.usage) {
    const rest = usage.slice(command.name.length);
    lines.push(`${indent}${b(command.name)}${rest}`);
  }
  lines.push('', b('DESCRIPTION'));
  man.description.split('\n\n').forEach((block, index) => {
    if (index > 0) lines.push('');
    lines.push(...paragraph(block, body, indent));
  });
  if (man.options && man.options.length > 0) {
    lines.push('', b('OPTIONS'));
    for (const [flags, text] of man.options) {
      lines.push(`${indent}${b(flags)}`, ...paragraph(text, body - 7, `${indent}       `), '');
    }
    lines.pop();
  }
  if (man.examples && man.examples.length > 0) {
    lines.push('', b('EXAMPLES'));
    for (const [example, text] of man.examples) {
      lines.push(`${indent}${b(example)}`, ...paragraph(text, body - 7, `${indent}       `), '');
    }
    lines.pop();
  }
  if (man.seeAlso && man.seeAlso.length > 0) {
    lines.push('', b('SEE ALSO'), `${indent}${man.seeAlso.join(', ')}`);
  }
  lines.push('', center('ROOT_ACCESS', FOOTER_DATE, title, width), '');
  return lines.join('\n');
}

function apropos(ctx: CommandContext, keyword: string): number {
  const needle = keyword.toLowerCase();
  const matches = ctx.shell.commands
    .all()
    .filter((c) => c.name.includes(needle) || c.description.toLowerCase().includes(needle));
  if (matches.length === 0) {
    ctx.stdout(`${keyword}: nothing appropriate.\n`);
    return 16;
  }
  for (const command of matches) {
    const label = `${command.name} (${command.man.section})`;
    ctx.stdout(utf8Encode(`${label.padEnd(20)} - ${command.description}\n`));
  }
  return 0;
}

export const man = defineCommand({
  name: 'man',
  kind: 'binary',
  description: 'an interface to the system reference manuals',
  usage: ['[SECTION] PAGE...', '-k KEYWORD'],
  about:
    'man shows the manual page for a command: what it does, its options, and examples.\nIn ROOT_ACCESS every command, including the game commands, has a page.',
  options: [['-k, --apropos', 'search the short descriptions for KEYWORD']],
  details:
    'Pages are printed directly instead of opening a pager. Scroll the terminal to read long pages, or pipe them: man ls | grep -- -a',
  examples: [
    ['man ls', 'read the manual page for ls'],
    ['man -k permission', 'find commands related to permissions'],
  ],
  seeAlso: ['help(1)', 'apropos(1)'],
  run: async (ctx) => {
    const outcome = parseOptions(ctx.name, ctx.args, [{ short: 'k', long: 'apropos' }]);
    if (!outcome.ok) {
      ctx.stderr(outcome.message);
      return 2;
    }
    const pages = [...outcome.options.operands];
    if (outcome.options.has('apropos')) {
      const keyword = pages[0];
      if (keyword === undefined) {
        ctx.stderr('apropos what?\n');
        return 1;
      }
      return apropos(ctx, keyword);
    }
    let section: number | null = null;
    if (pages.length > 1 && /^[1-9]$/.test(pages[0] ?? '')) section = Number(pages.shift());
    if (pages.length === 0) {
      ctx.stderr("What manual page do you want?\nFor example, try 'man man'.\n");
      return 1;
    }
    let status = 0;
    pages.forEach((page, index) => {
      const command = ctx.shell.commands.get(page);
      if (!command || (section !== null && command.man.section !== section)) {
        ctx.stderr(
          section === null
            ? `No manual entry for ${page}\n`
            : `No manual entry for ${page} in section ${section}\n`,
        );
        status = 16;
        return;
      }
      if (index > 0) ctx.stdout('\n');
      ctx.stdout(utf8Encode(renderManPage(command, ctx.tty.columns, ctx.tty.stdoutIsTTY)));
    });
    return status;
  },
});
