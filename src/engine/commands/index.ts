import { cat } from './cat';
import { cd } from './cd';
import { clear } from './clear';
import { echo } from './echo';
import { env } from './env';
import { exit } from './exit';
import { exportCommand } from './export';
import { falseCommand } from './false';
import { file } from './file';
import { help } from './help';
import { history } from './history';
import { hostname } from './hostname';
import { id } from './id';
import { logout } from './logout';
import { ls } from './ls';
import { man } from './man';
import { pwd } from './pwd';
import { strings } from './strings';
import { trueCommand } from './true';
import { CommandRegistry, type Command } from './types';
import { unset } from './unset';
import { whoami } from './whoami';

/** Every Linux command the simulation provides (game commands are registered by the game). */
export const LINUX_COMMANDS: readonly Command[] = [
  cat,
  cd,
  clear,
  echo,
  env,
  exit,
  exportCommand,
  falseCommand,
  file,
  help,
  history,
  hostname,
  id,
  logout,
  ls,
  man,
  pwd,
  strings,
  trueCommand,
  unset,
  whoami,
];

export function createCommandRegistry(extra: readonly Command[] = []): CommandRegistry {
  return new CommandRegistry().register(...LINUX_COMMANDS, ...extra);
}
