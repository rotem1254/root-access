import { defineCommand } from './define';
import { isIdentifier } from './util';

const USAGE = 'export [-fn] [name[=value] ...] or export -p';

const escapeValue = (value: string): string => value.replace(/[\\"$`]/g, '\\$&');

export const exportCommand = defineCommand({
  name: 'export',
  kind: 'builtin',
  description: 'Set export attribute for shell variables.',
  usage: ['[-n] [name[=value] ...] or export -p'],
  about:
    'Marks each NAME for automatic export to the environment of subsequently\nexecuted commands. If VALUE is supplied, assign VALUE before exporting.',
  options: [
    ['-n', 'remove the export property from each NAME'],
    ['-p', 'display a list of all exported variables'],
  ],
  details:
    'Exported variables are visible to programs you run (see `env`); plain shell variables are not.',
  examples: [
    ['export EDITOR=nano', 'set and export a variable'],
    ['export PATH="$HOME/bin:$PATH"', 'add a directory to the command search path'],
    ['export -p', 'list exported variables'],
  ],
  seeAlso: ['env(1)', 'unset(1)'],
  run: async (ctx) => {
    const args = [...ctx.args];
    let unexport = false;
    while (args.length > 0 && (args[0] ?? '').startsWith('-') && args[0] !== '-') {
      const option = args.shift() ?? '';
      if (option === '--') break;
      for (const flag of option.slice(1)) {
        if (flag === 'n') unexport = true;
        else if (flag !== 'p') {
          ctx.stderr(`bash: export: -${flag}: invalid option\nexport: usage: ${USAGE}\n`);
          return 2;
        }
      }
    }
    if (args.length === 0) {
      const names = new Set([
        ...ctx.env.exported().map(([name]) => name),
        ...ctx.env.pendingExports,
      ]);
      for (const name of [...names].sort()) {
        const value = ctx.env.get(name);
        ctx.stdout(
          value === undefined
            ? `declare -x ${name}\n`
            : `declare -x ${name}="${escapeValue(value)}"\n`,
        );
      }
      return 0;
    }
    let status = 0;
    for (const arg of args) {
      const eq = arg.indexOf('=');
      const name = eq < 0 ? arg : arg.slice(0, eq);
      if (!isIdentifier(name)) {
        ctx.stderr(`bash: export: \`${arg}': not a valid identifier\n`);
        status = 1;
        continue;
      }
      if (unexport) {
        if (eq >= 0) ctx.env.set(name, arg.slice(eq + 1));
        ctx.env.unexport(name);
      } else if (eq >= 0) {
        ctx.env.export(name, arg.slice(eq + 1));
      } else {
        ctx.env.export(name);
      }
    }
    return status;
  },
});
