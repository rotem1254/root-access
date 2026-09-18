import type { Plugin } from 'vite';

/**
 * Production Content-Security-Policy. `connect-src 'none'` makes the browser enforce the rule that
 * ROOT_ACCESS never talks to a real network. Not applied in dev: Vite's HMR needs a websocket.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // xterm.js injects <style> elements for its theme.
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data:",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

export function cspPlugin(): Plugin {
  return {
    name: 'root-access:csp',
    apply: 'build',
    transformIndexHtml(html) {
      return {
        html,
        tags: [
          {
            tag: 'meta',
            attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
            injectTo: 'head-prepend',
          },
        ],
      };
    },
  };
}

/**
 * `import content from './file.txt?sealed'` returns the file's bytes scrambled (XOR + Base64),
 * so level story files and flag fragments are not readable plaintext in the JavaScript bundle.
 * The raw source file is never emitted to dist. This deters casual spoilers; it is not security.
 */
// Must stay identical to KEY in src/engine/util/seal.ts, so unseal() reproduces the bytes.
const SEAL_KEY = 'ROOT_ACCESS::level-content';

export function sealPlugin(): Plugin {
  const SUFFIX = '?sealed';
  return {
    name: 'root-access:seal',
    enforce: 'pre',
    async load(id) {
      if (!id.endsWith(SUFFIX)) return null;
      const path = id.slice(0, -SUFFIX.length);
      const { readFile } = await import('node:fs/promises');
      const bytes = await readFile(path); // raw UTF-8 bytes
      const xored = Buffer.from(
        bytes.map((byte, i) => byte ^ SEAL_KEY.charCodeAt(i % SEAL_KEY.length)),
      );
      this.addWatchFile(path);
      return `export default ${JSON.stringify({ sealed: xored.toString('base64') })};`;
    },
  };
}
