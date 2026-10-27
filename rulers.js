/* CV Editor – rulers and guides. Rulers run along the top and left of the desk, measured from the page's top-left
 * corner in mm, px or pt (click the corner to switch). Drag from a ruler onto the page to pull out a guide; drag a
 * guide to move it, or back onto its ruler to remove it. Guides are saved with the document (doc.guides, shared by
 * every page), items snap to them, and they are never printed. */
'use strict';

const RULER = 20; // px, the rulers' thickness
const UNITS = { mm: 96 / 25.4, px: 1, pt: 96 / 72 };
const stageWrap = $('#stageWrap'), rulerTop = $('#rulerTop'), rulerLeft = $('#rulerLeft'), rulerCorner = $('#rulerCorner');
const pref = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch (_) { return d; } };
const setPref = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* private window */ } };
let unit = UNITS[pref('cv-ruler-unit', 'mm')] ? pref('cv-ruler-unit', 'mm') : 'mm';
let rulersOn = pref('cv-rulers', '1') === '1';
const guidesOf = () => (doc.guides ||= { x: [], y: [] });
const fmt = (px) => { const v = px / UNITS[unit]; return (unit === 'px' ? Math.round(v) : Math.round(v * 10) / 10) + ' ' + unit; };

// ---------------------------------------------------------------- drawing
function drawRuler(cv, horiz) {
  const r = cv.getBoundingClientRect(); if (!r.width || !r.height) return;
  const dpr = window.devicePixelRatio || 1, g = cv.getContext('2d');
  cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const css = getComputedStyle(document.documentElement), col = (v) => css.getPropertyValue(v).trim();
  g.fillStyle = col('--chrome'); g.fillRect(0, 0, r.width, r.height);
  const ppu = UNITS[unit] * zoom; // screen px per unit
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000];
  const major = steps.find((s) => s * ppu >= 46) || 2000, minor = major / (String(major)[0] === '2' ? 4 : 5);
  const pages = [...pagesEl.children], selBox = selectionBox();
  pages.forEach((pg, i) => {
    if (horiz && i > 0) return; // every page shares the same x
    const pr = pg.getBoundingClientRect(), o = horiz ? pr.left - r.left : pr.top - r.top, len = horiz ? pr.width : pr.height;
    if (o + len < 0 || o > (horiz ? r.width : r.height)) return;
    g.fillStyle = col('--field');
    if (horiz) g.fillRect(o, 0, len, r.height); else g.fillRect(0, o, r.width, len);
    if (selBox && (horiz || selBox.pi === i)) { // the selection's extent
      g.fillStyle = col('--ink-soft');
      const a = o + (horiz ? selBox.x : selBox.y) * zoom, b = (horiz ? selBox.w : selBox.h) * zoom;
      if (horiz) g.fillRect(a, 0, b, r.height); else g.fillRect(0, a, r.width, b);
    }
    g.strokeStyle = col('--muted'); g.fillStyle = col('--muted'); g.lineWidth = 1; g.font = `9px ${col('--num') || 'monospace'}`;
    const units = len / ppu;
    for (let u = 0; u <= units + 1e-6; u += minor) {
      const p = Math.round(o + u * ppu) + 0.5, isMajor = Math.abs(u / major - Math.round(u / major)) < 1e-6;
      const t = isMajor ? RULER : Math.abs(u / (major / 2) - Math.round(u / (major / 2))) < 1e-6 ? RULER * 0.45 : RULER * 0.25;
      g.beginPath();
      if (horiz) { g.moveTo(p, RULER); g.lineTo(p, RULER - t); } else { g.moveTo(RULER, p); g.lineTo(RULER - t, p); }
      g.stroke();
      if (isMajor && u > 0) {
        const label = String(Math.round(u));
        if (horiz) g.fillText(label, p + 3, 9);
        else { g.save(); g.translate(9, p + 3); g.rotate(-Math.PI / 2); g.fillText(label, -g.measureText(label).width, 0); g.restore(); }
      }
    }
  });
  g.strokeStyle = col('--line'); g.beginPath();
  if (horiz) { g.moveTo(0, r.height - 0.5); g.lineTo(r.width, r.height - 0.5); } else { g.moveTo(r.width - 0.5, 0); g.lineTo(r.width - 0.5, r.height); }
  g.stroke();
}
// The selection's bounding box on its page (page px), for the shaded band on the rulers
function selectionBox() {
  const els = selEls().filter((e) => !e.hidden); if (!els.length) return null;
  const pi = pageIndexOf(els[0].id), bs = els.filter((e) => pageIndexOf(e.id) === pi).map(getBox);
  const x = Math.min(...bs.map((b) => b.x)), y = Math.min(...bs.map((b) => b.y));
  return { pi, x, y, w: Math.max(...bs.map((b) => b.x + b.w)) - x, h: Math.max(...bs.map((b) => b.y + b.h)) - y };
}
let rulerFrame = 0;
function drawRulers() {
  if (!rulersOn || rulerFrame) return;
  rulerFrame = requestAnimationFrame(() => { rulerFrame = 0; drawRuler(rulerTop, true); drawRuler(rulerLeft, false); });
}

// Guides: one thin line per guide on every page (drawn after the items, so they sit on top)
function placeGuides() {
  pagesEl.querySelectorAll('.rguide').forEach((n) => n.remove());
  if (rulersOn) {
    const gd = guidesOf();
    [...pagesEl.children].forEach((pg) => {
      gd.x.forEach((x, i) => pg.append(h('div', { class: 'rguide v', 'data-axis': 'x', 'data-i': i, style: `left:${x}px`, title: `${fmt(x)} – drag to move, drag onto the ruler to remove` })));
      gd.y.forEach((y, i) => pg.append(h('div', { class: 'rguide h', 'data-axis': 'y', 'data-i': i, style: `top:${y}px`, title: `${fmt(y)} – drag to move, drag onto the ruler to remove` })));
    });
  }
  drawRulers();
}

// ---------------------------------------------------------------- dragging guides
const inRect = (r, m) => m.clientX >= r.left && m.clientX <= r.right && m.clientY >= r.top && m.clientY <= r.bottom;
// Where a guide on `axis` sits for this pointer, in page px: x from the first page, y from the page under (or nearest to) it
function guideAt(axis, m) {
  const pages = [...pagesEl.children];
  if (axis === 'x') return (m.clientX - pages[0].getBoundingClientRect().left) / zoom;
  const near = pages.map((pg) => pg.getBoundingClientRect())
    .reduce((best, r) => { const d = m.clientY < r.top ? r.top - m.clientY : m.clientY > r.bottom ? m.clientY - r.bottom : 0; return d < best.d ? { d, r } : best; }, { d: Infinity, r: null });
  return (m.clientY - near.r.top) / zoom;
}
function startGuideDrag(axis, ev, index) {
  ev.preventDefault(); ev.stopPropagation();
  const before = JSON.stringify(doc), gd = guidesOf(), list = gd[axis], ruler = axis === 'x' ? rulerLeft : rulerTop;
  const isNew = index < 0, start = isNew ? null : list[index];
  if (isNew) { list.push(guideAt(axis, ev)); index = list.length - 1; }
  const tag = h('div', { class: 'rguide-tag' }); document.body.append(tag);
  let remove = isNew;
  const move = (m) => {
    const off = inRect(ruler.getBoundingClientRect(), m) || !inRect($('#stage').getBoundingClientRect(), m);
    remove = off;
    let v = Math.round(guideAt(axis, m) * 2) / 2;
    if (!m.altKey) { // pull towards the margins and the page centre
      const { w, h: ph } = paper(), stops = axis === 'x' ? [doc.margin, w / 2, w - doc.margin] : [doc.margin, ph / 2, ph - doc.margin];
      const near = stops.find((s) => Math.abs(s - v) < 5 / zoom); if (near != null) v = near;
    }
    list[index] = v;
    tag.textContent = off ? 'Release to remove' : fmt(v);
    Object.assign(tag.style, { left: m.clientX + 12 + 'px', top: m.clientY + 14 + 'px' });
    tag.classList.toggle('off', off);
    placeGuides();
    pagesEl.querySelectorAll(`.rguide[data-axis="${axis}"][data-i="${index}"]`).forEach((n) => n.classList.toggle('removing', off));
  };
  const up = () => {
    window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
    tag.remove();
    if (remove) list.splice(index, 1);
    const changed = isNew ? !remove : remove || list[index] !== start;
    if (changed) { pushUndo(before); coalesceKey = null; save(); setStatus(remove ? 'Guide removed' : `Guide at ${fmt(list[index])}`, 2500); }
    placeGuides(); buildPanels();
  };
  move(ev);
  window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
}
rulerTop.addEventListener('mousedown', (ev) => { if (ev.button === 0) startGuideDrag('y', ev, -1); });
rulerLeft.addEventListener('mousedown', (ev) => { if (ev.button === 0) startGuideDrag('x', ev, -1); });
// existing guides: caught before the page starts a marquee
pagesEl.addEventListener('mousedown', (ev) => {
  const gEl = ev.target.closest?.('.rguide'); if (!gEl || ev.button !== 0) return;
  startGuideDrag(gEl.dataset.axis, ev, +gEl.dataset.i);
}, true);

// ---------------------------------------------------------------- switches
function addMarginGuides() {
  const { w, h: ph } = paper(), m = doc.margin;
  mutate(() => {
    const gd = guidesOf();
    [m, w - m].forEach((x) => { if (!gd.x.includes(x)) gd.x.push(x); });
    [m, ph - m].forEach((y) => { if (!gd.y.includes(y)) gd.y.push(y); });
  });
  if (!rulersOn) setRulers(true);
  buildPanels();
}
function clearGuides() { mutate(() => { doc.guides = { x: [], y: [] }; }); buildPanels(); }
function setRulers(on) {
  rulersOn = on; setPref('cv-rulers', on ? '1' : '0');
  stageWrap.classList.toggle('rulers', on);
  $('#btnRulers').classList.toggle('active', on); $('#btnRulers').setAttribute('aria-pressed', on);
  placeGuides();
}
rulerCorner.addEventListener('click', () => {
  const order = ['mm', 'px', 'pt']; unit = order[(order.indexOf(unit) + 1) % order.length];
  setPref('cv-ruler-unit', unit); rulerCorner.textContent = unit; placeGuides();
});
$('#btnRulers').addEventListener('click', () => setRulers(!rulersOn));
document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'R' || !ev.shiftKey || ev.ctrlKey || ev.metaKey || ev.altKey || editingId || isField(ev.target)) return;
  ev.preventDefault(); setRulers(!rulersOn);
});
$('#stage').addEventListener('scroll', drawRulers);
window.addEventListener('resize', drawRulers);
rulerCorner.textContent = unit;
setRulers(rulersOn);
