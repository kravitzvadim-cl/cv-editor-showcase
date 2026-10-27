// Privacy guards: the editor keeps a CV in the user's own browser and sends it nowhere.
// Run with: node --test "tests/*.test.mjs"   (no dependencies)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFileSync(join(root, f), 'utf8');
const APP = ['app.js', 'layers.js', 'rulers.js', 'templates.js', 'icons.js', 'pdfimport.js', 'translate.js'];
const html = read('index.html');

test('no PDF or saved CV file is tracked by git', () => {
  const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
  const bad = files.filter(f => /\.(pdf|cv\.json)$/i.test(f));
  assert.deepEqual(bad, []);
});

const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const BANNED = /\b(fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts)\b|new\s+Worker\b/;

test('only translate.js can send data, to one address (openrouter.ai), and only from a local file', () => {
  for (const f of APP.filter((x) => x !== 'translate.js')) assert.ok(!BANNED.test(strip(read(f))), `${f} uses a network primitive`);
  const code = strip(read('translate.js'));
  assert.equal((code.match(/\bfetch\(/g) || []).length, 1, 'translate.js must make exactly one request');
  assert.ok(!/XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts|new\s+Worker/.test(code));
  assert.deepEqual([...new Set(code.match(/https?:\/\/[^'"`\s)]+/g) || [])], ['https://openrouter.ai/api/v1/chat/completions']);
  assert.match(code, /location\.protocol === 'file:'/, 'translate.js must be limited to local files');
});

test('the translate request goes only when a Translate button is pressed', () => {
  const code = strip(read('translate.js'));
  const callers = [...code.matchAll(/\b(trCall|translateDoc|runTranslate)\(/g)].length;
  assert.ok(callers > 0 && /\$\('#trToEn'\)\.onclick/.test(code) && /\$\('#trToHe'\)\.onclick/.test(code));
  assert.ok(!/^\s*(runTranslate|translateDoc)\(/m.test(code), 'no translation is started on load');
});

test('index.html loads nothing from another host and has no inline script', () => {
  assert.deepEqual(html.match(/(?:src|href)="https?:\/\/[^"]*"/g)?.filter(u => !/^href=/.test(u)) ?? [], []);
  assert.ok(!/<link[^>]+href="https?:/.test(html), 'external stylesheet');
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html), 'inline script');
});

test('the browser keeps only the known storage keys', () => {
  const allowed = new Set(['cv-editor-doc', 'cv-editor-tabs', 'cv-rulers', 'cv-ruler-unit', 'cv-keep', 'cv-translate-key', 'cv-translate-model', 'cv-translate-remember']);
  const found = new Set();
  for (const f of APP) {
    const src = read(f);
    for (const m of src.matchAll(/(?:'|")(cv-[a-z-]+)(?:'|")/g)) found.add(m[1]);
    assert.ok(!/sessionStorage|indexedDB|document\.cookie/.test(src), `${f} uses other storage`);
  }
  for (const k of found) assert.ok(allowed.has(k), `unexpected storage key ${k}`);
});

test('the API key file is never committed and the tool never prints the key', () => {
  const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n');
  assert.ok(!files.includes('local-config.js'), 'local-config.js is tracked');
  assert.match(read('.gitignore'), /^local-config\.js$/m);
  const tool = strip(read('tools/make-local-config.mjs'));
  assert.ok(!/console\.\w+\([^)]*(\$\{key\}|\bkey\s*[,)]|\+\s*key\b)/.test(tool), 'the tool prints the key');
});

test('the user can switch the autosave off and clear the saved CV', () => {
  assert.match(html, /id="keepCopy"/);
  assert.match(html, /id="clearSaved"/);
});
