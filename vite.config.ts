import { defineConfig } from 'vitest/config';
import { cspPlugin, sealPlugin } from './scripts/vite-plugins.ts';

export default defineConfig({
  plugins: [sealPlugin(), cspPlugin()],
  build: {
    target: 'es2022',
    // The polyfill fetches chunks with fetch(), which the production CSP (connect-src 'none') blocks.
    modulePreload: { polyfill: false },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/engine/**/*.ts'],
      reporter: ['text-summary', 'html'],
      thresholds: {
        lines: 85,
        statements: 85,
        functions: 85,
        branches: 85,
      },
    },
  },
});
