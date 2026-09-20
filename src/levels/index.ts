import { type Level, type LevelCatalog, type Localized } from '../engine/game/level';
import { level00 } from './level00';
import { level00b } from './level00b';
import { level00c } from './level00c';
import { level00d } from './level00d';
import { level00e } from './level00e';
import { level00f } from './level00f';
import { level00g } from './level00g';
import { level00h } from './level00h';
import { level00i } from './level00i';
import { level00j } from './level00j';
import { level01 } from './level01';
import { level02 } from './level02';
import { level03 } from './level03';
import { level04 } from './level04';
import { level05 } from './level05';
import { level06 } from './level06';
import { level07 } from './level07';
import { level08 } from './level08';
import { level09 } from './level09';
import { level10 } from './level10';
import { level11 } from './level11';
import { level12 } from './level12';
import { level13 } from './level13';
import { level14 } from './level14';
import { level15 } from './level15';
import { sandbox } from './sandbox';
import { HE } from './translations.he';

const english = (value: Localized): string => (typeof value === 'string' ? value : value.en);

/** Pairs an English value with its Hebrew translation into a Localized value. */
const bi = (value: Localized, he: string | undefined): Localized =>
  he === undefined ? value : { en: english(value), he };

/** Merges the Hebrew translations onto a level, leaving the level files English-only. */
function withHebrew(level: Level): Level {
  const he = HE[level.id];
  if (!he) return level;
  return {
    ...level,
    title: bi(level.title, he.title),
    objective: bi(level.objective, he.objective),
    briefing: bi(level.briefing, he.briefing),
    ...(level.debrief !== undefined ? { debrief: bi(level.debrief, he.debrief) } : {}),
    hints: level.hints.map((hint, index) => bi(hint, he.hints[index])),
  };
}

/** The ordered catalog the game plays through. Add a new level by importing it here. */
export const LEVELS: LevelCatalog = [
  level00,
  level00b,
  level00c,
  level00d,
  level00e,
  level00f,
  level00g,
  level00h,
  level00i,
  level00j,
  level01,
  level02,
  level03,
  level04,
  level05,
  level06,
  level07,
  level08,
  level09,
  level10,
  level11,
  level12,
  level13,
  level14,
  level15,
  sandbox,
].map(withHebrew);
