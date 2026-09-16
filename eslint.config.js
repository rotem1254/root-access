// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const NO_NETWORK = 'ROOT_ACCESS never makes real network calls: everything is simulated.';
const NETWORK_GLOBALS = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'WebTransport'].map(
  (name) => ({ name, message: NO_NETWORK }),
);

const NO_DOM = 'The engine, levels and content are pure logic: no DOM or browser globals.';
const DOM_GLOBALS = [
  'window',
  'document',
  'navigator',
  'location',
  'localStorage',
  'sessionStorage',
  'console',
  'setTimeout',
  'setInterval',
  'requestAnimationFrame',
].map((name) => ({ name, message: NO_DOM }));

const SOLUTION_IMPORT = {
  regex: '(^|/)solution(\\.ts)?$',
  message: 'Level solution files contain plaintext flags and may only be imported by tests.',
};
const UI_IMPORT = {
  regex: '(^|/)ui(/|$)|^@xterm/',
  message: 'The engine, levels and content must not depend on the UI.',
};
const LEVELS_IMPORT = {
  // Blocks engine files from reaching up into src/levels (paths that climb with ..),
  // without catching the sibling `levels` game command inside the engine.
  regex: '\\.\\./([^/]+/)*levels(/|$)',
  message: 'The engine must not import level content; inject the catalog instead.',
};

export default defineConfig([
  globalIgnores(['dist/', 'coverage/', 'node_modules/']),
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.node.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-eval': 'error',
      'no-new-func': 'error',
      '@typescript-eslint/no-implied-eval': 'error',
      'no-restricted-globals': ['error', ...NETWORK_GLOBALS],
      // Commands implement an async interface even when they do no async work.
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
    },
  },
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [SOLUTION_IMPORT] }],
    },
  },
  {
    files: ['src/levels/**/*.ts', 'src/content/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [SOLUTION_IMPORT, UI_IMPORT] }],
      'no-restricted-globals': ['error', ...NETWORK_GLOBALS, ...DOM_GLOBALS],
    },
  },
  {
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [SOLUTION_IMPORT, UI_IMPORT, LEVELS_IMPORT] }],
      'no-restricted-globals': ['error', ...NETWORK_GLOBALS, ...DOM_GLOBALS],
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      // Test fixtures index into known data; non-null assertions keep them readable.
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  prettier,
]);
