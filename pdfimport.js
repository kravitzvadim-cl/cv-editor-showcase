/* PDF import: opens any PDF as an editable document.
 * pdf.js (vendor/pdfjs, loaded on first use) reads each page's text, fonts, links and drawing operators.
 * They are rebuilt as editor items:
 *   text           → text boxes on the Heading 1–4 / Body / Small styles (bold runs, links, bullets, tab stops)
 *   embedded fonts → reused, so the text keeps its original look (nearest installed font as fallback)
 *   lines / boxes  → line and box items; bullet dots and small icons → • bullets and :icons:
 *   everything else (photos, logos, charts, gradients, rotated text, scanned pages) → image pieces in place.
 * Nothing on the page is dropped: what can't be edited as text still comes in as a picture. */
'use strict';

let pdfjsReady = null;
function loadPdfJs() {
  const load = (src) => new Promise((ok, fail) => document.head.append(h('script', { src, onload: ok, onerror: () => fail(new Error('could not load ' + src)) })));
  // The worker script runs on the main thread (globalThis.pdfjsWorker), which also works when index.html is opened as a file.
  pdfjsReady ||= load('vendor/pdfjs/pdf.worker.js').then(() => load('vendor/pdfjs/pdf.js'));
  return pdfjsReady;
}

const S = 3; // render scale: 3 px per point, sharp enough for image pieces in print
// PDF font name → editor font. Bundled families (fonts/doc) come first: a PDF set in them renders in the real face.
const FONT_RULES = [
  [/^inter(?:[-_, ]|display|variable|var|\d|$)/i, 'Inter'], [/^roboto(?!\s*(slab|mono|condensed|flex|serif))/i, 'Roboto'],
  [/open\s*-?sans/i, 'Open Sans'], [/^lato(?:[-_, ]|$)/i, 'Lato'], [/source\s*sans/i, 'Source Sans 3'], [/carlito/i, 'Carlito'],
  [/merriweather(?!\s*sans)/i, 'Merriweather'], [/^lora(?:[-_, ]|$)/i, 'Lora'], [/eb\s*garamond/i, 'EB Garamond'],
  [/source\s*serif/i, 'Source Serif 4'], [/manrope/i, 'Manrope'], [/^geist(?!\s*mono)/i, 'Geist'], [/dm\s*sans/i, 'DM Sans'],
  [/montserrat/i, 'Montserrat'], [/playfair/i, 'Playfair Display'], [/rubik/i, 'Rubik'], [/heebo/i, 'Heebo'],
  [/^assistant/i, 'Assistant'], [/frank\s*ruhl/i, 'Frank Ruhl Libre'],
  [/calibri/i, 'Calibri'], [/arial|helvetica|arimo|liberationsans|liberation sans|nimbussans/i, 'Arial'],
  [/times|tinos|liberationserif|liberation serif|nimbusrom/i, 'Times New Roman'], [/georgia|cambria/i, 'Georgia'],
  [/garamond/i, 'Garamond'], [/verdana|dejavusans/i, 'Verdana'], [/tahoma|segoe/i, 'Tahoma'], [/trebuchet/i, 'Trebuchet MS'],
  [/palatino|palladio|pagella|bookantiqua/i, 'Palatino'], [/courier|mono|cousine|consolas/i, 'Courier New'],
  [/serif|roman|book|minion|caslon|baskerville/i, 'Georgia'],
];
const matchFont = (name) => (FONT_RULES.find(([re]) => re.test(name || '')) || [, 'Arial'])[1];
// ascent / descent per em, to turn a PDF baseline into the top of a CSS line box: measured from the font the browser
// will really use (bundled or installed), with typical values as a fallback
const FONT_METRICS = { Calibri: [0.952, 0.269], Arial: [0.905, 0.212], 'Times New Roman': [0.891, 0.216], Georgia: [0.917, 0.219], Verdana: [1.005, 0.21] };
function fontMetrics(name) {
  measureCtx.font = `100px ${fontCss(name)}`;
  const m = measureCtx.measureText('Hg');
  if (m.fontBoundingBoxAscent > 0) return [m.fontBoundingBoxAscent / 100, m.fontBoundingBoxDescent / 100];
  return FONT_METRICS[name] || [0.9, 0.22];
}
const BULLET_CHARS = /^[•●▪◦‣∙·■□–\-•]$/;
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const lum = (px, k) => 0.299 * px[k] + 0.587 * px[k + 1] + 0.114 * px[k + 2];

// ---------------------------------------------------------------- entry point
// Returns { doc, report, originals } – originals are page renders for the "Original" overlay (not saved).
async function importPdf(file, onProgress = () => {}) {
  await loadPdfJs();
  const task = pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), fontExtraProperties: true, isEvalSupported: false });
  task.onPassword = (update, reason) => {
    const pw = prompt(reason === pdfjsLib.PasswordResponses.INCORRECT_PASSWORD ? 'Wrong password – try again:' : `"${file.name}" is password-protected. Password:`);
    if (pw === null) task.destroy(); else update(pw);
  };
  let pdf;
  try { pdf = await task.promise; } catch (err) {
    if (err?.name === 'PasswordException' || /destroy|cancel/i.test(err?.message || '')) throw new Error('the PDF is password-protected and no password was given.');
    throw new Error(`this file could not be read as a PDF (${err?.message || err}).`);
  }
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress(i, pdf.numPages);
    const page = await pdf.getPage(i);
    try { pages.push(await readPage(page)); } catch (err) { pages.push(await fallbackPage(page, err)); }
  }
  const { doc, report } = await buildDoc(pages, file.name.replace(/\.pdf$/i, ''));
  return { doc, report, originals: pages.map((p) => p.original) };
}

// A page that could not be analysed still comes in, as one picture.
async function fallbackPage(page, err) {
  const vp = page.getViewport({ scale: 1 });
  const canvas = h('canvas', { width: Math.ceil(vp.width * S), height: Math.ceil(vp.height * S) });
  try { await page.render({ canvasContext: canvas.getContext('2d'), viewport: page.getViewport({ scale: S }) }).promise; } catch (_) { /* blank */ }
  const original = canvas.toDataURL('image/jpeg', 0.85);
  return { w: vp.width, h: vp.height, spans: [], links: [], shapes: [], fonts: {}, original, failed: String(err?.message || err), canvas, pixels: null };
}

// ---------------------------------------------------------------- reading one page
async function readPage(page) {
  const vp = page.getViewport({ scale: 1 });
  const canvas = h('canvas', { width: Math.ceil(vp.width * S), height: Math.ceil(vp.height * S) });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  await page.render({ canvasContext: ctx, viewport: page.getViewport({ scale: S }) }).promise;
  const W = canvas.width, H = canvas.height, px = ctx.getImageData(0, 0, W, H).data;
  const original = canvas.toDataURL('image/jpeg', 0.85);

  const tc = await page.getTextContent();
  const fonts = {};
  const fontOf = (id) => {
    if (!(id in fonts)) { let f = null; try { f = page.commonObjs.get(id); } catch (_) { /* not loaded */ } fonts[id] = f; }
    return fonts[id];
  };

  // ink inside a box (page points, top-left origin): darkest colour, and stroke width (2·area / perimeter) for bold detection
  const inkStats = (x, y, w, hh) => {
    const x0 = Math.max(0, Math.floor(x * S)), y0 = Math.max(0, Math.floor(y * S));
    const x1 = Math.min(W, Math.ceil((x + w) * S)), y1 = Math.min(H, Math.ceil((y + hh) * S));
    const dark = []; let n = 0, edge = 0;
    const isInk = (xx, yy) => xx >= x0 && xx < x1 && yy >= y0 && yy < y1 && lum(px, (yy * W + xx) * 4) < 170;
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
      const k = (yy * W + xx) * 4, l = lum(px, k);
      if (l < 200) dark.push([l, px[k], px[k + 1], px[k + 2]]);
      if (l < 170) { n++; if (!isInk(xx - 1, yy) || !isInk(xx + 1, yy) || !isInk(xx, yy - 1) || !isInk(xx, yy + 1)) edge++; }
    }
    if (!dark.length) return { color: '#000000', stroke: 0 };
    dark.sort((a, b) => a[0] - b[0]);
    const top = dark.slice(0, Math.max(1, Math.ceil(dark.length / 4)));
    const avg = (c) => Math.round(top.reduce((s, p) => s + p[c], 0) / top.length);
    return { color: '#' + [1, 2, 3].map((c) => avg(c).toString(16).padStart(2, '0')).join(''), stroke: edge ? (2 * n) / edge / S : 0 };
  };

  const spans = [], rotated = [];
  for (const it of tc.items) {
    const str = it.str.replace(/\s*\n\s*$/, '').replace(/\s+/g, ' ');
    if (!str.trim()) continue;
    const [a, b, c, d, e, f] = it.transform;
    const size = Math.min(Math.hypot(a, b), Math.hypot(c, d)); // Type 3 fonts can be scaled unevenly
    if (size < 1) continue;
    const [x, base] = vp.convertToViewportPoint(e, f);
    const [vx, vy] = [vp.transform[0] * a + vp.transform[2] * b, vp.transform[1] * a + vp.transform[3] * b]; // text direction on screen
    if (Math.abs(vy) > Math.abs(vx) * 0.05 || vx <= 0) { // rotated or vertical text → kept as a picture
      const len = it.width || size * str.length * 0.5;
      const ex = x + (vx / Math.hypot(vx, vy)) * len, ey = base + (vy / Math.hypot(vx, vy)) * len;
      rotated.push({ x: Math.min(x, ex) - size, y: Math.min(base, ey) - size, w: Math.abs(ex - x) + size * 2, h: Math.abs(ey - base) + size * 2 });
      continue;
    }
    const font = fontOf(it.fontName), type3 = !!font?.isType3Font;
    const name = type3 ? '' : (font?.name || '').replace(/^[A-Z]{6}\+/, '');
    const ink = inkStats(x, base - size * 0.75, it.width, size * 0.75);
    spans.push({
      str, x, base, size, w: it.width, color: ink.color, stroke: ink.stroke / size, fontId: it.fontName, named: !!name,
      bold: /bold|black|heavy|semibold|demi|w[6-9]00/i.test(name) || !!font?.bold || !!font?.black, italic: /italic|oblique/i.test(name) || !!font?.italic,
      font: name ? matchFont(name) : 'Arial',
    });
  }
  // Text layers of outlined/Type 3 text often contain false spaces ("se tting"): keep only spaces that line up with a visible gap.
  spans.filter((s) => !s.named && / /.test(s.str.trim())).forEach((s) => { s.str = realSpaces(s, px, W, H); });
  // Fonts without names (Type 3, outlined text): a span is bold when its strokes are clearly thicker than normal text.
  const unnamed = spans.filter((s) => !s.named && s.str.replace(/\s/g, '').length > 2 && s.stroke > 0);
  if (unnamed.length > 2) {
    const ref = median(unnamed.map((s) => s.stroke));
    spans.filter((s) => !s.named).forEach((s) => {
      s.bold = s.stroke > ref * 1.25;
      // "Label: text" in one piece – is the label bold? compare stroke widths before and after the colon
      const k = s.str.indexOf(':') + 1;
      if (s.bold || k < 3 || k > 60 || k > s.str.length * 0.7) return;
      measureCtx.font = `${s.size}px Arial`;
      const split = s.x + (measureCtx.measureText(s.str.slice(0, k)).width / (measureCtx.measureText(s.str).width || 1)) * s.w;
      const a = inkStats(s.x, s.base - s.size * 0.75, split - s.x, s.size * 0.75).stroke / s.size;
      const b = inkStats(split, s.base - s.size * 0.75, s.x + s.w - split, s.size * 0.75).stroke / s.size;
      if (a > b * 1.2 && a > ref * 1.15) s.boldPrefix = k;
    });
  }

  const links = (await page.getAnnotations()).filter((an) => an.subtype === 'Link' && an.url).map((an) => {
    const [x0, y0] = vp.convertToViewportPoint(an.rect[0], an.rect[1]), [x1, y1] = vp.convertToViewportPoint(an.rect[2], an.rect[3]);
    return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0), url: an.url };
  });

  const shapes = await readShapes(page, vp);
  rotated.forEach((b) => shapes.push({ kind: 'other', ...b, why: 'rotated text' }));
  return { w: vp.width, h: vp.height, spans, links, shapes, fonts, original, canvas, pixels: px };
}

// Word gaps are blank columns in the rendered span; spaces in the text are matched to them in order
// (positions estimated from a reference font), and spaces with no gap to match are dropped.
const measureCtx = document.createElement('canvas').getContext('2d');
function realSpaces(s, px, W, H) {
  const str = s.str, y0 = Math.max(0, Math.floor((s.base - s.size * 0.75) * S)), y1 = Math.min(H, Math.ceil(s.base * S));
  const x0 = Math.max(0, Math.floor(s.x * S)), x1 = Math.min(W, Math.ceil((s.x + s.w) * S));
  const blank = [];
  for (let xx = x0; xx < x1; xx++) {
    let ink = false;
    for (let yy = y0; yy < y1 && !ink; yy++) ink = lum(px, (yy * W + xx) * 4) < 215;
    blank.push(!ink);
  }
  const gaps = []; // centres of blank runs at least 0.16 em wide, in points
  for (let i = 0, run = 0; i <= blank.length; i++) {
    if (i < blank.length && blank[i]) { run++; continue; }
    if (run >= s.size * 0.16 * S && i - run > 0 && i < blank.length) gaps.push((x0 + i - run / 2) / S);
    run = 0;
  }
  measureCtx.font = `${s.size}px Arial`;
  const total = measureCtx.measureText(str).width || 1;
  const spaces = [];
  for (let i = 0; i < str.length; i++) if (str[i] === ' ' && i > 0 && i < str.length - 1) spaces.push({ i, x: s.x + (measureCtx.measureText(str.slice(0, i + 0.5)).width / total) * s.w });
  if (!spaces.length || gaps.length >= spaces.length) return str;
  // order-preserving alignment: every visible gap takes one space; leftover spaces are false
  const n = spaces.length, m = gaps.length, INF = 1e9, skip = s.size * 0.6;
  const D = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(INF)); D[0][0] = 0;
  for (let i = 0; i <= n; i++) for (let j = 0; j <= m; j++) {
    if (D[i][j] >= INF) continue;
    if (i < n) D[i + 1][j] = Math.min(D[i + 1][j], D[i][j] + skip);
    if (i < n && j < m) D[i + 1][j + 1] = Math.min(D[i + 1][j + 1], D[i][j] + Math.abs(spaces[i].x - gaps[j]));
  }
  const drop = new Set();
  for (let i = n, j = m; i > 0;) {
    if (j > 0 && D[i][j] === D[i - 1][j - 1] + Math.abs(spaces[i - 1].x - gaps[j - 1])) { i--; j--; } else { drop.add(spaces[i - 1].i); i--; }
  }
  return [...str].filter((_, i) => !drop.has(i)).join('');
}

// Drawing operators → shapes: { kind: 'path' | 'image' | 'other', x, y, w, h (page points), color, … }
async function readShapes(page, vp) {
  const ops = await page.getOperatorList(), O = pdfjsLib.OPS;
  const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  let st = { ctm: [1, 0, 0, 1, 0, 0], fill: '#000000', stroke: '#000000', lw: 1, clip: null };
  const stack = [], out = [];
  let clipNext = false; // pdf.js sends "clip" just before the path it clips to
  const hex = (args) => (typeof args[0] === 'string' ? args[0] : '#' + [0, 1, 2].map((i) => Math.round(args[i]).toString(16).padStart(2, '0')).join(''));
  const gray = (v) => hex([v * 255, v * 255, v * 255]);
  const box = (x0, y0, x1, y1) => { // path-space box → top-left page points
    const pts = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => vp.convertToViewportPoint(st.ctm[0] * x + st.ctm[2] * y + st.ctm[4], st.ctm[1] * x + st.ctm[3] * y + st.ctm[5]));
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  };
  const clipTo = (b) => {
    if (!st.clip) return b;
    const x = Math.max(b.x, st.clip.x), y = Math.max(b.y, st.clip.y);
    return { x, y, w: Math.min(b.x + b.w, st.clip.x + st.clip.w) - x, h: Math.min(b.y + b.h, st.clip.y + st.clip.h) - y };
  };
  const PAINT = { [O.fill]: 'f', [O.eoFill]: 'f', [O.stroke]: 's', [O.closeStroke]: 's', [O.fillStroke]: 'fs', [O.eoFillStroke]: 'fs', [O.closeFillStroke]: 'fs', [O.closeEOFillStroke]: 'fs' };
  // pdf.js path data: 0 moveTo (x,y) · 1 lineTo (x,y) · 2 curveTo (6) · 3 quadraticCurveTo (4) · 4 closePath
  const pathInfo = (d) => {
    let sub = 0, curves = 0, pts = 0;
    for (let i = 0; d && i < d.length;) {
      const op = d[i++];
      if (op === 0) { sub++; i += 2; } else if (op === 1) { pts++; i += 2; } else if (op === 2) { curves++; i += 6; } else if (op === 3) { curves++; i += 4; } else if (op !== 4) break;
    }
    return { sub, curves, pts };
  };
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i], args = ops.argsArray[i];
    if (fn === O.save) stack.push({ ...st });
    else if (fn === O.restore) st = stack.pop() || st;
    else if (fn === O.transform) st.ctm = mul(st.ctm, args);
    else if (fn === O.paintFormXObjectBegin) { stack.push({ ...st }); if (args?.[0]) st.ctm = mul(st.ctm, args[0]); }
    else if (fn === O.paintFormXObjectEnd) st = stack.pop() || st;
    else if (fn === O.setFillRGBColor) { st.fill = hex(args); st.pattern = false; }
    else if (fn === O.setFillColorN) st.pattern = typeof args?.[0] === 'string'; // gradient or tiling pattern
    else if (fn === O.setStrokeRGBColor) st.stroke = hex(args);
    else if (fn === O.setFillGray) { st.fill = gray(args[0]); st.pattern = false; }
    else if (fn === O.setStrokeGray) st.stroke = gray(args[0]);
    else if (fn === O.setFillCMYKColor || fn === O.setStrokeCMYKColor) {
      const [c, m, y, k] = args, rgb = [c, m, y].map((v) => 255 * (1 - Math.min(1, v + k)));
      if (fn === O.setFillCMYKColor) st.fill = hex(rgb); else st.stroke = hex(rgb);
    } else if (fn === O.setLineWidth) st.lw = args[0];
    else if (fn === O.constructPath) {
      const mm = args[2]; if (!mm) continue;
      const b = box(mm[0], mm[1], mm[2], mm[3]);
      if (clipNext) { st.clip = st.clip ? clipTo(b) : { ...b }; clipNext = false; }
      const paint = PAINT[args[0]];
      if (!paint) continue; // clipping path or no-op
      const info = pathInfo(args[1]?.[0]);
      const scale = Math.hypot(st.ctm[0], st.ctm[1]) || 1;
      if (paint === 's') { const t = Math.max(0.5, st.lw * scale); if (b.h < t) { b.y -= t / 2; b.h = t; } if (b.w < t) { b.x -= t / 2; b.w = t; } }
      const cb = clipTo(b);
      if (cb.w <= 0 || cb.h <= 0) continue;
      if (st.pattern && paint !== 's') { out.push({ kind: 'other', ...cb, why: 'pattern' }); continue; }
      out.push({ kind: 'path', ...cb, color: paint === 's' ? st.stroke : st.fill, stroke: paint === 's' ? st.stroke : null, lw: st.lw * scale, paint, ...info });
    } else if (fn === O.clip || fn === O.eoClip) clipNext = true;
    else if (fn === O.paintImageXObject || fn === O.paintInlineImageXObject || fn === O.paintImageMaskXObject || fn === O.paintImageXObjectRepeat) {
      const b = clipTo(box(0, 0, 1, 1));
      if (b.w > 2 && b.h > 2) out.push({ kind: 'image', ...b });
    } else if (fn === O.shadingFill) {
      const b = st.clip ? { ...st.clip } : { x: 0, y: 0, w: vp.width, h: vp.height };
      out.push({ kind: 'other', ...b, why: 'gradient' });
    }
  }
  return out.filter((q, i) => !out.slice(0, i).some((o) => o.kind === q.kind && Math.abs(o.x - q.x) < 0.5 && Math.abs(o.y - q.y) < 0.5 && Math.abs(o.w - q.w) < 0.5 && Math.abs(o.h - q.h) < 0.5));
}

// Small connected blobs of ink inside a box – used to find bullet dots drawn as shapes, glyphs or baked into outlines.
function blobsIn(p, x, y, w, hh) {
  const W = p.canvas.width, H = p.canvas.height, px = p.pixels;
  const x0 = Math.max(0, Math.floor(x * S)), y0 = Math.max(0, Math.floor(y * S));
  const x1 = Math.min(W, Math.ceil((x + w) * S)), y1 = Math.min(H, Math.ceil((y + hh) * S));
  const bw = x1 - x0, bh = y1 - y0; if (bw <= 0 || bh <= 0) return [];
  const seen = new Uint8Array(bw * bh), out = [];
  const ink = (xx, yy) => lum(px, (yy * W + xx) * 4) < 170;
  for (let sy = 0; sy < bh; sy++) for (let sx = 0; sx < bw; sx++) {
    if (seen[sy * bw + sx] || !ink(x0 + sx, y0 + sy)) continue;
    const pts = [], stack = [[sx, sy]]; seen[sy * bw + sx] = 1;
    while (stack.length) {
      const [cx, cy] = stack.pop(); pts.push([cx, cy]);
      for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]]) {
        if (nx < 0 || ny < 0 || nx >= bw || ny >= bh || seen[ny * bw + nx] || !ink(x0 + nx, y0 + ny)) continue;
        seen[ny * bw + nx] = 1; stack.push([nx, ny]);
      }
    }
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
    const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2, quad = [0, 0, 0, 0];
    pts.forEach(([qx, qy]) => { quad[(qx < cx ? 0 : 1) + (qy < cy ? 0 : 2)]++; });
    out.push({ x: (x0 + bx0) / S, y: (y0 + by0) / S, w: (bx1 - bx0 + 1) / S, h: (by1 - by0 + 1) / S, n: pts.length, fill: pts.length / ((bx1 - bx0 + 1) * (by1 - by0 + 1)), quad });
  }
  return out;
}
// A bullet: the first ink on the line, a small solid round (or square) blob, followed by a gap.
function bulletBlob(p, firstX, base, size) {
  const blobs = blobsIn(p, firstX - size * 2.5, base - size * 0.95, size * 3.6, size * 1.1).sort((a, b) => a.x - b.x);
  const d = blobs[0];
  if (!d) return null;
  const em = size, mid = base - size * 0.32;
  const round = d.w >= em * 0.18 && d.h >= em * 0.18 && d.w <= em * 0.62 && d.h <= em * 0.62 && d.w / d.h > 0.75 && d.w / d.h < 1.33;
  const solid = d.fill > 0.62 && Math.max(...d.quad) <= Math.min(...d.quad) * 1.8 + 3;
  const centred = Math.abs(d.y + d.h / 2 - mid) < size * 0.3;
  const next = blobs.find((b) => b !== d && b.x > d.x);
  const gap = next ? next.x - (d.x + d.w) : size;
  // textX: where the text really starts (some PDFs report the line starting before its first letter)
  return round && solid && centred && gap >= size * 0.12 ? { ...d, textX: next ? next.x : null } : null;
}

// ---------------------------------------------------------------- rebuilding the document
async function buildDoc(pages, name) {
  const report = { pages: pages.length, textBlocks: 0, fontsReused: [], fontsMatched: [], fontsSubstituted: [], images: 0, pieces: 0, scanned: [], failed: [], notes: [] };
  const P = pages[0];
  const near = (a, b) => Math.abs(a - b) < 3;
  const size = near(P.w, 595.3) && near(P.h, 841.9) ? 'A4' : near(P.w, 612) && near(P.h, 792) ? 'Letter' : 'Custom';
  if (pages.some((p) => !near(p.w, P.w) || !near(p.h, P.h))) report.notes.push('Pages have different sizes – all pages now use the size of page 1.');

  const all = pages.flatMap((p) => p.spans);
  // load the bundled fonts this PDF maps to before measuring anything with them
  await Promise.all([...new Set(all.map((sp) => sp.font))].flatMap((f) => [400, 700].map((wt) => document.fonts.load(`${wt} 16px ${fontCss(f)}`).catch(() => {}))));
  const bodySize = mostChars(all, (s) => Math.round(s.size * 2) / 2) || 10;
  const docFonts = await reuseFonts(pages, report);

  const work = pages.map((p, i) => {
    if (p.failed) { report.failed.push(i + 1); return { p, paras: [], scanned: true }; }
    const textChars = p.spans.reduce((n, s) => n + s.str.trim().length, 0);
    const imgArea = p.shapes.filter((q) => q.kind === 'image').reduce((a, q) => a + q.w * q.h, 0);
    if (textChars < 15 && (imgArea > p.w * p.h * 0.3 || !p.spans.length && p.shapes.length)) return { p, paras: [], scanned: true };
    p.shapes = p.shapes.filter((q) => q.kind !== 'path' || (!isBackground(q, p) && !coversText(q, p.spans)));
    const lines = toLines(p, bodySize);
    return { p, paras: toParagraphs(lines) };
  });
  const paras = work.flatMap((x) => x.paras);
  const styles = assignStyles(paras, bodySize);
  const docFontFor = (q) => docFonts[q.fontId]?.family;

  const pw = Math.round(P.w * PT), ph = Math.round(P.h * PT);
  const doc = { ...newDoc(), name, size, styles, pages: [], fonts: Object.values(uniqueFamilies(docFonts)) };
  if (size === 'Custom') { doc.pageW = pw; doc.pageH = ph; }
  const minX = Math.min(...paras.map((q) => q.x));
  doc.margin = Number.isFinite(minX) ? Math.max(16, Math.min(120, Math.round(minX * PT))) : 48;
  // the styles use the reused PDF font where most of their text has one
  for (const k of STYLE_ORDER) {
    const fams = paras.filter((q) => q.role === k).map((q) => ({ str: q.text, f: docFontFor(q) || '' }));
    const fam = fams.length && mostChars(fams, (x) => x.f);
    if (fam) styles[k].font = fam;
  }

  for (const { p, paras: pp, scanned } of work) {
    const els = [];
    if (scanned) {
      if (!p.failed) report.scanned.push(pages.indexOf(p) + 1);
      els.push({ id: uid(), type: 'image', x: 0, y: 0, w: p.w * PT, h: p.h * PT, src: p.original, radius: 0, opacity: 1, fit: 'cover' });
      doc.pages.push({ els });
      continue;
    }
    const right = Math.max(...pp.map((q) => q.right), p.w * 0.8);
    const erased = eraseText(p);
    const pieces = [];
    for (const q of p.shapes) {
      if (q.kind === 'image') { els.push(cropEl(erased, q)); report.images++; continue; }
      if (q.kind === 'other') { pieces.push(q); continue; }
      if (q.used) continue; // became a bullet, an icon or a "|" separator
      if (q.small) { pieces.push(q); continue; }
      const fillColor = q.paint === 's' ? '' : q.color;
      if (q.w >= 20 && q.h <= 4) els.push({ id: uid(), type: 'line', x: q.x * PT, y: (q.y + q.h / 2) * PT, len: q.w * PT, th: Math.max(0.5, Math.round(q.h * PT * 2) / 2), color: q.color, dash: 'solid', vert: false });
      else if (q.h >= 20 && q.w <= 4) els.push({ id: uid(), type: 'line', x: (q.x + q.w / 2) * PT, y: q.y * PT, len: q.h * PT, th: Math.max(0.5, Math.round(q.w * PT * 2) / 2), color: q.color, dash: 'solid', vert: true });
      else if (q.sub === 1 && q.curves <= 8 && q.w > 6 && q.h > 6) els.push({ id: uid(), type: 'rect', x: q.x * PT, y: q.y * PT, w: q.w * PT, h: q.h * PT, fill: fillColor, stroke: q.stroke || '#000000', sw: q.paint === 's' ? Math.max(0.5, Math.round(q.lw * PT * 2) / 2) : 0, radius: q.curves ? Math.round(Math.min(q.w, q.h) * PT * 0.2) : 0, opacity: 1 });
      else pieces.push(q);
    }
    for (const c of clusters(pieces)) { els.push(cropEl(erased, c)); report.pieces++; }
    // shapes go behind the text
    for (const q of pp) {
      const el = paraToElement(q, styles, right, docFontFor(q), p);
      els.push(el); report.textBlocks++;
    }
    doc.pages.push({ els });
  }
  // margin guide from the actual content, so nothing is flagged for crossing it right after opening
  const texts = doc.pages.flatMap((pg) => pg.els.filter((e) => e.type === 'text'));
  if (texts.length) {
    const left = Math.min(...texts.map((e) => e.x)), top = Math.min(...texts.map((e) => e.y)), rightGap = pw - Math.max(...texts.map((e) => e.x + e.w));
    const bottomGap = ph - Math.max(...paras.map((q) => (q.lines.at(-1).base + q.size * 0.4) * PT));
    doc.margin = Math.max(0, Math.floor(Math.min(left, top, rightGap, Math.max(bottomGap, 0)) - 2));
  }
  return { doc, report };
}

const isBackground = (q, p) => q.w > p.w * 0.9 && q.h > p.h * 0.9 && /^#f[a-f0-9]f[a-f0-9]f[a-f0-9]$/i.test(q.color);
// Some PDFs draw their visible text as outlines and put an invisible text layer on top: those outlines overlap the text.
function coversText(q, spans) {
  let covered = 0;
  for (const s of spans) {
    const ix = Math.min(q.x + q.w, s.x + s.w) - Math.max(q.x, s.x), iy = Math.min(q.y + q.h, s.base + s.size * 0.25) - Math.max(q.y, s.base - s.size * 0.8);
    if (ix > 0 && iy > 0) covered += ix * iy;
  }
  return covered > q.w * q.h * 0.3;
}
function mostChars(items, key) {
  const n = new Map();
  items.forEach((s) => n.set(key(s), (n.get(key(s)) || 0) + (s.str || '').length + 1));
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0];
}

// Embedded fonts that map normal Unicode letters are registered and reused; others fall back to the nearest installed font.
async function reuseFonts(pages, report) {
  const byId = {}, faces = [];
  for (const p of pages) {
    for (const [id, f] of Object.entries(p.fonts || {})) {
      if (!f || byId[id] !== undefined) continue;
      const used = p.spans.filter((s) => s.fontId === id);
      if (!used.length) continue;
      const raw = (f.name || '').replace(/^[A-Z]{6}\+/, '');
      // a font the editor bundles (Roboto, Montserrat, Carlito…): use the complete bundled copy instead of the PDF's subset
      if (raw && bundledFont(matchFont(raw))) {
        byId[id] = null;
        if (!report.fontsMatched.includes(matchFont(raw))) report.fontsMatched.push(matchFont(raw));
        continue;
      }
      if (f.isType3Font || !f.data || !raw) {
        byId[id] = null;
        const label = f.isType3Font ? 'drawn (Type 3) font' : raw || 'unnamed font';
        if (!report.fontsSubstituted.some((x) => x.from === label)) report.fontsSubstituted.push({ from: label, to: used[0].font });
        continue;
      }
      const base = raw.split(/[-,+]/)[0].replace(/(MT|PS|Std|Pro)$/, '') || raw;
      const weight = /black|heavy/i.test(raw) ? 900 : /extrabold|ultrabold/i.test(raw) ? 800 : /semibold|demi/i.test(raw) ? 600 : /bold/i.test(raw) || f.bold ? 700 : /medium/i.test(raw) ? 500 : /light/i.test(raw) ? 300 : 400;
      const style = /italic|oblique/i.test(raw) || f.italic ? 'italic' : 'normal';
      const family = `${base} (from PDF)`;
      const b64 = toBase64(f.data);
      // does the font draw the characters it is used for? (some PDFs remap glyphs to private codes)
      const chars = [...new Set(used.map((s) => s.str).join('').replace(/\s/g, ''))];
      const face = new FontFace(family, f.data, { weight: String(weight), style });
      let ok = false;
      try {
        await face.load(); document.fonts.add(face);
        const ctx = h('canvas').getContext('2d'); let hit = 0;
        for (const ch of chars) {
          ctx.font = `${style} ${weight} 40px "${family}", monospace`; const a = ctx.measureText(ch).width;
          ctx.font = `${style} ${weight} 40px monospace`; const b = ctx.measureText(ch).width;
          if (Math.abs(a - b) > 0.01) hit++;
        }
        // and draws them at the widths the PDF expects (broken glyph maps, e.g. ligatures, show up as wrong widths)
        const ratios = used.filter((s) => s.str.trim().length >= 6).map((s) => {
          ctx.font = `${style} ${weight} ${s.size}px "${family}", monospace`; return ctx.measureText(s.str).width / s.w;
        });
        const off = ratios.map((r) => Math.abs(r - 1));
        ok = chars.length > 0 && hit / chars.length >= 0.9 && (!ratios.length || (median(off) < 0.02 && off.filter((d) => d > 0.05).length <= ratios.length * 0.1));
      } catch (_) { ok = false; }
      if (!ok) { byId[id] = null; if (!report.fontsSubstituted.some((x) => x.from === base)) report.fontsSubstituted.push({ from: base, to: used[0].font }); continue; }
      byId[id] = { family, fallback: used[0].font, weight, style, data: b64 };
      if (!report.fontsReused.includes(base)) report.fontsReused.push(base);
      faces.push(byId[id]);
    }
  }
  return byId;
}
function uniqueFamilies(byId) {
  const fams = {};
  Object.values(byId).filter(Boolean).forEach((f) => {
    fams[f.family] ||= { family: f.family, fallback: f.fallback, faces: [] };
    if (!fams[f.family].faces.some((x) => x.weight === f.weight && x.style === f.style)) fams[f.family].faces.push({ weight: f.weight, style: f.style, data: f.data });
  });
  return fams;
}
function toBase64(bytes) {
  let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// A copy of the page render with the converted text painted over in its surrounding colour, for image pieces.
function eraseText(p) {
  const c = h('canvas', { width: p.canvas.width, height: p.canvas.height }), ctx = c.getContext('2d');
  ctx.drawImage(p.canvas, 0, 0);
  const W = c.width, px = p.pixels;
  for (const s of p.spans) {
    const x0 = Math.max(0, Math.floor((s.x - 0.5) * S)), y0 = Math.max(0, Math.floor((s.base - s.size * 0.95) * S));
    const x1 = Math.min(W - 1, Math.ceil((s.x + s.w + 0.5) * S)), y1 = Math.min(c.height - 1, Math.ceil((s.base + s.size * 0.3) * S));
    const ring = [];
    for (let xx = x0; xx <= x1; xx += 2) { ring.push((y0 * W + xx) * 4, (y1 * W + xx) * 4); }
    for (let yy = y0; yy <= y1; yy += 2) { ring.push((yy * W + x0) * 4, (yy * W + x1) * 4); }
    const ch = (o) => median(ring.map((k) => px[k + o]));
    ctx.fillStyle = `rgb(${ch(0)},${ch(1)},${ch(2)})`;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
  return c;
}
function cropEl(canvas, q) {
  const pad = 0.5, x = Math.max(0, q.x - pad), y = Math.max(0, q.y - pad), w = q.w + pad * 2, hh = q.h + pad * 2;
  const c = h('canvas', { width: Math.max(1, Math.round(w * S)), height: Math.max(1, Math.round(hh * S)) });
  c.getContext('2d').drawImage(canvas, x * S, y * S, w * S, hh * S, 0, 0, c.width, c.height);
  const big = c.width * c.height > 250000;
  return { id: uid(), type: 'image', x: x * PT, y: y * PT, w: w * PT, h: hh * PT, src: c.toDataURL(big ? 'image/jpeg' : 'image/png', 0.9), radius: 0, opacity: 1, fit: 'cover' };
}
// Leftover shapes that touch each other (parts of one logo or chart) become one image piece.
function clusters(boxes) {
  let out = boxes.filter((b) => b.w > 1 && b.h > 1).map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }));
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < out.length && !merged; i++) for (let j = i + 1; j < out.length && !merged; j++) {
      const a = out[i], b = out[j];
      if (b.x < a.x + a.w + 3 && a.x < b.x + b.w + 3 && b.y < a.y + a.h + 3 && a.y < b.y + b.h + 3) {
        const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
        out[i] = { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
        out.splice(j, 1); merged = true;
      }
    }
  }
  return out;
}

// Spans → lines (same baseline), with bullets, icons, links, inline bold and tab stops resolved.
function toLines(p, bodySize) {
  const spans = [...p.spans].sort((a, b) => a.base - b.base || a.x - b.x);
  let rows = [];
  for (const s of spans) {
    // same baseline – or nearly the same and close by (baselines in other columns can sit just a few points apart)
    const row = rows.find((r) => {
      const d = Math.abs(r.base - s.base);
      return d < 0.6 || (d < Math.max(r.size, s.size) * 0.35 && r.spans.some((o) => s.x - (o.x + o.w) < s.size * 1.2 && o.x - (s.x + s.w) < s.size * 1.2));
    });
    if (row) { row.spans.push(s); row.size = Math.max(row.size, s.size); } else rows.push({ base: s.base, size: s.size, spans: [s] });
  }
  // Across a wide gap: a short last part reaching the right edge (a date) stays on the line as a right-aligned tab stop;
  // other parts keep their own position as separate boxes (columns, table cells, spaced-out contact details).
  const contentRight = Math.max(...spans.map((s) => s.x + s.w));
  // A column gutter is a gap that lines up across neighbouring rows; it splits rows even when it is narrow.
  rows.forEach((r) => {
    r.spans.sort((a, b) => a.x - b.x);
    r.gaps = r.spans.slice(1).map((s, i) => ({ x0: r.spans[i].x + r.spans[i].w, x1: s.x })).filter((g) => g.x1 - g.x0 > r.size * 1.2);
  });
  // (the middle of the gap is empty in at least 3 rows above or below: no text runs across it)
  const gutter = (r, x0, x1) => {
    const m = (x0 + x1) / 2;
    return rows.filter((o) => o !== r && Math.abs(o.base - r.base) < r.size * 5 && !o.spans.some((s) => s.x - 2 < m && s.x + s.w + 2 > m)).length >= 3;
  };
  rows = rows.flatMap((r) => {
    const parts = [[r.spans[0]]];
    for (const s of r.spans.slice(1)) {
      const prev = parts.at(-1).at(-1), gap = s.x - (prev.x + prev.w);
      if (gap > r.size * 3 || (gap > r.size * 1.2 && gutter(r, prev.x + prev.w, s.x))) parts.push([s]); else parts.at(-1).push(s);
    }
    const text = (part) => part.map((s) => s.str).join('').trim();
    const last = parts.at(-1), lastRight = Math.max(...last.map((s) => s.x + s.w));
    const columnAt = (x) => spans.some((o) => !last.includes(o) && Math.abs(o.x - x) < 2 && Math.abs(o.base - r.base) > 1 && Math.abs(o.base - r.base) < r.size * 2.6);
    if (parts.length === 2 && text(last).length <= 40 && lastRight > contentRight - r.size * 1.5 && !columnAt(last[0].x)) return [r];
    return parts.map((part) => ({ base: part[0].base, size: Math.max(...part.map((s) => s.size)), spans: part }));
  }).sort((a, b) => a.base - b.base || a.spans[0].x - b.spans[0].x);

  // small drawn shapes: separators, bullet dots and icons sitting next to text
  const small = p.shapes.filter((q) => q.kind === 'path' && q.w <= bodySize * 1.8 && q.h <= bodySize * 1.8 && q.w > 0.3 && q.h > 0.3);
  small.forEach((q) => { q.small = true; q.used = false; });
  const bars = small.filter((q) => q.w < 2.5 && q.h >= bodySize * 0.5);
  // touching pieces form one shape: a lone small round one is a bullet dot, anything bigger an icon
  const groups = mergeBoxes(small.filter((q) => !bars.includes(q)));
  const isDot = (g) => g.parts.length === 1 && g.w <= 6.5 && g.h <= 6.5 && g.w >= 1.5 && Math.abs(g.w - g.h) < 1.5;
  const dotShapes = groups.filter(isDot).map((g) => g.parts[0]);
  const icons = groups.filter((g) => !isDot(g) && g.w >= 4 && g.h >= 4);

  return rows.map((r) => {
    const first = r.spans[0];
    let bullet = false;
    if (BULLET_CHARS.test(first.str.trim())) { bullet = true; r.spans.shift(); }
    else if (/^[•●▪•]\s/.test(first.str)) { bullet = true; first.str = first.str.replace(/^\S\s+/, ''); }
    if (!r.spans.length) return null;
    const mid = r.base - r.size * 0.32;
    let textX = r.spans[0].x;
    if (!bullet) {
      const shape = dotShapes.find((d) => !d.used && Math.abs(d.y + d.h / 2 - mid) < r.size * 0.5 && d.x + d.w > textX - r.size * 2.5 && d.x + d.w < textX + r.size * 0.2);
      const blob = !shape && !icons.some((q) => Math.abs(q.y + q.h / 2 - mid) < r.size * 0.7 && q.x < textX && q.x > textX - r.size * 2.5) && bulletBlob(p, textX, r.base, r.size);
      const dot = shape || blob;
      if (dot) {
        bullet = true; if (shape) shape.used = true;
        if (dot.textX) textX = dot.textX;
        else if (dot.x + dot.w > textX - 0.5) textX = dot.x + dot.w + r.size * 0.35; // the bullet was drawn inside the first span
      }
    }
    const boldChars = r.spans.filter((s) => s.bold).reduce((n, s) => n + s.str.length, 0), allChars = r.spans.reduce((n, s) => n + s.str.length, 0);
    const mixed = boldChars > 0 && boldChars < allChars && r.spans.some((s) => !s.bold && s.str.trim()); // e.g. a bold title with a regular date
    const dom = {
      size: mostChars(r.spans, (s) => Math.round(s.size * 2) / 2), bold: mostChars(r.spans, (s) => s.bold), mixed,
      italic: mostChars(r.spans, (s) => s.italic), color: mostChars(r.spans, (s) => s.color), font: mostChars(r.spans, (s) => s.font),
      fontId: mostChars(r.spans, (s) => s.fontId),
    };
    let text = '', prev = null, iconX = null;
    const wrapBold = (s, t) => (s.bold && (!dom.bold || mixed) && t.trim() ? t.replace(/^(\s*)(.*?)(\s*)$/, '$1**$2**$3') : t);
    for (let i = 0; i < r.spans.length; i++) {
      const s = r.spans[i];
      if (prev) {
        const gap = s.x - (prev.x + prev.w);
        if (gap > r.size * 3) text = text.trimEnd() + '\t';
        else if (gap > r.size * 1.2) text = text.trimEnd() + '   ';
        else if (gap > r.size * 0.12 && !/\s$/.test(text) && !/^\s/.test(s.str)) text += ' ';
      }
      const bar = prev && bars.find((q) => !q.used && q.x > prev.x + prev.w - 1 && q.x < s.x + 1 && Math.abs(q.y + q.h / 2 - mid) < r.size * 0.7);
      if (bar) { bar.used = true; text = text.trimEnd() + ' | '; }
      const icon = icons.find((q) => !q.used && Math.abs(q.y + q.h / 2 - mid) < r.size * 0.7 && s.x - (q.x + q.w) > -1 && s.x - (q.x + q.w) < r.size * 1.6);
      const link = p.links.find((l) => s.x + s.w / 2 >= l.x && s.x + s.w / 2 <= l.x + l.w && s.base - s.size / 3 >= l.y - 2 && s.base - s.size / 3 <= l.y + l.h + 2);
      let t = wrapBold(s, s.str.replace(/^([A-HJ-Z]) ([a-z]{2,})/, '$1$2')); // "T echnical" → "Technical" (kerning gaps in some PDFs)
      if (s.boldPrefix && !s.bold) t = `**${s.str.slice(0, s.boldPrefix).trim()}**${s.str.slice(s.boldPrefix).replace(/^(\S)/, ' $1')}`;
      if (link && !sameAddress(s.str, link.url)) t = `[${t.trim()}](${link.url})`;
      if (icon) { icon.used = true; icon.parts.forEach((q) => { q.used = true; }); t = `:${iconFor(s.str, link?.url)}: ` + t.trimStart(); if (!prev) iconX = icon.x; }
      text += t; prev = s;
    }
    text = text.replace(/\*\*( +)\*\*/g, '$1').replace(/\*\*\*\*/g, ''); // join neighbouring bold spans
    const x = iconX ?? r.spans[0].x, right = Math.max(...r.spans.map((s) => s.x + s.w)); // a leading icon belongs to the line
    const letters = text.replace(/\[([^\]]*)\]\([^)]*\)|:[a-z]+:|\*\*/g, '$1').replace(/[^A-Za-z]/g, '');
    // natural width: the pieces themselves without the gaps between them (justified lines stretch those gaps)
    const natW = r.spans.reduce((n, s) => n + s.w, 0), natText = r.spans.map((s) => s.str).join('');
    return { ...dom, text: text.trim(), x, textX, base: r.base, right, natW, natText, bullet, tab: text.includes('\t'), upper: letters.length > 2 && letters === letters.toUpperCase() };
  }).filter(Boolean);
}
function mergeBoxes(boxes) { // icons drawn from several pieces become one box (remembering the pieces)
  const out = [];
  for (const b of boxes) {
    const o = out.find((a) => b.x < a.x + a.w + 1.5 && a.x < b.x + b.w + 1.5 && b.y < a.y + a.h + 1.5 && a.y < b.y + b.h + 1.5);
    if (o) { const x = Math.min(o.x, b.x), y = Math.min(o.y, b.y); o.w = Math.max(o.x + o.w, b.x + b.w) - x; o.h = Math.max(o.y + o.h, b.y + b.h) - y; o.x = x; o.y = y; o.parts.push(b); }
    else out.push({ x: b.x, y: b.y, w: b.w, h: b.h, parts: [b] });
  }
  return out;
}
const sameAddress = (text, url) => {
  const n = (x) => x.toLowerCase().replace(/^(https?:\/\/|mailto:|tel:)/, '').replace(/^www\./, '').replace(/[^a-z0-9@./+]/g, '').replace(/\/+$/, '');
  return n(text).includes(n(url)) || (n(url).includes(n(text)) && n(text).length > 8 && n(text).includes('.'));
};
function iconFor(text, url) {
  const t = (text + ' ' + (url || '')).toLowerCase();
  if (t.includes('linkedin')) return 'linkedin';
  if (t.includes('github')) return 'github';
  if (t.includes('gitlab')) return 'gitlab';
  if (t.includes('@') || t.includes('mailto:')) return 'mail';
  if (/\+?\d[\d\s().-]{6,}/.test(t)) return 'phone';
  if (/https?:|www\.|\.\w{2,}\//.test(t)) return 'globe';
  return 'location';
}

// Lines → paragraphs: wrapped lines of the same style join into one text box; consecutive bullets form one list.
function toParagraphs(lines) {
  const paras = [];
  // a line with a few **bold** words is still regular text: compare the base weight
  const sameStyle = (a, b) => Math.abs(a.size - b.size) < 0.6 && (a.bold && !a.mixed) === (b.bold && !b.mixed) && a.italic === b.italic && a.color === b.color;
  for (const l of lines) {
    const q = paras.find((pp) => {
      const last = pp.lines.at(-1), gap = l.base - last.base;
      if (gap <= 0 || gap > Math.max(l.size, last.size) * 1.75 || !sameStyle(pp, l) || last.tab || l.tab) return false;
      if (pp.bullet) return l.bullet ? Math.abs(l.textX - pp.textX) < 4.5 : Math.abs(l.x - pp.textX) < 4.5;
      if (l.bullet) return false;
      // same left edge (left / justified), same centre (centred) or same right edge (right-aligned)
      return Math.abs(l.x - pp.x) < 3 || Math.abs((l.x + l.right) / 2 - (last.x + last.right) / 2) < 3 || Math.abs(l.right - last.right) < 2;
    });
    if (q) {
      const last = q.lines.at(-1);
      if (l.bullet) q.items.push(l.text); else q.items[q.items.length - 1] += ' ' + l.text;
      q.lines.push(l); q.right = Math.max(q.right, l.right); q.gaps.push(l.base - last.base);
      q.x = Math.min(q.x, l.x);
    } else paras.push({ ...l, lines: [l], items: [l.text], gaps: [] });
  }
  paras.forEach((pp) => { pp.text = pp.items.join('\n'); pp.lh = pp.gaps.length ? median(pp.gaps) / pp.size : null; });
  return paras;
}

// Decide which paragraphs are Heading 1–4 / Body / Small, and derive the styles from the PDF itself.
function assignStyles(paras, bodySize) {
  const styles = defaultStyles();
  if (!paras.length) return styles;
  const maxSize = Math.max(...paras.map((q) => q.size));
  const bodyColor = mostChars(paras.map((x) => ({ str: x.text, c: x.color })), (x) => x.c);
  paras.forEach((q) => {
    q.role = q.size === maxSize && q.size >= bodySize * 1.5 ? 'h1'
      : q.upper && (q.bold || q.size > bodySize) && !q.bullet && q.text.length < 60 ? 'h2'
        : q.size >= bodySize * 1.35 && !q.bullet && q.text.length < 80 ? 'h2'
          : q.bold && q.size >= bodySize * 0.95 && !q.bullet ? 'h3'
            : q.size < bodySize * 0.92 ? 'small'
              : !q.bullet && (q.italic || q.size > bodySize * 1.05 || q.color !== bodyColor) && q.text.length < 140 ? 'h4'
                : 'body';
  });
  for (const k of STYLE_ORDER) {
    const group = paras.filter((q) => q.role === k);
    if (!group.length) continue;
    const pick = (fn) => mostChars(group.map((q) => ({ str: q.text, v: fn(q) })), (x) => x.v);
    const lhs = group.filter((q) => q.lh).map((q) => q.lh);
    Object.assign(styles[k], {
      font: pick((q) => q.font), size: pick((q) => q.size), weight: pick((q) => q.bold) ? 700 : 400, color: pick((q) => q.color),
      italic: pick((q) => q.italic), upper: false, ls: 0, lh: lhs.length ? Math.round(median(lhs) * 100) / 100 : styles[k].lh, align: 'left',
    });
  }
  return styles;
}

// Paragraph → text box: overrides where it differs from its style, alignment, and the CSS box position for its baseline.
function paraToElement(q, styles, right, docFont, p) {
  const st = styles[q.role], o = {};
  const font = docFont || q.font;
  if (Math.abs(q.size - st.size) > 0.3) o.size = q.size;
  const bold = q.bold && !q.mixed; // mixed lines are regular with **bold** parts
  if (bold !== (st.weight >= 600)) o.weight = bold ? 700 : 400;
  if (q.italic !== st.italic) o.italic = q.italic;
  if (q.color !== st.color) o.color = q.color;
  if (font !== st.font) o.font = font;
  if (q.lh && Math.abs(q.lh - st.lh) > 0.08) o.lh = Math.round(q.lh * 100) / 100;
  // alignment from the line edges
  const L = q.lines, lefts = L.map((l) => l.x), rights = L.map((l) => l.right), centres = L.map((l) => (l.x + l.right) / 2);
  const spread = (a) => Math.max(...a) - Math.min(...a);
  let align = 'left';
  if (L.length > 1 && spread(lefts) > 3 && spread(centres) < 3) align = 'center';
  else if (L.length > 1 && spread(lefts) > 3 && spread(rights) < 2) align = 'right';
  else if (L.length > 2 && spread(lefts) < 3 && spread(rights.slice(0, -1)) < 1.5 && rights.at(-1) < Math.max(...rights) - 5) align = 'justify';
  else if (L.length === 1 && !q.bullet && !q.tab && Math.abs(centres[0] - p.w / 2) < 3 && q.x > p.w * 0.2) align = 'center';
  else if (L.length === 1 && !q.bullet && !q.tab && Math.abs(q.right - right) < 2 && q.x > p.w / 2) align = 'right';
  if (align !== st.align) o.align = align;

  // the font it will be shown in may be wider or narrower than the PDF's: nudge letter spacing so lines break as in the original
  const weight = o.weight ?? st.weight, italic = o.italic ?? st.italic;
  measureCtx.font = `${italic ? 'italic ' : ''}${weight} ${q.size}px ${fontCss(font)}`;
  // (justified lines are stretched, so use the last line of a justified paragraph, and the tightest line otherwise)
  const natural = align === 'justify' ? q.lines.slice(-1) : q.lines;
  const fits = natural.filter((l) => !l.tab && !/:[a-z]+:/.test(l.text) && l.natW > q.size * 8)
    .map((l) => (l.natW - measureCtx.measureText(l.natText).width) / Math.max(1, l.natText.length));
  if (fits.length) {
    const ls = Math.max(-0.8, Math.min(0.8, Math.round(Math.min(...fits) * 100) / 100));
    if (Math.abs(ls) >= 0.03 && Math.abs(ls - (st.ls || 0)) >= 0.03) o.ls = ls;
  }
  const lh = o.lh || st.lh;
  const [asc, desc] = fontMetrics(font);
  const s = q.size, topPt = L[0].base - asc * s - ((lh - asc - desc) * s) / 2;
  let x = q.bullet ? q.textX - s * 1.4 : q.x; // the bullet hangs 1.4em left of the text, as in the editor
  // wrapped paragraphs keep their own width (columns); a single line gets the room its text needs in the font it will use
  measureCtx.font = `${italic ? 'italic ' : ''}${weight} ${q.size}px ${fontCss(font)}`;
  const need = measureCtx.measureText(q.text.replace(MDLINK_RE, '$1').replace(/\*\*/g, '').replace(/:[a-z]+:/g, 'MM')).width + (o.ls || 0) * q.text.length;
  let w = L.length > 1 ? q.right - x + Math.max(2, s * 0.3) : Math.min(p.w - 2, Math.max(q.right, x + need) + s * 0.6 + 4) - x;
  if (q.tab) w = Math.max(right, q.right) - x + 2;
  if (align === 'center') { const half = Math.min(q.x + (q.right - q.x) / 2, p.w - (q.x + (q.right - q.x) / 2)); x = q.x + (q.right - q.x) / 2 - half; w = half * 2; }
  if (align === 'right') { w = q.right - x + 1; }
  if (align === 'justify') { w = q.right - x + 0.5; }
  return {
    id: uid(), type: 'text', x: Math.round(x * PT * 10) / 10, y: Math.round(topPt * PT * 10) / 10,
    w: Math.round(w * PT), style: q.role, o, bullet: q.bullet ? 'dot' : 'none', text: q.text,
  };
}
