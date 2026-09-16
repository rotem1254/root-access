import { base64 } from './base64';
import { cat } from './cat';
import { cd } from './cd';
import { cut } from './cut';
import { clear } from './clear';
import { echo } from './echo';
import { env } from './env';
import { exit } from './exit';
import { exportCommand } from './export';
import { chmod } from './chmod';
import { cp } from './cp';
import { falseCommand } from './false';
import { find } from './find';
import { grep } from './grep';
import { file } from './file';
import { help } from './help';
import { history } from './history';
import { head } from './head';
import { hostname } from './hostname';
import { id } from './id';
import { mkdir } from './mkdir';
import { mv } from './mv';
import { logout } from './logout';
import { ls } from './ls';
import { man } from './man';
import { printf } from './printf';
import { rm } from './rm';
import { pwd } from './pwd';
import { sort } from './sort';
import { strings } from './strings';
import { su } from './su';
import { sudo } from './sudo';
import { tail } from './tail';
import { touch } from './touch';
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
  chmod,
  cp,
  cut,
  clear,
  echo,
  env,
  exit,
  exportCommand,
  falseCommand,
  file,
  find,
  grep,
  head,
  help,
  history,
  hostname,
  id,
  logout,
  mkdir,
  mv,
  ls,
  man,
  printf,
  pwd,
  rm,
  sort,
  strings,
  su,
  sudo,
  tail,
  touch,
  trueCommand,
  uniq,
  unset,
  wc,
  whoami,
];

export function createCommandRegistry(extra: readonly Command[] = []): CommandRegistry {
  return new CommandRegistry().register(...LINUX_COMMANDS, ...extra);
}
