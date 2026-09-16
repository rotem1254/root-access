import { isSealed, type Sealed } from '../engine/util/seal';

/**
 * Narrows a `?sealed` import (typed loosely by the ambient module declaration) to `Sealed`,
 * and fails loudly if the seal plugin did not run — which would otherwise ship a broken level.
 */
export function asSealed(value: unknown): Sealed {
  if (!isSealed(value)) throw new Error('sealed import did not produce sealed content');
  return value;
}
