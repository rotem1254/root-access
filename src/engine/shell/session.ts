import type { Machine } from '../system/Machine';
import type { UserRecord } from '../system/UserDB';
import type { Environment } from './Environment';

/**
 * One running shell: which machine it is on, who it runs as, and its variables. `su` pushes a new
 * session on the same machine; `ssh` pushes one on another machine.
 */
export interface Session {
  machine: Machine;
  user: UserRecord;
  env: Environment;
  login: boolean;
  pid: number;
}

export const USER_PATH =
  '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games:/snap/bin';

export const BASH_VERSION = '5.2.21(1)-release';
