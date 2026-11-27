// Finestra per ritagliare un'immagine quadrata (es. il ritratto): si trascina per
// spostarla e si usa il cursore (o la rotellina, o due dita) per lo zoom.
import { h, modal } from './ui.js';
import { t } from './i18n.js';

const OUT = 480; // lato dell'immagine salvata, in pixel

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error(t('Immagine non valida')));
  img.src = src;
});

/**
 * Apre il ritaglio. `src` è un indirizzo d'immagine (anche data: o blob:).
 * Restituisce l'immagine ritagliata come data URL JPEG, oppure null se si annulla.
 */
export async function cropImage(src) {
  const img = await loadImage(src);
  const view = h('div', { class: 'crop-view' });
  const pic = h('img', { src, alt: '', draggable: false });
  view.append(pic, h('div', { class: 'crop-ring', 'aria-hidden': 'true' }));

  // stato: zoom (1 = l'immagine copre tutto il riquadro) e centro dell'inquadratura,
  // in frazioni dell'immagine (0–1)
  let zoom = 1;
  let cx = 0.5;
  let cy = 0.5;
  const size = () => view.clientWidth || 288;
  const cover = () => Math.max(size() / img.width, size() / img.height); // pixel schermo per pixel immagine, a zoom 1
  const clamp = () => {
    const s = cover() * zoom;
    const halfW = size() / 2 / (img.width * s);
    const halfH = size() / 2 / (img.height * s);
    cx = Math.min(1 - halfW, Math.max(halfW, cx));
    cy = Math.min(1 - halfH, Math.max(halfH, cy));
  };
  const draw = () => {
    clamp();
    const s = cover() * zoom;
    pic.style.width = `${img.width * s}px`;
    pic.style.height = `${img.height * s}px`;
    pic.style.transform = `translate(${size() / 2 - cx * img.width * s}px, ${size() / 2 - cy * img.height * s}px)`;
    slider.value = String(zoom);
  };

  const slider = h('input', { type: 'range', min: '1', max: '4', step: '0.01', value: '1', class: 'crop-zoom', 'aria-label': t('Zoom'),
    oninput: (e) => { zoom = Number(e.target.value); draw(); } });

  // trascinamento e zoom con due dita
  const pts = new Map();
  let last = null;
  view.addEventListener('pointerdown', (e) => {
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    last = null;
    try { view.setPointerCapture(e.pointerId); } catch { /* il trascinamento funziona anche senza */ }
  });
  view.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    const prev = pts.get(e.pointerId);
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 1) {
      const s = cover() * zoom;
      cx -= (e.clientX - prev[0]) / (img.width * s);
      cy -= (e.clientY - prev[1]) / (img.height * s);
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (last) zoom = Math.min(4, Math.max(1, zoom * (dist / last)));
      last = dist;
    }
    draw();
  });
  const up = (e) => { pts.delete(e.pointerId); last = null; };
  view.addEventListener('pointerup', up);
  view.addEventListener('pointercancel', up);
  view.addEventListener('wheel', (e) => { e.preventDefault(); zoom = Math.min(4, Math.max(1, zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))); draw(); }, { passive: false });

  requestAnimationFrame(draw);
  const ok = await modal({
    title: t('Ritaglia l\'immagine'),
    body: h('div', { class: 'crop' },
      view,
      h('div', { class: 'crop-tools' }, h('span', { class: 'crop-minus', 'aria-hidden': 'true' }, '−'), slider, h('span', { class: 'crop-plus', 'aria-hidden': 'true' }, '+')),
      h('p', { class: 'muted small' }, t('Trascina per spostarla, usa il cursore (o due dita) per lo zoom. Il cerchio mostra come si vedrà nel nome e nella home.'))),
    actions: [{ label: t('Annulla'), value: false }, { label: t('Usa'), value: true, cls: 'primary' }],
  });
  if (!ok) return null;

  // ritaglio: la parte dell'immagine visibile nel riquadro
  const s = cover() * zoom;
  const side = size() / s; // lato del ritaglio in pixel dell'immagine
  const sx = cx * img.width - side / 2;
  const sy = cy * img.height - side / 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.min(OUT, Math.round(side)) || OUT;
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(img, sx, sy, side, side, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.88);
}
