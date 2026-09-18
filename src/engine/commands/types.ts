import type { BinarySpec } from '../fs/baseSystem';
import type { FileSystem } from '../fs/FileSystemView';
import type { Credentials } from '../fs/permissions';
import type { GameAPI } from '../game/api';
import type { Environment } from '../shell/Environment';
import type { Machine } from '../system/Machine';
import type { Network } from '../network/Network';
import type { UserRecord } from '../system/UserDB';
import type { ByteString } from '../util/bytes';

/**
 * - `builtin`: runs inside the shell; errors read `bash: cd: …`.
 * - `binary`: installed in /usr/bin, found through $PATH, needs the execute bit.
 * - `game`: mission/hint/submit…, always available.
 */
export type CommandKind = 'builtin' | 'binary' | 'game';

export interface ManPage {
  section: 1 | 6 | 8;
  /** DESCRIPTION paragraphs, separated by blank lines. */
  description: string;
  options?: readonly (readonly [flags: string, text: string])[];
  examples?: readonly (readonly [command: string, text: string])[];
  seeAlso?: readonly string[];
}

export interface Command {
  name: string;
  kind: CommandKind;
  /** Installed setuid root (su, sudo). */
  setuid?: boolean;
  /** One line, for `help` and the man page NAME section. */
  description: string;
  /** SYNOPSIS lines, e.g. `ls [OPTION]... [FILE]...`. */
  usage: readonly string[];
  /** `--help` output. */
  help: string;
  man: ManPage;
  /** False for commands that treat `--help` as ordinary input, like bash's `echo`. */
  handlesHelp?: boolean;
  run(ctx: CommandContext): Promise<number>;
}

export interface Stdin {
  /** True when input comes from the terminal rather than a pipe or file. */
  readonly isTTY: boolean;
  /** All remaining input. From the terminal: lines until Ctrl+D. Null when interrupted. */
  readAll(): Promise<ByteString | null>;
  /** One line with its newline; null at end of input or when interrupted. */
  readLine(): Promise<ByteString | null>;
}

export interface TTY {
  /** False when stdout is a pipe or a file: `ls` prints one name per line, no colors. */
  readonly stdoutIsTTY: boolean;
  readonly columns: number;
  /** Prompts on the terminal itself (not stdin), like `su` asking for a password. Null on Ctrl+C/Ctrl+D. */
  readLine(prompt: string, options?: { secret?: boolean }): Promise<string | null>;
  /** Ctrl+C was pressed while this command ran. */
  readonly interrupted: boolean;
  /** Waits (instantly in tests); ends early on Ctrl+C. */
  sleep(ms: number): Promise<void>;
}

export interface SubprocessIO {
  /** Input bytes, or null to read the terminal. */
  stdin: ByteString | null;
  stdout(chunk: ByteString): void;
  stderr(chunk: ByteString): void;
  stdoutIsTTY: boolean;
}

export interface ShellAPI {
  readonly history: readonly string[];
  clearHistory(): void;
  readonly commands: CommandRegistryView;
  /** Nesting depth of shells started with su (1 = login shell). */
  readonly depth: number;
  readonly isLoginShell: boolean;
  /** Starts a new shell as `user` (su). It takes over from the next command line. */
  pushSession(user: UserRecord, options: { login: boolean }): void;
  /** Starts a login shell as `user` on another machine (ssh). Takes over from the next line. */
  sshTo(machine: Machine, user: UserRecord): void;
  /** Leaves the current shell. */
  exit(status: number): void;
  /** The environment a login shell for `user` starts with. */
  loginEnvironment(user: UserRecord): Environment;
  /** Runs a resolved command as another user (sudo). `argv[0]` is the name as typed. */
  runAs(
    user: UserRecord,
    path: string,
    argv: readonly string[],
    io: SubprocessIO,
    env: Environment,
  ): Promise<number>;
  /** Parses and runs a command line as another user (su -c). */
  runLineAs(user: UserRecord, line: string, io: SubprocessIO, env: Environment): Promise<number>;
}

export interface CommandRegistryView {
  get(name: string): Command | undefined;
  all(): readonly Command[];
}

export interface CommandContext {
  /** argv[0] as typed; used as the prefix of error messages. */
  name: string;
  args: readonly string[];
  stdin: Stdin;
  stdout(chunk: ByteString): void;
  stderr(chunk: ByteString): void;
  env: Environment;
  /** Filesystem as seen by the effective user, relative to the working directory. */
  fs: FileSystem;
  /** The user running the shell (the real user). */
  user: UserRecord;
  /** Effective credentials: root while a setuid-root binary runs. */
  credentials: Credentials;
  /** The machine this shell session is running on (changes after ssh). */
  machine: Machine;
  /** The simulated network, for recon and connectivity commands. */
  network: Network;
  tty: TTY;
  shell: ShellAPI;
  game: GameAPI;
}

export class CommandRegistry implements CommandRegistryView {
  private readonly commands = new Map<string, Command>();

  register(...commands: Command[]): this {
    for (const command of commands) {
      if (this.commands.has(command.name)) throw new Error(`duplicate command: ${command.name}`);
      this.commands.set(command.name, command);
    }
    return this;
  }

  get(name: string): Command | undefined {
    return this.commands.get(name);
  }

  all(): readonly Command[] {
    return [...this.commands.values()].sort((a, b) => (a.name < b.name ? -1 : 1));
  }

  /** Commands to install as files in the base system. */
  binaries(): BinarySpec[] {
    return this.all()
      .filter((command) => command.kind === 'binary')
      .map((command) => ({
        name: command.name,
        description: command.description,
        ...(command.setuid ? { setuid: true } : {}),
      }));
  }
}
