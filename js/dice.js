// Tiro di dadi: si possono sommare dadi diversi (es. 2d20 + 1d6, fino a MAX_DICE dadi in tutto)
// e un modificatore; i dadi rotolano con un'animazione e poi si fermano sul risultato, con il totale.
// Toccando i dadi tirati li selezioni e li puoi ritirare.
import { h, modal, holdRepeat } from './ui.js';
import { t } from './i18n.js';

export const DICE = [4, 6, 8, 10, 12, 20, 100];
export const MAX_DICE = 20;
const KEY = 'gdr-schede/dadi';

/** Numero casuale da 1 a `sides` (con crypto quando c'è, senza sbilanciamenti). */
export function rollDie(sides) {
  if (globalThis.crypto?.getRandomValues) {
    const buf = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / sides) * sides; // scarta la coda che sbilancerebbe
    do crypto.getRandomValues(buf); while (buf[0] >= limit);
    return (buf[0] % sides) + 1;
  }
  return Math.floor(Math.random() * sides) + 1;
}

/** Tiro completo: { rolls: [..], total }. */
export function roll(sides, count = 1, mod = 0) {
  const n = Math.max(1, Math.min(MAX_DICE, Math.floor(count) || 1));
  const rolls = Array.from({ length: n }, () => rollDie(sides));
  return { rolls, total: rolls.reduce((a, b) => a + b, 0) + (Math.floor(mod) || 0) };
}

/** Riordina un insieme di gruppi [{ sides, count }]: unisce i doppioni, toglie i vuoti, max MAX_DICE dadi in tutto. */
export function normalizePool(pool) {
  const by = new Map();
  for (const g of pool || []) {
    const sides = Number(g?.sides);
    if (!DICE.includes(sides)) continue;
    by.set(sides, (by.get(sides) || 0) + Math.max(0, Math.floor(Number(g.count) || 0)));
  }
  let left = MAX_DICE;
  return DICE.filter((d) => by.get(d)).sort((a, b) => b - a).map((sides) => {
    const count = Math.min(left, by.get(sides));
    left -= count;
    return { sides, count };
  }).filter((g) => g.count > 0);
}

/** Formula di un insieme di gruppi, es. "2d20 + 1d6 + 3". */
export function poolFormula(pool, mod = 0) {
  const parts = normalizePool(pool).map((g) => `${g.count}d${g.sides}`);
  return `${parts.join(' + ') || '—'}${mod ? ` ${mod > 0 ? '+' : '−'} ${Math.abs(mod)}` : ''}`;
}

/** Tira un insieme di gruppi: { dice: [{ sides, v }], total }. */
export function rollPool(pool, mod = 0) {
  const dice = normalizePool(pool).flatMap((g) => Array.from({ length: g.count }, () => ({ sides: g.sides, v: rollDie(g.sides) })));
  return { dice, total: dice.reduce((a, d) => a + d.v, 0) + (Math.floor(mod) || 0) };
}

const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* facoltativo */ } };
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '');

// ---- disegno dei dadi (SVG) ------------------------------------------------------
// Ogni dado: contorno, faccia frontale (più chiara, dove sta il numero), linee delle altre facce
// e la posizione del numero (y in % del lato). Stile pulito: poche linee sottili, luce dall'alto.
const SHAPES = {
  4: { outline: 'M50 7 Q53 7 55 10 L93 84 Q95 89 89 89 L11 89 Q5 89 7 84 L45 10 Q47 7 50 7 Z', face: '', facets: '', y: 64 },
  6: { outline: 'M22 8 H78 Q92 8 92 22 V78 Q92 92 78 92 H22 Q8 92 8 78 V22 Q8 8 22 8 Z', face: 'M26 22 H74 Q78 22 78 26 V74 Q78 78 74 78 H26 Q22 78 22 74 V26 Q22 22 26 22 Z', facets: '', y: 50 },
  8: { outline: 'M50 4 L94 50 L50 96 L6 50 Z', face: 'M50 4 L94 50 L6 50 Z', facets: '', y: 37 },
  10: { outline: 'M50 4 L95 44 L50 96 L5 44 Z', face: 'M50 4 L69 58 L50 70 L31 58 Z', facets: 'M5 44 L31 58 M95 44 L69 58 M50 70 L50 96', y: 49 },
  12: { outline: 'M50 4 L95 37 L78 94 L22 94 L5 37 Z', face: 'M50 23 L73 40 L64 70 L36 70 L27 40 Z', facets: 'M50 4 L50 23 M95 37 L73 40 M78 94 L64 70 M22 94 L36 70 M5 37 L27 40', y: 52 },
  20: { outline: 'M50 3 L92 27 L92 73 L50 97 L8 73 L8 27 Z', face: 'M50 23 L76 67 L24 67 Z', facets: 'M50 3 L50 23 M92 27 L50 23 M8 27 L50 23 M92 27 L76 67 M8 27 L24 67 M92 73 L76 67 M8 73 L24 67 M50 97 L76 67 M50 97 L24 67', y: 54 },
  100: { outline: 'M50 5 A45 45 0 1 1 49.9 5 Z', face: 'M50 19 A31 31 0 1 1 49.9 19 Z', facets: '', y: 50 },
};
const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}) => { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); return el; };

/** Disegno di un dado tirato: corpo colorato, faccia frontale illuminata, facce laterali appena accennate. */
function dieArt(sides) {
  const sh = SHAPES[sides];
  const root = svg('svg', { viewBox: '0 0 100 100', class: 'die-art', 'aria-hidden': 'true' });
  const id = `dg${sides}-${Math.random().toString(36).slice(2, 7)}`;
  const defs = svg('defs');
  const grad = svg('linearGradient', { id, x1: '0', y1: '0', x2: '0', y2: '1' });
  grad.append(svg('stop', { offset: '0', 'stop-color': '#fff', 'stop-opacity': '.22' }), svg('stop', { offset: '1', 'stop-color': '#000', 'stop-opacity': '.22' }));
  defs.append(grad);
  root.append(defs, svg('path', { d: sh.outline, class: 'die-body' }), svg('path', { d: sh.outline, fill: `url(#${id})` }));
  if (sh.face) root.append(svg('path', { d: sh.face, class: 'die-front' }));
  if (sh.facets) root.append(svg('path', { d: sh.facets, class: 'die-facets' }));
  root.append(svg('path', { d: sh.outline, class: 'die-edge' }));
  return root;
}

/** Apre la finestra dei dadi. */
export function openDiceRoller() {
  const saved = load();
  const state = {
    pool: normalizePool(saved.pool || (saved.sides ? [{ sides: saved.sides, count: saved.count || 1 }] : [{ sides: 20, count: 1 }])),
    mod: Number(saved.mod) || 0,
  };
  if (!state.pool.length) state.pool = [{ sides: 20, count: 1 }];
  const history = [];
  const totalDice = () => state.pool.reduce((a, g) => a + g.count, 0);
  const countOf = (sides) => state.pool.find((g) => g.sides === sides)?.count || 0;
  const setGroup = (sides, count) => {
    const others = totalDice() - countOf(sides);
    const n = Math.max(0, Math.min(MAX_DICE - others, count));
    state.pool = normalizePool([...state.pool.filter((g) => g.sides !== sides), { sides, count: n }]);
    draw();
  };
  // un passo di +1/−1 su un tipo di dado; tenendo premuto si ripete sempre più in fretta (false = fermo)
  const step = (sides, d) => () => { const before = countOf(sides); setGroup(sides, before + d); return countOf(sides) !== before; };

  // tocca un dado per aggiungerlo al tiro (il numero sul pulsante dice quanti ce ne sono)
  const chips = h('div', { class: 'dice-types', role: 'group', 'aria-label': t('Aggiungi un dado') });
  // gruppi del tiro: "− 2d20 +" per ogni tipo
  const groups = h('div', { class: 'dice-groups' });
  const full = h('small', { class: 'dice-full muted', hidden: true }, t('Massimo {n} dadi', { n: MAX_DICE }));
  const modIn = h('input', { class: 'input num dice-mod', type: 'number', inputmode: 'numeric', value: state.mod || '', placeholder: '0', 'aria-label': t('Modificatore'),
    oninput: (e) => { state.mod = Math.max(-99, Math.min(99, Math.floor(Number(e.target.value)) || 0)); save(state); },
    onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); doRoll(); } } }); // Invio tira invece di chiudere

  const draw = () => {
    const tot = totalDice();
    chips.replaceChildren(...DICE.map((d) => {
      const n = countOf(d);
      return holdRepeat(h('button', {
        type: 'button', class: `dice-chip hold${n ? ' on' : ''}`, disabled: tot >= MAX_DICE, title: t('Aggiungi un d{d}', { d }), 'aria-label': t('Aggiungi un d{d}', { d }),
      }, `d${d}`, n ? h('b', { class: 'dice-badge' }, String(n)) : null), step(d, 1));
    }));
    groups.replaceChildren(...state.pool.map((g) => h('div', { class: 'dice-stepper' },
      holdRepeat(h('button', { type: 'button', class: 'hold', 'aria-label': t('Un d{d} in meno', { d: g.sides }) }, '−'), step(g.sides, -1)),
      h('b', { class: 'dice-count' }, `${g.count}d${g.sides}`),
      holdRepeat(h('button', { type: 'button', class: 'hold', 'aria-label': t('Un d{d} in più', { d: g.sides }), disabled: tot >= MAX_DICE }, '+'), step(g.sides, 1)))));
    if (!state.pool.length) groups.append(h('span', { class: 'muted small dice-empty' }, t('Tocca un dado per aggiungerlo')));
    full.hidden = tot < MAX_DICE;
    rollBtn.disabled = !tot;
    save(state);
  };

  // area dei dadi, risultato, ritiro dei dadi selezionati
  const tray = h('div', { class: 'dice-tray', 'aria-live': 'polite' }, h('p', { class: 'muted small dice-hint' }, t('Tocca i dadi da aggiungere al tiro, poi premi Tira.')));
  const totalEl = h('div', { class: 'dice-total', hidden: true });
  const reroll = h('button', { type: 'button', class: 'btn small dice-reroll', hidden: true, onclick: () => doReroll() });
  const pickHint = h('p', { class: 'muted small dice-pick-hint', hidden: true }, t('Tocca uno o più dadi per selezionarli e ritirarli.'));
  const histEl = h('ul', { class: 'dice-history' });
  const rollBtn = h('button', { type: 'button', class: 'btn primary dice-roll', onclick: () => doRoll() }, t('Tira'));

  let busy = false;
  let cur = null; // tiro attuale: { pool, mod, dice: [{ el, face, sides, v, sel, rerolled }] }

  const updateReroll = () => {
    const n = cur ? cur.dice.filter((d) => d.sel).length : 0;
    reroll.hidden = !n;
    reroll.textContent = n === 1 ? t('Ritira il dado selezionato') : t('Ritira {n} dadi selezionati', { n });
  };
  const markDie = (d) => {
    d.face.textContent = String(d.v);
    d.el.classList.toggle('crit', d.sides === 20 && d.v === 20);
    d.el.classList.toggle('fumble', d.sides === 20 && d.v === 1);
    d.el.classList.toggle('rerolled', !!d.rerolled);
  };
  const showTotal = (note) => {
    const total = cur.dice.reduce((a, d) => a + d.v, 0) + cur.mod;
    // dettaglio per gruppo: "d20: 12 + 5 · d6: 3 · +3"
    const kinds = [...new Set(cur.dice.map((d) => d.sides))];
    const parts = kinds.map((s) => { const v = cur.dice.filter((d) => d.sides === s).map((d) => d.v); return kinds.length > 1 ? `d${s}: ${v.join(' + ')}` : v.join(' + '); });
    if (cur.mod) parts.push(`${cur.mod > 0 ? '+' : '−'}${Math.abs(cur.mod)}`);
    const detail = cur.dice.length > 1 || cur.mod ? parts.join(kinds.length > 1 ? ' · ' : ' ') : '';
    const name = poolFormula(cur.pool, cur.mod);
    totalEl.replaceChildren(h('small', {}, note ? `${name} · ${note}` : name), h('b', {}, String(total)), detail ? h('span', {}, detail) : null);
    totalEl.hidden = false;
    totalEl.classList.remove('pop'); void totalEl.offsetWidth; totalEl.classList.add('pop'); // riparte l'animazione
    history.unshift(`${name} = ${total}${note ? ` (${note})` : ''}`);
    histEl.replaceChildren(...history.slice(1, 5).map((x) => h('li', {}, x)));
  };
  // fa rotolare i dadi indicati e li ferma uno dopo l'altro sul valore già deciso
  const animate = (list, done) => {
    if (reduced()) { list.forEach((d) => markDie(d)); done(); return; }
    list.forEach((d, i) => { d.el.classList.remove('landed'); d.el.classList.add('rolling'); d.el.style.setProperty('--i', String(i)); d.el.style.setProperty('--r', `${(Math.random() * 2 - 1) * 40}deg`); });
    const spin = setInterval(() => list.forEach((d) => { if (d.el.classList.contains('rolling')) d.face.textContent = String(rollDie(d.sides)); }), 70);
    list.forEach((d, i) => setTimeout(() => {
      d.el.classList.remove('rolling');
      d.el.classList.add('landed');
      markDie(d);
      if (i === list.length - 1) { clearInterval(spin); done(); }
    }, 650 + i * 80));
  };

  const doRoll = () => {
    if (busy || !totalDice()) return;
    busy = true;
    const res = rollPool(state.pool, state.mod);
    totalEl.hidden = true;
    cur = { pool: structuredClone(state.pool), mod: state.mod, dice: [] };
    cur.dice = res.dice.map(({ sides, v }) => {
      const face = h('span', { class: 'die-face', style: { top: `${SHAPES[sides].y}%` } }, String(rollDie(sides)));
      const d = { sides, v, sel: false, rerolled: false, face };
      d.el = h('button', { type: 'button', class: `die die-d${sides}`, 'aria-pressed': 'false', title: t('Seleziona per ritirare'),
        onclick: () => { if (busy) return; d.sel = !d.sel; d.el.classList.toggle('sel', d.sel); d.el.setAttribute('aria-pressed', String(d.sel)); updateReroll(); } },
      dieArt(sides), face);
      return d;
    });
    tray.replaceChildren(...cur.dice.map((d) => d.el));
    updateReroll();
    animate(cur.dice, () => { showTotal(); pickHint.hidden = false; busy = false; });
  };

  const doReroll = () => {
    if (busy || !cur) return;
    const list = cur.dice.filter((d) => d.sel);
    if (!list.length) return;
    busy = true;
    list.forEach((d) => { d.v = rollDie(d.sides); d.rerolled = true; d.sel = false; d.el.classList.remove('sel'); d.el.setAttribute('aria-pressed', 'false'); });
    updateReroll();
    animate(list, () => { showTotal(list.length === 1 ? t('1 dado ritirato') : t('{n} dadi ritirati', { n: list.length })); busy = false; });
  };

  draw();
  return modal({
    title: t('Tira i dadi'),
    wide: true,
    body: h('div', { class: 'dice' },
      chips,
      // i gruppi del tiro, poi modificatore e Tira
      h('div', { class: 'dice-bar' },
        groups,
        h('div', { class: 'dice-actions' },
          h('label', { class: 'dice-modbox', title: t('Modificatore') }, h('span', {}, t('mod')), modIn),
          rollBtn)),
      full,
      tray, pickHint,
      h('div', { class: 'dice-result' }, totalEl, reroll),
      histEl),
    actions: [{ label: t('Chiudi'), value: true }],
  });
}
