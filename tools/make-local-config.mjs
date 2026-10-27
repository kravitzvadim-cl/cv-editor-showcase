// Writes local-config.js, which the Translate window reads, from the OPENROUTER_API_KEY environment variable,
// so the key never has to be pasted. The file is gitignored: it stays on this computer and is never committed.
// Usage:  OPENROUTER_API_KEY=sk-or-... node tools/make-local-config.mjs      (or export it first)
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const key = (process.env.OPENROUTER_API_KEY || '').trim();
if (!key) {
  console.error('OPENROUTER_API_KEY is not set in this environment, so nothing was written.');
  process.exit(1);
}
const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'local-config.js');
writeFileSync(file, `window.CV_OPENROUTER_KEY = ${JSON.stringify(key)};\n`, { mode: 0o600 });
console.log('Wrote local-config.js (the key is in it; it is gitignored). Reload the editor and open Translate.');
