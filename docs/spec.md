# ROOT_ACCESS — Kickoff Spec

> Original kickoff prompt, preserved verbatim except for code-block formatting.
> Decisions that refine or change this spec are recorded in [`phase-1-plan.md`](phase-1-plan.md).

You are a senior TypeScript engineer and game designer. We are building ROOT_ACCESS, a browser-based,
text-based hacking puzzle game. The player works inside a simulated Linux terminal and solves real
challenges (Linux, permissions, cryptography, networking, web) to capture flags and progress through a
story.

The target audience is pre-military cyber cadets (ages ~17–19) learning networking and cybersecurity.
Every puzzle must teach a genuine, transferable skill: a command or technique that works the same way on
a real Linux system.

## 0. How to work with me

1. Start in planning mode. Before writing any code, read this whole prompt and reply with:
   - an implementation plan broken into small, verifiable steps
   - the folder structure
   - the core TypeScript interfaces (filesystem node, command, level, game state)
   - any questions or ambiguities. Ask them now, not halfway through.
2. Wait for my approval before implementing.
3. Implement one phase at a time. At the end of each phase, stop and give me: what was built, how to run
   it, how to test it, and known limitations.
4. Initialize git. Commit after each meaningful step, using Conventional Commits (`feat:`, `fix:`,
   `test:`, `refactor:`).
5. Run `npm run typecheck`, `npm run lint` and `npm test` before declaring any step done. Never leave the
   build broken.
6. If a requirement conflicts with good design, tell me and propose an alternative. Don't silently
   deviate.

## 1. Tech stack

- Vite + TypeScript (strict mode, `noUncheckedIndexedAccess: true`)
- xterm.js (+ `@xterm/addon-fit`, `@xterm/addon-web-links`) for the terminal
- Vitest for unit and integration tests
- ESLint + Prettier
- No UI framework for the MVP: vanilla TS plus a small, clean DOM layer for the side panels
- No backend. Everything runs client-side. Progress is saved in `localStorage`, behind a storage
  interface so we can swap in Supabase later.
- Deployable as a static site to Vercel

## 2. Architecture

```
src/
  main.ts                  # bootstrap
  engine/
    fs/                    # virtual filesystem
      VirtualFS.ts
      path.ts              # normalize, resolve, ~, ., ..
      permissions.ts       # rwx checks, owner/group, SUID
    shell/
      Lexer.ts             # tokens: words, quotes, escapes, |, >, >>, <, &&, ;
      Parser.ts            # AST for pipelines and command lists
      Executor.ts          # runs AST, wires stdin/stdout/stderr between commands
      Environment.ts       # env vars, $VAR expansion, cwd, user, history
      glob.ts              # *, ?, [abc]
    commands/
      index.ts             # command registry
      ls.ts, cd.ts, cat.ts ...   # ONE FILE PER COMMAND
    network/               # (Phase 2) simulated hosts, ports, services
    game/
      GameState.ts
      LevelManager.ts
      FlagValidator.ts
      HintSystem.ts
      Storage.ts           # interface + LocalStorageAdapter
  levels/
    level01/               # each level is self-contained data
      index.ts
    level02/
    ...
  ui/
    Terminal.ts            # xterm wrapper, prompt, input line editing
    Completion.ts          # tab completion
    HUD.ts                 # level title, objective, flags, timer
    Panels.ts              # story / mission briefing / hints
  content/
    strings.ts             # all player-facing text in one place (i18n-ready)
tests/
  engine/  commands/  levels/
```

### Key design rules

- The engine is pure logic with no DOM. The shell and filesystem must be fully testable in Node without
  a browser.
- Commands share one interface, for example:

  ```ts
  interface Command {
    name: string;
    description: string;
    usage: string;
    run(ctx: CommandContext): Promise<number>; // exit code
  }

  interface CommandContext {
    args: string[];
    stdin: string;
    stdout: (s: string) => void;
    stderr: (s: string) => void;
    env: Environment;
    fs: VirtualFS;
    game: GameAPI; // for submit, hint, triggers
  }
  ```

- Levels are pure data plus optional hooks. Adding a level must never require touching engine code.
- Never use `eval`, `new Function` or real network calls. Everything is simulated.
- Error messages must mimic real bash/coreutils output exactly (for example
  `cat: foo: No such file or directory`, `bash: foo: command not found`, `Permission denied`), because
  learning to read real errors is part of the education.

## 3. Virtual filesystem

- Node types: file, directory, symlink
- Metadata: owner, group, mode (octal, for example `0644`), SUID bit, mtime, size
- Hidden files (dotfiles)
- Real permission enforcement based on the current user (read/write/execute, and directory traversal
  needs `x`)
- Multiple users (`guest`, `admin`, `root`...), switchable with `su` / `ssh` when the password is known
- Each level supplies its initial filesystem as a declarative tree, for example:

  ```ts
  fs: {
    "/home/guest/.secret": { content: "ZmxhZ3toaWRkZW59", mode: "0600", owner: "guest" },
    "/var/log/auth.log": { content: authLog, mode: "0640", owner: "root", group: "adm" }
  }
  ```

- The filesystem is resettable per level (`reset` command) and serializable for save/load

## 4. Shell features (Phase 1)

- Pipes `|`, redirects `>`, `>>`, `<`, command lists `&&`, `;`
- Single and double quotes, backslash escapes
- `$VAR` and `~` expansion, glob expansion
- Command history (↑/↓), `history` command
- Tab completion for commands and paths
- Ctrl+C cancels the current line, Ctrl+L clears
- Line editing: ←/→, Home/End, Backspace, Delete
- Dynamic prompt: `guest@corp-web01:~/docs$` (colored like real bash)

## 5. Commands

### Phase 1 (MVP)

`help`, `clear`, `ls` (`-l -a -la -h`), `cd`, `pwd`, `cat`, `echo`, `whoami`, `id`, `hostname`,
`history`, `grep` (`-i -r -n -v`), `find` (`-name -type -perm -user`), `head`, `tail`, `wc`, `sort`,
`uniq`, `base64` (`-d`), `file`, `strings`, `su`, `sudo -l`, `man` (short in-game man pages), `env`,
`export`

### Game commands

`mission` (show objective), `hint` (progressive hints), `submit <flag>`, `status`, `reset`, `levels`

### Phase 2

`nmap`, `ssh`, `ping`, `ifconfig` / `ip a`, `netstat` / `ss`, `curl`, `wget`, `nc`, `dig`, `cat` on
`.pcap` summaries (simulated `tcpdump -r`)

### Phase 3

`md5sum`, `sha256sum`, `xxd`, `rot13`/`tr`, `openssl enc` (simplified), `john` (simulated wordlist
cracking), `gpg` (simplified), `sqlmap`-style manual SQLi via `curl`

Every command must have `--help` output and a man page entry.

## 6. Level format

```ts
interface Level {
  id: string;                 // "01-hidden-files"
  chapter: number;
  title: string;
  briefing: string;           // story intro shown in the side panel
  objective: string;          // one-line goal
  skills: string[];           // ["ls -a", "base64"]
  startUser: string;
  startHost: string;
  startCwd: string;
  fs: FSDefinition;
  hosts?: HostDefinition[];   // Phase 2
  flag: string;               // stored hashed (SHA-256) in build output, never plaintext in UI
  hints: string[];            // progressive: vague → specific → near-solution
  solution: string[];         // canonical command sequence, used by tests
  onCommand?: (cmd: ParsedCommand, api: GameAPI) => void; // optional story triggers
}
```

Flag format: `FLAG{...}`. Flags are validated by hash comparison.

## 7. MVP content: Chapter 1 "Initial Access" (3 levels)

Write engaging but concise story text. The premise: the player is a junior security analyst hired to
investigate NovaCorp, a company suspected of data leaks. Each level reveals a bit more story through
files (emails, logs, notes).

1. **Hidden in Plain Sight.** Flag split between a dotfile and a Base64-encoded note. Teaches `ls -la`,
   `cat`, `base64 -d`.
2. **Needle in the Logs.** A 500+ line generated `auth.log`. The player must find the
   failed-then-successful login of a suspicious user and read a file in that user's home. Teaches
   `grep`, `tail`, pipes, `sort | uniq -c`.
3. **Permission Denied.** The flag is readable only by `admin`. The player finds admin's password in a
   world-readable backup config via `find / -perm -o=r -name "*.bak"` and uses `su admin`. Teaches
   `find`, permissions, `su`.

Then include placeholders (briefing and objective only) for Chapter 2 (Networking) and Chapter 3
(Crypto).

## 8. UI / UX

- Dark hacker aesthetic: black or very dark background, green or cyan accents, monospace font
  (JetBrains Mono or Fira Code via Google Fonts)
- Layout: terminal on the left (~70%), side panel on the right with Mission / Story / Hints tabs
- Collapsible side panel on mobile; the terminal must remain usable on a tablet
- Boot sequence animation on first load (short, skippable)
- Satisfying flag-capture feedback (ASCII art banner and a short typing effect)
- "Unlocked skills" list showing commands the player has learned
- Respect `prefers-reduced-motion`
- All player-facing strings live in `content/strings.ts` so a Hebrew translation of the side panel can be
  added later. Terminal output stays in English, like real Linux.

## 9. Hint system

- `hint` reveals the next hint for the current level
- Track hints used and time per level, and show them on the level-complete screen
- Scoring: base points per level, minus a penalty per hint, plus a bonus for speed

## 10. Testing requirements (non-negotiable)

- Unit tests for: lexer, parser (quotes, escapes, pipes, redirects), path resolution, permissions, glob,
  every command's main flags and error cases
- Solvability tests: for every level, an integration test boots the level in a headless engine, runs
  `level.solution` commands, and asserts the flag is captured. This guarantees engine changes never break
  existing levels.
- Anti-shortcut tests: for each level, assert that obvious shortcuts fail (for example `cat` on the
  protected flag as `guest` returns `Permission denied`)
- Target ≥ 85% coverage on `src/engine`

## 11. Phases

- **Phase 1:** engine (FS, shell, Phase 1 commands), terminal UI, level system, save/load, Chapter 1
  levels, tests. Stop and report.
- **Phase 2:** simulated network layer (hosts, ports, services, `ssh` hopping between machines),
  Chapter 2 "Lateral Movement" (4 levels). Stop and report.
- **Phase 3:** crypto commands, Chapter 3 "Breaking the Cipher" (4 levels), scoring screen. Stop and
  report.
- **Phase 4:** web challenges (simulated HTTP server, `curl`, `robots.txt`, SQLi), final boss level,
  polish, Vercel deploy config.

## 12. Definition of done (per phase)

- `npm run dev` runs with zero console errors
- `npm run build` succeeds
- Typecheck, lint and all tests pass
- Every level in the phase is solvable end-to-end by its solution test
- README updated: how to run, how to add a new level, command list

## 13. First task

1. Create `CLAUDE.md` in the repo root that captures the permanent rules from sections 0, 2 ("Key design
   rules"), 10 and 12, so they persist across sessions.
2. Then give me the implementation plan for Phase 1 only, as described in section 0. Do not write
   implementation code yet.
