import { base64 } from './base64';
import { cat } from './cat';
import { cd } from './cd';
import { curl } from './curl';
import { cut } from './cut';
import { clear } from './clear';
import { dig } from './dig';
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
import { ifconfig } from './ifconfig';
import { ip } from './ip';
import { mkdir } from './mkdir';
import { netstat } from './netstat';
import { nc } from './nc';
import { nmap } from './nmap';
import { nslookup } from './nslookup';
import { mv } from './mv';
import { logout } from './logout';
import { ls } from './ls';
import { man } from './man';
import { kill } from './kill';
import { ping } from './ping';
import { printf } from './printf';
import { ps } from './ps';
import { rm } from './rm';
import { pwd } from './pwd';
import { sort } from './sort';
import { ss } from './ss';
import { ssh } from './ssh';
import { strings } from './strings';
import { su } from './su';
import { sudo } from './sudo';
import { tail } from './tail';
import { tcpdump } from './tcpdump';
import { touch } from './touch';
import { trueCommand } from './true';
import { GAME_COMMANDS } from './game';
import { CommandRegistry, type Command } from './types';
import { uniq } from './uniq';
import { unset } from './unset';
import { wc } from './wc';
import { wget } from './wget';
import { whoami } from './whoami';
import { gpg } from './gpg';
import { john } from './john';
import { openssl } from './openssl';
import { md5sum, sha1sum, sha256sum, sha512sum } from './sums';
import { tr } from './tr';
import { xxd } from './xxd';

/** Every Linux command the simulation provides (game commands are registered by the game). */
export const LINUX_COMMANDS: readonly Command[] = [
  base64,
  cat,
  cd,
  chmod,
  cp,
  curl,
  cut,
  clear,
  echo,
  env,
  exit,
  exportCommand,
  dig,
  falseCommand,
  file,
  find,
  gpg,
  grep,
  head,
  help,
  history,
  hostname,
  id,
  ifconfig,
  ip,
  john,
  kill,
  logout,
  md5sum,
  mkdir,
  mv,
  netstat,
  nc,
  nmap,
  nslookup,
  ls,
  man,
  openssl,
  ping,
  printf,
  ps,
  pwd,
  rm,
  sha1sum,
  sha256sum,
  sha512sum,
  sort,
  ss,
  ssh,
  strings,
  su,
  sudo,
  tail,
  tcpdump,
  tr,
  touch,
  trueCommand,
  uniq,
  unset,
  wc,
  wget,
  xxd,
  whoami,
];

export function createCommandRegistry(extra: readonly Command[] = []): CommandRegistry {
  return new CommandRegistry().register(...LINUX_COMMANDS, ...GAME_COMMANDS, ...extra);
}
