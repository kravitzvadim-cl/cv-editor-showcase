/* CV Editor – a tiny local, dependency-free page editor that exports real (selectable-text) PDFs
 * through the browser's "Save as PDF". Everything lives in one JSON document (see README). */
'use strict';

// ---------------------------------------------------------------- constants
const PT = 96 / 72; // CSS px per typographic point
const PAPER = { A4: { w: 794, h: 1122 }, Letter: { w: 816, h: 1055 } };
// Fonts installed on the computer. Calibri falls back to the bundled Carlito, which has identical letter widths.
const FONTS = [
  ['Arial', 'sans-serif'], ['Helvetica', 'sans-serif'], ['Calibri', '"Carlito", sans-serif'], ['Verdana', 'sans-serif'],
  ['Trebuchet MS', 'sans-serif'], ['Tahoma', 'sans-serif'], ['Georgia', 'serif'], ['Times New Roman', 'serif'],
  ['Garamond', 'serif'], ['Palatino', 'serif'], ['Courier New', 'monospace'],
];
const WEIGHTS = [[400, 'Regular'], [500, 'Medium'], [600, 'Semibold'], [700, 'Bold'], [800, 'Extra bold']];
const BULLETS = [['none', 'None'], ['dot', '• Dot'], ['dash', '– Dash'], ['arrow', '▸ Arrow'], ['num', '1. Numbers']];
const STYLE_ORDER = ['h1', 'h2', 'h3', 'h4', 'body', 'small'];
const ACCENT = '#1f4e79';

const defaultStyles = () => ({
  h1:    { label: 'Heading 1 · Name',          font: 'Arial', size: 28,  weight: 700, color: '#111111', italic: false, upper: false, lh: 1.15, ls: 0,   align: 'left' },
  h2:    { label: 'Heading 2 · Section',       font: 'Arial', size: 13,  weight: 700, color: ACCENT,    italic: false, upper: true,  lh: 1.2,  ls: 0.5, align: 'left' },
  h3:    { label: 'Heading 3 · Role / Degree', font: 'Arial', size: 11.5, weight: 700, color: '#111111', italic: false, upper: false, lh: 1.3,  ls: 0,   align: 'left' },
  h4:    { label: 'Heading 4 · Dates / Meta',  font: 'Arial', size: 10,  weight: 400, color: '#5b6270', italic: true,  upper: false, lh: 1.3,  ls: 0,   align: 'left' },
  body:  { label: 'Body text',                 font: 'Arial', size: 10,  weight: 400, color: '#222222', italic: false, upper: false, lh: 1.45, ls: 0,   align: 'left' },
  small: { label: 'Small text',                font: 'Arial', size: 9,   weight: 400, color: '#666666', italic: false, upper: false, lh: 1.4,  ls: 0,   align: 'left' },
});

// ---------------------------------------------------------------- state
let doc;                 // the document (see newDoc)
let sel = [];            // selected element ids
let zoom = 1;
let curPage = 0;         // page that receives new elements
let editingId = null;
const undoStack = [], redoStack = [];
let coalesceKey = null;  // groups rapid edits of one field into one undo step

const $ = (s, r = document) => r.querySelector(s);
const pagesEl = $('#pages');
const uid = () => 'e' + Math.random().toString(36).slice(2, 9);
const clone = (o) => JSON.parse(JSON.stringify(o));
const paper = () => (doc.size === 'Custom' && doc.pageW ? { w: doc.pageW, h: doc.pageH } : PAPER[doc.size] || PAPER.A4);
const mm = (px) => Math.round((px / 96) * 25.4); // CSS px → millimetres (for the page label)

// v2: each page's `els` order is both the reading order (PDF text, ATS) and the stacking order (later = on top).
// With autoOrder on, text is kept sorted by position (see autoOrdered); the Layers panel lets you set it by hand.
const PALETTE = ['#111111', ACCENT, '#5b6270', '#e8eef6', '#ffffff'];
function newDoc() {
  return { v: 2, name: 'My CV', size: 'A4', margin: 48, autoOrder: true, palette: [...PALETTE], guides: { x: [], y: [] }, styles: defaultStyles(), pages: [{ els: [] }] };
}
// A document from a file, the browser or a template, brought up to date
function normalize(d) {
  const n = { ...newDoc(), ...d, styles: { ...defaultStyles(), ...d.styles } };
  if (!(d.v >= 2)) { n.v = 2; n.autoOrder = true; } // older files kept text in position order anyway
  if (!Array.isArray(n.palette) || !n.palette.length) n.palette = [...PALETTE];
  if (!n.guides || !Array.isArray(n.guides.x) || !Array.isArray(n.guides.y)) n.guides = { x: [], y: [] };
  return n;
}

// ---------------------------------------------------------------- persistence / undo
// Privacy: the CVs are kept only in this browser's own storage (localStorage), never sent anywhere (see the policy in
// index.html). Switching "Keep a copy in this browser" off stops autosave and removes the stored copies.
// Every open document is a tab; `doc` is always the active tab's document (see "document tabs" below).
const DOC_KEY = 'cv-editor-doc', TABS_KEY = 'cv-editor-tabs', KEEP_KEY = 'cv-keep'; // DOC_KEY: the single-document format used before tabs
const keepCopy = () => { try { return localStorage.getItem(KEEP_KEY) !== 'off'; } catch (_) { return true; } };
let saveWarned = false;
function save() {
  if (!keepCopy() || !tabs.length) return;
  tabs[activeTab].doc = doc;
  try {
    // Only the document being edited is serialised on each change; the other tabs reuse their last text.
    const parts = tabs.map((t, i) => `{"fresh":${!!t.fresh},"doc":${i === activeTab ? JSON.stringify(doc) : (t.json ||= JSON.stringify(t.doc))}}`);
    localStorage.setItem(TABS_KEY, `{"v":1,"active":${activeTab},"tabs":[${parts.join(',')}]}`); saveWarned = false;
  } catch (_) {
    // browser storage is full (big imported PDFs): keep working, but make sure the user saves a file
    if (!saveWarned) setStatus('Too big to autosave in the browser – use Save to keep these documents', 12000);
    saveWarned = true;
  }
}
function pushUndo(snapshot = JSON.stringify(doc)) {
  if (tabs[activeTab]) tabs[activeTab].fresh = false;
  undoStack.push(snapshot); if (undoStack.length > 120) undoStack.shift(); redoStack.length = 0;
}
function mutate(fn, key) {
  if (key == null || key !== coalesceKey) pushUndo();
  coalesceKey = key ?? null;
  fn(); render(); save();
}
function restore(snapshot) {
  doc = JSON.parse(snapshot);
  const ids = new Set(doc.pages.flatMap((p) => p.els.map((e) => e.id)));
  sel = sel.filter((id) => ids.has(id)); coalesceKey = null;
  fullRender(); save();
}
function undo() { if (!undoStack.length) return; redoStack.push(JSON.stringify(doc)); restore(undoStack.pop()); }
function redo() { if (!redoStack.length) return; undoStack.push(JSON.stringify(doc)); restore(redoStack.pop()); }

// ---------------------------------------------------------------- element helpers
const allEls = () => doc.pages.flatMap((p) => p.els);
const selEls = () => sel.map((id) => allEls().find((e) => e.id === id)).filter(Boolean);
const primary = () => selEls().slice(-1)[0];
const pageIndexOf = (id) => doc.pages.findIndex((p) => p.els.some((e) => e.id === id));
const nodeOf = (id) => pagesEl.querySelector(`.el[data-id="${id}"]`);
// Free fonts bundled with the editor (fonts/doc, SIL OFL): they look the same on every computer and are embedded
// in the exported PDF. use: 'cv' = good for body text, 'headings' = display faces for titles only. langs: extra scripts.
const BUNDLED = [
  ['Inter', 'sans-serif', 'Best for CVs', 'cv', 'ru'], ['Roboto', 'sans-serif', 'Best for CVs', 'cv', 'ru'],
  ['Open Sans', 'sans-serif', 'Best for CVs', 'cv', 'ru he'], ['Lato', 'sans-serif', 'Best for CVs', 'cv', ''],
  ['Source Sans 3', 'sans-serif', 'Best for CVs', 'cv', 'ru'], ['Carlito', 'sans-serif', 'Best for CVs', 'cv', 'ru'],
  ['Merriweather', 'serif', 'Best for CVs', 'cv', 'ru'], ['Lora', 'serif', 'Best for CVs', 'cv', 'ru'],
  ['EB Garamond', 'serif', 'Best for CVs', 'cv', 'ru'], ['Source Serif 4', 'serif', 'Best for CVs', 'cv', 'ru'],
  ['Manrope', 'sans-serif', 'Modern', 'cv', 'ru'], ['Geist', 'sans-serif', 'Modern', 'cv', 'ru'], ['DM Sans', 'sans-serif', 'Modern', 'cv', ''],
  ['Montserrat', 'sans-serif', 'Headings', 'headings', 'ru'], ['Playfair Display', 'serif', 'Headings', 'headings', 'ru'],
  ['Rubik', 'sans-serif', 'Hebrew', 'cv', 'ru he'], ['Heebo', 'sans-serif', 'Hebrew', 'cv', 'he'],
  ['Assistant', 'sans-serif', 'Hebrew', 'cv', 'he'], ['Frank Ruhl Libre', 'serif', 'Hebrew', 'cv', 'he'],
].map(([name, generic, group, use, langs]) => ({ name, generic, group, use, langs: langs.split(' ').filter(Boolean) }));
const bundledFont = (name) => BUNDLED.find((f) => f.name === name);
// Fonts reused from an imported PDF live in doc.fonts; each falls back to the closest installed font.
const fontCss = (name) => {
  const df = doc.fonts?.find((f) => f.family === name);
  if (df) return `"${name}", ${fontCss(df.fallback)}`;
  const b = bundledFont(name); if (b) return `"${name}", ${b.generic}`;
  const f = FONTS.find((x) => x[0] === name); return `"${name}", ${f ? f[1] : 'sans-serif'}`;
};
// Font choices, grouped: from the imported PDF, bundled (by group), installed on this computer
const fontGroups = () => [
  ...(doc.fonts?.length ? [{ label: 'From this PDF', items: doc.fonts.map((f) => f.family) }] : []),
  ...[...new Set(BUNDLED.map((f) => f.group))].map((g) => ({ label: g, items: BUNDLED.filter((f) => f.group === g).map((f) => f.name) })),
  { label: 'On your computer', items: FONTS.map(([n]) => n) },
];
const fontOptions = () => fontGroups().map((g) => ({ label: g.label, items: g.items.map((n) => [n, n]) }));
const registeredFaces = new Set();
function registerDocFonts() {
  for (const fam of doc.fonts || []) for (const face of fam.faces) {
    const key = `${fam.family}|${face.weight}|${face.style}`;
    if (registeredFaces.has(key)) continue;
    registeredFaces.add(key);
    try {
      const bytes = Uint8Array.from(atob(face.data), (c) => c.charCodeAt(0));
      const ff = new FontFace(fam.family, bytes, { weight: String(face.weight), style: face.style });
      document.fonts.add(ff); ff.load().then(() => render(), () => {});
    } catch (_) { /* a broken font simply falls back */ }
  }
}
const styleOf = (e) => ({ ...doc.styles[e.style], ...(e.o || {}) });

function getBox(e) {
  if (e.type === 'text') {
    const n = nodeOf(e.id);
    const r = n?.getBoundingClientRect();
    return { x: e.x, y: e.y, w: e.autoW && r ? r.width / zoom : e.w, h: r ? r.height / zoom : 20 };
  }
  if (e.type === 'line') return e.vert ? { x: e.x, y: e.y, w: e.th, h: e.len } : { x: e.x, y: e.y, w: e.len, h: e.th };
  return { x: e.x, y: e.y, w: e.w, h: e.h };
}

// ---------------------------------------------------------------- rendering
function applyGeometry(e, n) {
  if (e.type === 'line') {
    const pad = 5;
    if (e.vert) Object.assign(n.style, { left: e.x - pad + 'px', top: e.y + 'px', width: e.th + 2 * pad + 'px', height: e.len + 'px' });
    else Object.assign(n.style, { left: e.x + 'px', top: e.y - pad + 'px', width: e.len + 'px', height: e.th + 2 * pad + 'px' });
    return;
  }
  n.style.left = e.x + 'px'; n.style.top = e.y + 'px'; n.style.width = e.type === 'text' && e.autoW ? 'max-content' : e.w + 'px';
  if (e.type !== 'text') n.style.height = e.h + 'px';
}

function bulletMark(kind, i) { return { dot: '•', dash: '–', arrow: '▸', num: i + 1 + '.' }[kind]; }

// Inline markup inside text: **bold**, and emails / web addresses / phone numbers become clickable links in the PDF.
const LINK_RE = /([\w.+-]+@[\w-]+(?:\.[\w-]+)+)|((?:https?:\/\/|www\.)\S+|(?:[\w-]+\.)+(?:com|org|net|io|dev|me|co|ai|app|info|eu|uk|de|fr|il|nl|ch|ca|au)(?:\/\S*)?)|(\+?\d[\d ().-]{7,}\d)/g;
function linkHref(m, t) {
  if (m[1]) return 'mailto:' + t;
  if (m[2]) return /^https?:/.test(t) ? t : 'https://' + t;
  return t.replace(/\D/g, '').length >= 9 ? 'tel:' + t.replace(/[^\d+]/g, '') : null; // skip short numbers like 2013-2017
}
// :name: icons (see icons.js), drawn 1em high in the text colour or the item's icon colour
const ICON_RE = new RegExp(`:(${Object.keys(ICONS).join('|')}):`, 'g');
function iconSvg(name) {
  const [kind, body] = ICONS[name];
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'icon ' + kind);
  svg.innerHTML = kind === 'f' ? `<path d="${body}"/>` : body;
  return svg;
}
function appendIcons(parent, str) {
  let last = 0;
  for (const m of str.matchAll(ICON_RE)) { parent.append(str.slice(last, m.index), iconSvg(m[1])); last = m.index + m[0].length; }
  parent.append(str.slice(last));
}
// Written links [visible text](address); the address may be a URL, an email or a phone number.
const MDLINK_RE = /\[([^\]]+)\]\(([^)\s]+)\)/g;
function normalizeHref(u) {
  if (/^(https?:|mailto:|tel:)/i.test(u)) return u;
  if (/^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(u)) return 'mailto:' + u;
  if (/^\+?[\d ().-]{7,}$/.test(u)) return 'tel:' + u.replace(/[^\d+]/g, '');
  return 'https://' + u;
}
function appendAutoLinks(parent, str) {
  let last = 0;
  for (const m of str.matchAll(LINK_RE)) {
    const t = m[0].replace(/[.,;:)]+$/, ''), href = linkHref(m, t);
    if (!href || m.index < last) continue;
    appendIcons(parent, str.slice(last, m.index));
    parent.append(h('a', { href, textContent: t }));
    last = m.index + t.length;
  }
  appendIcons(parent, str.slice(last));
}
// **words** is bold; **(500)words**, **(600)words**, **(700)words** set an exact weight (Medium, Semibold, Bold).
const WEIGHT_MARK = /^\((\d00)\)/;
const MARKED_RE = /\*\*(?:\(\d00\))?([^*]+)\*\*/g; // any weight run; $1 = its words
function weightRun(inner, boldWeight) {
  const m = inner.match(WEIGHT_MARK);
  const b = h(m && m[1] === '400' ? 'span' : 'b'); b.style.fontWeight = m ? m[1] : boldWeight;
  return [b, m ? inner.slice(m[0].length) : inner];
}
// __words__ is underlined. It opens after a space or punctuation and closes before one, so file_names and
// __init__-style words are left alone; it can hold **bold** and links, and sit inside them.
const UL_SRC = '(?<![\\w_])__(?=\\S)((?:(?!__).)+?)(?<=\\S)__(?![\\w_])';
const UL_RE = new RegExp(UL_SRC, 'g');
const BOLD_UL_RE = new RegExp(`\\*\\*([^*]+)\\*\\*|${UL_SRC}`, 'g'); // inside a link: bold or underline
function appendBold(parent, str, boldWeight, add) {
  let last = 0;
  for (const m of str.matchAll(BOLD_UL_RE)) {
    add(parent, str.slice(last, m.index));
    if (m[1] !== undefined) { const [b, inner] = weightRun(m[1], boldWeight); appendBold(b, inner, boldWeight, add); parent.append(b); }
    else { const u = h('u'); appendBold(u, m[2], boldWeight, add); parent.append(u); }
    last = m.index + m[0].length;
  }
  add(parent, str.slice(last));
}
// Left to right, whichever starts first wins: a written link [text](address) – whose text may be **bold** or
// __underlined__ – or **bold** or __underline__ – which may contain links. Everything else gets auto-links and icons.
const INLINE_RE = new RegExp(`\\[([^\\]]+)\\]\\(([^)\\s]+)\\)|\\*\\*((?:\\[[^\\]]+\\]\\([^)\\s]+\\)|[^*])+)\\*\\*|${UL_SRC}`, 'g');
function appendInline(parent, str, boldWeight) {
  let last = 0;
  for (const m of str.matchAll(INLINE_RE)) {
    appendAutoLinks(parent, str.slice(last, m.index));
    if (m[1] !== undefined) {
      const a = h('a', { href: normalizeHref(m[2]) }); appendBold(a, m[1], boldWeight, appendIcons); parent.append(a);
    } else if (m[3] !== undefined) {
      const [b, inner] = weightRun(m[3], boldWeight); appendInline(b, inner, boldWeight); parent.append(b);
    } else {
      const u = h('u'); appendInline(u, m[4], boldWeight); parent.append(u);
    }
    last = m.index + m[0].length;
  }
  appendAutoLinks(parent, str.slice(last));
}

function fillText(e, n) {
  n.textContent = '';
  if (editingId === e.id) { n.textContent = e.text; return; } // edit the raw text, markup included
  const bold = styleOf(e).weight >= 600 ? 800 : 700, list = e.bullet && e.bullet !== 'none';
  e.text.split('\n').forEach((line, i) => {
    const d = h('div', { class: list ? 'li' : '' });
    // the bullet is a real character placed before the text, so it is also first in the PDF text
    const mark = list ? h('span', { class: 'mark', textContent: bulletMark(e.bullet, i) }) : '';
    const tab = line.indexOf('\t');
    if (tab >= 0) { // "left<Tab>right" puts the right part against the right edge, e.g. dates
      d.classList.add('tabline');
      const l = h('span', {}, mark), r = h('span', { class: 'tabr' });
      appendInline(l, line.slice(0, tab), bold); appendInline(r, line.slice(tab + 1).replace(/\t/g, ' '), bold);
      d.append(l, r);
    } else {
      d.append(mark);
      if (line) appendInline(d, line, bold); else d.append('\u200b'); // keeps empty lines their height
    }
    n.appendChild(d);
  });
}

function buildNode(e) {
  const n = document.createElement('div');
  n.className = 'el ' + e.type + (e.hidden ? ' hidden' : '') + (e.locked ? ' locked' : ''); n.dataset.id = e.id;
  applyGeometry(e, n);
  if (e.type === 'text') {
    const s = styleOf(e);
    Object.assign(n.style, {
      fontFamily: fontCss(s.font), fontSize: s.size * PT + 'px', fontWeight: s.weight, fontStyle: s.italic ? 'italic' : 'normal', textDecoration: s.underline ? 'underline' : 'none',
      color: s.color, lineHeight: s.lh, letterSpacing: s.ls * PT + 'px', textTransform: s.upper ? 'uppercase' : 'none', textAlign: s.align,
      minHeight: s.size * PT * s.lh + 2 * ((e.py || 0) + (e.bw || 0)) + 'px',
    });
    // optional box around the text: fill, border, rounded corners, padding (chips, highlighted blocks)
    if (e.bg) n.style.background = e.bg;
    if (e.bw) n.style.border = `${e.bw}px solid ${e.bd || '#111111'}`;
    if (e.br) n.style.borderRadius = e.br + 'px';
    if (e.px || e.py) n.style.padding = `${e.py || 0}px ${e.px || 0}px`;
    if (e.ic) n.style.setProperty('--ic', e.ic);
    if (doc.dir === 'rtl') n.dir = 'rtl'; // Hebrew: right to left, bullets and dates on the other side
    fillText(e, n);
  } else if (e.type === 'line') {
    const i = document.createElement('div');
    const edge = e.vert ? 'borderLeft' : 'borderTop';
    Object.assign(i.style, { position: 'absolute', [edge]: `${e.th}px ${e.dash} ${e.color}`, pointerEvents: 'none' });
    if (e.vert) Object.assign(i.style, { left: '5px', top: 0, bottom: 0 }); else Object.assign(i.style, { top: '5px', left: 0, right: 0 });
    n.appendChild(i);
  } else if (e.type === 'rect') {
    Object.assign(n.style, {
      background: e.fill || 'transparent', border: e.sw ? `${e.sw}px solid ${e.stroke}` : 'none',
      borderRadius: e.shape === 'ellipse' ? '50%' : e.radius + 'px', opacity: e.opacity, boxSizing: 'border-box',
    });
  } else if (e.type === 'image') {
    Object.assign(n.style, { overflow: 'hidden', borderRadius: e.radius + 'px', opacity: e.opacity });
    const img = document.createElement('img');
    img.src = e.src; img.draggable = false;
    Object.assign(img.style, { width: '100%', height: '100%', objectFit: e.fit, display: 'block', pointerEvents: 'none' });
    n.appendChild(img);
  }
  return n;
}

// ---------------------------------------------------------------- reading order
// The DOM (and so the PDF text) follows each page's `els` order. Automatic order: shapes and pictures first
// (in their own order, so they stay behind), then the text the way a person reads the page – a recursive
// XY-cut: rows of the page top to bottom, and real columns (a sidebar) one after the other.
function autoOrdered(p) {
  const texts = p.els.filter((e) => e.type === 'text');
  const W = paper().w, rtl = doc.dir === 'rtl'; // a right-to-left page is read from its right edge
  const box = (e) => { const b = getBox(e); return rtl ? { ...b, x: W - b.x - b.w } : b; };
  return [...p.els.filter((e) => e.type !== 'text'), ...xyOrder(texts.map((e) => ({ e, b: box(e) }))).map((it) => it.e)];
}
// Split items into runs along one axis wherever nothing overlaps (bands for 'y', columns for 'x').
function splitRuns(items, ax) {
  const size = ax === 'y' ? 'h' : 'w', out = [];
  let cur = [], end = -Infinity;
  [...items].sort((a, b) => a.b[ax] - b.b[ax]).forEach((it) => {
    if (cur.length && it.b[ax] > end - 1) { out.push(cur); cur = []; }
    cur.push(it); end = Math.max(end, it.b[ax] + it.b[size]);
  });
  if (cur.length) out.push(cur);
  return out;
}
function xyOrder(items) {
  if (items.length < 2) return items;
  const bands = splitRuns(items, 'y');
  if (bands.length === 1) {
    const cols = splitRuns(items, 'x');
    if (cols.length > 1) return cols.flatMap(xyOrder);
    return [...items].sort((a, b) => (Math.abs(a.b.y - b.b.y) > 6 ? a.b.y - b.b.y : a.b.x - b.b.x));
  }
  // Consecutive bands that share a free vertical gutter form one region (e.g. a main column next to a sidebar).
  const regions = [];
  bands.forEach((band) => {
    const last = regions[regions.length - 1];
    if (last && splitRuns([...last.flat(), ...band], 'x').length > 1) last.push(band); else regions.push([band]);
  });
  return regions.flatMap((reg) => {
    if (reg.length === 1) return xyOrder(reg[0]);
    const all = reg.flat(), cols = splitRuns(all, 'x');
    // A grid (labels next to their content) lines its rows up; columns that don't line up are read one by one.
    const big = cols.reduce((a, c) => (c.length > a.length ? c : a));
    const rest = cols.filter((c) => c !== big).flat();
    const aligned = rest.filter((it) => all.some((o) => !rest.includes(o) && Math.abs(o.b.y - it.b.y) < 5)).length;
    return aligned / rest.length >= 0.6 ? reg.flatMap(xyOrder) : cols.flatMap(xyOrder);
  });
}
const inAutoOrder = (p) => autoOrdered(p).every((e, i) => e === p.els[i]);
// Changes the order by hand (Layers, front/back). If that breaks the automatic order, it switches to manual.
function reorderWith(fn) {
  let switched = false;
  mutate(() => { fn(); if (doc.autoOrder && !doc.pages.every(inAutoOrder)) { doc.autoOrder = false; switched = true; } });
  if (switched) setStatus('Order is now set by hand – turn on “Auto” in Layers to sort text by position again', 9000);
  buildPanels();
}
// Elements in document order (page by page, then list order)
const docOrder = (els) => [...els].sort((a, b) => {
  const pa = pageIndexOf(a.id), pb = pageIndexOf(b.id);
  return pa - pb || doc.pages[pa].els.indexOf(a) - doc.pages[pb].els.indexOf(b);
});

function render() {
  const { w, h: ph } = paper();
  pagesEl.textContent = '';
  doc.pages.forEach((p, i) => {
    const pg = document.createElement('div');
    pg.className = 'page'; pg.dataset.i = i;
    Object.assign(pg.style, { width: w + 'px', height: ph + 'px', zoom });
    pg.style.setProperty('--m', doc.margin + 'px');
    pg.innerHTML = `<span class="pagebadge">Page ${i + 1} · ${doc.size} · ${mm(w)} × ${mm(ph)} mm</span><div class="margin-guide"></div>`;
    if (showOriginal && originals[i]) pg.append(h('img', { class: 'original', src: originals[i], alt: '' }));
    p.els.forEach((e) => pg.appendChild(buildNode(e)));
    pagesEl.appendChild(pg);
  });
  if (doc.autoOrder) doc.pages.forEach((p, i) => { // sorting needs the real text heights, so it runs after layout
    if (inAutoOrder(p)) return;
    p.els.splice(0, p.els.length, ...autoOrdered(p));
    p.els.forEach((e) => pagesEl.children[i].appendChild(nodeOf(e.id)));
  });
  checkBounds();
  updateSelection(false);
  if (typeof refreshLayers === 'function') refreshLayers();
  if (typeof placeGuides === 'function') placeGuides();
}

// Mark items that would be cut off (outside the page) or that break the margins (text only).
function boundsProblems() {
  const { w, h: ph } = paper(), m = doc.margin, outside = [], outMargin = [];
  allEls().filter((e) => !e.hidden).forEach((e) => {
    const b = getBox(e), r = b.x + b.w, btm = b.y + b.h;
    if (b.x < -0.5 || b.y < -0.5 || r > w + 0.5 || btm > ph + 0.5) outside.push(e);
    else if (e.type === 'text' && (b.x < m - 0.5 || b.y < m - 0.5 || r > w - m + 0.5 || btm > ph - m + 0.5)) outMargin.push(e);
  });
  return { outside, outMargin };
}
function checkBounds() {
  const { outside, outMargin } = boundsProblems();
  pagesEl.querySelectorAll('.el').forEach((n) => {
    n.classList.toggle('outside', outside.some((e) => e.id === n.dataset.id));
    n.classList.toggle('outmargin', outMargin.some((e) => e.id === n.dataset.id));
  });
  const warn = $('#warn');
  warn.hidden = !outside.length;
  warn.textContent = `⚠ ${outside.length} item${outside.length > 1 ? 's' : ''} outside the page`;
  warn.onclick = () => { sel = outside.map((e) => e.id); updateSelection(); nodeOf(sel[0])?.scrollIntoView({ block: 'center' }); };
}

function fullRender() {
  $('#docName').value = doc.name; registerDocFonts(); syncPaper(); $('#zoomLabel').textContent = Math.round(zoom * 100) + '%';
  render(); buildPanels();
}

const BOX_HANDLES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
const HANDLES = { text: ['w', 'e'], rect: BOX_HANDLES, image: BOX_HANDLES };
function updateSelection(rebuildPanel = true) {
  pagesEl.querySelectorAll('.handle').forEach((x) => x.remove());
  pagesEl.querySelectorAll('.el').forEach((n) => n.classList.toggle('sel', sel.includes(n.dataset.id)));
  if (sel.length === 1) {
    const e = primary(), n = e && nodeOf(e.id);
    if (n && editingId !== e.id && !e.locked) {
      const hs = e.type === 'line' ? (e.vert ? ['n', 's'] : ['w', 'e']) : HANDLES[e.type];
      hs.forEach((k) => { const d = document.createElement('div'); d.className = 'handle ' + k; d.dataset.h = k; n.appendChild(d); });
    }
  }
  if (typeof syncLayerSel === 'function') syncLayerSel();
  if (typeof drawRulers === 'function') drawRulers();
  if (rebuildPanel) buildPanels();
}

// ---------------------------------------------------------------- adding elements
function addElement(kind, extra = {}, edit = true) {
  const pi = Math.min(curPage, doc.pages.length - 1), page = doc.pages[pi];
  const m = doc.margin, W = paper().w;
  const bottom = page.els.reduce((b, e) => { const x = getBox(e); return Math.max(b, x.y + x.h); }, m - 12);
  const y = Math.min(bottom + 12, paper().h - m - 40);
  const base = { id: uid(), x: m, y };
  let e;
  const textDefaults = {
    h1: 'Your Name', h2: 'Section', h3: 'Role or Degree', h4: 'Company · 2020 – Present', body: 'Write something…', small: 'Small note',
  };
  if (STYLE_ORDER.includes(kind)) e = { ...base, type: 'text', w: W - 2 * m, style: kind, o: {}, bullet: 'none', text: textDefaults[kind] };
  else if (kind === 'list') e = { ...base, type: 'text', w: W - 2 * m, style: 'body', o: {}, bullet: 'dot', text: 'First point\nSecond point\nThird point' };
  else if (kind === 'contact') e = { ...base, type: 'text', w: W - 2 * m, style: 'small', o: {}, bullet: 'none', ic: ACCENT, text: ':mail: you@example.com   :phone: +1 555 000 0000   :linkedin: linkedin.com/in/you   :github: github.com/you' };
  else if (kind === 'titledate') e = { ...base, type: 'text', w: W - 2 * m, style: 'h3', o: {}, bullet: 'none', text: 'Job title — Company\tJan 2020 – Present' };
  else if (kind === 'chip') e = { ...base, type: 'text', w: 100, autoW: true, style: 'small', o: { color: ACCENT, weight: 600 }, bullet: 'none', bg: '#e8eef6', br: 10, px: 9, py: 3, text: 'Skill' };
  else if (kind === 'line') e = { ...base, type: 'line', len: W - 2 * m, th: 1.5, color: ACCENT, dash: 'solid', vert: false };
  else if (kind === 'vline') e = { ...base, type: 'line', len: 200, th: 1.5, color: ACCENT, dash: 'solid', vert: true };
  else if (kind === 'rect') e = { ...base, type: 'rect', w: 160, h: 80, fill: '#e8eef6', stroke: ACCENT, sw: 0, radius: 0, opacity: 1 };
  else if (kind === 'ellipse') e = { ...base, type: 'rect', shape: 'ellipse', w: 80, h: 80, fill: '#e8eef6', stroke: ACCENT, sw: 0, radius: 0, opacity: 1 };
  else if (kind === 'image') e = { ...base, type: 'image', radius: 0, opacity: 1, fit: 'cover', ...extra };
  Object.assign(e, extra);
  if (e.type === 'text' && e.x + e.w > W - m) e.w = Math.max(120, W - m - e.x); // dropped further right: keep it on the page
  mutate(() => { page.els.push(e); sel = [e.id]; });
  nodeOf(e.id).scrollIntoView({ block: 'nearest' });
  if (e.type === 'text' && edit) startEdit(e.id, true);
}

let imageAt = null, imageFor = null; // where a dragged-in Image button was dropped: { x, y }; the image being replaced
function pickImage(at = null, target = null) { imageAt = at; imageFor = target; $('#fileImage').click(); }
$('#fileImage').addEventListener('change', (ev) => {
  const f = ev.target.files[0]; ev.target.value = ''; if (f) placeImage(f, imageAt, imageFor); imageAt = imageFor = null;
});
// A new picture at `at`, or a new picture inside an existing image item (keeps its frame; the crop fills it)
function placeImage(f, at, target = null) {
  const r = new FileReader();
  r.onload = () => {
    const img = new Image();
    img.onload = () => { // downscale big photos so the saved file stays small
      const k = Math.min(1, 1000 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const png = f.type === 'image/png';
      const src = c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.9);
      if (target) { mutate(() => { target.src = src; target.fit = 'cover'; sel = [target.id]; }); buildPanels(); return; }
      const w = 120;
      addElement('image', { src, w, h: Math.round((w * img.height) / img.width), type: 'image', ...(at || {}) });
    };
    img.src = r.result;
  };
  r.readAsDataURL(f);
}

// ---------------------------------------------------------------- text editing
function startEdit(id, selectAll) {
  const e = allEls().find((x) => x.id === id), n = nodeOf(id);
  if (!e || e.type !== 'text' || !n) return;
  editingId = id; sel = [id];
  fillText(e, n); updateSelection(false);
  n.classList.add('editing');
  n.contentEditable = 'plaintext-only';
  if (n.contentEditable !== 'plaintext-only') n.contentEditable = 'true';
  n.focus();
  if (selectAll) document.getSelection().selectAllChildren(n);
  showTextBar(n); buildPanels();
  const finish = () => {
    n.removeEventListener('blur', finish);
    hideTextBar();
    n.style.textTransform = 'none'; // innerText would otherwise bake CSS uppercase into the data
    const text = n.innerText.replace(/​/g, '').replace(/\n+$/, '');
    editingId = null;
    if (!text.trim()) mutate(() => { doc.pages.forEach((p) => { p.els = p.els.filter((x) => x.id !== id); }); sel = []; });
    else if (text !== e.text) mutate(() => { e.text = text; });
    else render();
    buildPanels();
  };
  n.addEventListener('blur', finish);
  n.addEventListener('keydown', (ev) => {
    const ins = (t) => { ev.preventDefault(); document.execCommand('insertText', false, t); };
    if (ev.key === 'Escape') { ev.preventDefault(); n.blur(); }
    else if (ev.key === 'Tab') ins('\t'); // Tab = push the rest of the line to the right edge
    else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'u') { ev.preventDefault(); toggleUnderline(); } else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'b') { ev.preventDefault(); toggleBold(); } else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') { ev.preventDefault(); insertLink(); }
    ev.stopPropagation();
  });
  n.addEventListener('paste', (ev) => { ev.preventDefault(); document.execCommand('insertText', false, ev.clipboardData.getData('text/plain')); });
}

// Ctrl+K / Link button: turns the selected words into [words](address). If the selection already is an
// address (linkedin.com/in/you, you@mail.com) it links straight to it; otherwise the caret is left inside
// "(https://)" so you can type the address.
function insertLink() {
  const s = document.getSelection().toString().trim();
  const isAddr = s && !/\s/.test(s) && (/[\w-]+\.[a-z]{2,}/i.test(s) || /^\+?[\d().-]{7,}$/.test(s));
  if (isAddr) { document.execCommand('insertText', false, `[${s}](${s})`); return; }
  document.execCommand('insertText', false, `[${s || 'link text'}](https://)`);
  document.getSelection().modify('move', 'backward', 'character'); // caret before ")"
}
// Insert at the caret while editing; on a selected (not edited) text, start editing at the end first.
function insertIntoText(fn) {
  if (!editingId) {
    const e = primary(); if (!e || e.type !== 'text') return;
    startEdit(e.id, false);
    const n = nodeOf(e.id); document.getSelection().selectAllChildren(n); document.getSelection().collapseToEnd();
  }
  fn();
}

// ---------------------------------------------------------------- word weights while editing
// A small toolbar floats above the text being edited: Regular · Medium · Semibold · Bold for the selected words
// (or the word at the caret). Its buttons never take the focus, so the edit goes on.
const BAR_WEIGHTS = [[400, 'Regular'], [500, 'Medium'], [600, 'Semibold'], ['b', 'Bold']];
const textBar = h('div', { id: 'textBar', role: 'toolbar', 'aria-label': 'Selected words', hidden: true },
  ...BAR_WEIGHTS.map(([w, label]) => h('button', {
    textContent: label, 'data-w': w, title: `${label} – for the selected words`, onmousedown: (ev) => ev.preventDefault(),
    onclick: () => setWeight(w), style: `font-weight:${w === 'b' ? 700 : w}`,
  })),
  h('span', { class: 'sep' }),
  h('button', { innerHTML: '<u>U</u>', 'data-u': '1', title: 'Ctrl+U – underline the selected words', onmousedown: (ev) => ev.preventDefault(), onclick: () => toggleUnderline() }),
  h('button', { textContent: '🔗 Link', title: 'Ctrl+K – link the selected words', onmousedown: (ev) => ev.preventDefault(), onclick: () => insertLink() }));
document.body.append(textBar);
function showTextBar(n) { textBar.hidden = false; placeTextBar(n); markTextBar(); }
function hideTextBar() { textBar.hidden = true; }
function placeTextBar(n = editingId && nodeOf(editingId)) {
  if (!n || textBar.hidden) return;
  const r = n.getBoundingClientRect(), bh = textBar.offsetHeight, bw = textBar.offsetWidth;
  const top = r.top - bh - 10 < 56 ? r.bottom + 10 : r.top - bh - 10;
  Object.assign(textBar.style, { top: top + 'px', left: Math.max(8, Math.min(r.left, window.innerWidth - bw - 8)) + 'px' });
}
$('#stage').addEventListener('scroll', () => placeTextBar());
window.addEventListener('resize', () => placeTextBar());

// The selection inside the edited text, widened to the word at the caret and to the weight marks around it.
function selectWithMarks(underline = false) {
  const s = document.getSelection(); if (!s.rangeCount) return '';
  if (s.isCollapsed) { s.modify('move', 'backward', 'word'); s.modify('extend', 'forward', 'word'); }
  const r = s.getRangeAt(0), node = r.startContainer;
  if (node === r.endContainer && node.nodeType === 3) {
    const t = node.data; let a = r.startOffset, b = r.endOffset;
    while (b > a && /\s/.test(t[b - 1])) b--; // a word selection takes the space after it too
    // grow to every weight run it touches, so the marks are replaced, never nested or cut in half
    for (const m of t.matchAll(underline ? UL_RE : /\*\*(?:\(\d00\))?[^*]+\*\*/g)) {
      const s0 = m.index, e0 = m.index + m[0].length;
      if (s0 < b && e0 > a) { a = Math.min(a, s0); b = Math.max(b, e0); }
    }
    r.setStart(node, a); r.setEnd(node, b); s.removeAllRanges(); s.addRange(r);
  }
  return s.toString();
}
// Each tab-separated part of `str` with weight `w` (400 removes the marks, 'b' is plain bold).
function weightMarkup(str, w) {
  return str.split('\t').map((p) => {
    const bare = p.replace(MARKED_RE, '$1').replace(/\*\*(\(\d00\))?/g, '');
    if (!bare.trim()) return p;
    return w === 400 ? bare : w === 'b' ? `**${bare}**` : `**(${w})${bare}**`;
  }).join('\t');
}
function setWeight(w) {
  if (!editingId) return;
  const str = selectWithMarks();
  if (!str.trim()) return;
  const out = weightMarkup(str, w);
  document.execCommand('insertText', false, out);
  // keep the same words selected (inside their marks), so another weight can follow and the bar shows this one
  const sel = document.getSelection(), node = sel.anchorNode, end = sel.anchorOffset;
  if (node?.nodeType === 3 && end >= out.length && !out.includes('\t')) {
    const pre = (out.match(/^\*\*(\(\d00\))?/) || [''])[0].length, r = document.createRange();
    r.setStart(node, end - out.length + pre); r.setEnd(node, end - (pre ? 2 : 0));
    sel.removeAllRanges(); sel.addRange(r);
  }
  markTextBar();
}
// Underline the selected words (or the word at the caret); words already underlined lose it again.
function underlineMarkup(str, on) {
  return str.split('\t').map((p) => {
    const [, lead, core, tail] = p.match(/^(\s*)([\s\S]*?)(\s*)$/);
    const bare = core.replace(UL_RE, '$1').replace(/__/g, '');
    return bare ? lead + (on ? `__${bare}__` : bare) + tail : p;
  }).join('\t');
}
function toggleUnderline() {
  if (!editingId) return;
  const str = selectWithMarks(true);
  if (!str.trim()) { document.execCommand('insertText', false, '__underlined__'); return; }
  const on = !new RegExp(`^${UL_SRC}$`).test(str.trim());
  const out = underlineMarkup(str, on);
  document.execCommand('insertText', false, out);
  const sel = document.getSelection(), node = sel.anchorNode, end = sel.anchorOffset; // keep the words selected, inside their marks
  if (node?.nodeType === 3 && end >= out.length && !out.includes('\t') && on) {
    const r = document.createRange(), lead = out.length - out.trimStart().length;
    r.setStart(node, end - out.length + lead + 2); r.setEnd(node, end - (out.length - out.trimEnd().length) - 2);
    sel.removeAllRanges(); sel.addRange(r);
  }
  markTextBar();
}
function toggleBold() {
  const str = document.getSelection().toString();
  if (!str) { document.execCommand('insertText', false, '**bold**'); return; }
  document.execCommand('insertText', false, weightMarkup(str, /^\*\*[^*]+\*\*$/.test(str) ? 400 : 'b'));
}
// Light up the weight the caret or selection sits in.
function markTextBar() {
  if (textBar.hidden) return;
  const s = document.getSelection(); let w = 400;
  if (s.rangeCount && s.anchorNode?.nodeType === 3) {
    const t = s.anchorNode.data, at = Math.min(s.anchorOffset, s.focusOffset ?? s.anchorOffset);
    const open = t.lastIndexOf('**', at), m = open >= 0 ? t.slice(open).match(/^\*\*(\((\d00)\))?[^*]*\*\*/) : null;
    const runs = t.slice(0, at).split('**').length - 1; // inside a run when an odd number of marks come before
    if (m && runs % 2 === 1) w = m[2] ? +m[2] : 'b';
  }
  textBar.querySelectorAll('[data-w]').forEach((b) => b.classList.toggle('active', String(b.dataset.w) === String(w)));
  let u = false;
  if (s.rangeCount && s.anchorNode?.nodeType === 3) {
    const t = s.anchorNode.data, at = Math.min(s.anchorOffset, s.focusOffset ?? s.anchorOffset);
    u = [...t.matchAll(UL_RE)].some((m) => m.index < at && at < m.index + m[0].length);
  }
  textBar.querySelector('[data-u]').classList.toggle('active', u);
}
document.addEventListener('selectionchange', () => { if (editingId) markTextBar(); });

// ---------------------------------------------------------------- mouse: select, drag, resize
function snapOffsets(box, dx, dy, others, W, H) {
  const m = doc.margin, xs = [0, m, W / 2, W - m, W], ys = [0, m, H / 2, H - m, H];
  others.forEach((o) => { xs.push(o.x, o.x + o.w / 2, o.x + o.w); ys.push(o.y, o.y + o.h / 2, o.y + o.h); });
  xs.push(...(doc.guides?.x || [])); ys.push(...(doc.guides?.y || [])); // ruler guides
  const th = 6 / zoom;
  const best = (pts, cands) => {
    let r = { d: 0, at: null, gap: th };
    pts.forEach((p) => cands.forEach((c) => { const g = Math.abs(c - p); if (g < r.gap) r = { d: c - p, at: c, gap: g }; }));
    return r;
  };
  return {
    x: best([box.x + dx, box.x + dx + box.w / 2, box.x + dx + box.w], xs),
    y: best([box.y + dy, box.y + dy + box.h / 2, box.y + dy + box.h], ys),
  };
}

function showGuides(pageNode, gx, gy) {
  pageNode.querySelectorAll('.guide').forEach((g) => g.remove());
  const add = (cls, pos) => { const g = document.createElement('div'); g.className = 'guide ' + cls; g.style[cls === 'v' ? 'left' : 'top'] = pos + 'px'; pageNode.appendChild(g); };
  if (gx != null) add('v', gx);
  if (gy != null) add('h', gy);
}

function startDrag(ev) {
  const els = selEls().filter((e) => !e.locked && !e.hidden); if (!els.length) return;
  const before = JSON.stringify(doc), starts = els.map((e) => [e.x, e.y]);
  const pi = pageIndexOf(els[0].id), pageNode = pagesEl.children[pi], page = doc.pages[pi];
  const others = page.els.filter((e) => !sel.includes(e.id) && !e.hidden).map(getBox);
  const boxes = els.map(getBox);
  const gb = { x: Math.min(...boxes.map((b) => b.x)), y: Math.min(...boxes.map((b) => b.y)) };
  gb.w = Math.max(...boxes.map((b) => b.x + b.w)) - gb.x; gb.h = Math.max(...boxes.map((b) => b.y + b.h)) - gb.y;
  let moved = false;
  const move = (m) => {
    let dx = (m.clientX - ev.clientX) / zoom, dy = (m.clientY - ev.clientY) / zoom;
    if (!moved && Math.hypot(dx, dy) * zoom < 3) return;
    moved = true;
    let gx = null, gy = null;
    if ($('#snapToggle').checked && !m.altKey) {
      const s = snapOffsets(gb, dx, dy, others, paper().w, paper().h);
      dx += s.x.d; dy += s.y.d; gx = s.x.at; gy = s.y.at;
    }
    els.forEach((e, i) => { e.x = Math.round((starts[i][0] + dx) * 10) / 10; e.y = Math.round((starts[i][1] + dy) * 10) / 10; applyGeometry(e, nodeOf(e.id)); });
    showGuides(pageNode, gx, gy);
    if (typeof drawRulers === 'function') drawRulers();
  };
  const up = () => {
    window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
    pageNode.querySelectorAll('.guide').forEach((g) => g.remove());
    if (moved) { pushUndo(before); coalesceKey = null; render(); save(); buildPanels(); } // render: the reading order may change
  };
  window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
}

// Handles on every side and corner. Corners keep the proportions of pictures (Shift frees them) and of
// boxes/circles while Shift is held; the opposite side stays put.
function startResize(ev, which) {
  const e = primary(), n = nodeOf(e.id), before = JSON.stringify(doc);
  if (e.type === 'text' && e.autoW) { e.w = Math.round(getBox(e).w); e.autoW = false; }
  const s = { x: e.x, y: e.y, w: e.w, h: e.h, len: e.len }, ratio = e.w / e.h;
  const move = (m) => {
    const dx = (m.clientX - ev.clientX) / zoom, dy = (m.clientY - ev.clientY) / zoom;
    if (e.type === 'line') {
      const d = e.vert ? dy : dx, grow = which === 'e' || which === 's';
      e.len = Math.max(10, Math.round(grow ? s.len + d : s.len - d));
      if (!grow) e[e.vert ? 'y' : 'x'] = s[e.vert ? 'y' : 'x'] + s.len - e.len;
    } else {
      let w = s.w, ht = s.h;
      if (which.includes('e')) w = s.w + dx;
      if (which.includes('w')) w = s.w - dx;
      if (which.includes('s')) ht = s.h + dy;
      if (which.includes('n')) ht = s.h - dy;
      w = Math.max(10, w); ht = Math.max(10, ht);
      if (which.length === 2 && (e.type === 'image') !== m.shiftKey) { if (w / ht > ratio) ht = w / ratio; else w = ht * ratio; }
      e.w = Math.round(w);
      if (which.includes('w')) e.x = Math.round(s.x + s.w - e.w);
      if (e.type !== 'text') {
        e.h = Math.round(ht);
        if (which.includes('n')) e.y = Math.round(s.y + s.h - e.h);
      }
    }
    applyGeometry(e, n);
  };
  const up = () => {
    window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
    pushUndo(before); coalesceKey = null; save(); render(); buildPanels();
  };
  window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
}

pagesEl.addEventListener('mousedown', (ev) => {
  coalesceKey = null;
  const ae = document.activeElement;
  if (ae && ae !== document.body && ae.closest && !ae.classList.contains('editing')) ae.blur();
  let n = ev.target.closest('.el'), pg = ev.target.closest('.page');
  if (editingId && n && n.dataset.id === editingId) return; // normal caret placement while editing
  if (editingId) { // clicking elsewhere finishes the edit; that re-renders, so look the nodes up again
    const id = n?.dataset.id, pi = pg?.dataset.i;
    nodeOf(editingId)?.blur();
    n = id ? nodeOf(id) : null; pg = pi != null ? pagesEl.children[pi] : null;
    if (id && !n) return; // the clicked item no longer exists
  }
  if (pg) curPage = +pg.dataset.i;
  if (ev.target.closest('.handle')) { ev.preventDefault(); startResize(ev, ev.target.dataset.h); return; }
  if (n) {
    ev.preventDefault();
    const ids = withGroups([n.dataset.id]);
    if (ev.shiftKey) sel = sel.includes(ids[0]) ? sel.filter((x) => !ids.includes(x)) : [...sel, ...ids];
    else if (!sel.includes(ids[0])) sel = ids;
    updateSelection(); startDrag(ev);
  } else if (pg) { ev.preventDefault(); startMarquee(ev, pg); }
  else if (sel.length) { sel = []; updateSelection(); }
});
// Double-click on a text: start editing with the word under the pointer already selected, ready for the weight bar.
pagesEl.addEventListener('dblclick', (ev) => {
  const n = ev.target.closest('.el.text'); if (!n || n.dataset.id === editingId) return;
  const hit = wordAt(n, ev.clientX, ev.clientY);
  startEdit(n.dataset.id, false);
  if (hit) selectWordInEdit(nodeOf(n.dataset.id), hit);
});
const WORD_CH = /[\p{L}\p{N}_'’]/u;
// The word under a point of a rendered text box, and which occurrence of that word it is (1st, 2nd …).
function wordAt(n, x, y) {
  let node, off;
  if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(x, y); node = r?.startContainer; off = r?.startOffset; }
  else if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); node = p?.offsetNode; off = p?.offset; }
  if (!node || node.nodeType !== 3 || !n.contains(node)) return null;
  const t = node.data; let a = off, b = off;
  if (a > 0 && !WORD_CH.test(t[a] || '') && WORD_CH.test(t[a - 1])) a--, b--; // clicked just after the word's last letter
  while (a > 0 && WORD_CH.test(t[a - 1])) a--;
  while (b < t.length && WORD_CH.test(t[b])) b++;
  const word = t.slice(a, b); if (!word) return null;
  const before = document.createRange(); before.setStart(n, 0); before.setEnd(node, a);
  return { word, nth: wordMatches(before.toString(), word).length };
}
const wordMatches = (text, word) => [...text.matchAll(new RegExp(`(?<![\\p{L}\\p{N}_'’])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}_'’])`, 'gu'))];
// Select that word in the raw text being edited, skipping what the reader never sees (link addresses, :icons:, weight marks).
function selectWordInEdit(n, { word, nth }) {
  const node = n?.firstChild; if (!node || node.nodeType !== 3) return;
  const raw = node.data, hidden = [];
  for (const m of raw.matchAll(/\]\([^)\s]+\)|\*\*\(\d00\)/g)) hidden.push([m.index, m.index + m[0].length]);
  for (const m of raw.matchAll(ICON_RE)) hidden.push([m.index, m.index + m[0].length]);
  const seen = wordMatches(raw, word).filter((m) => !hidden.some(([a, b]) => m.index < b && m.index + word.length > a));
  const m = seen[nth] || seen[seen.length - 1]; if (!m) return;
  const r = document.createRange(); r.setStart(node, m.index); r.setEnd(node, m.index + word.length);
  const s = document.getSelection(); s.removeAllRanges(); s.addRange(r);
  markTextBar();
}
pagesEl.addEventListener('click', (ev) => { if (ev.target.closest('a')) ev.preventDefault(); }); // links only work in the PDF

// Drag on an empty part of the page to select everything the rectangle touches (Shift adds to the selection).
function startMarquee(ev, pageNode) {
  const page = doc.pages[+pageNode.dataset.i], base = ev.shiftKey ? [...sel] : [];
  const r0 = pageNode.getBoundingClientRect();
  const pt = (m) => ({ x: (m.clientX - r0.left) / zoom, y: (m.clientY - r0.top) / zoom });
  const start = pt(ev), box = h('div', { class: 'marquee' }), boxes = page.els.filter((e) => !e.hidden && !e.locked).map((e) => [e.id, getBox(e)]);
  let moved = false;
  const move = (m) => {
    const p = pt(m), x = Math.min(p.x, start.x), y = Math.min(p.y, start.y), w = Math.abs(p.x - start.x), bh = Math.abs(p.y - start.y);
    if (!moved && w + bh < 4) return;
    if (!moved) { moved = true; pageNode.appendChild(box); }
    Object.assign(box.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: bh + 'px' });
    const hit = boxes.filter(([, b]) => b.x < x + w && b.x + b.w > x && b.y < y + bh && b.y + b.h > y).map(([id]) => id);
    sel = [...new Set([...base, ...withGroups(hit)])]; updateSelection(false);
  };
  const up = () => {
    window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
    box.remove();
    if (!moved) sel = base;
    updateSelection();
  };
  window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
}

// ---------------------------------------------------------------- groups, copy / paste
// Grouped items share a `g` id and are selected, moved, copied and deleted together.
function withGroups(ids) {
  const gs = new Set(allEls().filter((e) => ids.includes(e.id) && e.g).map((e) => e.g));
  return [...new Set([...ids, ...allEls().filter((e) => gs.has(e.g)).map((e) => e.id)])];
}
function groupSel() {
  if (sel.length < 2) return;
  const g = uid(), pi = pageIndexOf(primary().id);
  mutate(() => selEls().forEach((e) => { if (pageIndexOf(e.id) === pi) e.g = g; }));
  buildPanels();
}
function ungroupSel() { mutate(() => selEls().forEach((e) => { delete e.g; })); buildPanels(); }

// Copies of `els` shifted by `off`; groups inside the copy get fresh ids so they stay groups of their own.
function addCopies(els, off, pageFor) {
  const ids = [], groups = {};
  mutate(() => els.forEach((src) => {
    const c = { ...clone(src), id: uid(), x: src.x + off, y: src.y + off };
    if (src.g) c.g = groups[src.g] ||= uid();
    pageFor(src).els.push(c); ids.push(c.id);
  }));
  sel = ids; updateSelection();
}

let clip = null; // { els, text, n } – what Ctrl+C copied inside the editor
const isField = (t) => ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName) || t.isContentEditable;
// The text as a reader (or an ATS) gets it: no markup, link text only, icons dropped.
const noIcons = (t) => t.replace(ICON_RE, '').replace(/^ +/, '').replace(/ {4,}/g, '   ');
const plain = (e) => noIcons(e.text.replace(MDLINK_RE, '$1').replace(MARKED_RE, '$1').replace(UL_RE, '$1'))
  .replace(/\t/g, '   ').replace(/^ +| +$/gm, '');
function copySelection(ev) {
  if (editingId || isField(ev.target) || !sel.length) return false;
  ev.preventDefault();
  const els = docOrder(selEls()).map(clone);
  clip = { els, text: els.filter((e) => e.type === 'text').map(plain).join('\n'), n: 0 };
  ev.clipboardData.setData('text/plain', clip.text); // also lets you paste the text into other apps
  return true;
}
document.addEventListener('copy', copySelection);
document.addEventListener('cut', (ev) => { if (copySelection(ev)) { clip.n = -1; removeSelected(); } }); // first paste lands in place
document.addEventListener('paste', (ev) => {
  if (editingId || isField(ev.target)) return;
  const text = ev.clipboardData.getData('text/plain');
  ev.preventDefault();
  const page = doc.pages[Math.min(curPage, doc.pages.length - 1)];
  if (clip && text === clip.text) addCopies(clip.els, 14 * ++clip.n, () => page);
  else if (text.trim()) addElement('body', { text: text.replace(/\r/g, '').trim() }, false); // text from elsewhere → a Body text box
});
$('#stage').addEventListener('mousedown', (ev) => { if (ev.target.id === 'stage' || ev.target.id === 'pages') { sel = []; updateSelection(); } });

// ---------------------------------------------------------------- keyboard
document.addEventListener('keydown', (ev) => {
  const mod = ev.ctrlKey || ev.metaKey, tag = ev.target.tagName;
  if (mod && ev.key.toLowerCase() === 's') { ev.preventDefault(); saveFile(); return; }
  if (editingId || ['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return;
  if (ev.altKey && ev.shiftKey && (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') && tabs.length > 1) { // Alt+Shift+←/→: previous / next document
    ev.preventDefault(); switchTab((activeTab + (ev.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length); return;
  }
  if (mod && ev.key.toLowerCase() === 'z') { ev.preventDefault(); ev.shiftKey ? redo() : undo(); return; }
  if (mod && ev.key.toLowerCase() === 'y') { ev.preventDefault(); redo(); return; }
  if (mod && ev.key.toLowerCase() === 'a') {
    ev.preventDefault(); sel = doc.pages[Math.min(curPage, doc.pages.length - 1)].els.filter((e) => !e.hidden && !e.locked).map((e) => e.id); updateSelection(); return;
  }
  if (!sel.length) return;
  if (mod && (ev.code === 'BracketRight' || ev.code === 'BracketLeft')) { // Ctrl+] forward, Ctrl+[ backward; with Shift: to front / back
    ev.preventDefault(); const fwd = ev.code === 'BracketRight';
    arrange(ev.shiftKey ? (fwd ? 'front' : 'back') : (fwd ? 'forward' : 'backward')); return;
  }
  if (mod && ev.key.toLowerCase() === 'd') { ev.preventDefault(); duplicate(); return; }
  if (mod && ev.key.toLowerCase() === 'g') { ev.preventDefault(); ev.shiftKey ? ungroupSel() : groupSel(); return; }
  if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); removeSelected(); return; }
  if (ev.key === 'Escape') { sel = []; updateSelection(); return; }
  if (ev.key === 'Enter' && sel.length === 1 && primary().type === 'text') { ev.preventDefault(); startEdit(sel[0], false); return; }
  const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[ev.key];
  if (dir) {
    ev.preventDefault(); const k = ev.shiftKey ? 10 : 1;
    mutate(() => selEls().filter((e) => !e.locked).forEach((e) => { e.x += dir[0] * k; e.y += dir[1] * k; }), 'nudge'); buildPanels();
  }
});

function removeSelected() { mutate(() => { doc.pages.forEach((p) => { p.els = p.els.filter((e) => !sel.includes(e.id)); }); sel = []; }); buildPanels(); }
function duplicate() { addCopies(selEls(), 14, (e) => doc.pages[pageIndexOf(e.id)]); }
// Order on the page = list order: later items are drawn on top and read later.
function arrange(mode) {
  reorderWith(() => doc.pages.forEach((p) => {
    const arr = p.els, on = (e) => sel.includes(e.id), picked = arr.filter(on);
    if (!picked.length) return;
    if (mode === 'front') arr.splice(0, arr.length, ...arr.filter((e) => !on(e)), ...picked);
    else if (mode === 'back') arr.splice(0, arr.length, ...picked, ...arr.filter((e) => !on(e)));
    else if (mode === 'forward') for (let i = arr.length - 2; i >= 0; i--) { if (on(arr[i]) && !on(arr[i + 1])) [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]; }
    else for (let i = 1; i < arr.length; i++) { if (on(arr[i]) && !on(arr[i - 1])) [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]]; }
  }));
}
// Align / distribute. A group moves as one unit. One unit lines up with the page margins; several line up
// with each other (the outer edges of the selection).
function selUnits() {
  const units = new Map();
  selEls().filter((e) => !e.locked).forEach((e) => { const k = e.g || e.id; if (!units.has(k)) units.set(k, []); units.get(k).push(e); });
  return [...units.values()].map((els) => {
    const bs = els.map(getBox), x = Math.min(...bs.map((b) => b.x)), y = Math.min(...bs.map((b) => b.y));
    return { els, x, y, w: Math.max(...bs.map((b) => b.x + b.w)) - x, h: Math.max(...bs.map((b) => b.y + b.h)) - y };
  });
}
const shiftUnit = (u, dx, dy) => u.els.forEach((e) => { e.x = Math.round((e.x + dx) * 10) / 10; e.y = Math.round((e.y + dy) * 10) / 10; });
function alignSel(mode) {
  const us = selUnits(); if (!us.length) return;
  const { w: W, h: H } = paper(), m = doc.margin;
  const f = us.length > 1
    ? { x: Math.min(...us.map((u) => u.x)), y: Math.min(...us.map((u) => u.y)), r: Math.max(...us.map((u) => u.x + u.w)), b: Math.max(...us.map((u) => u.y + u.h)) }
    : { x: m, y: m, r: W - m, b: H - m };
  if (us.length === 1 && (mode === 'center' || mode === 'middle')) Object.assign(f, { x: 0, r: W, y: 0, b: H }); // centre on the sheet
  mutate(() => us.forEach((u) => {
    const dx = { left: f.x - u.x, center: (f.x + f.r) / 2 - (u.x + u.w / 2), right: f.r - (u.x + u.w) }[mode] ?? 0;
    const dy = { top: f.y - u.y, middle: (f.y + f.b) / 2 - (u.y + u.h / 2), bottom: f.b - (u.y + u.h) }[mode] ?? 0;
    shiftUnit(u, dx, dy);
  }));
  buildPanels();
}
// Equal gaps between three or more units, keeping the first and last in place.
function distributeSel(axis) {
  const us = selUnits(); if (us.length < 3) return;
  const [p, s] = axis === 'h' ? ['x', 'w'] : ['y', 'h'];
  us.sort((a, b) => a[p] - b[p]);
  const first = us[0], last = us[us.length - 1];
  const gap = (last[p] + last[s] - first[p] - us.reduce((t, u) => t + u[s], 0)) / (us.length - 1);
  let at = first[p] + first[s] + gap;
  mutate(() => us.slice(1, -1).forEach((u) => { shiftUnit(u, p === 'x' ? at - u.x : 0, p === 'y' ? at - u.y : 0); at += u[s] + gap; }));
  buildPanels();
}

// ---------------------------------------------------------------- side panels
function h(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => { if (k === 'class') n.className = v; else if (k.includes('-')) n.setAttribute(k, v); else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n[k] = v; });
  kids.flat().forEach((k) => n.append(k)); return n;
}
const row = (label, ...ctrls) => h('div', { class: 'row' }, h('label', { textContent: label }), ...ctrls);

function numField(label, get, set, { min, max, step = 1, unit } = {}) {
  const i = h('input', { type: 'number', value: Math.round(get() * 100) / 100, min, max, step });
  i.addEventListener('input', () => { const v = parseFloat(i.value); if (!Number.isNaN(v)) set(v); });
  return row(label + (unit ? ` (${unit})` : ''), i);
}
function selField(label, options, get, set) {
  const opt = ([v, t]) => h('option', { value: v, textContent: t });
  const s = h('select', {}, options.map((o) => (Array.isArray(o) ? opt(o) : h('optgroup', { label: o.label }, o.items.map(opt)))));
  if (![...s.options].some((o) => o.value === get())) s.prepend(opt([get(), get()])); // e.g. a font from an older file
  s.value = get(); s.addEventListener('change', () => set(s.value)); return row(label, s);
}
// Font select plus a "browse" button that shows every font in its own face.
function fontField(label, get, set) {
  const r = selField(label, fontOptions(), get, set);
  r.append(h('button', { class: 'tog', textContent: 'Aa', title: 'Browse fonts with previews', onclick: (ev) => openFontBrowser(ev.currentTarget, get(), set) }));
  return r;
}
function openFontBrowser(anchor, current, set) {
  closeFontBrowser();
  const sample = (name) => {
    const b = bundledFont(name), langs = b ? b.langs : [];
    return 'Alex Morgan – Senior Engineer 2026' + (langs.includes('he') ? ' · שלום' : '') + (langs.includes('ru') ? ' · Привет' : '');
  };
  const tags = (name) => {
    const b = bundledFont(name);
    if (!b) return doc.fonts?.some((f) => f.family === name) ? ['from PDF'] : ['installed'];
    return [b.use === 'headings' ? 'headings only' : 'CV-safe', ...(b.langs.includes('he') ? ['Hebrew'] : []), ...(b.langs.includes('ru') ? ['Russian'] : [])];
  };
  const pop = h('div', { id: 'fontBrowser', role: 'dialog', 'aria-label': 'Fonts' },
    h('div', { class: 'fb-head' }, h('b', { textContent: 'Fonts' }), h('span', { class: 'hint', textContent: 'Bundled fonts look the same on every computer and are embedded in your PDF.' })),
    ...fontGroups().map((g) => h('section', {}, h('h4', { textContent: g.label }), ...g.items.map((name) => {
      const btn = h('button', { class: 'fb-item' + (name === current ? ' active' : ''), onclick: () => { set(name); closeFontBrowser(); buildPanels(); } },
        h('span', { class: 'fb-name', textContent: name, style: `font-family:${fontCss(name)}` }),
        h('span', { class: 'fb-tags' }, ...tags(name).map((t) => h('span', { class: 'fb-tag', textContent: t }))),
        h('span', { class: 'fb-sample', textContent: sample(name), style: `font-family:${fontCss(name)}` }));
      return btn;
    }))));
  document.body.append(pop);
  const r = anchor.getBoundingClientRect();
  pop.style.top = Math.max(56, Math.min(r.top, window.innerHeight - pop.offsetHeight - 12)) + 'px';
  pop.style.left = Math.max(12, r.left - pop.offsetWidth - 10) + 'px';
  pop.querySelector('.fb-item.active')?.scrollIntoView({ block: 'center' });
  setTimeout(() => document.addEventListener('mousedown', outsideFontBrowser), 0);
}
function outsideFontBrowser(ev) { if (!ev.target.closest('#fontBrowser')) closeFontBrowser(); }
function closeFontBrowser() { $('#fontBrowser')?.remove(); document.removeEventListener('mousedown', outsideFontBrowser); }
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && $('#fontBrowser')) { ev.stopPropagation(); closeFontBrowser(); } }, true);
// Colour picker plus the document's theme colours as one-click swatches.
function colorField(label, get, set, allowNone) {
  const c = h('input', { type: 'color', value: get() || '#ffffff' });
  c.addEventListener('input', () => { none && (none.checked = false); set(c.value); });
  let none = null;
  const sw = h('span', { class: 'swatches' }, (doc.palette || []).map((col) => h('button', {
    class: 'swatch' + (get() && get().toLowerCase() === col.toLowerCase() ? ' on' : ''), style: `background:${col}`, title: 'Theme colour ' + col,
    onclick: () => { set(col); buildPanels(); },
  })));
  const kids = [c, sw];
  if (allowNone) {
    none = h('input', { type: 'checkbox', checked: !get() });
    none.addEventListener('change', () => set(none.checked ? '' : c.value));
    kids.push(h('label', { class: 'nonebox' }, none, 'none'));
  }
  return row(label, ...kids);
}
const iconBtn = (icon, title, onclick, disabled = false) => { const b = h('button', { class: 'ib', title, 'aria-label': title, onclick, disabled }); b.append(uiIcon(icon)); return b; };
function toggleBtn(text, get, set, title = '') {
  const b = h('button', { class: 'tog' + (get() ? ' active' : ''), textContent: text, title });
  b.addEventListener('click', () => { set(!get()); buildPanels(); }); return b;
}

// edit helpers: apply to every selected element of the primary's type
const forType = (type) => selEls().filter((e) => e.type === type);
const setAll = (type, key, prop) => (v) => mutate(() => forType(type).forEach((e) => { e[prop] = v; }), key + prop);
const setStyleProp = (prop) => (v) => mutate(() => forType('text').forEach((e) => { e.o = { ...e.o, [prop]: v }; }), 'o' + prop);

function buildPanels() { buildSelPanel(); buildStylesPanel(); }
const keepEditing = (ev) => ev.preventDefault(); // panel buttons that act on the text being edited must not steal focus

function buildSelPanel() {
  const p = $('#panelSel'); p.textContent = '';
  const e = primary();
  if (!e) { p.append(h('p', { class: 'empty', textContent: 'Click an item on the page to edit it, or add something from the left.' })); return; }
  const t = e.type;
  if (sel.length > 1) p.append(h('p', { class: 'empty', textContent: `${sel.length} items selected — changes apply to all.` }));

  if (t === 'text') {
    const s = styleOf(e);
    p.append(
      selField('Style', STYLE_ORDER.map((k) => [k, doc.styles[k].label]), () => e.style, (v) => { setAll('text', 'st', 'style')(v); buildPanels(); }),
      fontField('Font', () => s.font, (v) => setStyleProp('font')(v)),
      numField('Size', () => s.size, (v) => setStyleProp('size')(v), { min: 5, max: 120, step: 0.5, unit: 'pt' }),
      editingId === e.id
        ? row('Weight', h('span', { class: 'hint inline', textContent: 'Select words, then pick a weight in the bar above the text.' }))
        : selField('Weight', WEIGHTS, () => String(s.weight), (v) => setStyleProp('weight')(+v)),
      row('Format',
        toggleBtn('I', () => s.italic, (v) => setStyleProp('italic')(v), 'Italic'),
        toggleBtn('U', () => s.underline, (v) => setStyleProp('underline')(v), 'Underline the whole text (to underline only some words, select them while editing and press Ctrl+U)'),
        toggleBtn('AA', () => s.upper, (v) => setStyleProp('upper')(v), 'UPPERCASE'),
        ...['left', 'center', 'right', 'justify'].map((a) => toggleBtn({ left: '⇤', center: '↔', right: '⇥', justify: '≡' }[a], () => s.align === a, () => setStyleProp('align')(a), 'Align ' + a))),
      colorField('Color', () => s.color, (v) => setStyleProp('color')(v)),
      numField('Line height', () => s.lh, (v) => setStyleProp('lh')(v), { min: 0.8, max: 3, step: 0.05 }),
      numField('Letter space', () => s.ls, (v) => setStyleProp('ls')(v), { min: -2, max: 20, step: 0.25, unit: 'pt' }),
      selField('Bullets', BULLETS, () => e.bullet || 'none', (v) => { setAll('text', 'bl', 'bullet')(v); }),
      numField('Width', () => e.w, setAll('text', 'w', 'w'), { min: 20, max: 2000, unit: 'px' }),
      h('button', { textContent: 'Reset to style', title: 'Remove overrides, use the Text style settings', onclick: () => { mutate(() => forType('text').forEach((x) => { x.o = {}; })); buildPanels(); } }),
      colorField('Icon color', () => e.ic, setAll('text', 'ic', 'ic'), true),
      h('div', { class: 'group' }, h('h4', { textContent: 'Box around the text' }),
        colorField('Fill', () => e.bg, setAll('text', 'tb', 'bg'), true),
        colorField('Border', () => e.bd || '#111111', setAll('text', 'tbd', 'bd')),
        numField('Border width', () => e.bw || 0, setAll('text', 'tbw', 'bw'), { min: 0, max: 20, step: 0.5, unit: 'px' }),
        numField('Corner radius', () => e.br || 0, setAll('text', 'tbr', 'br'), { min: 0, max: 200, unit: 'px' }),
        numField('Padding ↔', () => e.px || 0, setAll('text', 'tpx', 'px'), { min: 0, max: 100, unit: 'px' }),
        numField('Padding ↕', () => e.py || 0, setAll('text', 'tpy', 'py'), { min: 0, max: 100, unit: 'px' }),
        row('Width', toggleBtn('Fit to text', () => !!e.autoW, (v) => setAll('text', 'taw', 'autoW')(v), 'Shrink the box to its text – for tags and chips'))),
      row('Insert',
        h('button', { textContent: '🔗 Link', title: 'Ctrl+K – link the selected words', onmousedown: keepEditing, onclick: () => insertIntoText(insertLink) }),
        h('button', { innerHTML: '<u>U</u>', title: 'Ctrl+U – underline the selected words', onmousedown: keepEditing, onclick: () => insertIntoText(toggleUnderline) }),
        h('button', { innerHTML: '<b>B</b>', title: 'Ctrl+B – bold', onmousedown: keepEditing, onclick: () => insertIntoText(() => nodeOf(editingId).dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true }))) })),
      h('div', { class: 'iconbar' }, Object.keys(ICONS).map((name) => {
        const b = h('button', { title: `Insert ${name} icon (:${name}:)`, onmousedown: keepEditing, onclick: () => insertIntoText(() => document.execCommand('insertText', false, `:${name}: `)) });
        b.append(iconSvg(name)); return b;
      })),
      h('p', { class: 'hint', innerHTML: 'While editing: <b>Ctrl+B</b> bold, <b>Ctrl+U</b> underline, <b>Ctrl+K</b> link, <b>Tab</b> pushes the rest of the line right (dates). Emails, web addresses and phone numbers link automatically. Tip: keep the address visible (e.g. <i>:linkedin: linkedin.com/in/you</i>) – ATS and printed copies only see the visible text.' }),
    );
  } else if (t === 'line') {
    p.append(
      numField('Length', () => e.len, setAll('line', 'ln', 'len'), { min: 5, max: 2000, unit: 'px' }),
      numField('Thickness', () => e.th, setAll('line', 'th', 'th'), { min: 0.5, max: 40, step: 0.5, unit: 'px' }),
      colorField('Color', () => e.color, setAll('line', 'lc', 'color')),
      selField('Dash', [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted'], ['double', 'Double']], () => e.dash, setAll('line', 'ld', 'dash')),
    );
  } else if (t === 'rect') {
    p.append(
      numField('Width', () => e.w, setAll('rect', 'rw', 'w'), { min: 2, unit: 'px' }),
      numField('Height', () => e.h, setAll('rect', 'rh', 'h'), { min: 2, unit: 'px' }),
      colorField('Fill', () => e.fill, setAll('rect', 'rf', 'fill'), true),
      colorField('Stroke', () => e.stroke, setAll('rect', 'rs', 'stroke')),
      numField('Stroke width', () => e.sw, setAll('rect', 'rsw', 'sw'), { min: 0, max: 40, step: 0.5, unit: 'px' }),
      selField('Shape', [['box', 'Box'], ['ellipse', 'Circle / ellipse']], () => e.shape || 'box', (v) => { mutate(() => forType('rect').forEach((x) => { if (v === 'ellipse') x.shape = v; else delete x.shape; })); buildPanels(); }),
      ...(e.shape === 'ellipse' ? [] : [numField('Corner radius', () => e.radius, setAll('rect', 'rr', 'radius'), { min: 0, max: 500, unit: 'px' })]),
      numField('Opacity', () => e.opacity, setAll('rect', 'ro', 'opacity'), { min: 0, max: 1, step: 0.05 }),
    );
  } else if (t === 'image') {
    p.append(
      numField('Width', () => e.w, setAll('image', 'iw', 'w'), { min: 5, unit: 'px' }),
      numField('Height', () => e.h, setAll('image', 'ih', 'h'), { min: 5, unit: 'px' }),
      numField('Corner radius', () => e.radius, setAll('image', 'ir', 'radius'), { min: 0, max: 1000, unit: 'px' }),
      selField('Fit', [['cover', 'Fill (crop)'], ['contain', 'Fit inside']], () => e.fit, setAll('image', 'if', 'fit')),
      numField('Opacity', () => e.opacity, setAll('image', 'io', 'opacity'), { min: 0, max: 1, step: 0.05 }),
      row('Picture', h('button', { textContent: 'Replace…', title: 'Choose another picture for this frame (or drop an image file onto it)', onclick: () => pickImage(null, e) })),
    );
  }
  const g = h('div', { class: 'group' }, h('h4', { textContent: 'Position & arrange' }));
  const many = selUnits().length > 1, to = many ? 'Align' : 'Align to the page:';
  g.append(
    numField('X', () => e.x, (v) => mutate(() => { e.x = v; }, 'x'), { unit: 'px' }),
    numField('Y', () => e.y, (v) => mutate(() => { e.y = v; }, 'y'), { unit: 'px' }),
    row('Align', h('span', { class: 'ibar' },
      iconBtn('alignl', `${to} left${many ? ' edges' : ' margin'}`, () => alignSel('left')),
      iconBtn('alignc', `${to} ${many ? 'centres' : 'centre'}`, () => alignSel('center')),
      iconBtn('alignr', `${to} right${many ? ' edges' : ' margin'}`, () => alignSel('right')),
      iconBtn('alignt', `${to} top${many ? ' edges' : ' margin'}`, () => alignSel('top')),
      iconBtn('alignm', `${to} ${many ? 'middles' : 'middle'}`, () => alignSel('middle')),
      iconBtn('alignb', `${to} bottom${many ? ' edges' : ' margin'}`, () => alignSel('bottom')))),
    row('Distribute', h('span', { class: 'ibar' },
      iconBtn('disth', 'Equal gaps left to right (3 or more items)', () => distributeSel('h'), selUnits().length < 3),
      iconBtn('distv', 'Equal gaps top to bottom (3 or more items)', () => distributeSel('v'), selUnits().length < 3))),
    row('Order', h('span', { class: 'ibar' },
      iconBtn('front', 'Bring to front (Ctrl+Shift+]) – drawn on top, read last', () => arrange('front')),
      iconBtn('up', 'Bring forward (Ctrl+])', () => arrange('forward')),
      iconBtn('down', 'Send backward (Ctrl+[)', () => arrange('backward')),
      iconBtn('back', 'Send to back (Ctrl+Shift+[) – drawn below, read first', () => arrange('back')))),
    row('Layer', toggleBtn('Hide', () => !!e.hidden, (v) => mutate(() => selEls().forEach((x) => { x.hidden = v; })), 'Hidden items are not shown, printed or read'),
      toggleBtn('Lock', () => !!e.locked, (v) => mutate(() => selEls().forEach((x) => { x.locked = v; })), 'Locked items can’t be moved on the page – select them in Layers')),
    row('', h('button', { textContent: 'Duplicate', onclick: duplicate }), h('button', { textContent: 'Delete', onclick: removeSelected })),
    row('Group',
      h('button', { textContent: 'Group', title: 'Ctrl+G – move the selected items as one block', disabled: sel.length < 2, onclick: groupSel }),
      h('button', { textContent: 'Ungroup', title: 'Ctrl+Shift+G', disabled: !selEls().some((x) => x.g), onclick: ungroupSel })),
  );
  p.append(g);
}

// Every colour property in the document, so a theme colour can be swapped everywhere at once.
function eachColor(fn) {
  STYLE_ORDER.forEach((k) => { doc.styles[k].color = fn(doc.styles[k].color); });
  allEls().forEach((e) => {
    ['ic', 'bg', 'bd', 'color', 'fill', 'stroke'].forEach((k) => { if (e[k]) e[k] = fn(e[k]); });
    if (e.o?.color) e.o.color = fn(e.o.color);
  });
}
function buildStylesPanel() {
  const p = $('#panelStyles'); p.textContent = '';
  const pal = h('div', { class: 'palette' }, doc.palette.map((col, i) => {
    const c = h('input', { type: 'color', value: col, title: 'Change this colour everywhere it is used' });
    c.addEventListener('input', () => mutate(() => {
      const old = doc.palette[i].toLowerCase();
      eachColor((v) => (v.toLowerCase() === old ? c.value : v)); doc.palette[i] = c.value;
    }, 'pal' + i));
    c.addEventListener('change', buildPanels);
    return c;
  }));
  p.append(
    h('div', { class: 'stylecard' }, h('b', { textContent: 'Theme colours' }), pal,
      h('p', { class: 'hint', textContent: 'Change a colour here and every heading, line and box using it follows. The same colours appear as swatches next to each colour picker.' })),
    h('p', { class: 'hint', textContent: 'Change a style here and every text using it updates — that is how you keep the hierarchy consistent.' }),
    fontField('All fonts', () => doc.styles.body.font, (v) => mutate(() => STYLE_ORDER.forEach((k) => { doc.styles[k].font = v; }))),
  );
  STYLE_ORDER.forEach((k) => {
    const s = doc.styles[k], set = (prop) => (v) => mutate(() => { s[prop] = v; }, 'S' + k + prop);
    p.append(h('div', { class: 'stylecard' }, h('b', { textContent: s.label }),
      fontField('Font', () => s.font, set('font')),
      numField('Size', () => s.size, set('size'), { min: 5, max: 120, step: 0.5, unit: 'pt' }),
      selField('Weight', WEIGHTS, () => String(s.weight), (v) => set('weight')(+v)),
      colorField('Color', () => s.color, set('color')),
      numField('Line height', () => s.lh, set('lh'), { min: 0.8, max: 3, step: 0.05 }),
      numField('Letter space', () => s.ls, set('ls'), { min: -2, max: 20, step: 0.25, unit: 'pt' }),
      row('Format', toggleBtn('I', () => s.italic, set('italic'), 'Italic'), toggleBtn('U', () => s.underline, set('underline'), 'Underline'), toggleBtn('AA', () => s.upper, set('upper'), 'UPPERCASE')),
    ));
  });
  const g = h('div', { class: 'stylecard' }, h('b', { textContent: 'Page' }),
    numField('Margin guide', () => doc.margin, (v) => mutate(() => { doc.margin = v; }, 'margin'), { min: 0, max: 200, unit: 'px' }),
    row('Guides', h('button', { textContent: 'At margins', title: 'Add ruler guides on the four margins', onclick: () => addMarginGuides() }),
      h('button', { textContent: `Clear (${(doc.guides?.x.length || 0) + (doc.guides?.y.length || 0)})`, disabled: !(doc.guides?.x.length || doc.guides?.y.length), onclick: () => clearGuides() })),
    h('button', { textContent: 'Reset all styles to default', onclick: () => { if (confirm('Reset all text styles to the defaults?')) { mutate(() => { doc.styles = defaultStyles(); }); buildPanels(); } } }));
  p.append(g);
}

document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('active', x === b));
  $('#panelSel').hidden = b.dataset.tab !== 'sel'; $('#panelStyles').hidden = b.dataset.tab !== 'styles';
}));

// ---------------------------------------------------------------- top bar + left bar
// <i data-icon="name"> placeholders in the markup become the interface icons from icons.js
function uiIcon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'ui'); svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = UI_ICONS[name] || ''; return svg;
}
document.querySelectorAll('i[data-icon]').forEach((i) => i.replaceWith(uiIcon(i.dataset.icon)));
document.querySelectorAll('[data-add]').forEach((b) => {
  b.addEventListener('click', () => (b.dataset.add === 'image' ? pickImage() : addElement(b.dataset.add)));
  // …or drag the button onto the page to place the item exactly there
  b.draggable = true;
  b.addEventListener('dragstart', (ev) => { ev.dataTransfer.setData('application/x-cv-add', b.dataset.add); ev.dataTransfer.effectAllowed = 'copy'; });
});
// The page (and point on it) under the pointer, in page px
function pagePoint(cx, cy) {
  for (const pg of pagesEl.children) {
    const r = pg.getBoundingClientRect();
    if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) return { pi: +pg.dataset.i, x: Math.round((cx - r.left) / zoom), y: Math.round((cy - r.top) / zoom) };
  }
  return null;
}
const isAddDrag = (ev) => [...(ev.dataTransfer?.types || [])].includes('application/x-cv-add');
pagesEl.addEventListener('dragover', (ev) => { if (isAddDrag(ev)) { ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy'; } });
pagesEl.addEventListener('drop', (ev) => {
  if (!isAddDrag(ev)) return;
  ev.preventDefault(); ev.stopPropagation();
  const at = pagePoint(ev.clientX, ev.clientY), kind = ev.dataTransfer.getData('application/x-cv-add');
  if (!at) return;
  curPage = at.pi;
  const pos = { x: Math.max(0, at.x - 12), y: Math.max(0, at.y - 10) };
  if (kind === 'image') pickImage(pos); else addElement(kind, pos);
});
$('#addPage').onclick = () => { mutate(() => { doc.pages.push({ els: [] }); curPage = doc.pages.length - 1; }); };
$('#delPage').onclick = () => {
  if (doc.pages.length < 2) return;
  const last = doc.pages[doc.pages.length - 1];
  if (last.els.length && !confirm('The last page has content. Delete it?')) return;
  mutate(() => { doc.pages.pop(); sel = sel.filter((id) => !last.els.some((e) => e.id === id)); curPage = Math.min(curPage, doc.pages.length - 1); });
  buildPanels();
};
// ---------------------------------------------------------------- document tabs
// Several documents can be open at once, one tab each. Each tab keeps its own document, undo history, selection,
// zoom and "Original" overlay; switching stores the one you leave and loads the one you pick.
const tabs = [];         // { doc, undo, redo, sel, curPage, zoom, originals, showOriginal, fresh, json }
let activeTab = -1;
const newTab = (d, extra = {}) => ({ doc: d, undo: [], redo: [], sel: [], curPage: 0, zoom: null, originals: [], showOriginal: false, fresh: false, json: null, ...extra });
function stashTab() {
  const t = tabs[activeTab]; if (!t) return;
  Object.assign(t, { doc, undo: undoStack.slice(), redo: redoStack.slice(), sel, curPage, zoom, originals, showOriginal, json: null });
}
function fitZoom() { return Math.round(Math.min(1, Math.max(0.5, ($('#stage').clientWidth - 56) / paper().w)) * 100) / 100; }
function loadTab(i) {
  activeTab = i; const t = tabs[i];
  doc = t.doc; sel = t.sel; curPage = Math.min(t.curPage, doc.pages.length - 1); coalesceKey = null; editingId = null;
  undoStack.splice(0, undoStack.length, ...t.undo); redoStack.splice(0, redoStack.length, ...t.redo);
  setOriginals(t.originals); zoom = t.zoom ?? fitZoom();
  fullRender(); if (t.showOriginal) toggleOriginal(true);
  renderTabs(); $('#stage').scrollTop = 0;
}
function switchTab(i) {
  if (i === activeTab || !tabs[i]) return;
  document.activeElement?.blur?.(); // finish any text being edited first
  stashTab(); loadTab(i); save();
}
// Open a document in a new tab – or in this tab, if it is still the untouched sample.
function openDoc(d, { originals: orig, zoom: z, fresh = false } = {}) {
  document.activeElement?.blur?.();
  const cur = tabs[activeTab], reuse = cur && cur.fresh && !undoStack.length;
  if (!reuse) stashTab();
  const t = newTab(normalize(d), { originals: orig || [], zoom: z ?? null, fresh });
  if (reuse) tabs[activeTab] = t; else { tabs.push(t); activeTab = tabs.length - 1; }
  loadTab(activeTab); save();
}
function closeTab(i) {
  const t = tabs[i]; if (!t) return;
  const d = i === activeTab ? doc : t.doc;
  if (!t.fresh && !confirm(`Close "${d.name || 'My CV'}"?\n\nIts changes are discarded unless you saved a file (Save).`)) return;
  if (i !== activeTab) { tabs.splice(i, 1); if (i < activeTab) activeTab--; renderTabs(); save(); return; }
  tabs.splice(i, 1);
  if (!tabs.length) tabs.push(newTab(newDoc(), { fresh: true }));
  loadTab(Math.min(i, tabs.length - 1)); save();
}
function renderTabs() {
  const list = $('#tabList');
  list.replaceChildren(...tabs.map((t, i) => {
    const name = (i === activeTab ? doc : t.doc).name || 'Untitled', on = i === activeTab;
    const label = h('button', { class: 'tname', 'aria-selected': on, tabIndex: on ? 0 : -1, textContent: name, title: name, onclick: () => switchTab(i) });
    const x = h('button', { class: 'tclose', title: `Close ${name}`, 'aria-label': `Close ${name}`, textContent: '×', onclick: () => closeTab(i) });
    const tab = h('div', { class: 'dtab' + (on ? ' active' : ''), onauxclick: (ev) => { if (ev.button === 1) { ev.preventDefault(); closeTab(i); } } }, label, x);
    return tab;
  }));
  list.querySelectorAll('.tname').forEach((b) => b.setAttribute('role', 'tab'));
  list.querySelector('.dtab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
$('#tabList').addEventListener('keydown', (ev) => {
  if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
  ev.preventDefault(); switchTab((activeTab + (ev.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length);
  $('#tabList .dtab.active .tname')?.focus();
});
$('#tabOpen').onclick = () => $('#fileOpen').click();
$('#btnUndo').onclick = undo; $('#btnRedo').onclick = redo;
$('#docName').addEventListener('input', (ev) => {
  doc.name = ev.target.value; if (tabs[activeTab]) tabs[activeTab].fresh = false;
  const nm = $('#tabList .dtab.active .tname'); if (nm) nm.textContent = nm.title = doc.name || 'Untitled';
  save();
});
$('#paper').addEventListener('change', (ev) => mutate(() => { doc.size = ev.target.value; }));
function syncPaper() {
  const sel = $('#paper'); let opt = sel.querySelector('option[value=Custom]');
  if (doc.pageW && !opt) { opt = h('option', { value: 'Custom' }); sel.append(opt); }
  if (opt) { if (doc.pageW) opt.textContent = `Custom ${mm(doc.pageW)}×${mm(doc.pageH)}`; else opt.remove(); }
  sel.value = doc.size;
}
const setZoom = (z) => { zoom = Math.min(2, Math.max(0.3, Math.round(z * 100) / 100)); $('#zoomLabel').textContent = Math.round(zoom * 100) + '%'; render(); };
$('#zoomIn').onclick = () => setZoom(zoom + 0.1); $('#zoomOut').onclick = () => setZoom(zoom - 0.1);

function saveFile() {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: (doc.name || 'cv') + '.cv.json' });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$('#btnSave').onclick = saveFile;
$('#btnOpen').onclick = () => $('#fileOpen').click();
$('#fileOpen').addEventListener('change', (ev) => { const fs = [...ev.target.files]; ev.target.value = ''; openFiles(fs); });
// Drop a .cv.json or a PDF anywhere on the editor to open it.
const hasFiles = (ev) => [...(ev.dataTransfer?.types || [])].includes('Files');
document.addEventListener('dragenter', (ev) => { if (hasFiles(ev)) $('#dropOverlay').hidden = false; });
document.addEventListener('dragleave', (ev) => { if (!ev.relatedTarget) $('#dropOverlay').hidden = true; });
document.addEventListener('dragover', (ev) => { if (hasFiles(ev)) ev.preventDefault(); });
document.addEventListener('drop', (ev) => {
  $('#dropOverlay').hidden = true;
  const files = [...ev.dataTransfer.files], f = files[0]; if (!f) return;
  ev.preventDefault();
  if (!f.type.startsWith('image/')) { openFiles(files.filter((x) => !x.type.startsWith('image/'))); return; }
  const at = pagePoint(ev.clientX, ev.clientY); // a picture lands where it was dropped – or replaces the picture it is dropped on
  const onImg = document.elementsFromPoint(ev.clientX, ev.clientY).find((n) => n.matches?.('#pages .el.image:not(.locked)'));
  if (at) curPage = at.pi;
  placeImage(f, at && { x: at.x, y: at.y }, onImg && allEls().find((e) => e.id === onImg.dataset.id));
});

// "Original" overlay: the imported PDF's pages drawn faintly behind the editable items (memory only, never saved or printed).
let originals = [], showOriginal = false;
function setOriginals(list) {
  originals = list || []; showOriginal = false;
  $('#viewOriginal').disabled = !originals.length; $('#viewOriginal').classList.remove('active'); $('#origOpacity').hidden = true;
}
$('#viewOriginal').onclick = () => toggleOriginal(!showOriginal);
function toggleOriginal(on) {
  showOriginal = on && originals.length > 0;
  $('#viewOriginal').classList.toggle('active', showOriginal); $('#viewOriginal').setAttribute('aria-pressed', showOriginal);
  $('#origOpacity').hidden = !showOriginal; render();
}
$('#origOpacity').addEventListener('input', (ev) => document.documentElement.style.setProperty('--orig', ev.target.value / 100));

let statusTimer = null;
function setStatus(text, ms = 0) {
  const st = $('#status'); st.textContent = text; st.hidden = !text;
  clearTimeout(statusTimer); if (ms) statusTimer = setTimeout(() => { st.hidden = true; }, ms);
}
// Several files at once (the file picker or a drop): each opens in its own tab, one after the other.
async function openFiles(files) {
  for (const f of files) await openFile(f);
  if (files.length > 1) setStatus(`Opened ${files.length} files – each is in its own tab`, 6000);
}
async function openFile(f) {
  const isPdf = /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
  const isJson = /\.json$/i.test(f.name) || f.type === 'application/json';
  if (!isPdf && !isJson) { alert(`"${f.name}" isn't a PDF or a .cv.json file. Open a PDF to edit it, or a .cv.json saved from this editor.`); return; }
  try {
    let d, result = null;
    if (isPdf) {
      setStatus('Opening PDF…');
      result = await importPdf(f, (i, n) => setStatus(n > 1 ? `Reading page ${i} of ${n}…` : 'Reading the page…'));
      d = result.doc;
    } else {
      d = JSON.parse(await f.text());
      if (!Array.isArray(d.pages)) throw new Error('it was not saved by this editor.');
    }
    const nd = normalize(d), pw = nd.size === 'Custom' && nd.pageW ? nd.pageW : (PAPER[nd.size] || PAPER.A4).w;
    const z = result ? Math.min(1, Math.max(0.4, Math.round((($('#stage').clientWidth - 56) / pw) * 100) / 100)) : null;
    openDoc(nd, { originals: result?.originals, zoom: z });
    setStatus(`Opened ${f.name}`, 5000);
    if (result) showImportReport(result.report, f.name);
  } catch (err) { setStatus(''); alert(`Couldn't open "${f.name}": ${err.message}`); }
}

// After a PDF import: what came in as editable text, which fonts were reused, what became pictures.
function showImportReport(r, fileName) {
  const chip = (kind, label) => h('span', { class: 'chip ' + kind, textContent: label });
  const n = (v, one, many) => `${v} ${v === 1 ? one : many}`;
  $('#reportTitle').textContent = fileName;
  $('#reportChips').replaceChildren(
    chip('info', n(r.pages, 'page', 'pages')),
    chip(r.textBlocks ? 'ok' : 'warn', n(r.textBlocks, 'text block', 'text blocks')),
    ...(r.fontsReused.length ? [chip('ok', n(r.fontsReused.length, 'font reused', 'fonts reused'))] : []),
    ...(r.fontsMatched?.length ? [chip('ok', n(r.fontsMatched.length, 'font matched', 'fonts matched'))] : []),
    ...(r.fontsSubstituted.length ? [chip('warn', n(r.fontsSubstituted.length, 'font replaced', 'fonts replaced'))] : []),
    ...(r.images + r.pieces ? [chip('info', n(r.images + r.pieces, 'picture', 'pictures'))] : []),
    ...(r.scanned.length ? [chip('warn', n(r.scanned.length, 'scanned page', 'scanned pages'))] : []),
    ...(r.failed.length ? [chip('bad', n(r.failed.length, 'page as picture', 'pages as pictures'))] : []),
  );
  const notes = [];
  if (r.fontsReused.length) notes.push(['ok', `Original fonts reused: ${r.fontsReused.join(', ')}. Letters missing from the PDF's copy of a font use the closest installed font.`]);
  if (r.fontsMatched?.length) notes.push(['ok', `Set in ${r.fontsMatched.join(', ')} – shown in the editor's own copy of ${r.fontsMatched.length > 1 ? 'these fonts' : 'this font'}: the same design, with every letter and weight.`]);
  r.fontsSubstituted.forEach((x) => notes.push(['warn', `${x.from[0].toUpperCase() + x.from.slice(1)} couldn't be reused, so it's shown in ${x.to}. Spacing was adjusted to keep the original line breaks; pick another font in Text styles if it looks off.`]));
  if (r.images + r.pieces) notes.push(['info', `${n(r.images + r.pieces, 'graphic', 'graphics')} (photos, logos, drawings) came in as pictures. You can move, resize or delete them.`]);
  if (r.scanned.length) notes.push(['warn', `Page ${r.scanned.join(', ')}: scanned, with no text inside, so it came in as a picture. Add text boxes on top to change it.`]);
  if (r.failed.length) notes.push(['bad', `Page ${r.failed.join(', ')} couldn't be analysed and came in as a picture.`]);
  r.notes.forEach((t) => notes.push(['info', t]));
  const icon = { ok: '✓', bad: '✕', warn: '!', info: 'i' };
  $('#reportNotes').replaceChildren(...notes.map(([k, t]) => h('div', { class: 'check ' + k }, h('span', { textContent: icon[k] }), t)));
  $('#reportCompare').hidden = !originals.length;
  $('#reportDialog').showModal();
}
$('#reportDone').onclick = () => $('#reportDialog').close();
$('#reportCompare').onclick = () => { $('#reportDialog').close(); toggleOriginal(true); };

function exportPdf() {
  const { outside } = boundsProblems();
  if (outside.length && !confirm(`${outside.length} item(s) are outside the page and will be cut off in the PDF. Export anyway?`)) return;
  sel = []; updateSelection();
  let st = $('#printPageStyle');
  if (!st) { st = h('style', { id: 'printPageStyle' }); document.head.append(st); }
  const { w, h: ph } = paper();
  st.textContent = `@page { size: ${doc.size === 'Custom' ? `${w}px ${ph}px` : doc.size}; margin: 0; }`;
  const old = document.title; document.title = doc.name || 'cv';
  window.print();
  setTimeout(() => { document.title = old; }, 800);
}
$('#btnExport').onclick = exportPdf;

// ---------------------------------------------------------------- ATS check
// Shows the plain text an applicant tracking system would extract (same order as the PDF) plus simple checks.
const ATS_FONTS = ['Arial', 'Helvetica', 'Calibri', 'Verdana', 'Tahoma', 'Georgia', 'Times New Roman', 'Garamond'];
function atsText() {
  return doc.pages.map((p) => p.els.filter((e) => e.type === 'text' && !e.hidden).map((e) => {
    const upper = styleOf(e).upper, list = e.bullet && e.bullet !== 'none';
    return plain(e).split('\n').map((l, i) => (list ? bulletMark(e.bullet, i) + ' ' : '') + (upper ? l.toUpperCase() : l)).join('\n');
  }).join('\n')).join('\n\n— page break —\n\n');
}
function atsChecks() {
  const out = [], texts = allEls().filter((e) => e.type === 'text' && !e.hidden), all = texts.map((e) => e.text).join('\n');
  const { outside, outMargin } = boundsProblems();
  if (outside.length) out.push(['bad', `${outside.length} item(s) are outside the page and will be cut off.`]);
  if (outMargin.length) out.push(['warn', `${outMargin.length} text item(s) cross the page margins.`]);
  if (!/[\w.+-]+@[\w-]+\.\w/.test(all)) out.push(['warn', 'No email address found.']);
  // A link whose visible text is not its address ("LinkedIn", or just an icon) loses the address for ATS and print.
  const norm = (x) => x.toLowerCase().replace(/^(https?:\/\/|mailto:|tel:)/, '').replace(/^www\./, '').replace(/[^a-z0-9@./+]/g, '').replace(/\/+$/, '');
  const hidden = texts.flatMap((e) => [...e.text.matchAll(MDLINK_RE)])
    .map((m) => [m[1].replace(ICON_RE, '').replace(/\*\*(\(\d00\))?/g, '').replace(UL_RE, '$1').trim(), m[2]])
    .filter(([vis, addr]) => !norm(vis).includes(norm(addr)))
    .map(([vis]) => `"${vis || 'icon only'}"`);
  if (hidden.length) out.push(['warn', `${hidden.length} link(s) hide their address: ${hidden.join(', ')}. ATS and printed copies only see the visible text – show the address itself, e.g. "linkedin.com/in/you".`]);
  const fonts = [...new Set(texts.map((e) => styleOf(e).font))].filter((f) => !ATS_FONTS.includes(f) && bundledFont(f)?.use !== 'cv' && !doc.fonts?.some((d) => d.family === f));
  const display = [...new Set(texts.filter((e) => ['body', 'small'].includes(e.style)).map((e) => styleOf(e).font))].filter((f) => bundledFont(f)?.use === 'headings');
  if (display.length) out.push(['warn', `${display.join(', ')} is made for headings – use a CV font such as Inter, Source Sans 3 or Lora for body text.`]);
  if (fonts.length) out.push(['warn', `Less common font(s): ${fonts.join(', ')}. Arial, Calibri, Helvetica, Georgia or Times New Roman are safest.`]);
  const tiny = texts.filter((e) => styleOf(e).size < 9).length;
  if (tiny) out.push(['warn', `${tiny} text item(s) smaller than 9pt – hard to read and may parse badly.`]);
  // Wide letter spacing makes the browser's PDF write each letter with a gap; extractors then read "EXPERIENCE" as "EXPERI ENC E".
  const loose = texts.filter((e) => { const st = styleOf(e); return st.ls > st.size * 0.045; });
  if (loose.length) out.push(['warn', `${loose.length} text item(s) have wide letter spacing (over 0.045 × the font size). In the PDF text this can split words, e.g. "EXPERI ENC E", so an ATS may miss the section. Keep Letter space at or below 0.04 × the size (0.4 pt at 10 pt).`]);
  const imgs = allEls().filter((e) => e.type === 'image' && !e.hidden).length;
  if (imgs) out.push(['info', `${imgs} image(s): ATS ignore images, so keep important information in text.`]);
  // Two text boxes side by side (overlapping rows, separate columns) can be read across instead of down.
  const cols = doc.pages.some((p) => {
    const b = p.els.filter((e) => e.type === 'text' && !e.hidden && !e.autoW).map(getBox); // chips (fit-to-text) are fine
    return b.some((a, i) => b.some((c, j) => j > i && (a.x + a.w <= c.x || c.x + c.w <= a.x)
      && Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y) > Math.min(a.h, c.h) / 2));
  });
  if (cols) out.push(['info', 'Text boxes side by side (columns). ATS read them in the order of the Layers list – check the text below reads correctly.']);
  if (doc.pages.length > 2) out.push(['info', `${doc.pages.length} pages – most CVs are 1–2 pages.`]);
  if (!out.some(([k]) => k !== 'info')) out.unshift(['ok', 'No problems found.']);
  return out;
}
$('#btnAts').onclick = () => {
  const icon = { ok: '✓', bad: '✕', warn: '!', info: 'i' };
  $('#atsChecks').replaceChildren(...atsChecks().map(([k, t]) => h('div', { class: 'check ' + k }, h('span', { textContent: icon[k] }), t)));
  $('#atsText').value = atsText();
  $('#atsDialog').showModal();
};
$('#atsClose').onclick = () => $('#atsDialog').close();
$('#atsCopy').onclick = () => { $('#atsText').select(); document.execCommand('copy'); };

// ---------------------------------------------------------------- sample CV
function sampleDoc() {
  const d = newDoc(), els = d.pages[0].els, W = PAPER[d.size].w - 2 * d.margin;
  const T = (style, y, text, extra = {}) => els.push({ id: uid(), type: 'text', x: 48, y, w: W, style, o: {}, bullet: 'none', text, ...extra });
  const L = (y) => els.push({ id: uid(), type: 'line', x: 48, y, len: W, th: 1, color: ACCENT, dash: 'solid', vert: false });
  T('h1', 48, 'Alex Morgan');
  T('h3', 92, 'Senior Software Engineer', { o: { color: ACCENT } });
  T('small', 116, ':mail: alex.morgan@example.com   :phone: +1 555 010 0199   :location: Berlin   :linkedin: linkedin.com/in/alexmorgan   :github: github.com/alexmorgan', { ic: ACCENT });
  L(142);
  T('h2', 158, 'Profile'); L(182);
  T('body', 192, 'Software engineer with 8+ years of experience building reliable web products. Comfortable across the stack, with a focus on clean APIs, performance and mentoring. Looking for a role where I can own problems end to end.');
  T('h2', 252, 'Experience'); L(276);
  T('h3', 288, 'Senior Software Engineer\tJan 2021 – Present');
  T('h4', 310, 'Northwind Labs  ·  Remote');
  T('body', 332, 'Led a team of 5 building the customer analytics platform\nCut page load time by **45%** by redesigning the data layer\nIntroduced code review and CI practices adopted company-wide', { bullet: 'dot' });
  T('h3', 408, 'Software Engineer\tJun 2017 – Dec 2020');
  T('h4', 430, 'Contoso  ·  Berlin');
  T('body', 452, 'Built and maintained the public REST API used by **200+ partners**\nMigrated a monolith to services with zero downtime', { bullet: 'dot' });
  T('h2', 520, 'Education'); L(544);
  T('h3', 556, 'B.Sc. Computer Science\t2013 – 2017');
  T('h4', 578, 'State University');
  T('h2', 616, 'Skills'); L(640);
  T('body', 650, '**Languages:** TypeScript, Python, Go, SQL\n**Tools:** React, Node.js, PostgreSQL, Docker, AWS');
  return d;
}

// ---------------------------------------------------------------- privacy controls
$('#keepCopy').checked = keepCopy();
$('#keepCopy').onchange = (ev) => {
  try {
    if (ev.target.checked) { localStorage.removeItem(KEEP_KEY); save(); setStatus('Autosave is on: a copy is kept in this browser', 5000); }
    else { localStorage.setItem(KEEP_KEY, 'off'); localStorage.removeItem(TABS_KEY); localStorage.removeItem(DOC_KEY); localStorage.removeItem('cv-translate-key'); setStatus('Nothing is kept in this browser now. Use Save to keep a file', 8000); }
  } catch (_) { /* storage blocked: nothing is kept anyway */ }
};
// Removes the stored CV and reloads, which also drops the undo history, the imported fonts and the page pictures held in memory.
$('#clearSaved').onclick = () => {
  if (!confirm('Remove the CVs kept in this browser?\n\nEvery open tab is discarded (undo cannot bring them back). Files you saved are not touched.')) return;
  try { localStorage.removeItem(TABS_KEY); localStorage.removeItem(DOC_KEY); localStorage.removeItem('cv-translate-key'); } catch (_) { /* nothing to remove */ }
  undoStack.length = 0; redoStack.length = 0; tabs.length = 0; location.reload();
};

// ---------------------------------------------------------------- init
(function init() {
  try {
    if (keepCopy()) {
      const saved = localStorage.getItem(TABS_KEY), old = localStorage.getItem(DOC_KEY);
      if (saved) {
        const st = JSON.parse(saved);
        st.tabs.forEach((t) => tabs.push(newTab(normalize(t.doc), { fresh: !!t.fresh })));
        activeTab = Math.min(Math.max(st.active | 0, 0), tabs.length - 1);
      } else if (old) { tabs.push(newTab(normalize(JSON.parse(old)))); activeTab = 0; } // saved before tabs existed
      localStorage.removeItem(DOC_KEY);
    } else { localStorage.removeItem(TABS_KEY); localStorage.removeItem(DOC_KEY); }
  } catch (_) { tabs.length = 0; }
  if (!tabs.length) { tabs.push(newTab(sampleDoc(), { fresh: true })); activeTab = 0; }
  loadTab(activeTab);
})();
