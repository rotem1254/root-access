import type { LevelCatalog } from '../engine/game/level';
import { level01 } from './level01';
import { level02 } from './level02';
import { level03 } from './level03';
import { level04 } from './level04';
import { level05 } from './level05';
import { level06 } from './level06';
import { level07 } from './level07';
import { CHAPTER_3_STUBS } from './stubs';

/** The ordered catalog the game plays through. Add a new level by importing it here. */
export const LEVELS: LevelCatalog = [
  level01,
  level02,
  level03,
  level04,
  level05,
  level06,
  level07,
  ...CHAPTER_3_STUBS,
];
