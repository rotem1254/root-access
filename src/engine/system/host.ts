import type { FSDefinition } from '../fs/definition';
import type { SudoRule } from './sudoers';

export interface UserDefinition {
  name: string;
  uid: number;
  /** Primary gid. Defaults to a group named after the user, with gid = uid. */
  gid?: number;
  /** Supplementary groups, e.g. `["adm"]`. */
  groups?: readonly string[];
  /** Defaults to `/home/<name>`. */
  home?: string;
  /** Defaults to `/bin/bash`. */
  shell?: string;
  /** Defaults to `<name>,,,` (Ubuntu's adduser format). */
  gecos?: string;
  /** Plaintext password for `su`/`sudo`. Omit to lock the account. */
  password?: string;
}

export interface GroupDefinition {
  name: string;
  gid: number;
  members?: readonly string[];
}

/** Everything that makes one simulated machine. */
export interface HostDefinition {
  hostname: string;
  users?: readonly UserDefinition[];
  groups?: readonly GroupDefinition[];
  /** Extra sudoers rules on top of `root` and `%sudo`. */
  sudoers?: readonly SudoRule[];
  fs?: FSDefinition;
  /** Contents of /etc/motd, printed at login. */
  motd?: string;
  /** Mode for generated home directories. Ubuntu's default is `"0750"`. */
  homeMode?: string;
}
