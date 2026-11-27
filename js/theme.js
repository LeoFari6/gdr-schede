import { h, icon, modal } from './ui.js';
import { store } from './store.js';
import { t as tr } from './i18n.js';

export function applyTheme() {
  const t = store.setting('theme') || 'auto';
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0e0e10' : '#f7f7f8');
}

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

/** Passa da chiaro a scuro e viceversa (e lo ricorda). */
export function toggleTheme() {
  store.setSetting('theme', document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  applyTheme();
}

export function themeToggle() {
  const b = h('button', { type: 'button', class: 'btn ghost sq', title: tr('Tema chiaro/scuro'), 'aria-label': tr('Cambia tema') });
  const draw = () => b.replaceChildren(icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon'));
  b.addEventListener('click', () => { toggleTheme(); draw(); });
  draw();
  return b;
}

// ---- colore d'accento per personaggio ---------------------------------------
export const ACCENTS = [
  ['Rosso', null], ['Blu', '#2f6fb5'], ['Verde', '#2f8a57'], ['Viola', '#7b4bb7'],
  ['Oro', '#b8860b'], ['Arancio', '#d0661f'], ['Turchese', '#168a8a'], ['Rosa', '#c2477e'],
  ['Ardesia', '#5b6b82'], ['Bronzo', '#8a5a2b'],
];

const HEX_RE = /^#[0-9a-f]{6}$/i;

function inkFor(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.35 ? '#15110f' : '#ffffff';
}

/** Applica (o toglie, con color nullo) un accento personalizzato a un elemento. */
export function applyAccent(el, color) {
  if (color && HEX_RE.test(color)) {
    el.classList.add('custom-accent');
    el.style.setProperty('--char-accent', color);
    el.style.setProperty('--char-accent-ink', inkFor(color));
  } else {
    el.classList.remove('custom-accent');
    el.style.removeProperty('--char-accent');
    el.style.removeProperty('--char-accent-ink');
  }
}

/** Finestra di scelta del colore: applica in anteprima e restituisce il colore scelto (null = predefinito, undefined = annullato). */
export async function pickAccent(current, preview) {
  let chosen = current || null;
  const swatches = h('div', { class: 'swatches' });
  const custom = h('input', { type: 'color', class: 'swatch-custom', value: chosen || '#9e2b25', 'aria-label': tr('Colore personalizzato'),
    oninput: (e) => select(e.target.value) });
  const select = (c) => {
    chosen = c;
    preview(c);
    [...swatches.children].forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.color || null) === c)));
  };
  for (const [name, color] of ACCENTS) {
    swatches.append(h('button', {
      type: 'button', class: `swatch${color ? '' : ' swatch-default'}`, title: tr(name), 'aria-label': tr(name),
      dataset: color ? { color } : {}, style: color ? { background: color } : null,
      onclick: () => select(color),
    }, icon('check')));
  }
  select(chosen);
  const ok = await modal({
    title: tr('Colore della scheda'),
    body: h('div', { class: 'stack gap' },
      h('p', { class: 'muted small' }, tr('Il colore secondario (titoli, schede, competenze, caselle) vale solo per questo personaggio.')),
      swatches,
      h('label', { class: 'row gap' }, custom, h('span', {}, tr('Personalizzato…')))),
    actions: [{ label: tr('Annulla'), value: false }, { label: tr('Usa questo colore'), value: true, cls: 'primary' }],
  });
  if (!ok) { preview(current || null); return undefined; }
  return chosen;
}
