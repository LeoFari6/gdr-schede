// Piccole utility per costruire il DOM senza framework.
import { t, locale } from './i18n.js';

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  const late = {};
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value' || k === 'checked' || k === 'selected') late[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  Object.assign(el, late);
  return el;
}

export const icon = (name) => {
  const paths = {
    plus: 'M12 5v14M5 12h14',
    back: 'M15 18l-6-6 6-6',
    dice: 'M4 4h16v16H4zM8.5 8.5h.01M15.5 15.5h.01M15.5 8.5h.01M8.5 15.5h.01M12 12h.01',
    edit: 'M4 20h4L19 9l-4-4L4 16v4z',
    copy: 'M9 9h11v11H9zM5 15V4h11',
    trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
    download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
    upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    up: 'M6 15l6-6 6 6',
    down: 'M6 9l6 6 6-6',
    x: 'M6 6l12 12M18 6L6 18',
    gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19 12l2-1-1-3-2 .2-1.3-1.3L17 5l-3-1-1 2h-2L10 4 7 5l.3 2-1.3 1.3L4 8 3 11l2 1v0l-2 1 1 3 2-.2 1.3 1.3L7 19l3 1 1-2h2l1 2 3-1-.3-2 1.3-1.3 2 .3 1-3z',
    print: 'M7 9V4h10v5M7 17H5v-6h14v6h-2M7 14h10v6H7z',
    sun: 'M12 17a5 5 0 100-10 5 5 0 000 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
    moon: 'M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z',
    check: 'M5 12l5 5 9-10',
    palette: 'M12 3a9 9 0 100 18c1 0 1.6-.8 1.6-1.6 0-1-.9-1.3-.9-2.2 0-.8.7-1.3 1.5-1.3H17a4 4 0 004-4c0-4.9-4-8.9-9-8.9zM7.5 12h.01M9 7.5h.01M14.5 7.5h.01',
    help: 'M12 21a9 9 0 100-18 9 9 0 000 18zM9.5 9a2.5 2.5 0 114 2c-.9.6-1.5 1.1-1.5 2.2M12 17h.01',
    note: 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h5',
    weight: 'M12 7a2 2 0 100-4 2 2 0 000 4zM6 8h12l3 12H3z',
    book: 'M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3zM5 17a3 3 0 013-3h11',
    crop: 'M6 2v14a2 2 0 002 2h14M2 6h14a2 2 0 012 2v14',
    image: 'M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15 9h.01',
    pin: 'M9 3h6l-1 6 4 3v2H6v-2l4-3zM12 14v7',
    play: 'M8 5.5v13l10.5-6.5z',
    pause: 'M9 5v14M15 5v14',
    cut: 'M6 9a3 3 0 100-6 3 3 0 000 6zM6 21a3 3 0 100-6 3 3 0 000 6zM20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12',
    music: 'M9 18V5l11-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zM20 16a3 3 0 11-6 0 3 3 0 016 0z',
    alert: 'M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 001.7 3h16.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', paths[name] || '');
  svg.append(p);
  return svg;
};

export function btn(label, onClick, { cls = '', iconName, title, type = 'button' } = {}) {
  return h('button', { type, class: `btn ${cls}`.trim(), onclick: onClick, title: title || (iconName && !label ? undefined : null), 'aria-label': title || null },
    iconName ? icon(iconName) : null, label ? h('span', {}, label) : null);
}

export function toast(message, kind = 'info', ms = 2600) {
  let host = document.getElementById('toasts');
  if (!host) host = h('div', { id: 'toasts', 'aria-live': 'polite' });
  // se c'è una finestra aperta, i messaggi vanno sopra di lei (altrimenti restano dietro, oscurati)
  const parent = [...document.querySelectorAll('dialog[open]')].at(-1) || document.body;
  if (host.parentNode !== parent) parent.appendChild(host);
  const el = h('div', { class: `toast toast-${kind}` }, message);
  host.append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
}

/** Finestra modale. Restituisce una Promise con il valore scelto (o null). */
export function modal({ title, body, actions = [{ label: 'OK', value: true, cls: 'primary' }], wide = false }) {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: `modal${wide ? ' wide' : ''}` });
    const close = (v) => { dlg.close(); dlg.remove(); resolve(v); };
    dlg.append(
      h('form', { method: 'dialog', onsubmit: (e) => { e.preventDefault(); const def = actions.find((a) => a.cls?.includes('primary')); close(def ? (typeof def.value === 'function' ? def.value() : def.value) : true); } },
        title ? h('h2', {}, title) : null,
        h('div', { class: 'modal-body' }, body),
        h('div', { class: 'modal-actions' },
          actions.map((a) => h('button', {
            type: a.cls?.includes('primary') ? 'submit' : 'button',
            class: `btn ${a.cls || ''}`,
            onclick: a.cls?.includes('primary') ? null : () => close(typeof a.value === 'function' ? a.value() : a.value),
          }, a.label)))));
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(null); });
    document.body.append(dlg);
    dlg.showModal();
    dlg.querySelector('input, select, textarea')?.focus();
  });
}

export const confirmDialog = (title, text, okLabel = t('Conferma'), danger = false) =>
  modal({ title, body: h('p', {}, text), actions: [
    { label: t('Annulla'), value: false },
    { label: okLabel, value: true, cls: danger ? 'primary danger' : 'primary' },
  ] });

export function promptDialog(title, label, initial = '') {
  const input = h('input', { type: 'text', value: initial, class: 'input' });
  return modal({ title, body: h('label', { class: 'stack' }, h('span', { class: 'lbl' }, label), input), actions: [
    { label: t('Annulla'), value: null },
    { label: 'OK', value: () => input.value.trim() || null, cls: 'primary' },
  ] });
}

export function download(filename, data, type = 'application/json') {
  const blob = new Blob([typeof data === 'string' ? data : JSON.stringify(data, null, 2)], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pickFile(accept = '.json,application/json') {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, style: { display: 'none' } });
    input.addEventListener('change', () => { resolve(input.files[0] || null); input.remove(); });
    document.body.append(input);
    input.click();
  });
}

export const readText = (file) => file.text();

export function readImageResized(file, maxSize = 320) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(t('Immagine non valida'))); };
    img.src = url;
  });
}

/** Menu a tendina semplice. items: [{label, icon, onClick, danger}] */
export function menuButton(items, { title = t('Altro'), iconName = 'more', label = '' } = {}) {
  const wrap = h('div', { class: 'menu' });
  const list = h('div', { class: 'menu-list', role: 'menu' },
    items.filter(Boolean).map((it) => h('button', {
      type: 'button', role: 'menuitem', class: `menu-item${it.danger ? ' danger' : ''}`,
      onclick: () => { wrap.classList.remove('open'); it.onClick(); },
    }, it.icon ? icon(it.icon) : null, it.label)));
  const trigger = btn(label, (e) => {
    e.stopPropagation();
    document.querySelectorAll('.menu.open').forEach((m) => m !== wrap && m.classList.remove('open'));
    wrap.classList.toggle('open');
  }, { iconName, title, cls: 'ghost' });
  wrap.append(trigger, list);
  return wrap;
}
document.addEventListener('click', () => document.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open')));

export function slugify(text) {
  return String(text || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    .replace(/^(\d)/, '_$1')
    .slice(0, 32) || 'campo';
}

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID().slice(0, 13);
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function relativeTime(ts) {
  if (!ts) return '';
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return t('adesso');
  if (diff < 3600) return t('{n} min fa', { n: Math.floor(diff / 60) });
  if (diff < 86400) return t('{n} h fa', { n: Math.floor(diff / 3600) });
  if (diff < 86400 * 7) return t('{n} g fa', { n: Math.floor(diff / 86400) });
  return new Date(ts).toLocaleDateString(locale);
}

/**
 * Tieni premuto per ripetere: al primo tocco esegue step() una volta, poi
 * (dopo una breve pausa) lo ripete sempre più in fretta finché il dito resta
 * giù. step() può restituire false per fermarsi (es. al minimo o al massimo).
 * Da tastiera (Invio / Spazio) resta un singolo passo.
 */
export function holdRepeat(button, step) {
  let timer = null;
  let started = 0;
  let fromPointer = false;
  const stop = () => {
    clearTimeout(timer);
    timer = null;
    document.removeEventListener('pointerup', stop);
    document.removeEventListener('pointercancel', stop);
  };
  const tick = () => {
    if (step() === false) return stop();
    const held = Date.now() - started;
    timer = setTimeout(tick, held > 2200 ? 35 : held > 1200 ? 70 : 130);
  };
  button.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || button.disabled) return;
    e.preventDefault(); // niente selezione del testo o menu della pressione lunga
    fromPointer = true;
    stop();
    started = Date.now();
    if (step() === false) return;
    timer = setTimeout(tick, 380);
    // il pulsante può essere ridisegnato mentre lo tieni premuto: ascolta il rilascio ovunque
    document.addEventListener('pointerup', stop);
    document.addEventListener('pointercancel', stop);
  });
  button.addEventListener('click', () => {
    if (fromPointer) { fromPointer = false; return; } // già gestito dal tocco
    step();
  });
  button.addEventListener('contextmenu', (e) => e.preventDefault());
  return button;
}
