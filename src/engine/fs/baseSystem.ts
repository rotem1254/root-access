import type { SudoRule } from '../system/sudoers';
import { sudoersFile } from '../system/sudoers';
import type { UserDB } from '../system/UserDB';
import type { ByteString } from '../util/bytes';
import type { FSDefinition, FSEntry } from './definition';

/** A registered command installed as an executable file. */
export interface BinarySpec {
  name: string;
  description: string;
  setuid?: boolean;
  /** Defaults to /usr/bin. */
  directory?: string;
}

export interface BaseSystemOptions {
  hostname: string;
  users: UserDB;
  sudoers: readonly SudoRule[];
  binaries: readonly BinarySpec[];
  motd: string;
  homeMode: string;
  /** Story time; system files are dated months earlier. */
  time: number;
}

const DAY = 24 * 60 * 60 * 1000;

export const DEFAULT_MOTD = 'Welcome to Ubuntu 24.04.2 LTS (GNU/Linux 6.8.0-57-generic x86_64)\n';

const SKEL_BASHRC = `# ~/.bashrc: executed by bash(1) for non-login shells.

# If not running interactively, don't do anything
case $- in
    *i*) ;;
      *) return;;
esac

# don't put duplicate lines or lines starting with space in the history.
HISTCONTROL=ignoreboth

# append to the history file, don't overwrite it
shopt -s histappend

HISTSIZE=1000
HISTFILESIZE=2000

# check the window size after each command
shopt -s checkwinsize

PS1='\\[\\033[01;32m\\]\\u@\\h\\[\\033[00m\\]:\\[\\033[01;34m\\]\\w\\[\\033[00m\\]\\$ '

# enable color support of ls and grep
alias ls='ls --color=auto'
alias grep='grep --color=auto'

# some more ls aliases
alias ll='ls -alF'
alias la='ls -A'
alias l='ls -CF'
`;

const SKEL_PROFILE = `# ~/.profile: executed by the command interpreter for login shells.

# if running bash
if [ -n "$BASH_VERSION" ]; then
    # include .bashrc if it exists
    if [ -f "$HOME/.bashrc" ]; then
        . "$HOME/.bashrc"
    fi
fi

# set PATH so it includes user's private bin if it exists
if [ -d "$HOME/bin" ] ; then
    PATH="$HOME/bin:$PATH"
fi
`;

const SKEL_BASH_LOGOUT = `# ~/.bash_logout: executed by bash(1) when login shell exits.

# when leaving the console clear the screen to increase privacy
if [ "$SHLVL" = 1 ]; then
    [ -x /usr/bin/clear_console ] && /usr/bin/clear_console -q
fi
`;

const OS_RELEASE = `PRETTY_NAME="Ubuntu 24.04.2 LTS"
NAME="Ubuntu"
VERSION_ID="24.04"
VERSION="24.04.2 LTS (Noble Numbat)"
VERSION_CODENAME=noble
ID=ubuntu
ID_LIKE=debian
UBUNTU_CODENAME=noble
`;

const SHELLS =
  '# /etc/shells: valid login shells\n/bin/sh\n/usr/bin/sh\n/bin/bash\n/usr/bin/bash\n';

/** A minimal ELF image: correct magic and headers, plus the strings a real binary would carry. */
export function fakeElf(name: string, description: string): ByteString {
  const ident = '\x7fELF\x02\x01\x01\x00' + '\x00'.repeat(8);
  const header = ident + '\x03\x00\x3e\x00\x01\x00\x00\x00' + '\x00'.repeat(40);
  const strings = [
    '/lib64/ld-linux-x86-64.so.2',
    'libc.so.6',
    'GLIBC_2.34',
    '__libc_start_main',
    '__cxa_finalize',
    `Usage: ${name} [OPTION]...`,
    description,
    `Try '${name} --help' for more information.`,
    'GCC: (Ubuntu 13.3.0-6ubuntu2~24.04) 13.3.0',
    '.shstrtab',
    '.interp',
    '.text',
    '.rodata',
    '.data',
    '.bss',
  ];
  return `${header}${'\x00'.repeat(16)}${strings.join('\x00\x00')}${'\x00'.repeat(8)}`;
}

const iso = (time: number): string => new Date(time).toISOString();

/** The Ubuntu-like skeleton every host starts from. Level definitions are applied on top. */
export function baseSystemDefinition(options: BaseSystemOptions): FSDefinition {
  const { users, hostname } = options;
  const installed = iso(options.time - 120 * DAY);
  const accountsCreated = iso(options.time - 30 * DAY);
  const def: Record<string, FSEntry> = {};
  const add = (path: string, entry: FSEntry): void => {
    def[path] = entry;
  };
  const dir = (path: string, mode = '0755', owner = 'root', group?: string): void => {
    add(path, { dir: true, mode, owner, ...(group ? { group } : {}), mtime: installed });
  };
  const text = (path: string, content: string, mode = '0644', group?: string): void => {
    add(path, { content, mode, owner: 'root', ...(group ? { group } : {}), mtime: installed });
  };

  add('/bin', { symlink: 'usr/bin', mtime: installed });
  add('/sbin', { symlink: 'usr/sbin', mtime: installed });
  add('/lib', { symlink: 'usr/lib', mtime: installed });
  add('/lib64', { symlink: 'usr/lib64', mtime: installed });
  for (const path of ['/boot', '/etc', '/home', '/media', '/mnt', '/opt', '/srv', '/usr'])
    dir(path);
  for (const path of ['/usr/bin', '/usr/sbin', '/usr/lib', '/usr/lib64', '/usr/local']) dir(path);
  for (const path of ['/usr/local/bin', '/usr/share', '/var', '/var/backups', '/var/lib'])
    dir(path);
  dir('/root', '0700');
  dir('/tmp', '1777');
  dir('/var/tmp', '1777');
  dir('/var/log', '0775', 'root', 'syslog');
  dir('/dev');
  add('/dev/null', { bytes: '', device: 'null', mode: '0666', mtime: installed });

  text('/etc/hostname', `${hostname}\n`);
  text(
    '/etc/hosts',
    `127.0.0.1 localhost\n127.0.1.1 ${hostname}\n\n::1     ip6-localhost ip6-loopback\n`,
  );
  text('/etc/os-release', OS_RELEASE);
  text('/etc/issue', 'Ubuntu 24.04.2 LTS \\n \\l\n\n');
  text('/etc/motd', options.motd);
  text('/etc/shells', SHELLS);
  text('/etc/timezone', 'Etc/UTC\n');
  text('/etc/passwd', users.passwdFile());
  text('/etc/group', users.groupFile());
  text('/etc/shadow', users.shadowFile(), '0640', 'shadow');
  text('/etc/sudoers', sudoersFile(options.sudoers), '0440');
  dir('/etc/skel');
  text('/etc/skel/.bashrc', SKEL_BASHRC);
  text('/etc/skel/.profile', SKEL_PROFILE);
  text('/etc/skel/.bash_logout', SKEL_BASH_LOGOUT);
  text('/root/.bashrc', SKEL_BASHRC);
  text('/root/.profile', SKEL_PROFILE);

  for (const binary of options.binaries) {
    const directory = binary.directory ?? '/usr/bin';
    add(`${directory}/${binary.name}`, {
      bytes: fakeElf(binary.name, binary.description),
      exec: binary.name,
      mode: binary.setuid ? '4755' : '0755',
      mtime: installed,
    });
  }

  for (const user of users.allUsers()) {
    if (user.uid < 1000 || user.uid === 65534 || !user.home.startsWith('/home/')) continue;
    const owner = user.name;
    const created = { owner, mtime: accountsCreated };
    add(user.home, { dir: true, mode: options.homeMode, ...created });
    add(`${user.home}/.bashrc`, { content: SKEL_BASHRC, ...created });
    add(`${user.home}/.profile`, { content: SKEL_PROFILE, ...created });
    add(`${user.home}/.bash_logout`, { content: SKEL_BASH_LOGOUT, ...created });
  }
  return def;
}
