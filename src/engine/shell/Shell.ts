import type { CommandRegistry, ShellAPI, SubprocessIO } from '../commands/types';
import { tildify } from '../fs/path';
import { ROOT_CREDENTIALS } from '../fs/permissions';
import type { GameAPI } from '../game/api';
import type { Machine } from '../system/Machine';
import type { UserRecord } from '../system/UserDB';
import { type ByteString, utf8Encode } from '../util/bytes';
import { createRandom, type Random } from '../util/prng';
import { Environment } from './Environment';
import {
  type ExecIO,
  type ExecutedCommand,
  type ExecutionHost,
  Executor,
  literalWord,
  type Sink,
} from './Executor';
import { parse } from './Parser';
import { BASH_VERSION, type Session, USER_PATH } from './session';

export interface ShellIO {
  stdout(chunk: ByteString): void;
  stderr(chunk: ByteString): void;
  columns(): number;
}

export type InputRequest =
  | { kind: 'prompt'; prompt: string }
  | { kind: 'continuation'; prompt: string }
  | { kind: 'read'; prompt: string; secret: boolean }
  | { kind: 'busy' };

export interface ShellHooks {
  onCommand?(command: ExecutedCommand): void;
  onInputRequest?(request: InputRequest): void;
  /** A command line finished (after all its commands ran). */
  onLineComplete?(): void;
  onSessionChange?(): void;
}

export interface ShellOptions {
  machine: Machine;
  registry: CommandRegistry;
  io: ShellIO;
  game: GameAPI;
  user: string;
  cwd?: string;
  /** Real waiting in the browser; instant by default (tests). */
  sleep?: (ms: number) => Promise<void>;
  hooks?: ShellHooks;
  history?: readonly string[];
  seed?: number;
}

export interface SessionSnapshot {
  user: string;
  login: boolean;
  cwd: string;
  lastStatus: number;
  vars: [name: string, value: string, exported: boolean][];
}

export interface ShellSnapshot {
  sessions: SessionSnapshot[];
  history: string[];
}

const HISTORY_LIMIT = 1000;

/**
 * An interactive bash session on a machine: reads lines, keeps history, runs commands, handles
 * Ctrl+C / Ctrl+D, and nests shells for `su`. The UI and the headless test harness drive it the
 * same way, through `submit`, `interrupt` and `eof`.
 */
export class Shell implements ExecutionHost {
  readonly machine: Machine;
  readonly registry: CommandRegistry;
  readonly game: GameAPI;
  readonly internalErrors: string[] = [];
  private readonly io: ShellIO;
  private readonly hooks: ShellHooks;
  private readonly sleepImpl: (ms: number) => Promise<void>;
  private readonly executor: Executor;
  private readonly rng: Random;
  private readonly sessions: Session[] = [];
  private readonly historyList: string[];
  private request: InputRequest = { kind: 'busy' };
  private buffer = '';
  private waiters: (() => void)[] = [];
  private pendingRead: ((line: string | null) => void) | null = null;
  private readonly sleepers = new Set<() => void>();
  private interruptedFlag = false;
  private lineAbortedFlag = false;
  private nextPid = 2300;

  constructor(options: ShellOptions) {
    this.machine = options.machine;
    this.registry = options.registry;
    this.game = options.game;
    this.io = options.io;
    this.hooks = options.hooks ?? {};
    this.sleepImpl = options.sleep ?? (() => Promise.resolve());
    this.historyList = [...(options.history ?? [])];
    this.rng = createRandom(options.seed ?? 1337);
    this.executor = new Executor(this);
    const user = this.machine.users.byName(options.user);
    if (!user) throw new Error(`unknown start user: ${options.user}`);
    this.sessions.push(this.newSession(user, true, options.cwd));
    this.request = this.promptRequest();
  }

  // ── State ───────────────────────────────────────────────────────────────

  get session(): Session {
    const session = this.sessions[this.sessions.length - 1];
    if (!session) throw new Error('shell has no session');
    return session;
  }

  get depth(): number {
    return this.sessions.length;
  }

  get history(): readonly string[] {
    return this.historyList;
  }

  get inputRequest(): InputRequest {
    return this.request;
  }

  get interrupted(): boolean {
    return this.interruptedFlag;
  }

  get lineAborted(): boolean {
    return this.lineAbortedFlag;
  }

  /** PS1, colored like Ubuntu's default: `guest@corp-web01:~/docs$ `. */
  prompt(): string {
    const { user, env } = this.session;
    const dir = tildify(env.cwd, env.get('HOME') ?? '');
    const sigil = user.uid === 0 ? '#' : '$';
    return `\x1b[01;32m${user.name}@${this.machine.hostname}\x1b[00m:\x1b[01;34m${dir}\x1b[00m${sigil} `;
  }

  /** /etc/motd, printed when a login session starts. */
  motd(): ByteString {
    try {
      return this.machine.fs.readFile('/etc/motd', ROOT_CREDENTIALS);
    } catch {
      return '';
    }
  }

  private promptRequest(): InputRequest {
    return { kind: 'prompt', prompt: this.prompt() };
  }

  private setRequest(request: InputRequest): void {
    this.request = request;
    this.hooks.onInputRequest?.(request);
    if (request.kind !== 'busy') {
      const waiters = this.waiters;
      this.waiters = [];
      for (const resolve of waiters) resolve();
    }
  }

  /** Resolves once the shell is waiting for input again. */
  whenReady(): Promise<void> {
    if (this.request.kind !== 'busy') return Promise.resolve();
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  // ── Input ───────────────────────────────────────────────────────────────

  /** The user pressed Enter. Resolves when the shell next waits for input. */
  submit(line: string): Promise<void> {
    const request = this.request;
    if (request.kind === 'read') {
      const pending = this.pendingRead;
      this.pendingRead = null;
      this.setRequest({ kind: 'busy' });
      pending?.(line);
      return this.whenReady();
    }
    if (request.kind === 'busy') return this.whenReady();

    const source = request.kind === 'continuation' ? `${this.buffer}\n${line}` : line;
    const result = parse(utf8Encode(source));
    if (!result.ok && result.incomplete) {
      this.buffer = source;
      this.setRequest({ kind: 'continuation', prompt: '> ' });
      return Promise.resolve();
    }
    this.buffer = '';
    this.remember(source);
    if (!result.ok) {
      this.io.stderr(`${result.error}\n`);
      this.session.env.lastStatus = 2;
      this.setRequest(this.promptRequest());
      this.hooks.onLineComplete?.();
      return Promise.resolve();
    }
    if (result.list.items.length === 0) {
      this.setRequest(this.promptRequest());
      return Promise.resolve();
    }
    this.interruptedFlag = false;
    this.lineAbortedFlag = false;
    this.setRequest({ kind: 'busy' });
    void this.execute(result.list);
    return this.whenReady();
  }

  private async execute(list: Parameters<Executor['runList']>[0]): Promise<void> {
    const session = this.session;
    try {
      await this.executor.runList(list, session, this.terminalIO());
    } catch (error) {
      this.internalError('bash', error);
    }
    this.pendingRead = null;
    this.setRequest(this.promptRequest());
    this.hooks.onLineComplete?.();
  }

  private terminalIO(): ExecIO {
    return {
      stdin: { kind: 'tty' },
      stdout: { kind: 'stream', write: (chunk) => this.io.stdout(chunk), isTTY: true },
      stderr: { kind: 'stream', write: (chunk) => this.io.stderr(chunk), isTTY: true },
    };
  }

  /** Ctrl+C. */
  interrupt(): void {
    const kind = this.request.kind;
    if (kind === 'busy' || kind === 'read') {
      this.interruptedFlag = true;
      const pending = this.pendingRead;
      this.pendingRead = null;
      if (pending) {
        this.setRequest({ kind: 'busy' });
        pending(null);
      }
      for (const wake of [...this.sleepers]) wake();
      return;
    }
    this.buffer = '';
    this.session.env.lastStatus = 130;
    this.setRequest(this.promptRequest());
  }

  /** Ctrl+D on an empty line. */
  eof(): Promise<void> {
    const kind = this.request.kind;
    if (kind === 'read') {
      const pending = this.pendingRead;
      this.pendingRead = null;
      this.setRequest({ kind: 'busy' });
      pending?.(null);
      return this.whenReady();
    }
    if (kind === 'continuation') {
      this.buffer = '';
      this.io.stderr(
        `bash: unexpected EOF while looking for matching quote or command\nbash: syntax error: unexpected end of file\n`,
      );
      this.session.env.lastStatus = 2;
      this.setRequest(this.promptRequest());
      return Promise.resolve();
    }
    if (kind === 'prompt') {
      this.io.stderr(this.session.login ? 'logout\n' : 'exit\n');
      this.exitSession(this.session.env.lastStatus);
      this.setRequest(this.promptRequest());
    }
    return this.whenReady();
  }

  private remember(line: string): void {
    const entry = line.replace(/\n/g, ' ');
    if (entry.trim() === '' || entry.startsWith(' ')) return;
    if (this.historyList[this.historyList.length - 1] === entry) return;
    this.historyList.push(entry);
    if (this.historyList.length > HISTORY_LIMIT) this.historyList.shift();
  }

  // ── ExecutionHost ───────────────────────────────────────────────────────

  columns(): number {
    return this.io.columns();
  }

  readTerminal(prompt: string, secret: boolean): Promise<string | null> {
    if (this.interruptedFlag) return Promise.resolve(null);
    return new Promise((resolve) => {
      this.pendingRead = resolve;
      this.setRequest({ kind: 'read', prompt, secret });
    });
  }

  sleep(ms: number): Promise<void> {
    if (this.interruptedFlag) return Promise.resolve();
    return new Promise((resolve) => {
      const wake = (): void => {
        if (this.sleepers.delete(wake)) resolve();
      };
      this.sleepers.add(wake);
      void this.sleepImpl(ms).then(wake);
    });
  }

  commandFinished(command: ExecutedCommand): void {
    this.hooks.onCommand?.(command);
  }

  internalError(name: string, error: unknown): void {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    this.internalErrors.push(`${name}: ${message}`);
  }

  pid(session: Session): number {
    return session.pid;
  }

  random(): number {
    return this.rng.next();
  }

  // ── Sessions ────────────────────────────────────────────────────────────

  private newSession(user: UserRecord, login: boolean, cwd?: string, env?: Environment): Session {
    const environment = env ?? this.loginEnvironment(user);
    if (cwd !== undefined) {
      environment.cwd = cwd;
      environment.set('PWD', cwd);
    }
    this.nextPid += 17;
    return { user, env: environment, login, pid: this.nextPid };
  }

  loginEnvironment(user: UserRecord): Environment {
    const home = this.machine.fs.exists(user.home, this.machine.users.credentials(user), true)
      ? user.home
      : '/';
    const env = new Environment(home, {
      SHELL: user.shell,
      PWD: home,
      LOGNAME: user.name,
      HOME: user.home,
      LANG: 'C.UTF-8',
      TERM: 'xterm-256color',
      USER: user.name,
      SHLVL: '1',
      PATH: USER_PATH,
    });
    env.set('HOSTNAME', this.machine.hostname);
    env.set('BASH_VERSION', BASH_VERSION);
    env.set('HISTCONTROL', 'ignoreboth');
    env.set('HISTSIZE', '1000');
    env.set('HISTFILESIZE', '2000');
    env.set('UID', String(user.uid));
    env.set('EUID', String(user.uid));
    return env;
  }

  /** `su` without `-`: keep the environment and directory, but switch HOME, SHELL, USER, LOGNAME. */
  private suEnvironment(user: UserRecord): Environment {
    const env = this.session.env.clone();
    env.set('HOME', user.home);
    env.set('SHELL', user.shell);
    if (user.uid !== 0) {
      env.set('USER', user.name);
      env.set('LOGNAME', user.name);
    }
    env.set('SHLVL', String(Number(env.get('SHLVL') ?? '1') + 1));
    env.set('UID', String(user.uid));
    env.set('EUID', String(user.uid));
    env.lastStatus = 0;
    return env;
  }

  pushSession(user: UserRecord, options: { login: boolean }): void {
    const env = options.login ? this.loginEnvironment(user) : this.suEnvironment(user);
    if (options.login) env.set('SHLVL', String(this.sessions.length + 1));
    this.sessions.push(this.newSession(user, options.login, undefined, env));
    this.hooks.onSessionChange?.();
  }

  private exitSession(status: number): void {
    if (this.sessions.length > 1) {
      this.sessions.pop();
      this.session.env.lastStatus = status;
    } else {
      const user = this.session.user;
      this.io.stdout(`Connection to ${this.machine.hostname} closed.\n\n`);
      this.sessions.pop();
      this.sessions.push(this.newSession(user, true));
      this.io.stdout(this.motd());
    }
    this.hooks.onSessionChange?.();
  }

  api(session: Session): ShellAPI {
    return {
      history: this.historyList,
      clearHistory: () => {
        this.historyList.length = 0;
      },
      commands: this.registry,
      depth: this.sessions.length,
      isLoginShell: session.login,
      pushSession: (user, options) => this.pushSession(user, options),
      exit: (status) => {
        this.lineAbortedFlag = true;
        if (this.sessions.includes(session)) this.exitSession(status);
      },
      loginEnvironment: (user) => this.loginEnvironment(user),
      runAs: (user, path, argv, io, env) =>
        this.executor.runSimple(
          { assignments: [], words: argv.map(literalWord), redirects: [] },
          { user, env, login: false, pid: this.nextPid + 1 },
          this.subprocessIO(io),
          path,
        ),
      runLineAs: async (user, line, io, env) => {
        const result = parse(line);
        if (!result.ok) {
          io.stderr(
            result.incomplete
              ? 'bash: syntax error: unexpected end of file\n'
              : `${result.error}\n`,
          );
          return 2;
        }
        const child: Session = { user, env, login: false, pid: this.nextPid + 1 };
        const status = await this.executor.runList(result.list, child, this.subprocessIO(io));
        this.lineAbortedFlag = false;
        return status;
      },
    };
  }

  private subprocessIO(io: SubprocessIO): ExecIO {
    const stdout: Sink = { kind: 'stream', write: (c) => io.stdout(c), isTTY: io.stdoutIsTTY };
    return {
      stdin: io.stdin === null ? { kind: 'tty' } : { kind: 'data', data: io.stdin },
      stdout,
      stderr: { kind: 'stream', write: (c) => io.stderr(c), isTTY: true },
    };
  }

  // ── Save and restore ────────────────────────────────────────────────────

  snapshot(): ShellSnapshot {
    return {
      sessions: this.sessions.map((session) => ({
        user: session.user.name,
        login: session.login,
        cwd: session.env.cwd,
        lastStatus: session.env.lastStatus,
        vars: session.env
          .names()
          .map((name) => [name, session.env.get(name) ?? '', session.env.isExported(name)]),
      })),
      history: [...this.historyList],
    };
  }

  restore(snapshot: ShellSnapshot): void {
    const restored: Session[] = [];
    for (const saved of snapshot.sessions) {
      const user = this.machine.users.byName(saved.user);
      if (!user) continue;
      const env = new Environment(saved.cwd);
      for (const [name, value, exported] of saved.vars) env.set(name, value, { export: exported });
      env.lastStatus = saved.lastStatus;
      restored.push(this.newSession(user, saved.login, undefined, env));
    }
    if (restored.length === 0) return;
    this.sessions.length = 0;
    this.sessions.push(...restored);
    this.historyList.length = 0;
    this.historyList.push(...snapshot.history.slice(-HISTORY_LIMIT));
    this.setRequest(this.promptRequest());
  }
}
