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
