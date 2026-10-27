/* CV Editor – Layers panel: every item of every page in list order. The list order is the DOM order, which is
 * both the order the PDF text is read in (ATS) and the drawing order (later items are drawn on top).
 * Drag rows to reorder (also onto another page), click to select, double-click to rename, eye = hide, lock = lock. */
'use strict';

const layersEl = $('#layersPanel');
let layerDrag = null; // set while a row is being dragged, so re-renders don't rebuild the list under the pointer

const TEXT_TAGS = { h1: 'H1', h2: 'H2', h3: 'H3', h4: 'H4', body: '¶', small: 'S' };
function layerLabel(e) {
  if (e.name) return e.name;
  if (e.type === 'text') return plain(e).split('\n').find((l) => l.trim())?.trim().slice(0, 60) || 'Empty text';
  if (e.type === 'line') return e.vert ? 'Vertical line' : 'Line';
  if (e.type === 'rect') return e.shape === 'ellipse' ? 'Circle' : 'Box';
  return 'Image';
}
function layerIcon(e) {
  if (e.type === 'text') return h('span', { class: 'ltag', textContent: TEXT_TAGS[e.style] || 'T' });
  return uiIcon(e.type === 'line' ? (e.vert ? 'vline' : 'line') : e.type === 'rect' ? (e.shape === 'ellipse' ? 'ellipse' : 'box') : 'image');
}
// a stable colour per group, shown as a bar on the left of its rows
const groupHue = (g) => [...g].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);

function refreshLayers() {
  if (layerDrag || layersEl.hidden) return;
  const scroll = $('#left').scrollTop;
  layersEl.textContent = '';
  const auto = h('input', { type: 'checkbox', checked: !!doc.autoOrder, id: 'autoOrder' });
  auto.addEventListener('change', () => { mutate(() => { doc.autoOrder = auto.checked; }); buildPanels(); });
  layersEl.append(
    h('div', { class: 'lhead' },
      h('label', { class: 'lauto', title: 'Keep text in the order a reader sees it: top to bottom, column by column' }, auto, h('span', { textContent: 'Auto reading order' })),
      h('button', {
        class: 'btn', textContent: 'Sort by position', hidden: !!doc.autoOrder, title: 'Put the text in reading order once, keep your order afterwards',
        onclick: () => { mutate(() => doc.pages.forEach((p) => p.els.splice(0, p.els.length, ...autoOrdered(p)))); },
      })),
    h('p', { class: 'hint lnote', textContent: 'Top of the list is read first. Lower items are drawn on top. Drag to reorder.' }),
  );
  let n = 0; // reading position of each visible text
  doc.pages.forEach((p, pi) => {
    const sec = h('section', { class: 'lpage', 'data-pi': pi });
    sec.append(h('h4', { class: 'lpagehead', textContent: `Page ${pi + 1}`, 'data-pi': pi }, h('span', { class: 'num', textContent: `${p.els.length}` })));
    if (!p.els.length) sec.append(h('p', { class: 'lempty', textContent: 'Empty – drop items here' }));
    p.els.forEach((e) => {
      const r = h('div', { class: 'lrow' + (e.hidden ? ' off' : '') + (e.locked ? ' locked' : '') + (sel.includes(e.id) ? ' sel' : ''), 'data-id': e.id });
      if (e.g) { r.classList.add('grouped'); r.style.setProperty('--gh', groupHue(e.g)); r.title = 'In a group (Ctrl+Shift+G ungroups)'; }
      const grip = uiIcon('grip'); grip.classList.add('grip');
      const eye = iconBtn(e.hidden ? 'eyeoff' : 'eye', e.hidden ? 'Show' : 'Hide (not shown, printed or read)', () => mutate(() => { e.hidden = !e.hidden; }));
      const lock = iconBtn(e.locked ? 'lock' : 'unlock', e.locked ? 'Unlock' : 'Lock (can’t be moved on the page)', () => mutate(() => { e.locked = !e.locked; }));
      eye.classList.add('leye'); lock.classList.add('llock');
      if (e.hidden) eye.classList.add('on'); if (e.locked) lock.classList.add('on');
      r.append(grip, h('span', { class: 'licon' }, layerIcon(e)), h('span', { class: 'lname', textContent: layerLabel(e) }),
        e.type === 'text' && !e.hidden ? h('span', { class: 'lnum num', textContent: ++n, title: `Read as number ${n}` }) : h('span', { class: 'lnum' }), eye, lock);
      sec.append(r);
    });
    layersEl.append(sec);
  });
  $('#left').scrollTop = scroll;
}
function syncLayerSel() {
  layersEl.querySelectorAll('.lrow').forEach((r) => r.classList.toggle('sel', sel.includes(r.dataset.id)));
}

// hovering a row outlines the item on the page
layersEl.addEventListener('pointerover', (ev) => {
  const r = ev.target.closest('.lrow'); pagesEl.querySelectorAll('.el.hl').forEach((n) => n.classList.remove('hl'));
  if (r && !layerDrag) nodeOf(r.dataset.id)?.classList.add('hl');
});
layersEl.addEventListener('pointerleave', () => pagesEl.querySelectorAll('.el.hl').forEach((n) => n.classList.remove('hl')));

// double-click a name to rename the layer (an empty name goes back to the text excerpt)
layersEl.addEventListener('dblclick', (ev) => {
  const r = ev.target.closest('.lrow'); if (!r || ev.target.closest('button')) return;
  const e = allEls().find((x) => x.id === r.dataset.id), name = r.querySelector('.lname');
  const inp = h('input', { type: 'text', class: 'lrename', value: e.name || '', placeholder: layerLabel({ ...e, name: '' }) });
  name.replaceWith(inp); inp.focus(); inp.select();
  let done = false;
  const finish = (keep) => {
    if (done) return; done = true;
    const v = inp.value.trim();
    if (keep && v !== (e.name || '')) mutate(() => { if (v) e.name = v; else delete e.name; }); else refreshLayers();
  };
  inp.addEventListener('keydown', (k) => { if (k.key === 'Enter') finish(true); if (k.key === 'Escape') finish(false); k.stopPropagation(); });
  inp.addEventListener('blur', () => finish(true));
});

// click selects (Shift/Ctrl adds), dragging reorders
layersEl.addEventListener('pointerdown', (ev) => {
  const r = ev.target.closest('.lrow');
  if (!r || ev.button !== 0 || ev.target.closest('button, input')) return;
  ev.preventDefault();
  if (editingId) nodeOf(editingId)?.blur();
  const id = r.dataset.id, add = ev.shiftKey || ev.ctrlKey || ev.metaKey, was = sel.includes(id);
  curPage = pageIndexOf(id);
  if (add) sel = was ? sel.filter((x) => x !== id) : [...sel, id];
  else if (!was) sel = [id];
  updateSelection();
  nodeOf(id)?.scrollIntoView({ block: 'nearest' });
  const y0 = ev.clientY;
  let target = null;
  const line = h('div', { class: 'ldrop' });
  const move = (m) => {
    if (!layerDrag) {
      if (Math.abs(m.clientY - y0) < 4 || add) return;
      layerDrag = { ids: docOrder(selEls()).map((e) => e.id) };
      layersEl.classList.add('dragging');
      layerDrag.ids.forEach((x) => layersEl.querySelector(`.lrow[data-id="${x}"]`)?.classList.add('moving'));
      layersEl.append(line);
    }
    target = dropTarget(m.clientY);
    if (!target) { line.hidden = true; return; }
    line.hidden = false;
    const lr = layersEl.getBoundingClientRect();
    line.style.top = target.lineY - lr.top + layersEl.scrollTop + 'px';
    autoScroll(m.clientY);
  };
  const up = () => {
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
    clearInterval(scrollTimer); scrollTimer = null;
    const drag = layerDrag; layerDrag = null; line.remove(); layersEl.classList.remove('dragging');
    if (drag && target) moveLayers(drag.ids, target.pi, target.before);
    else if (drag) refreshLayers(); // dropped outside the list: nothing moves
    else if (!drag && !add && was && sel.length > 1) { sel = [id]; updateSelection(); } // a plain click narrows a multi-selection
  };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
});

// Where a drop at this height would go: before a row, or at the end of a page section.
function dropTarget(cy) {
  const moving = new Set(layerDrag.ids);
  for (const sec of layersEl.querySelectorAll('.lpage')) {
    const sr = sec.getBoundingClientRect(), pi = +sec.dataset.pi;
    if (cy < sr.top || cy > sr.bottom + 6) continue;
    const head = sec.querySelector('.lpagehead').getBoundingClientRect();
    const rows = [...sec.querySelectorAll('.lrow')];
    if (cy <= head.bottom) return { pi, before: rows.find((r) => !moving.has(r.dataset.id))?.dataset.id ?? null, lineY: head.bottom };
    for (let i = 0; i < rows.length; i++) {
      const rr = rows[i].getBoundingClientRect();
      if (cy < rr.top + rr.height / 2) {
        const next = rows.slice(i).find((x) => !moving.has(x.dataset.id));
        return { pi, before: next?.dataset.id ?? null, lineY: rr.top };
      }
    }
    const last = rows[rows.length - 1]?.getBoundingClientRect();
    return { pi, before: null, lineY: last ? last.bottom : head.bottom };
  }
  return null;
}
let scrollTimer = null, scrollV = 0;
function autoScroll(cy) { // keep scrolling while the pointer is near the top or bottom of the panel
  const box = $('#left').getBoundingClientRect();
  scrollV = cy < box.top + 40 ? -8 : cy > box.bottom - 40 ? 8 : 0;
  if (scrollV && !scrollTimer) scrollTimer = setInterval(() => { $('#left').scrollTop += scrollV; }, 16);
  if (!scrollV) { clearInterval(scrollTimer); scrollTimer = null; }
}

// Move items (kept in their current order) to page `pi`, before the item `beforeId` (null = end of the page).
function moveLayers(ids, pi, beforeId) {
  reorderWith(() => {
    const moving = docOrder(ids.map((id) => allEls().find((e) => e.id === id)).filter(Boolean));
    doc.pages.forEach((p) => { p.els = p.els.filter((e) => !ids.includes(e.id)); });
    const arr = doc.pages[pi].els, at = beforeId ? arr.findIndex((e) => e.id === beforeId) : -1;
    arr.splice(at < 0 ? arr.length : at, 0, ...moving);
    if (moving.some((e) => e.g)) moving.forEach((e) => { if (e.g && doc.pages.some((p, i) => i !== pi && p.els.some((o) => o.g === e.g))) delete e.g; }); // groups stay on one page
  });
  curPage = pi;
  refreshLayers();
}

// Left sidebar tabs: Add | Layers
document.querySelectorAll('#ltabs button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('#ltabs button').forEach((x) => x.classList.toggle('active', x === b));
  $('#addPanel').hidden = b.dataset.ltab !== 'add'; layersEl.hidden = b.dataset.ltab !== 'layers';
  refreshLayers();
}));
refreshLayers();
