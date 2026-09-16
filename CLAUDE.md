# ROOT_ACCESS

Browser-based, text-based hacking puzzle game in a simulated Linux terminal, built for pre-military
cyber cadets (~17–19). Every puzzle must teach a genuine, transferable skill: a command or technique
that works the same way on a real Linux system.

Stack: Vite + TypeScript (strict, `noUncheckedIndexedAccess`), xterm.js, Vitest, ESLint + Prettier,
vanilla TS UI. No backend: everything runs client-side, progress is saved behind a storage interface.

- Full spec: [`docs/spec.md`](docs/spec.md)
- Approved Phase 1 plan, decisions, progress checklist and output-fidelity conventions:
  [`docs/phase-1-plan.md`](docs/phase-1-plan.md). Read it before working on Phase 1.

## Environment

- Node 24 LTS lives in `~/.local/node/bin` (on PATH via `~/.zprofile`). Non-login shells may need
  `export PATH="$HOME/.local/node/bin:$PATH"`.
- TypeScript is pinned to `~6.0.x`: typescript-eslint does not support TypeScript 7 yet. Don't bump it.
- Each phase is developed on a `phase-N` branch and merged into `main` after the phase report is accepted.

## Working agreement

1. **Plan before code.** Before implementing a phase, reply with: an implementation plan in small,
   verifiable steps; the folder structure; the core TypeScript interfaces; and all questions or
   ambiguities. Ask questions up front, not halfway through.
2. **Wait for approval** before implementing.
3. **One phase at a time.** At the end of each phase, stop and report: what was built, how to run it,
   how to test it, and known limitations.
4. **Git:** commit after each meaningful step, using Conventional Commits (`feat:`, `fix:`, `test:`,
   `refactor:`, …).
5. **Quality gate:** run `npm run typecheck`, `npm run lint` and `npm test` before declaring any step
   done. Never leave the build broken.
6. **No silent deviations.** If a requirement conflicts with good design, say so and propose an
   alternative.

## Architecture rules

- The engine (`src/engine`) is pure logic with no DOM. The shell and filesystem must be fully
  testable in Node without a browser.
- All commands implement one shared `Command` interface (`run(ctx)` resolves to an exit code), one
  file per command in `src/engine/commands/`.
- Levels are pure data plus optional hooks. Adding a level must never require touching engine code.
- Never use `eval`, `new Function`, or real network calls. Everything is simulated.
- Error messages must match real bash/coreutils output exactly (e.g.
  `cat: foo: No such file or directory`, `bash: foo: command not found`, `Permission denied`).
  Learning to read real errors is part of the education.
- `src/engine`, `src/levels` and `src/content` compile without the DOM lib (`tsconfig.engine.json`).
- Flags never appear in plaintext in level data or the build: levels store `flagHash`, plaintext flags
  live only in test-only `solution.ts` files, and level files are imported with `?sealed`.
- Fiction uses reserved addresses only: IPs from RFC 5737 / RFC 1918, domains under `.example` or
  `.internal`.

## Testing (non-negotiable)

- **Unit tests** for the lexer, the parser (quotes, escapes, pipes, redirects), path resolution,
  permissions, glob, and every command's main flags and error cases.
- **Solvability tests:** for every level, an integration test boots the level in a headless engine,
  runs the level's canonical solution commands, and asserts the flag is captured. Engine changes
  must never break an existing level.
- **Anti-shortcut tests:** for every level, assert that obvious shortcuts fail (e.g. `cat` on the
  protected flag as `guest` returns `Permission denied`).
- **Coverage** of `src/engine` stays at or above 85%.

## Definition of done (every phase)

- `npm run dev` runs with zero console errors
- `npm run build` succeeds
- Typecheck, lint and all tests pass
- Every level in the phase is solvable end-to-end by its solution test
- README is updated: how to run, how to add a new level, the command list
