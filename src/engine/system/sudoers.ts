/** A sudoers rule: `who ALL=(runAs) [NOPASSWD:] commands`. */
export interface SudoRule {
  /** A user name, or `%group`. */
  who: string;
  /** Target user; `ALL` for any. Defaults to `root`. */
  runAs?: string;
  /** Absolute command paths (optionally with fixed arguments, `*` wildcards allowed), or `ALL`. */
  commands: 'ALL' | readonly string[];
  nopasswd?: boolean;
}

export const SECURE_PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin';

export const BASE_SUDO_RULES: readonly SudoRule[] = [
  { who: 'root', runAs: 'ALL', commands: 'ALL' },
  { who: '%sudo', runAs: 'ALL', commands: 'ALL' },
];

function appliesTo(rule: SudoRule, user: string, groups: readonly string[]): boolean {
  return rule.who.startsWith('%') ? groups.includes(rule.who.slice(1)) : rule.who === user;
}

export function rulesFor(
  rules: readonly SudoRule[],
  user: string,
  groups: readonly string[],
): SudoRule[] {
  return rules.filter((rule) => appliesTo(rule, user, groups));
}

function wildcard(pattern: string, text: string): boolean {
  const source = pattern
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${source}$`).test(text);
}

function commandMatches(spec: string, path: string, args: readonly string[]): boolean {
  const [specPath = '', ...specArgs] = spec.trim().split(/\s+/);
  if (!wildcard(specPath, path)) return false;
  if (specArgs.length === 0) return true;
  if (specArgs.length === 1 && specArgs[0] === '""') return args.length === 0;
  return wildcard(specArgs.join(' '), args.join(' '));
}

/** The first rule allowing `user` to run `path args` as `target`, if any. */
export function findSudoPermission(
  rules: readonly SudoRule[],
  user: string,
  groups: readonly string[],
  target: string,
  path: string,
  args: readonly string[],
): SudoRule | undefined {
  return rulesFor(rules, user, groups).find((rule) => {
    const runAs = rule.runAs ?? 'root';
    if (runAs !== 'ALL' && runAs !== target) return false;
    if (rule.commands === 'ALL') return true;
    return rule.commands.some((spec) => commandMatches(spec, path, args));
  });
}

/** `(root) NOPASSWD: /usr/bin/find` as printed by `sudo -l`. */
export function formatSudoRule(rule: SudoRule): string {
  const runAs = rule.runAs ?? 'root';
  const target = runAs === 'ALL' ? '(ALL : ALL)' : `(${runAs})`;
  const tag = rule.nopasswd ? 'NOPASSWD: ' : '';
  const commands = rule.commands === 'ALL' ? 'ALL' : rule.commands.join(', ');
  return `${target} ${tag}${commands}`;
}

export function sudoersFile(rules: readonly SudoRule[]): string {
  const lines = rules.map((rule) => {
    const runAs = rule.runAs ?? 'root';
    const target = runAs === 'ALL' ? '(ALL:ALL)' : `(${runAs})`;
    const tag = rule.nopasswd ? 'NOPASSWD: ' : '';
    const commands = rule.commands === 'ALL' ? 'ALL' : rule.commands.join(', ');
    return `${rule.who}\tALL=${target} ${tag}${commands}`;
  });
  return [
    '#',
    "# This file MUST be edited with the 'visudo' command as root.",
    '#',
    'Defaults\tenv_reset',
    'Defaults\tmail_badpass',
    `Defaults\tsecure_path="${SECURE_PATH}"`,
    'Defaults\tuse_pty',
    '',
    '# User privilege specification',
    ...lines,
    '',
  ].join('\n');
}
