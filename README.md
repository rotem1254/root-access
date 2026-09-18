# ROOT_ACCESS

A browser-based, text-based hacking puzzle game. The player works inside a simulated Linux terminal
and solves real challenges — Linux, permissions, log analysis, cryptography, networking — to capture
flags and progress through a story. It is built for pre-military cyber cadets (~17–19): every puzzle
teaches a genuine, transferable skill that works the same way on a real Linux system.

**This build** delivers the engine, a faithful bash-like shell with ~53 commands, the level and
scoring system, save/load, the terminal UI, and two playable chapters: Chapter 1 "Initial Access"
(three levels) and Chapter 2 "Lateral Movement" (four levels, on a simulated network with ssh
pivoting). Chapter 3 appears as _coming soon_ stubs.

## Running it

Node 24 LTS is required (Vitest needs Node ≥ 22.12).

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

```bash
npm run build      # production build to dist/, then verifies no plaintext flags leaked
npm run preview    # serve the production build
npm run typecheck  # tsc across app, engine (no DOM) and node/test configs
npm run lint       # eslint + prettier --check
npm test           # vitest with coverage (fails under 85% on src/engine)
npm run check      # typecheck + lint + test
```

## How to play

Type Linux commands at the prompt, just like a real terminal. Useful game commands:

- `mission` — show the current objective (`mission -b` for the full briefing)
- `hint` — reveal the next hint (each one costs points)
- `submit FLAG{...}` — submit a flag you found
- `status` — your time, hints and score
- `levels` — list levels and switch to an unlocked one
- `reset` — restore the current level's files to their starting state
- `help` — list every command; `man <name>` or `<name> --help` for details

Tab completes commands and paths, the up/down arrows browse history, Ctrl+C cancels a line, and
Ctrl+L clears the screen. On a tablet, an on-screen key bar provides Tab, the arrows and Ctrl+C.

Progress is saved in `localStorage`, so you can close the tab and come back.

## Architecture

```
src/
  engine/            pure logic, no DOM — fully testable in Node
    util/            byte strings, base64, sha256, seeded PRNG, clock, ls/size formatting
    fs/              VirtualFS, POSIX paths, Linux permissions, node types, serialization
    system/          user/group database, sudoers, the Ubuntu-like base machine image
    shell/           lexer, parser, expansion, glob, executor, interactive Shell, completion
    network/         hosts with IPs, DNS, per-interface reachability, services, HTTP, pcap
    commands/        one file per command, a shared Command interface, GNU-style option parsing
      game/          mission, hint, submit, status, reset, levels
    game/            Game orchestrator, level model, scoring, flags, storage, events
  levels/            Chapter 1 and 2 levels (self-contained data) + coming-soon stubs
  ui/                xterm Terminal, LineEditor, keymap, Panels/HUD, boot sequence, touch keys
  content/           strings.ts (UI chrome, i18n-ready) and ASCII banners
  styles/            design tokens and layout
tests/               engine, commands, ui, and per-level solvability + anti-shortcut tests
```

Key rules (enforced, see `CLAUDE.md`):

- The engine has **no DOM and no network**: `src/engine`, `src/levels` and `src/content` compile
  without the DOM lib, ESLint bans browser/network globals there, and the production build ships a
  Content-Security-Policy with `connect-src 'none'`.
- Error messages match real bash/coreutils output (`cat: x: No such file or directory`,
  `bash: x: command not found`, `Permission denied`) — reading real errors is part of the learning.
- Flags never appear as plaintext in the build: levels store a SHA-256 `flagHash`, flag-bearing story
  files are imported with `?sealed` (scrambled at build time), and `npm run build` fails if any
  `FLAG{...}` slips into `dist/`. The plaintext flags live only in test-only `solution.ts` files.

## Commands

Shell builtins: `cd`, `pwd`, `echo`, `printf`, `export`, `unset`, `history`, `help`, `exit`, `logout`,
`true`, `false`, `clear`.

Programs: `ls`, `cat`, `file`, `strings`, `grep`, `head`, `tail`, `wc`, `sort`, `uniq`, `cut`,
`base64`, `find`, `su`, `sudo`, `env`, `whoami`, `id`, `hostname`, `man`, `mkdir`, `touch`, `rm`, `cp`,
`mv`, `chmod`.

Networking: `ip` (`a`/`route`), `ifconfig`, `ping`, `nmap` (`-p`, `-sV`, `-F`, CIDR sweeps),
`netstat`, `ss`, `ssh`, `nc`, `curl`, `wget`, `dig`, `nslookup`, `tcpdump -r`.

Game commands: `mission`, `hint`, `submit`, `status`, `reset`, `levels`.

Every command supports `--help` and has a `man` page. The shell supports pipes (`|`), redirects
(`>`, `>>`, `<`, `2>`, `2>&1`, `&>`), command lists (`;`, `&&`, `||`), single/double quotes, backslash
escapes, `$VAR`/`~`/glob expansion, and a `> ` continuation prompt for unfinished input.

## Adding a level

Levels are pure data — adding one never touches engine code.

1. Create `src/levels/levelNN/index.ts` exporting a `Level` (see the `Level` type in
   `src/engine/game/level.ts` and level 1 as a template). Give it an `id`, `chapter`, `title`,
   `briefing`, `objective`, `skills`, `startUser`/`startHost`/`startCwd`, any `users`/`groups`/
   `sudoers`, an `fs` map of files, progressive `hints`, a `parTimeSec`, and a `flagHash`.
2. Compute the hash: `npm run hash-flag -- 'FLAG{your_flag_here}'` and paste it as `flagHash`.
3. Put any flag-bearing story files in `levelNN/files/` and import them with `?sealed`
   (`import note from './files/note.txt?sealed'`), routed through `asSealed(...)`. Keep the plaintext
   flag out of the level source.
4. Add a test-only `src/levels/levelNN/solution.ts` exporting `FLAG`, `SOLUTION` (the canonical
   command sequence) and `SHORTCUTS_THAT_FAIL`.
5. Register the level in `src/levels/index.ts`.
6. Add it to the solvability/anti-shortcut tests in `tests/levels/`, then run `npm run check`.

### Networked levels

A level becomes a network level by adding `net` (the start host's interfaces and listening services)
and `hosts` (the other machines). Reachability is per interface: two hosts can talk only when they
have interfaces on the same subnet, so a dual-homed host is what makes `ssh` pivoting necessary.

```ts
net: { interfaces: [{ name: 'eth0', ip: '10.10.0.9' }], gateway: '10.10.0.1' },
hosts: [
  {
    hostname: 'corp-intra',
    net: {
      interfaces: [{ name: 'eth0', ip: '10.10.0.30' }],
      ports: [
        { port: 22, product: 'OpenSSH', version: '8.9p1' },
        { port: 80, http: { routes: { '/': { body: sealedPage } } } },
      ],
    },
  },
],
```

An HTTP route `body` may be a sealed import, so a flag on a page never reaches the bundle as
plaintext. For a packet capture, build one with `encodePcap(summary)` and store it as a file's
`bytes`: `file` recognises it as a pcap and `tcpdump -r` renders it.

## Story

You are a junior security analyst hired to investigate NovaCorp, a company suspected of leaking
customer data. Chapter 1 takes you from a hidden note on an old workstation, through a break-in
buried in a server's logs, to a locked account whose password was left in a world-readable backup.
Chapter 2 moves onto the network: you map the office LAN, find a service parked on an odd port,
pivot through a jump host into a segmented server network, and finally pull a cleartext credential
out of a packet capture. All hosts, addresses and domains are reserved for documentation
(RFC 5737 / RFC 1918, `.example`, `.internal`) — nothing here points at a real system.
