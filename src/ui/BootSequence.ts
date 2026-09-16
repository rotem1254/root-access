import { BOOT_LOGO } from '../content/banners';
import { prefersReducedMotion } from './dom';
import type { Terminal } from './Terminal';

const LINES = [
  'ROOT_ACCESS bootloader v1.2 ...',
  '[  0.000000] Initializing simulated kernel',
  '[  0.104233] Mounting virtual filesystem ... ok',
  '[  0.208912] Loading coreutils, grep, findutils ... ok',
  '[  0.312004] Starting sshd, cron, systemd-logind ... ok',
  '[  0.417781] Bringing up training network (documentation ranges only) ... ok',
  '[  0.500000] NovaCorp incident response console ready',
  '',
];

/** A short, skippable boot animation. Static when reduced motion is requested. */
export async function runBootSequence(
  terminal: Terminal,
  options: { full: boolean },
): Promise<void> {
  const reduced = prefersReducedMotion();
  terminal.reset();
  if (!options.full) {
    terminal.writeText(
      '\x1b[32mROOT_ACCESS\x1b[0m — welcome back. Reconnecting to your session...\n',
    );
    return;
  }
  terminal.writeText(`\x1b[32m${BOOT_LOGO}\x1b[0m\n`);
  const state = { skipped: false };
  const skip = (): void => {
    state.skipped = true;
  };
  window.addEventListener('keydown', skip, { once: true });
  window.addEventListener('pointerdown', skip, { once: true });
  const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
  for (const line of LINES) {
    if (state.skipped || reduced) break;
    terminal.writeText(`\x1b[90m${line}\x1b[0m`);
    await delay(180);
  }
  if (state.skipped || reduced) {
    terminal.reset();
    terminal.writeText(`\x1b[32m${BOOT_LOGO}\x1b[0m\n`);
    for (const line of LINES) terminal.writeText(`\x1b[90m${line}\x1b[0m`);
  }
  window.removeEventListener('keydown', skip);
  window.removeEventListener('pointerdown', skip);
  terminal.writeText(
    '\x1b[32mReady.\x1b[0m Type `help` to get started, or `mission` for your objective.\n',
  );
}
