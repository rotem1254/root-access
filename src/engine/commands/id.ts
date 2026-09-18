import { parseOptions } from './args';
import { defineCommand } from './define';
import { localeQuote } from './util';

export const id = defineCommand({
  name: 'id',
  kind: 'binary',
  description: 'print real and effective user and group IDs',
  usage: ['[OPTION]... [USER]...'],
  about:
    'Print user and group information for each specified USER,\nor (when USER omitted) for the current process.',
  options: [
    ['-g, --group', 'print only the effective group ID'],
    ['-G, --groups', 'print all group IDs'],
    ['-n, --name', 'print a name instead of a number, for -u,-g,-G'],
    ['-r, --real', 'print the real ID instead of the effective ID, with -u,-g,-G'],
    ['-u, --user', 'print only the effective user ID'],
  ],
  details:
    'Group membership decides which files you can read: a file owned by group adm with mode 0640 is readable by every member of adm.',
  examples: [
    ['id', 'show your uid, gid and groups'],
    ['id admin', 'show another account'],
    ['id -Gn', 'list your group names'],
  ],
  seeAlso: ['whoami(1)', 'groups(1)'],
  run: async (ctx) => {
    const outcome = parseOptions(ctx.name, ctx.args, [
      { short: 'g', long: 'group' },
      { short: 'G', long: 'groups' },
      { short: 'n', long: 'name' },
      { short: 'r', long: 'real' },
      { short: 'u', long: 'user' },
    ]);
    if (!outcome.ok) {
      ctx.stderr(outcome.message);
      return 1;
    }
    const { options } = outcome;
    const users = ctx.machine.users;
    const choices = ['user', 'group', 'groups'].filter((key) => options.has(key));
    if (choices.length > 1) {
      ctx.stderr('id: cannot print "only" of more than one choice\n');
      return 1;
    }
    if (choices.length === 0 && (options.has('name') || options.has('real'))) {
      ctx.stderr('id: cannot print only names or real IDs in default format\n');
      return 1;
    }
    const names = options.has('name');
    const groupLabel = (gid: number): string => (names ? users.groupLabel(gid) : String(gid));
    const targets = options.operands.length === 0 ? [null] : options.operands;
    let status = 0;
    for (const operand of targets) {
      const user =
        operand === null
          ? ctx.user
          : (users.byName(operand) ??
            (/^\d+$/.test(operand) ? users.byUid(Number(operand)) : undefined));
      if (!user) {
        ctx.stderr(`id: ${localeQuote(operand ?? '')}: no such user\n`);
        status = 1;
        continue;
      }
      const uid = user.uid;
      const euid = operand === null && !options.has('real') ? ctx.credentials.uid : uid;
      const groups = users.credentials(user).groups;
      if (options.has('user')) {
        ctx.stdout(`${names ? users.userLabel(euid) : euid}\n`);
      } else if (options.has('group')) {
        ctx.stdout(`${groupLabel(user.gid)}\n`);
      } else if (options.has('groups')) {
        ctx.stdout(`${groups.map(groupLabel).join(' ')}\n`);
      } else {
        const named = (idNumber: number, label: string | undefined): string =>
          label === undefined ? String(idNumber) : `${idNumber}(${label})`;
        let line = `uid=${named(uid, user.name)} gid=${named(user.gid, users.groupByGid(user.gid)?.name)}`;
        if (operand === null && ctx.credentials.uid !== uid) {
          line += ` euid=${named(ctx.credentials.uid, users.byUid(ctx.credentials.uid)?.name)}`;
        }
        line += ` groups=${groups.map((gid) => named(gid, users.groupByGid(gid)?.name)).join(',')}`;
        ctx.stdout(`${line}\n`);
      }
    }
    return status;
  },
});
