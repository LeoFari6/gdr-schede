// Testo formattato leggero, usato da privilegi e note:
//   **grassetto**   *corsivo*   ***entrambi***   righe "- " = elenco puntato
//   righe "# " / "## " = titoli   riga "---" = linea di separazione
//   riga "![didascalia](img:ID)" = immagine (salvata a parte, vedi images.js);
//   "![didascalia](img:ID 50%)" = immagine larga metà del testo
// Il testo resta semplice (si salva così com'è); qui lo si disegna senza innerHTML.
import { h } from './ui.js';
import { IMG_LINE, IMG_MIN, cachedImageUrl, imageUrl } from './images.js';

/**
 * opts.onImageSize(id, pct): se c'è, sulle immagini compare il pulsante per cambiarne la
 * grandezza (pct = percentuale della larghezza del testo, null = automatica).
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
  for (const line of String(text ?? '').split('\n')) {
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
  return out;
}

export const FORMAT_HINT = 'Formattazione: **grassetto**, *corsivo*, ***entrambi***; righe che iniziano con "- " = elenco, "# " = titolo; "---" = linea di separazione.';

/** Testo senza formattazione, su una riga (per le anteprime). */
export function plainText(text) {
  return String(text ?? '').split('\n')
    .map((l) => (IMG_LINE.test(l) ? '🖼' : l))
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
  const img = h('img', { alt: caption || 'Immagine', loading: 'lazy' });
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
    const presets = SIZES.map(([label, p]) => h('button', { type: 'button', class: 'btn small', 'data-p': String(p), onclick: () => { choose(p); slider.value = String(p); } }, label));
    const auto = h('button', { type: 'button', class: 'btn small ghost', onclick: () => { choose(null); slider.value = '100'; } }, 'Automatica');
    const slider = h('input', { type: 'range', min: String(IMG_MIN), max: '100', step: '1', value: String(pct ?? 100), 'aria-label': 'Grandezza dell\'immagine',
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
          h('button', { type: 'button', class: 'btn small ghost', onclick: () => { applySize(pct); close(); } }, 'Annulla'),
          h('button', { type: 'button', class: 'btn small primary', onclick: () => { close(); if (current !== pct) onSize(id, current); } }, 'Fatto')));
      bar.addEventListener('click', (e) => e.stopPropagation());
      fig.classList.add('sizing');
      fig.after(bar);
    };
    fig.append(h('button', { type: 'button', class: 'rt-size-btn', title: 'Grandezza', 'aria-label': 'Cambia la grandezza dell\'immagine',
      onclick: (e) => { e.stopPropagation(); if (bar) close(); else open(); } }, '⤢'));
  }
  const show = (url) => { img.src = url; };
  const cached = cachedImageUrl(id);
  if (cached) show(cached);
  else imageUrl(id).then(show).catch(() => { fig.classList.add('rt-img-missing'); fig.replaceChildren(h('span', {}, 'Immagine non disponibile su questo dispositivo')); });
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
  const img = h('img', { src, alt: caption || 'Immagine' });
  const stage = h('div', { class: 'viewer-stage' }, img);
  const close = () => { viewer.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const viewer = h('div', { class: 'viewer', role: 'dialog', 'aria-label': caption || 'Immagine' },
    h('div', { class: 'viewer-bar' },
      h('span', { class: 'viewer-caption' }, caption || ''),
      h('span', { class: 'viewer-hint' }, 'Tocca per ingrandire'),
      h('button', { type: 'button', class: 'viewer-close', 'aria-label': 'Chiudi', onclick: close }, '✕')),
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
