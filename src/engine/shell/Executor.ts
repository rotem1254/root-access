import type { Command, CommandContext, ShellAPI, Stdin, TTY } from '../commands/types';
import type { CommandRegistry } from '../commands/types';
import { isFsError, strerror } from '../errors';
import { createFileSystemView, type FileSystem } from '../fs/FileSystemView';
import { S_ISUID } from '../fs/mode';
import type { Credentials } from '../fs/permissions';
import type { Stat } from '../fs/types';
import type { GameAPI } from '../game/api';
import type { Machine } from '../system/Machine';
import { type ByteString, utf8Encode } from '../util/bytes';
import type { CommandList, Pipeline, SimpleCommand, Word } from './ast';
import { expandAssignment, type ExpansionContext, expandWords } from './expand';
import { expandPathname } from './glob';
import { notSupported } from './messages';
import type { Session } from './session';

export type StdinSource =
  | { kind: 'tty' }
  | { kind: 'data'; data: ByteString }
  /** Read when the command first reads, so a later `> same-file` truncation is visible. */
  | { kind: 'file'; path: string };

export type Sink =
  | { kind: 'stream'; write(chunk: ByteString): void; isTTY: boolean }
  | { kind: 'buffer'; data: ByteString }
  | { kind: 'file'; path: string; data: ByteString };

export interface ExecIO {
  stdin: StdinSource;
  stdout: Sink;
  stderr: Sink;
}

/** A command after it ran, as reported to level hooks. */
export interface ExecutedCommand {
  name: string;
  args: readonly string[];
  exitCode: number;
  user: string;
  cwd: string;
}

/** What the executor needs from the interactive shell around it. */
export interface ExecutionHost {
  readonly machine: Machine;
  readonly registry: CommandRegistry;
  readonly game: GameAPI;
  readonly interrupted: boolean;
  columns(): number;
  readTerminal(prompt: string, secret: boolean): Promise<string | null>;
  sleep(ms: number): Promise<void>;
  api(session: Session): ShellAPI;
  commandFinished(command: ExecutedCommand): void;
  internalError(name: string, error: unknown): void;
  pid(session: Session): number;
  random(): number;
}

function write(sink: Sink, chunk: ByteString): void {
  if (sink.kind === 'stream') sink.write(chunk);
  else sink.data += chunk;
}

export const literalWord = (text: string): Word => ({
  parts: [{ kind: 'text', value: text, quoted: true }],
  raw: text,
});

type Resolution =
  | { ok: true; command: Command; credentials: Credentials }
  | { ok: false; message: string; status: number };

/** Runs parsed command lines: expansion, redirects, pipes, command lookup and exit codes. */
export class Executor {
  private readonly host: ExecutionHost;

  constructor(host: ExecutionHost) {
    this.host = host;
  }

  async runList(list: CommandList, session: Session, io: ExecIO): Promise<number> {
    let status = session.env.lastStatus;
    let previous: ';' | '&&' | '||' | null = null;
    for (const item of list.items) {
      const skip = (previous === '&&' && status !== 0) || (previous === '||' && status === 0);
      previous = item.next;
      if (skip) continue;
      status = await this.runPipeline(item.pipeline, session, io);
      session.env.lastStatus = status;
      if (this.host.interrupted) break;
    }
    return status;
  }

  private async runPipeline(pipeline: Pipeline, session: Session, io: ExecIO): Promise<number> {
    let stdin = io.stdin;
    let status = 0;
    const { commands } = pipeline;
    for (let index = 0; index < commands.length; index++) {
      const command = commands[index];
      if (!command) continue;
      const last = index === commands.length - 1;
      const pipe = { kind: 'buffer' as const, data: '' };
      status = await this.runSimple(command, session, {
        stdin,
        stdout: last ? io.stdout : pipe,
        stderr: io.stderr,
      });
      if (this.host.interrupted) return 130;
      stdin = { kind: 'data', data: pipe.data };
    }
    return status;
  }

  expansionContext(session: Session): ExpansionContext {
    const { machine } = this.host;
    const env = session.env;
    const fs = this.fileSystem(session, machine.users.credentials(session.user));
    return {
      lookup: (name) => {
        switch (name) {
          case '?':
            return String(env.lastStatus);
          case '$':
            return String(this.host.pid(session));
          case '0':
            return session.login ? '-bash' : 'bash';
          case '#':
            return '0';
          case '-':
            return 'himBHs';
          case '@':
          case '*':
          case '!':
            return '';
          case 'RANDOM':
            return String(Math.floor(this.host.random() * 32768));
          default:
            return /^\d+$/.test(name) ? undefined : env.get(name);
        }
      },
      home: () => env.get('HOME') ?? '',
      homeOf: (user) => machine.users.byName(user)?.home,
      glob: (pattern) =>
        expandPathname(pattern, env.cwd, {
          readdir: (path) => {
            try {
              return fs.readdir(path);
            } catch {
              return null;
            }
          },
          isDirectory: (path) => {
            try {
              return fs.stat(path).type === 'dir';
            } catch {
              return false;
            }
          },
          exists: (path) => fs.exists(path),
        }),
    };
  }

  private fileSystem(session: Session, credentials: Credentials): FileSystem {
    return createFileSystemView(
      this.host.machine.fs,
      () => credentials,
      () => session.env.cwd,
    );
  }

  /** Applies one redirect. Returns an error message (without the `bash: ` prefix) on failure. */
  private redirect(
    redirect: SimpleCommand['redirects'][number],
    fds: { stdin: StdinSource; out: Sink; err: Sink },
    opened: (Sink & { kind: 'file' })[],
    fs: FileSystem,
    expansion: ExpansionContext,
  ): string | null {
    if (redirect.kind === 'dup') {
      if (redirect.fd < 1 || redirect.fd > 2 || redirect.to < 1 || redirect.to > 2) {
        return `${redirect.to}: Bad file descriptor`;
      }
      const source = redirect.to === 1 ? fds.out : fds.err;
      if (redirect.fd === 1) fds.out = source;
      else fds.err = source;
      return null;
    }
    const targets = expandWords([redirect.target], expansion);
    const target = targets[0];
    if (targets.length !== 1 || target === undefined)
      return `${redirect.target.raw}: ambiguous redirect`;
    try {
      if (redirect.kind === 'file' && redirect.op === '<') {
        fs.readFile(target);
        if (redirect.fd === 0) fds.stdin = { kind: 'file', path: target };
        return null;
      }
      const append = redirect.kind === 'file' ? redirect.op === '>>' : redirect.append;
      fs.writeFile(target, '', { append });
      const sink: Sink & { kind: 'file' } = { kind: 'file', path: target, data: '' };
      opened.push(sink);
      if (redirect.kind === 'both') {
        fds.out = sink;
        fds.err = sink;
      } else if (redirect.fd === 1) {
        fds.out = sink;
      } else if (redirect.fd === 2) {
        fds.err = sink;
      }
      return null;
    } catch (error) {
      if (isFsError(error)) return `${target}: ${strerror(error.code)}`;
      throw error;
    }
  }

  private flush(opened: (Sink & { kind: 'file' })[], fs: FileSystem, err: Sink): void {
    for (const sink of opened) {
      if (sink.data === '') continue;
      try {
        fs.writeFile(sink.path, sink.data, { append: true });
      } catch (error) {
        if (!isFsError(error)) throw error;
        write(err, `bash: ${sink.path}: ${strerror(error.code)}\n`);
      }
      sink.data = '';
    }
  }

  async runSimple(
    command: SimpleCommand,
    session: Session,
    io: ExecIO,
    resolvedPath?: string,
  ): Promise<number> {
    const { machine } = this.host;
    const expansion = this.expansionContext(session);
    const argv = expandWords(command.words, expansion);
    const baseCredentials = machine.users.credentials(session.user);
    const fs = this.fileSystem(session, baseCredentials);
    const fds = { stdin: io.stdin, out: io.stdout, err: io.stderr };
    const opened: (Sink & { kind: 'file' })[] = [];

    for (const redirect of command.redirects) {
      const error = this.redirect(redirect, fds, opened, fs, expansion);
      if (error !== null) {
        write(fds.err, `bash: ${error}\n`);
        this.flush(opened, fs, fds.err);
        return 1;
      }
    }

    const name = argv[0];
    if (name === undefined) {
      for (const assignment of command.assignments) {
        session.env.set(assignment.name, expandAssignment(assignment.value, expansion));
      }
      this.flush(opened, fs, fds.err);
      return 0;
    }

    const resolution = this.resolve(resolvedPath ?? name, name, session, fs, baseCredentials);
    if (!resolution.ok) {
      write(fds.err, `${resolution.message}\n`);
      this.flush(opened, fs, fds.err);
      return resolution.status;
    }

    const { command: target, credentials } = resolution;
    let env = session.env;
    if (command.assignments.length > 0) {
      if (target.kind !== 'builtin') env = session.env.clone();
      for (const assignment of command.assignments) {
        env.set(assignment.name, expandAssignment(assignment.value, expansion), {
          export: target.kind !== 'builtin',
        });
      }
    }

    const out = fds.out;
    const ctx: CommandContext = {
      name,
      args: argv.slice(1),
      stdin: this.stdin(fds.stdin, fs),
      stdout: (chunk) => write(out, chunk),
      stderr: (chunk) => write(fds.err, chunk),
      env,
      fs: createFileSystemView(
        machine.fs,
        () => credentials,
        () => env.cwd,
      ),
      user: session.user,
      credentials,
      machine,
      tty: this.tty(out),
      shell: this.host.api(session),
      game: this.host.game,
    };

    let status: number;
    const dashDash = argv.indexOf('--');
    const optionArgs = dashDash < 0 ? argv.slice(1) : argv.slice(1, dashDash);
    const helpRequested = target.handlesHelp !== false && optionArgs.includes('--help');
    if (helpRequested) {
      ctx.stdout(utf8Encode(target.help));
      status = 0;
    } else {
      try {
        status = await target.run(ctx);
      } catch (error) {
        this.host.internalError(name, error);
        write(fds.err, `${name}: internal error\n`);
        status = 1;
      }
    }
    if (this.host.interrupted) status = 130;
    this.flush(opened, fs, fds.err);
    this.host.commandFinished({
      name: target.name,
      args: argv.slice(1),
      exitCode: status,
      user: session.user.name,
      cwd: env.cwd,
    });
    return status;
  }

  private stdin(source: StdinSource, fs: FileSystem): Stdin {
    if (source.kind !== 'tty') {
      let loaded: ByteString | null = source.kind === 'data' ? source.data : null;
      const content = (): ByteString => {
        if (loaded === null) {
          try {
            loaded = source.kind === 'file' ? fs.readFile(source.path) : '';
          } catch {
            loaded = '';
          }
        }
        return loaded;
      };
      let offset = 0;
      return {
        isTTY: false,
        readAll: async () => {
          const data = content();
          const rest = data.slice(offset);
          offset = data.length;
          return rest;
        },
        readLine: async () => {
          const data = content();
          if (offset >= data.length) return null;
          const newline = data.indexOf('\n', offset);
          const end = newline < 0 ? data.length : newline + 1;
          const line = data.slice(offset, end);
          offset = end;
          return line;
        },
      };
    }
    const host = this.host;
    return {
      isTTY: true,
      readLine: async () => {
        const line = await host.readTerminal('', false);
        return line === null ? null : utf8Encode(`${line}\n`);
      },
      readAll: async () => {
        let all = '';
        for (;;) {
          const line = await host.readTerminal('', false);
          if (line === null) return host.interrupted ? null : all;
          all += utf8Encode(`${line}\n`);
        }
      },
    };
  }

  private tty(out: Sink): TTY {
    const host = this.host;
    return {
      stdoutIsTTY: out.kind === 'stream' && out.isTTY,
      columns: host.columns(),
      readLine: (prompt, options) => host.readTerminal(prompt, options?.secret ?? false),
      get interrupted() {
        return host.interrupted;
      },
      sleep: (ms) => host.sleep(ms),
    };
  }

  private resolve(
    lookup: string,
    name: string,
    session: Session,
    fs: FileSystem,
    credentials: Credentials,
  ): Resolution {
    if (lookup.includes('/')) return this.resolvePath(lookup, name, fs, credentials);
    const direct = this.host.registry.get(lookup);
    if (direct && direct.kind !== 'binary') return { ok: true, command: direct, credentials };
    if (lookup === '')
      return { ok: false, message: `bash: ${name}: command not found`, status: 127 };

    let denied = false;
    for (const directory of (session.env.get('PATH') ?? '').split(':')) {
      const candidate = directory === '' ? lookup : `${directory.replace(/\/+$/, '')}/${lookup}`;
      let stat: Stat;
      try {
        stat = fs.stat(candidate);
      } catch {
        continue;
      }
      if (stat.type !== 'file') continue;
      if (!fs.access(candidate, 'x')) {
        denied = true;
        continue;
      }
      return this.fromFile(candidate, name, stat, fs, credentials);
    }
    if (denied) return { ok: false, message: `bash: ${name}: Permission denied`, status: 126 };
    return { ok: false, message: `bash: ${name}: command not found`, status: 127 };
  }

  private resolvePath(
    path: string,
    name: string,
    fs: FileSystem,
    credentials: Credentials,
  ): Resolution {
    let stat: Stat;
    try {
      stat = fs.stat(path);
    } catch (error) {
      if (!isFsError(error)) throw error;
      const status = error.code === 'ENOENT' ? 127 : 126;
      return { ok: false, message: `bash: ${name}: ${strerror(error.code)}`, status };
    }
    if (stat.type === 'dir')
      return { ok: false, message: `bash: ${name}: Is a directory`, status: 126 };
    if (!fs.access(path, 'x'))
      return { ok: false, message: `bash: ${name}: Permission denied`, status: 126 };
    return this.fromFile(path, name, stat, fs, credentials);
  }

  private fromFile(
    path: string,
    name: string,
    stat: Stat,
    fs: FileSystem,
    credentials: Credentials,
  ): Resolution {
    const command = stat.exec === undefined ? undefined : this.host.registry.get(stat.exec);
    if (command) {
      const setuidRoot = (stat.mode & S_ISUID) !== 0 && stat.uid === 0;
      return {
        ok: true,
        command,
        credentials: setuidRoot ? { ...credentials, uid: 0 } : credentials,
      };
    }
    let head: string;
    try {
      head = fs.readFile(path).slice(0, 4);
    } catch {
      head = '';
    }
    if (head === '\x7fELF') {
      return {
        ok: false,
        message: `bash: ${name}: cannot execute binary file: Exec format error`,
        status: 126,
      };
    }
    return { ok: false, message: notSupported(`running scripts such as ${name}`), status: 126 };
  }
}
