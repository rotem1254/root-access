/** GNU getopt_long-style option parsing with glibc's error messages. */

export interface OptionSpec {
  /** One letter: `a` for `-a`. */
  short?: string;
  /** Long name: `all` for `--all`. */
  long?: string;
  arg?: 'required' | 'optional';
  /** Result key. Defaults to the long name, then the short letter. */
  key?: string;
}

export interface ParsedOptions {
  /** Options in the order given, with values (`true` for flags). */
  readonly entries: readonly { key: string; value: string | true }[];
  readonly operands: readonly string[];
  has(key: string): boolean;
  /** The last value given for an option that takes an argument. */
  value(key: string): string | undefined;
  values(key: string): string[];
}

export type ParseOutcome = { ok: true; options: ParsedOptions } | { ok: false; message: string };

export interface ParseConfig {
  /** Real options this simulation does not implement (letters or long names). */
  unsupported?: readonly string[];
  /** Stop at the first operand instead of permuting (sudo, su -c, find expressions). */
  stopAtOperand?: boolean;
  /** Accept `-NUM` (as in `head -5`), stored under this key. */
  numericKey?: string;
}

export const tryHelp = (name: string): string => `Try '${name} --help' for more information.\n`;

export const unsupportedOption = (name: string, option: string): string =>
  `${name}: option '${option}' is not supported in this simulation\n${tryHelp(name)}`;

function makeParsed(
  entries: { key: string; value: string | true }[],
  operands: string[],
): ParsedOptions {
  return {
    entries,
    operands,
    has: (key) => entries.some((entry) => entry.key === key),
    value: (key) => {
      const found = entries.filter((entry) => entry.key === key && entry.value !== true);
      const last = found[found.length - 1];
      return last === undefined || last.value === true ? undefined : last.value;
    },
    values: (key) =>
      entries.flatMap((entry) => (entry.key === key && entry.value !== true ? [entry.value] : [])),
  };
}

const keyOf = (spec: OptionSpec): string => spec.key ?? spec.long ?? spec.short ?? '';

export function parseOptions(
  name: string,
  argv: readonly string[],
  specs: readonly OptionSpec[],
  config: ParseConfig = {},
): ParseOutcome {
  const entries: { key: string; value: string | true }[] = [];
  const operands: string[] = [];
  const fail = (message: string): ParseOutcome => ({ ok: false, message });
  let i = 0;

  while (i < argv.length) {
    const arg = argv[i] ?? '';
    if (arg === '--') {
      operands.push(...argv.slice(i + 1));
      break;
    }

    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      const longName = eq < 0 ? arg.slice(2) : arg.slice(2, eq);
      const inline = eq < 0 ? undefined : arg.slice(eq + 1);
      if (longName === 'help') {
        entries.push({ key: 'help', value: true });
        i += 1;
        continue;
      }
      let spec = specs.find((candidate) => candidate.long === longName);
      if (!spec) {
        const matches = specs.filter((candidate) => candidate.long?.startsWith(longName));
        if (matches.length > 1) {
          const list = matches.map((m) => ` '--${m.long ?? ''}'`).join('');
          return fail(
            `${name}: option '--${longName}' is ambiguous; possibilities:${list}\n${tryHelp(name)}`,
          );
        }
        spec = matches[0];
      }
      if (!spec) {
        if (config.unsupported?.includes(longName))
          return fail(unsupportedOption(name, `--${longName}`));
        return fail(`${name}: unrecognized option '${arg}'\n${tryHelp(name)}`);
      }
      const long = spec.long ?? longName;
      if (!spec.arg) {
        if (inline !== undefined) {
          return fail(`${name}: option '--${long}' doesn't allow an argument\n${tryHelp(name)}`);
        }
        entries.push({ key: keyOf(spec), value: true });
        i += 1;
      } else if (inline !== undefined) {
        entries.push({ key: keyOf(spec), value: inline });
        i += 1;
      } else if (spec.arg === 'optional') {
        entries.push({ key: keyOf(spec), value: true });
        i += 1;
      } else {
        const next = argv[i + 1];
        if (next === undefined) {
          return fail(`${name}: option '--${long}' requires an argument\n${tryHelp(name)}`);
        }
        entries.push({ key: keyOf(spec), value: next });
        i += 2;
      }
      continue;
    }

    if (arg.startsWith('-') && arg.length > 1) {
      if (config.numericKey !== undefined && /^-\d+$/.test(arg)) {
        entries.push({ key: config.numericKey, value: arg.slice(1) });
        i += 1;
        continue;
      }
      let advance = 1;
      for (let j = 1; j < arg.length; j++) {
        const letter = arg.charAt(j);
        const spec = specs.find((candidate) => candidate.short === letter);
        if (!spec) {
          if (config.unsupported?.includes(letter))
            return fail(unsupportedOption(name, `-${letter}`));
          return fail(`${name}: invalid option -- '${letter}'\n${tryHelp(name)}`);
        }
        if (!spec.arg) {
          entries.push({ key: keyOf(spec), value: true });
          continue;
        }
        const rest = arg.slice(j + 1);
        if (rest !== '') {
          entries.push({ key: keyOf(spec), value: rest });
        } else if (spec.arg === 'optional') {
          entries.push({ key: keyOf(spec), value: true });
        } else {
          const next = argv[i + 1];
          if (next === undefined) {
            return fail(`${name}: option requires an argument -- '${letter}'\n${tryHelp(name)}`);
          }
          entries.push({ key: keyOf(spec), value: next });
          advance = 2;
        }
        break;
      }
      i += advance;
      continue;
    }

    if (config.stopAtOperand) {
      operands.push(...argv.slice(i));
      break;
    }
    operands.push(arg);
    i += 1;
  }
  return { ok: true, options: makeParsed(entries, operands) };
}
