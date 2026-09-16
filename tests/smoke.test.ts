import { describe, expect, it } from 'vitest';
import { ENGINE_VERSION } from '../src/engine';

describe('toolchain smoke test', () => {
  it('loads the engine entry point in Node', () => {
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
