import type { Command } from '../types';
import { hint } from './hint';
import { levels } from './levels';
import { mission } from './mission';
import { resetLevel } from './reset';
import { status } from './status';
import { summary } from './summary';
import { submit } from './submit';

/** Commands that talk to the game itself. Always available, regardless of $PATH. */
export const GAME_COMMANDS: readonly Command[] = [
  mission,
  hint,
  submit,
  status,
  summary,
  resetLevel,
  levels,
];
