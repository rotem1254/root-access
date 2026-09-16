import { base64 } from './base64';
import { cat } from './cat';
import { cd } from './cd';
import { cut } from './cut';
import { clear } from './clear';
import { echo } from './echo';
import { env } from './env';
import { exit } from './exit';
import { exportCommand } from './export';
import { falseCommand } from './false';
import { grep } from './grep';
import { file } from './file';
import { help } from './help';
import { history } from './history';
import { head } from './head';
import { hostname } from './hostname';
import { id } from './id';
import { logout } from './logout';
import { ls } from './ls';
import { man } from './man';
import { printf } from './printf';
import { pwd } from './pwd';
import { sort } from './sort';
import { strings } from './strings';
import { tail } from './tail';
import { trueCommand } from './true';
import { CommandRegistry, type Command } from './types';
import { uniq } from './uniq';
import { unset } from './unset';
import { wc } from './wc';
import { whoami } from './whoami';

/** Every Linux command the simulation provides (game commands are registered by the game). */
export const LINUX_COMMANDS: readonly Command[] = [
  base64,
  cat,
  cd,
  cut,
  clear,
  echo,
  env,
  exit,
  exportCommand,
  falseCommand,
  file,
  grep,
  head,
  help,
  history,
  hostname,
  id,
  logout,
  ls,
  man,
  printf,
  pwd,
  sort,
  strings,
  tail,
  trueCommand,
  uniq,
  unset,
  wc,
  whoami,
];

export function createCommandRegistry(extra: readonly Command[] = []): CommandRegistry {
  return new CommandRegistry().register(...LINUX_COMMANDS, ...extra);
}
