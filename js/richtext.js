// Testo formattato leggero, usato da privilegi e note:
//   **grassetto**   *corsivo*   ***entrambi***   righe "- " = elenco puntato
//   righe "# " / "## " = titoli   riga "---" = linea di separazione
//   riga "![didascalia](img:ID)" = immagine (salvata a parte, vedi images.js);
//   "![didascalia](img:ID 50%)" = immagine larga metà del testo
//   righe "| a | b |" = tabella (con una riga "|---|---|" sotto la prima, quella è l'intestazione)
// Il testo resta semplice (si salva così com'è); qui lo si disegna senza innerHTML.
import { h, modal, confirmDialog } from './ui.js';
import { t as tr } from './i18n.js';
import { IMG_LINE, IMG_MIN, cachedImageUrl, imageUrl } from './images.js';
import { TABLE_LINE, SEP_LINE, splitRow, parseTable, tableToText, MAX_TABLE_ROWS, MAX_TABLE_COLS } from './tables.js';

export { parseTable, tableToText, replaceTable } from './tables.js';

/**
 * opts.onImageSize(id, pct): se c'è, sulle immagini compare il pulsante per cambiarne la
 * grandezza (pct = percentuale della larghezza del testo, null = automatica).
 * opts.onTableEdit(n, testo): se c'è, sulle tabelle compare il pulsante per modificarle
 * (n = quale tabella del testo, testo = la nuova tabella, '' = eliminata).
 */
export function richText(text, opts = {}) {
  const italic = (s) => s.split(/(\*[^*\s][^*]*\*)/).map((p) => (/^\*[^*\s][^*]*\*$/.test(p) ? h('em', {}, p.slice(1, -1)) : p));
  const inline = (s) => s.split(/(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*)/).flatMap((p) => {
    if (/^\*\*\*[^*]+\*\*\*$/.test(p)) return [h('strong', {}, h('em', {}, p.slice(3, -3)))];
    if (/^\*\*[^*]+\*\*$/.test(p)) return [h('strong', {}, italic(p.slice(2, -2)))];
    return italic(p);
  });
  const out = [];
  let ul = null;
  let tableLines = [];
  let tables = 0;
  const flushTable = () => {
    if (!tableLines.length) return;
    out.push(tableBlock(parseTable(tableLines), inline, tables++, opts.onTableEdit));
    tableLines = [];
  };
  for (const line of String(text ?? '').split('\n')) {
    if (TABLE_LINE.test(line)) { ul = null; tableLines.push(line); continue; }
    flushTable();
    if (/^\s*(-{3,}|_{3,}|\*{3,})\s*$/.test(line)) { ul = null; out.push(h('hr', { class: 'rt-hr' })); continue; }
    const pic = IMG_LINE.exec(line);
    if (pic) { ul = null; out.push(imageFigure(pic[2], pic[1], pic[3] ? Number(pic[3]) : null, opts.onImageSize)); continue; }
    const head = /^\s*(#{1,3})\s+(.*)$/.exec(line);
    if (head) { ul = null; out.push(h(head[1].length === 1 ? 'h4' : 'h5', { class: 'rt-h' }, inline(head[2]))); continue; }
    const m = /^\s*[-•]\s+(.*)$/.exec(line) || /^\s*\*\s+(.*)$/.exec(line);
    if (m) {
      if (!ul) out.push((ul = h('ul', {})));
      ul.append(h('li', {}, inline(m[1])));
      continue;
    }
    ul = null;
    if (line.trim()) out.push(h('p', {}, inline(line)));
  }
  flushTable();
  return out;
}

// ---- tabelle --------------------------------------------------------------
function tableBlock({ header, rows }, inline, n, onEdit) {
  const cells = (r, tag) => h('tr', {}, r.map((c) => h(tag, {}, inline(c))));
  const table = h('table', { class: 'rt-table' },
    header ? h('thead', {}, cells(rows[0], 'th')) : null,
    h('tbody', {}, (header ? rows.slice(1) : rows).map((r) => cells(r, 'td'))));
  const wrap = h('div', { class: 'rt-table-wrap' }, h('div', { class: 'rt-table-scroll' }, table));
  if (onEdit) {
    wrap.append(h('button', { type: 'button', class: 'rt-table-btn', title: tr('Modifica tabella'), 'aria-label': tr('Modifica tabella'),
      onclick: async (e) => {
        e.stopPropagation();
        const r = await editTableDialog({ header, rows });
        if (r === 'delete') onEdit(n, '');
        else if (r) onEdit(n, tableToText(r));
      } }, '✎'));
  }
  return wrap;
}

/**
 * Editor a griglia di una tabella. Restituisce { header, rows }, 'delete' o null.
 * Senza argomento crea una tabella nuova (3 colonne, intestazione + 1 riga).
 */
export async function editTableDialog(table) {
  const isNew = !table;
  const t = table ? { header: table.header, rows: table.rows.map((r) => [...r]) } : { header: true, rows: [['', '', ''], ['', '', '']] };
  const grid = h('div', { class: 'tbl-grid' });
  const headerBox = h('input', { type: 'checkbox', checked: t.header, onchange: (e) => { t.header = e.target.checked; draw(); } });
  const cols = () => t.rows[0]?.length || 0;
  const addRow = h('button', { type: 'button', class: 'btn small', onclick: () => {
    if (t.rows.length >= MAX_TABLE_ROWS) return;
    t.rows.push(Array(cols()).fill('')); draw(); const all = grid.querySelectorAll('input'); all[all.length - cols()]?.focus();
  } }, tr('+ Riga'));
  const addCol = h('button', { type: 'button', class: 'btn small', onclick: () => {
    if (cols() >= MAX_TABLE_COLS) return;
    t.rows.forEach((row) => row.push('')); draw();
  } }, tr('+ Colonna'));
  const size = h('span', { class: 'tbl-size' });
  const del = (label, fn, disabled) => h('button', { type: 'button', class: 'btn ghost sq small danger', title: label, 'aria-label': label, disabled, onclick: () => { fn(); draw(); } }, '✕');
  const draw = () => {
    const n = cols();
    grid.style.setProperty('--tbl-cols', String(n));
    addRow.disabled = t.rows.length >= MAX_TABLE_ROWS;
    addCol.disabled = n >= MAX_TABLE_COLS;
    size.textContent = tr('{r}/{rmax} righe · {c}/{cmax} colonne', { r: t.rows.length, rmax: MAX_TABLE_ROWS, c: n, cmax: MAX_TABLE_COLS });
    grid.replaceChildren(
      h('span', {}),
      ...Array.from({ length: n }, (_, c) => h('div', { class: 'tbl-col-tools' }, del(tr('Elimina colonna'), () => t.rows.forEach((r) => r.splice(c, 1)), n <= 1))),
      ...t.rows.flatMap((r, i) => [
        del(tr('Elimina riga'), () => t.rows.splice(i, 1), t.rows.length <= 1),
        ...r.map((c, j) => h('input', { class: `input${t.header && i === 0 ? ' tbl-head' : ''}`, value: c, 'aria-label': tr('Riga {r}, colonna {c}', { r: i + 1, c: j + 1 }),
          placeholder: t.header && i === 0 ? tr('Titolo') : '', oninput: (e) => { r[j] = e.target.value; } })),
      ]));
  };
  draw();
  const r = await modal({
    title: isNew ? tr('Nuova tabella') : tr('Modifica tabella'),
    wide: true,
    body: h('div', { class: 'stack gap' },
      h('label', { class: 'tbl-check' }, headerBox, h('span', {}, tr('La prima riga è l\'intestazione'))),
      h('div', { class: 'tbl-scroll' }, grid),
      h('div', { class: 'tbl-tools' },
        addRow, addCol, size),
      h('small', { class: 'hint' }, tr('Nelle celle puoi usare **grassetto** e *corsivo*.'))),
    actions: [
      isNew ? null : { label: tr('Elimina'), value: 'delete', cls: 'danger' },
      { label: tr('Annulla'), value: null },
      { label: isNew ? tr('Inserisci') : tr('Salva'), value: 'save', cls: 'primary' },
    ].filter(Boolean),
  });
  if (r === 'delete') return (await confirmDialog(tr('Eliminare la tabella?'), tr('La tabella verrà tolta dal testo.'), tr('Elimina'), true)) ? 'delete' : null;
  if (r !== 'save') return null;
  // via le righe e le colonne rimaste del tutto vuote (tranne l'intestazione)
  let rows = t.rows.filter((row, i) => (t.header && i === 0) || row.some((c) => c.trim()));
  const keep = rows[0].map((_, j) => rows.some((row) => row[j].trim()));
  if (keep.some(Boolean)) rows = rows.map((row) => row.filter((_, j) => keep[j]));
  return { header: t.header, rows };
}

export const FORMAT_HINT = tr('Formattazione: **grassetto**, *corsivo*, ***entrambi***; righe che iniziano con "- " = elenco, "# " = titolo; "---" = linea di separazione; "Tabella" inserisce una tabella.');

/** Testo senza formattazione, su una riga (per le anteprime). */
export function plainText(text) {
  return String(text ?? '').split('\n')
    .map((l) => (IMG_LINE.test(l) ? '🖼' : SEP_LINE.test(l) ? '' : TABLE_LINE.test(l) ? splitRow(l).filter(Boolean).join(' ') : l))
    .map((l) => l.replace(/^\s*(#{1,3}|[-•*])\s+/, '').replace(/^\s*(-{3,}|_{3,}|\*{3,})\s*$/, '').replace(/\*+/g, '').trim())
    .filter(Boolean).join(' · ');
}

/** Adatta l'altezza della textarea al contenuto. */
export function autoGrow(ta, min = 4) {
  const fit = () => { ta.style.height = 'auto'; ta.style.height = `${Math.max(ta.scrollHeight + 2, min * 24)}px`; };
  ta.addEventListener('input', fit);
  ta.fit = fit;
  requestAnimationFrame(fit);
  return ta;
}

// Immagine nel testo: si carica dall'archivio; un tocco la apre a schermo intero.
const SIZES = [['Piccola', 33], ['Media', 50], ['Grande', 75], ['Intera', 100]];

function imageFigure(id, caption, pct, onSize) {
  const img = h('img', { alt: caption || tr('Immagine'), loading: 'lazy' });
  const fig = h('figure', { class: 'rt-img' }, img, caption ? h('figcaption', {}, caption) : null);
  const applySize = (p) => {
    fig.classList.toggle('sized', p != null);
    fig.style.width = p != null ? `${p}%` : '';
  };
  applySize(pct);
  if (onSize) {
    // pulsante per la grandezza e, aperto, la barra con le misure e il cursore
    let bar = null;
    let current = pct;
    const close = () => { bar?.remove(); bar = null; fig.classList.remove('sizing'); };
    const choose = (p) => { current = p; applySize(p); mark(); };
    const presets = SIZES.map(([label, p]) => h('button', { type: 'button', class: 'btn small', 'data-p': String(p), onclick: () => { choose(p); slider.value = String(p); } }, tr(label)));
    const auto = h('button', { type: 'button', class: 'btn small ghost', onclick: () => { choose(null); slider.value = '100'; } }, tr('Automatica'));
    const slider = h('input', { type: 'range', min: String(IMG_MIN), max: '100', step: '1', value: String(pct ?? 100), 'aria-label': tr('Grandezza dell\'immagine'),
      oninput: (e) => choose(Number(e.target.value)) });
    const label = h('span', { class: 'rt-size-val' });
    const mark = () => {
      label.textContent = current == null ? 'auto' : `${current}%`;
      presets.forEach((b) => b.classList.toggle('active', Number(b.dataset.p) === current));
      auto.classList.toggle('active', current == null);
    };
    const open = () => {
      if (bar) return;
      current = pct; slider.value = String(pct ?? 100); mark();
      bar = h('div', { class: 'rt-size' },
        h('div', { class: 'rt-size-presets' }, presets, auto),
        h('div', { class: 'rt-size-range' }, slider, label),
        h('div', { class: 'rt-size-actions' },
          h('button', { type: 'button', class: 'btn small ghost', onclick: () => { applySize(pct); close(); } }, tr('Annulla')),
          h('button', { type: 'button', class: 'btn small primary', onclick: () => { close(); if (current !== pct) onSize(id, current); } }, tr('Fatto'))));
      bar.addEventListener('click', (e) => e.stopPropagation());
      fig.classList.add('sizing');
      fig.after(bar);
    };
    fig.append(h('button', { type: 'button', class: 'rt-size-btn', title: tr('Grandezza'), 'aria-label': tr('Cambia la grandezza dell\'immagine'),
      onclick: (e) => { e.stopPropagation(); if (bar) close(); else open(); } }, '⤢'));
  }
  const show = (url) => { img.src = url; };
  const cached = cachedImageUrl(id);
  if (cached) show(cached);
  else imageUrl(id).then(show).catch(() => { fig.classList.add('rt-img-missing'); fig.replaceChildren(h('span', {}, tr('Immagine non disponibile su questo dispositivo'))); });
  fig.addEventListener('click', (e) => {
    e.stopPropagation(); // non apre la modifica del testo
    if (e.target.closest('.rt-size-btn')) return;
    if (img.src) openImageViewer(img.src, caption);
  });
  return fig;
}

/** Visualizzatore a schermo intero: un tocco passa da "adatta allo schermo" a "grandezza piena". */
export function openImageViewer(src, caption) {
  document.querySelector('.viewer')?.remove();
  const img = h('img', { src, alt: caption || tr('Immagine') });
  const stage = h('div', { class: 'viewer-stage' }, img);
  const close = () => { viewer.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const viewer = h('div', { class: 'viewer', role: 'dialog', 'aria-label': caption || tr('Immagine') },
    h('div', { class: 'viewer-bar' },
      h('span', { class: 'viewer-caption' }, caption || ''),
      h('span', { class: 'viewer-hint' }, tr('Tocca per ingrandire')),
      h('button', { type: 'button', class: 'viewer-close', 'aria-label': tr('Chiudi'), onclick: close }, '✕')),
    stage);
  stage.addEventListener('click', (e) => {
    if (e.target !== img) return close(); // tocco fuori dall'immagine: chiude
    const r = img.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width;
    const fy = (e.clientY - r.top) / r.height;
    viewer.classList.toggle('full');
    // ingrandendo, resta centrato il punto toccato
    if (viewer.classList.contains('full')) {
      stage.scrollLeft = fx * img.scrollWidth - stage.clientWidth / 2;
      stage.scrollTop = fy * img.scrollHeight - stage.clientHeight / 2;
    }
  });
  document.addEventListener('keydown', onKey);
  document.body.append(viewer);
}
