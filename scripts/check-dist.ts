// Fails the build if plaintext flag material ends up in dist/. Run after `vite build`.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const FLAG_MATERIAL = /FLAG\{[A-Za-z0-9_]+/g;
const TEXT_FILE = /\.(?:html|js|mjs|css|json|txt|map|svg)$/;

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (TEXT_FILE.test(entry.name)) yield path;
  }
}

const leaks: string[] = [];
for (const file of walk(DIST)) {
  const hits = readFileSync(file, 'utf8').match(FLAG_MATERIAL);
  if (hits) leaks.push(`  ${file}: ${hits.length} occurrence(s)`);
}

if (leaks.length > 0) {
  console.error(`check-dist: plaintext flag material found in build output:\n${leaks.join('\n')}`);
  process.exit(1);
}
console.log('check-dist: no plaintext flags in dist/');
