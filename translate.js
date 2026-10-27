/* CV Editor – Hebrew ⇄ English translation through OpenRouter. The one place the editor talks to a server, and only when
 * you press a Translate button: the text of the open document goes to openrouter.ai with your own API key (kept in memory,
 * in this browser if you tick "Remember", or read from the gitignored local-config.js that tools/make-local-config.mjs writes
 * from your OPENROUTER_API_KEY). It runs only from a local file; the hosted site blocks every outside connection.
 * The result opens in a new tab and the original is not changed. */
'use strict';

const TR_URL = 'https://openrouter.ai/api/v1/chat/completions';
const TR_KEY = 'cv-translate-key', TR_MODEL = 'cv-translate-model', TR_FORGET = 'cv-translate-remember', TR_DEFAULT_MODEL = 'anthropic/claude-haiku-5.5';
const trLocal = () => location.protocol === 'file:';
const trLang = { he: 'Hebrew', en: 'English' };
const HEB_RE = /[֐-׿]/, LAT_RE = /[A-Za-z]/;
let trAbort = null, trMemKey = ''; // the key stays in memory until the page is closed, even if it is not remembered

const trStore = {
  get: (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* storage blocked */ } },
  del: (k) => { try { localStorage.removeItem(k); } catch (_) { /* nothing to remove */ } },
};

// Which items need translating when going to `target`: the ones holding letters of the other language.
function trItems(d, target) {
  const from = target === 'he' ? LAT_RE : HEB_RE;
  return d.pages.flatMap((p) => p.els).filter((e) => e.type === 'text' && !e.hidden && from.test(e.text));
}
// The language to offer first: the one the document is not written in yet.
function trSuggest(d) {
  const t = d.pages.flatMap((p) => p.els).filter((e) => e.type === 'text').map((e) => e.text).join(' ');
  return (t.match(/[֐-׿]/g) || []).length > (t.match(/[A-Za-z]/g) || []).length ? 'en' : 'he';
}

// Addresses, e-mails, phone numbers, icons and link targets are swapped for ⟦n⟧ marks before sending and put back after.
function trMask(text) {
  const keep = [], put = (m) => { keep.push(m); return `⟦${keep.length - 1}⟧`; };
  let t = text.replace(/\]\(([^)\s]+)\)/g, (_, u) => `](${put(u)})`);
  const hide = (re) => { t = t.replace(re, (m) => put(m)); };
  hide(/(?:https?:\/\/|www\.)\S+/g);                       // addresses with a scheme
  hide(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g);                     // e-mails
  hide(/[\w-]+(?:\.[\w-]{2,})+(?:\/\S*)?/g);                 // any other dotted name (lenafischer.design, Node.js)
  hide(/\+?\d[\d ().-]{7,}\d/g);                              // phone numbers and number ranges
  hide(new RegExp(ICON_RE.source, 'g'));                        // :icons:
  return { t, keep };
}
const trUnmask = (t, keep) => t.replace(/⟦(\d+)⟧/g, (_, i) => keep[+i] ?? '');
const trCount = (s, re) => (s.match(re) || []).length;
// A translation is trusted only if the structure came back the same: marks, bold/underline, tabs, lines.
function trValid(src, out, keep) {
  if (typeof out !== 'string' || !out.trim()) return false;
  for (let i = 0; i < keep.length; i++) if (trCount(out, new RegExp(`⟦${i}⟧`, 'g')) !== 1) return false;
  return ['\t', '\n', '**', '__'].every((x) => out.split(x).length === src.split(x).length);
}

const trSystem = (target) => `You translate CV (résumé) text ${target === 'he' ? 'from English to Hebrew' : 'from Hebrew to English'}.
You receive a JSON array of {"id", "text"} items and return ONLY a JSON array of {"id", "text"} with the same ids, nothing else.
Rules:
- Keep the structure of every text exactly: line breaks, tab characters, **bold**, **(600)semibold**, __underline__, [link text](⟦n⟧).
- Keep every ⟦n⟧ mark unchanged, once, in the matching place. They hide addresses, e-mails, phone numbers and icons.
- Keep numbers, dates and symbols; write month names and "Present" in the target language (e.g. Hebrew: ינו׳ 2021 – הווה).
- Keep company names, product names, programming languages and technical terms in their original spelling unless a standard ${trLang[target]} form exists.
- Transliterate the person's own name; keep it as a name, not as a translation.
- Use the natural, professional register of a CV: short, active phrases; no extra words, no commentary.
${target === 'he' ? '- Write Hebrew with standard spelling and punctuation; do not add niqqud.' : '- Write fluent British or American English consistently; do not leave Hebrew words behind.'}
- If an item has nothing to translate, return it unchanged.`;

const trErr = (msg, retry = false) => Object.assign(new Error(msg), { retry });
async function trCall(items, target, key, model, signal) {
  if (!trLocal()) throw trErr('Translate works only when the editor is opened from a file on your computer.');
  let res;
  // a dropped connection or a busy server is tried again twice before giving up
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(TR_URL, {
        method: 'POST', signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, 'x-title': 'CV Editor' },
        body: JSON.stringify({
          model, max_tokens: 8192, temperature: 0,
          messages: [{ role: 'system', content: trSystem(target) }, { role: 'user', content: JSON.stringify(items) }],
        }),
      });
      if (![429, 502, 503, 504].includes(res.status) || attempt >= 2) break;
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      if (attempt >= 2) throw trErr("Couldn't reach openrouter.ai. Check your internet connection (and that the editor is open from a file on your computer).");
    }
    await new Promise((ok) => setTimeout(ok, 1500 * (attempt + 1)));
  }
  let data = null; try { data = await res.json(); } catch (_) { /* no body */ }
  const detail = data?.error?.message || '';
  if (!res.ok || data?.error) {
    const code = res.ok ? data.error.code : res.status;
    if (code === 401 || code === 403) throw trErr('OpenRouter did not accept the API key. Check it (it starts with sk-or-).');
    if (code === 402) throw trErr('The OpenRouter account has no credit left for this model. Add credit, or pick a cheaper model.');
    if (code === 429) throw trErr('Too many requests. Wait a moment and try again. ' + detail);
    if (code === 400 || code === 404) throw trErr(`OpenRouter could not use the model "${model}". ${detail}`);
    throw trErr(`OpenRouter answered ${code}. ${detail}`);
  }
  const choice = data?.choices?.[0], text = choice?.message?.content || '';
  if (choice?.finish_reason === 'length') throw trErr('too long', true);
  const a = text.indexOf('['), b = text.lastIndexOf(']');
  let arr; try { arr = JSON.parse(text.slice(a, b + 1)); } catch (_) { throw trErr('The answer was not readable.', true); }
  if (!Array.isArray(arr)) throw trErr('The answer was not readable.', true);
  return arr;
}
// A batch too long or unreadable is split in halves until it fits; one item that still fails is left as it is.
async function trBatch(items, target, key, model, signal, onDone) {
  try {
    const arr = await trCall(items.map(({ id, t }) => ({ id, text: t })), target, key, model, signal);
    const got = new Map(arr.map((x) => [x.id, x.text]));
    const bad = items.filter((it) => !trValid(it.t, got.get(it.id), it.keep));
    items.filter((it) => !bad.includes(it)).forEach((it) => onDone(it.id, trUnmask(got.get(it.id), it.keep)));
    if (bad.length && bad.length < items.length) await trBatch(bad, target, key, model, signal, onDone); // retry only the rejected ones
    else if (bad.length === 1) onDone(bad[0].id, null);
    else if (bad.length) { const h2 = bad.length >> 1; await trBatch(bad.slice(0, h2), target, key, model, signal, onDone); await trBatch(bad.slice(h2), target, key, model, signal, onDone); }
  } catch (e) {
    if (!e.retry) throw e;
    if (items.length === 1) { onDone(items[0].id, null); return; }
    const h2 = items.length >> 1;
    await trBatch(items.slice(0, h2), target, key, model, signal, onDone); await trBatch(items.slice(h2), target, key, model, signal, onDone);
  }
}

// Fonts for Hebrew: the editor's own Heebo (sans) or Frank Ruhl Libre (serif) when a font has no Hebrew letters.
function trHebrewFont(src, font) {
  if (bundledFont(font)?.langs.includes('he')) return font;
  const df = src.fonts?.find((f) => f.family === font);
  const generic = bundledFont(df ? df.fallback : font)?.generic || FONTS.find((x) => x[0] === font)?.[1] || 'sans-serif';
  return /serif/.test(generic) && !/sans/.test(generic) ? 'Frank Ruhl Libre' : 'Heebo';
}
const trSwap = (a) => (a === 'left' ? 'right' : a === 'right' ? 'left' : a);
// Mirrors the page left ↔ right (text boxes, lines, shapes, pictures, guides) and swaps left/right alignment.
function trMirror(d) {
  const W = d.size === 'Custom' && d.pageW ? d.pageW : (PAPER[d.size] || PAPER.A4).w;
  d.pages.forEach((p) => p.els.forEach((e) => {
    if (e.type === 'line') e.x = e.vert ? W - e.x - e.th : W - e.x - e.len;
    else {
      const w = e.type === 'text' && e.autoW ? (nodeOf(e.id)?.getBoundingClientRect().width || 0) / zoom : e.w;
      e.x = W - e.x - w;
      if (e.type === 'text' && e.o?.align) e.o = { ...e.o, align: trSwap(e.o.align) };
    }
  }));
  Object.values(d.styles).forEach((s) => { s.align = trSwap(s.align); });
  d.guides.x = d.guides.x.map((g) => W - g);
}

async function translateDoc(target, key, model, mirror, onProgress, signal) {
  const src = doc, items = trItems(src, target).map((e) => ({ id: e.id, ...trMask(e.text), e }));
  const results = new Map(); let done = 0;
  const chunks = []; let cur = [], size = 0;
  items.forEach((it) => { if (cur.length && (size + it.t.length > 3500 || cur.length >= 40)) { chunks.push(cur); cur = []; size = 0; } cur.push(it); size += it.t.length; });
  if (cur.length) chunks.push(cur);
  for (const c of chunks) {
    onProgress(done, items.length);
    await trBatch(c, target, key, model, signal, (id, text) => { results.set(id, text); done++; onProgress(done, items.length); });
  }
  const toDir = target === 'he' ? 'rtl' : 'ltr', flip = mirror && (src.dir || 'ltr') !== toDir;
  const d = clone(src);
  const left = [];
  d.pages.forEach((p) => p.els.forEach((e) => {
    if (e.type !== 'text' || !results.has(e.id)) return;
    const out = results.get(e.id);
    if (out == null) left.push(e); else e.text = out;
  }));
  d.dir = toDir; d.name = `${src.name || 'My CV'} (${target === 'he' ? 'עברית' : 'English'})`;
  if (target === 'he') {
    Object.values(d.styles).forEach((s) => { s.font = trHebrewFont(src, s.font); });
    d.pages.forEach((p) => p.els.forEach((e) => { if (e.o?.font) e.o = { ...e.o, font: trHebrewFont(src, e.o.font) }; }));
  }
  return { d, flip, translated: results.size - left.length, left: left.map((e) => plain(e).slice(0, 50)) };
}

// The key can also come from local-config.js, a file next to index.html that is never committed (see tools/make-local-config.mjs).
// It is looked for only when the editor runs from a local file.
if (trLocal()) {
  const cfg = document.createElement('script'); cfg.src = 'local-config.js'; cfg.onerror = () => cfg.remove();
  cfg.onload = () => { if ($('#trDialog').open && !trEls.key.value) trEls.key.value = window.CV_OPENROUTER_KEY || ''; }; // loaded after the window was opened
  document.head.append(cfg);
}

// ---------------------------------------------------------------- dialog
const trEls = { key: $('#trKey'), remember: $('#trRemember'), model: $('#trModel'), mirror: $('#trMirror'), note: $('#trNote'), size: $('#trSize') };
function trBusy(on) {
  $('#trProgress').hidden = !on; $('#trToEn').disabled = $('#trToHe').disabled = on || !trLocal();
  trEls.key.disabled = on;
}
function openTranslate() {
  trEls.key.value = trStore.get(TR_KEY) || trMemKey || (window.CV_OPENROUTER_KEY || '');
  trEls.remember.disabled = !keepCopy(); trEls.remember.checked = keepCopy() && trStore.get(TR_FORGET) !== 'off'; // remembered unless you switch it off
  $('#trForget').hidden = !trStore.get(TR_KEY);
  trEls.model.value = trStore.get(TR_MODEL) || TR_DEFAULT_MODEL;
  $('#trReview').replaceChildren(); trBusy(false);
  const local = trLocal();
  trEls.note.classList.toggle('off', !local);
  trEls.note.textContent = local
    ? 'Pressing a Translate button sends the text of this document to OpenRouter (openrouter.ai) with your API key, and nothing else. Until then nothing leaves your computer. The translation opens in a new tab; this one is not changed.'
    : 'Translate works when the editor is opened from the file on your computer. This hosted site blocks every outside connection to keep your CV private.';
  const sug = trSuggest(doc);
  [['en', '#trToEn'], ['he', '#trToHe']].forEach(([t, sel]) => { $(sel).classList.toggle('primary', t === sug); const n = trItems(doc, t).length; $(sel).title = `${n} text item${n === 1 ? '' : 's'} to translate`; });
  const n = trItems(doc, sug).length, chars = trItems(doc, sug).reduce((a, e) => a + e.text.length, 0);
  trEls.size.textContent = n ? `${n} text items, about ${chars.toLocaleString()} characters, will be sent.` : 'Nothing to translate into this language here.';
  trBusy(false); $('#trDialog').showModal();
}
async function runTranslate(target) {
  const key = trEls.key.value.trim();
  if (!key) { trEls.key.focus(); $('#trReview').replaceChildren(h('div', { class: 'check warn', textContent: 'Paste your OpenRouter API key first.' })); return; }
  if (!trItems(doc, target).length) { $('#trReview').replaceChildren(h('div', { class: 'check info', textContent: `Nothing here to translate into ${trLang[target]}.` })); return; }
  const model = trEls.model.value.trim() || TR_DEFAULT_MODEL; trStore.set(TR_MODEL, model); trMemKey = key;
  $('#trReview').replaceChildren(); trBusy(true);
  trAbort = new AbortController();
  const bar = $('#trBar'), st = $('#trStatus');
  try {
    const r = await translateDoc(target, key, model, trEls.mirror.checked, (d, n) => { bar.value = n ? d / n : 0; st.textContent = `Translating… ${d} of ${n}`; }, trAbort.signal);
    openDoc(r.d);
    if (trEls.remember.checked && keepCopy()) trStore.set(TR_KEY, key); else trStore.del(TR_KEY); // kept only once the key has worked
    if (r.flip) { trMirror(doc); undoStack.length = 0; render(); save(); }
    $('#trDialog').close();
    setStatus(`Translated to ${trLang[target]} in a new tab – read it through before you use it.`, 12000);
    if (r.left.length) alert(`${r.left.length} item(s) could not be translated safely and were left as they were:\n\n${r.left.join('\n')}`);
  } catch (e) {
    trBusy(false);
    if (e.name !== 'AbortError') $('#trReview').replaceChildren(h('div', { class: 'check bad', textContent: e.message }));
  } finally { trAbort = null; }
}
$('#btnTranslate').onclick = openTranslate;
$('#trToEn').onclick = () => runTranslate('en');
$('#trToHe').onclick = () => runTranslate('he');
$('#trCancel').onclick = () => trAbort?.abort();
$('#trClose').onclick = () => { trAbort?.abort(); $('#trDialog').close(); };
$('#trDialog').addEventListener('close', () => { trAbort?.abort(); });
trEls.remember.addEventListener('change', () => { if (trEls.remember.checked) trStore.del(TR_FORGET); else trStore.set(TR_FORGET, 'off'); });
$('#trForget').onclick = () => { trStore.del(TR_KEY); trMemKey = ''; trEls.key.value = ''; trEls.remember.checked = false; $('#trForget').hidden = true; };
