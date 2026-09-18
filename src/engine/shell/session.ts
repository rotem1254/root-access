import type { UserRecord } from '../system/UserDB';
import type { Environment } from './Environment';

/** One running shell: who it runs as and its variables. `su` pushes a new one. */
export interface Session {
  user: UserRecord;
  env: Environment;
  login: boolean;
  pid: number;
}

export const USER_PATH =
  '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games:/snap/bin';

export const BASH_VERSION = '5.2.21(1)-release';
