import type { LevelCatalog } from '../engine/game/level';
import { level01 } from './level01';
import { level02 } from './level02';
import { level03 } from './level03';
import { CHAPTER_2_STUBS, CHAPTER_3_STUBS } from './stubs';

/** The ordered catalog the game plays through. Add a new level by importing it here. */
export const LEVELS: LevelCatalog = [
  level01,
  level02,
  level03,
  ...CHAPTER_2_STUBS,
  ...CHAPTER_3_STUBS,
];
