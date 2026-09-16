# Phase 1 — Approved Plan

Approved 2026-09-16 ("defaults": every recommendation below was accepted).
Full original spec: [`spec.md`](spec.md). Once code exists, the code is the source of truth for
interfaces; this document records the decisions and the intended shape.

## Progress

- [x] 1. Toolchain scaffold
- [x] 2. Engine utilities (bytes, base64, prng, clock, formatting, errors)
- [x] 3. `path.ts`
- [x] 4. `VirtualFS` core + permissions + serialization
- [x] 5. Users, machine, FS definitions, base system image
- [x] 6. Lexer
- [x] 7. Parser
- [x] 8. Expansion + glob
- [x] 9. Executor + shell session host + registry + option parser
- [x] 10. Commands: shell & identity (`help clear echo pwd cd export unset env history whoami id hostname man exit logout true false printf`)
- [x] 11. Commands: `ls cat file strings`
- [x] 12. Commands: `grep head tail wc sort uniq base64 cut` (+ regex translator)
- [x] 13. Commands: `find su sudo`
- [x] 14. Commands: `mkdir touch rm cp mv chmod`
- [x] 15. Command conformance covered by per-command tests
- [ ] 16. Game layer + game commands + storage
- [ ] 17. Chapter 1 levels + stubs + sealing + solvability/anti-shortcut tests
- [ ] 18. UI: line editor + completion
- [ ] 19. UI: xterm terminal
- [ ] 20. UI: layout, panels, HUD, touch keys
- [ ] 21. UI: boot sequence, capture banner, level-complete, autosave
- [ ] 22. README + Definition-of-Done pass + Phase 1 report

Phase 1 work happens on branch `phase-1`, merged into `main` once the phase report is accepted.

## Decisions

### Answers to the kickoff questions

| # | Topic | Decision |
|---|---|---|
| 1 | Node | Node 24 LTS installed user-locally at `~/.local/node` (PATH in `~/.zprofile`). |
| 2 | Git identity | Repo-local `user.name "EM"`, `user.email rrotem1115@gmail.com`. |
| 3 | Flag secrecy | Levels store only `flagHash` (SHA-256 hex). Plaintext flags live only in test-only `levelNN/solution.ts`. Level files are imported through a `?sealed` Vite plugin (XOR + Base64 at build, decoded at level load). `npm run build` fails if `dist/` contains `FLAG{<alnum>`. This deters casual spoilers; it is not security. Scores are not graded for now. |
| 4 | Level text | `content/strings.ts` holds UI chrome only. Level text (`title`, `briefing`, `objective`, `hints`, `debrief`) is `Localized = string \| { en; he? }` inside the level folder. Side panel uses CSS logical properties (RTL-ready). |
| 5 | Extra commands | Required: `grep -E -o -c` (plus other common flags), `cut -d -f`, `sort -n -r`, redirects `2>` `2>>` `2>&1` `&>`, `/dev/null`, `\|\|`, `exit`. Optional set accepted: `mkdir touch rm cp mv chmod`. |
| 6 | Shared devices | Single save profile; storage keys are namespaced so profiles can be added later. |
| 7 | Progression | Strictly linear unlocking. No instructor unlock in Phase 1. |

### Accepted design changes

- **Commands are installed binaries.** Registry commands of kind `binary` exist as files in
  `/usr/bin` (`/bin → usr/bin`), are resolved through `$PATH`, and need the `x` bit. `su` and `sudo`
  are setuid-root. Builtins (`cd echo pwd export history exit help`) run inside the shell and prefix
  errors with `bash: <name>: …`. Game commands are always available regardless of `$PATH`.
- **Special bits live in `mode`** (`"4755"`, `/tmp` = `1777`), not a separate SUID flag.
- **Enforcement over convention.** `src/engine`, `src/levels`, `src/content` compile under
  `tsconfig.engine.json` without the DOM lib; ESLint forbids engine/levels importing UI or xterm and
  bans network globals everywhere; production builds ship a CSP with `connect-src 'none'`.
- **Testable UI logic.** Completion logic in `engine/shell/complete.ts`; line editing in a pure
  `ui/LineEditor.ts`; `ui/Completion.ts` only renders.
- **Storage** interface is async and named `GameStorage` (the DOM already has `Storage`);
  `LocalStorageAdapter` receives the storage object through its constructor.
- **`@noble/hashes`** for SHA-256 (works outside secure contexts, e.g. a tablet on the LAN; MD5 later).
- **Self-hosted JetBrains Mono** via `@fontsource/jetbrains-mono` (no Google Fonts request).
- **Touch key bar** (Tab, arrows, Ctrl+C, Esc, common symbols) on touch devices.
- **Reserved addresses only** in fiction: RFC 5737 (`192.0.2.0/24`, `198.51.100.0/24`,
  `203.0.113.0/24`), RFC 1918 internal ranges, `.example` / `.internal` domains. The web-links addon
  opens only allowlisted URLs.
- **`Level` shape changes:** `flag` → `flagHash`; `solution` → `levelNN/solution.ts`; new `users`,
  `groups`, `sudoers`, `debrief`, `parTimeSec`; `onCommand` receives the command after it ran.

### Defaults

- Chapter 2 "Lateral Movement" and Chapter 3 "Breaking the Cipher": 4 stubs each (title, briefing,
  objective), shown as *coming soon*.
- Scoring constants in one file: base 100; hint costs 10, 20, 30 (4th+ cost 30); speed bonus +50 at or
  under par time, linear to 0 at 3× par; completed-level floor 25; wrong submissions counted, not
  penalized.
- Timer counts active time only (paused while the tab is hidden).
- Skills unlock on level completion from `level.skills`.
- Boot sequence: full on first visit, one line afterwards; any key/tap skips; static under reduced
  motion.
- Flags match `FLAG{[A-Za-z0-9_]+}`, case-sensitive, surrounding whitespace ignored.
- `reset` asks `[y/N]`.
- Real options that are not implemented print `<cmd>: option '<opt>' is not supported in this simulation`.
- Out of scope for Phase 1: `$(…)`, backticks, subshells, `&`/jobs, here-docs, brace expansion,
  aliases, functions/scripting, pagers, editors.

## Toolchain pins

| Package | Version | Note |
|---|---|---|
| Node | 24 LTS | Vitest 5 needs ≥ 22.12 |
| vite | ^8.3 | |
| typescript | ~6.0.3 | **Not 7.x**: typescript-eslint 8.70 supports TS `<6.1` only |
| vitest, @vitest/coverage-v8 | ^5.0 | |
| @xterm/xterm | ^6.0 | addon-fit ^0.11, addon-web-links ^0.12 |
| eslint, typescript-eslint, prettier | ^10.10, ^8.70, ^3.9 | flat config |

## Simulated system conventions

These keep terminal output faithful. Tests assert them.

- **System:** Ubuntu 24.04-like, bash 5.2 semantics (`.*` never matches `.`/`..`), coreutils 9.x,
  GNU grep 3.11, GNU findutils 4.9, util-linux 2.39 `su`, sudo 1.9.
- **Locale:** `LANG=C.UTF-8` → byte-order sorting in `ls`, `sort`, globs. **Timezone:** UTC.
- **Clock:** each level has a fixed story start time; in-game time = story start + elapsed session
  time. File mtimes default to the story start time.
- **Data model:** file contents and pipe data are *byte strings* (one UTF-16 code unit per byte,
  0x00–0xFF). Author text is UTF-8 encoded at load; the UI decodes UTF-8 when writing to xterm.
- **Quoting in diagnostics:**
  - glibc getopt / usage: `ls: invalid option -- 'z'`, `Try 'ls --help' for more information.`
  - always-quoted (straight): `ls: cannot access 'x': …`, `head: cannot open 'x' for reading: …`,
    `rm: cannot remove 'x': …`, `touch: cannot touch 'x': …`, `cp: cannot stat 'x': …`,
    `chmod: changing permissions of 'x': …`
  - quoted only when needed: `cat: x: …`, `wc: x: …`, `grep: x: …`, `base64: x: …`, `uniq: x: …`,
    `cut: x: …`, `sort: cannot read: x: …`
  - locale quotes (UTF-8 ‘’): `find: ‘x’: Permission denied`, `mkdir: cannot create directory ‘x’: …`,
    `chmod: invalid mode: ‘x’`
  - bash: `bash: cd: x: No such file or directory`, `bash: x: command not found`,
    ``bash: syntax error near unexpected token `x'``
  - file(1): ``x: cannot open `x' (No such file or directory)``
- **Exit codes:** 127 command not found, 126 found but not executable, 130 interrupted (Ctrl+C),
  2 bash syntax error; usage errors use each tool's real code (2 for `ls`, `grep`, `sort`; 1 otherwise).
- **Colors on a TTY** (as Ubuntu's default aliases would give): `ls` dirs `01;34`, symlinks `01;36`,
  executables `01;32`, setuid `37;41`, setgid `30;43`, sticky+other-writable dir `30;42`,
  char devices `40;33;01`; `grep` matches `01;31`, filenames `35`, line numbers `32`, separators `36`.
  Prompt `\e[01;32m user@host \e[00m:\e[01;34m path \e[00m$ `.
- **`echo --help`** prints `--help`, exactly like the bash builtin (documented exception to "every
  command has `--help`"; `help echo` and `man echo` still work).

## Folder structure

```
CLAUDE.md  README.md  index.html  package.json  vite.config.ts  eslint.config.js
tsconfig.json (app, DOM)  tsconfig.engine.json (no DOM)  tsconfig.node.json (tests, scripts, configs)
scripts/        hash-flag.ts · check-dist.ts · sealPlugin.ts
docs/           spec.md · phase-1-plan.md
src/
  main.ts                    composition root
  styles/                    tokens.css · layout.css
  types/                     sealed.d.ts
  engine/
    index.ts                 public engine API
    errors.ts                errno codes, strerror, FsError
    util/                    bytes · base64 · prng · clock · format · seal · sha256
    fs/                      VirtualFS · path · permissions · mode · definition · baseSystem · serialize
    system/                  Machine · UserDB · sudoers
    shell/                   Lexer · Parser · ast · Environment · expand · glob · Executor · Shell · complete
    commands/                index (registry) · types · args · <one file per command>
      game/                  mission · hint · submit · status · reset · levels
    game/                    Game · GameState · LevelManager · FlagValidator · HintSystem · Scoring · Storage · events · level
  levels/
    index.ts                 ordered catalog
    level01/ level02/ level03/   index.ts · files/ · solution.ts (tests only)
    stubs.ts                 Chapter 2 & 3 placeholders
  content/                   strings.ts · banners.ts
  ui/                        Terminal · LineEditor · Completion · HUD · Panels · BootSequence · CaptureBanner · TouchKeys · dom
tests/
  helpers/                   headless.ts
  engine/  commands/  ui/  levels/
```

The engine never imports `levels/`; the catalog is injected by `main.ts` and the test harness.

## Chapter 1 design

### 01 — Hidden in Plain Sight (`guest`, `/home/guest`)

- `welcome.txt`: email from the handler; the previous analyst left a handover somewhere in this home.
- `.handover` (hidden): flag part 1 and a pointer to the memo.
- `memo.txt`: Base64 text; `base64 -d memo.txt` gives flag part 2 and a pointer to the auth logs.
- Must fail: `ls` without `-a` hides the dotfile; `grep -r FLAG ~` finds only half; half flag rejected.

### 02 — Needle in the Logs (`analyst`, member of `adm`)

- `/var/log/auth.log` (`0640 root:adm`), ~600 seeded lines: cron sessions, internal employee logins,
  background brute force on invalid users from documentation IPs, one legit external login (no failures),
  and the attacker: many `Failed password for mreyes from 203.0.113.47`, then `Accepted password`,
  then `sudo: mreyes : … COMMAND=/usr/bin/cp /srv/finance/q3-payroll.csv /home/mreyes/.cache/.q3-payroll.csv`.
- Home directories are `drwx--x--x`: `ls`, `grep -r`, `find` cannot enumerate them, so the exact path
  must come from the log. `cat` on the staged file gives the flag.

### 03 — Permission Denied (`guest`)

- `/home/admin/flag.txt` is `-r-------- admin admin` in a readable `/home/admin`.
- `find / -perm -o=r -name "*.bak" 2>/dev/null` lists a world-readable portal config backup whose
  password is reused by `admin`; `su admin` then `cat`.
- Must fail: `cat` as guest (`Permission denied`), wrong password (`su: Authentication failure`),
  `0600` decoy backups are not listed, `sudo` is refused, `chmod` is `Operation not permitted`.
