// Disegna una scheda a partire da un modello e dai valori di un personaggio.
// Usato sia dalla vista "scheda" sia dall'anteprima dell'editor di modelli.
import { h, icon, toast, pickFile, readImageResized, modal, confirmDialog, holdRepeat } from './ui.js';
import { Engine, allFields, defaultValue, weightEnabled, normalizeFeature, normalizeCounter, counterMax, RECHARGE, MAX_USES } from './engine.js';
import { toNum, formatValue, interpolate } from './formula.js';
import { richText, autoGrow, FORMAT_HINT, plainText } from './richtext.js';
import { loadSpells, searchSpells } from './spells.js';
import { addImageFromFile, setImageSize } from './images.js';
import { openSpellList } from './views/spell-list.js';

// options.weight: mostra campi e colonne marcati "weight" (peso/ingombro).
// options.menuFields: mostra nella griglia anche le caselle con "menu" (anteprima editor).
// options.print: versione da stampare (tutte le tab in fila, tutto aperto, niente vuoti).
export function renderSheet({ system, values, onChange, options = { weight: true }, initialTab, onTab }) {
  let engine = null;
  const getEngine = () => (engine ||= new Engine(system, values));
  const updaters = [];
  const set = (key, v) => {
    if (v === undefined) delete values[key]; else values[key] = v;
    engine = null;
    onChange?.(key, v);
    refresh();
  };
  const refresh = () => {
    engine = null;
    for (const u of updaters) u();
  };

  // ---- costruzione dei campi --------------------------------------------
  const showWeight = weightEnabled(options);
  const ctx = { system, getEngine, set, values, updaters, showWeight, menuFields: !!options.menuFields, print: !!options.print };

  const tabs = [];
  for (const s of system.sections || []) {
    const name = s.tab || 'Scheda';
    let tab = tabs.find((t) => t.name === name);
    if (!tab) tabs.push((tab = { name, sections: [] }));
    tab.sections.push(s);
  }

  const root = h('div', { class: `sheet${system.theme === 'fantasy' ? ' fantasy' : ''}` });
  const pages = tabs.map((t) => h('div', { class: 'sheet-page', dataset: { tab: t.name } },
    ctx.print && tabs.length > 1 ? h('h2', { class: 'print-tab' }, t.name) : null,
    t.sections.map((s) => renderSection(s, ctx))));

  if (tabs.length > 1 && !ctx.print) {
    const bar = h('nav', { class: 'tabs', role: 'tablist' });
    const select = (i) => {
      pages.forEach((p, j) => p.hidden = i !== j);
      [...bar.children].forEach((b, j) => b.setAttribute('aria-selected', String(i === j)));
      // la tab scelta resta sempre visibile nella barra (su telefono la barra scorre di lato)
      const btn = bar.children[i];
      if (btn) bar.scrollTo({ left: btn.offsetLeft - (bar.clientWidth - btn.offsetWidth) / 2, behavior: 'smooth' });
      onTab?.(tabs[i].name);
    };
    tabs.forEach((t, i) => bar.append(h('button', { type: 'button', role: 'tab', class: 'tab', onclick: () => select(i) }, t.name)));
    root.append(bar);
    select(Math.max(0, tabs.findIndex((t) => t.name === initialTab)));
  }
  root.append(...pages);
  refresh();
  return { el: root, refresh };
}

function renderSection(s, ctx) {
  const cols = Math.min(9, Math.max(1, Number(s.columns) || 3));
  const grid = h('div', { class: `grid${s.tiles ? ' tiles' : ''}`, dataset: { cols } });
  for (const f of s.fields || []) {
    if (f.weight && !ctx.showWeight) continue;
    if (f.menu && f.type === 'checkbox' && !ctx.menuFields) continue; // si attiva dal menu della scheda
    if (f.hidden) continue; // campo di appoggio per le formule, non si mostra
    try {
      grid.append(renderField(f, ctx, cols, s.tiles, s.customizable ? s.id : null));
    } catch (e) {
      grid.append(h('div', { class: 'f f-error' }, `${f.label || f.key}: ${e.message}`));
    }
  }
  const sec = h('section', { class: 'sec' });
  const header = h('button', { type: 'button', class: 'sec-head', 'aria-expanded': 'true', onclick: () => {
    const collapsed = sec.classList.toggle('collapsed');
    header.setAttribute('aria-expanded', String(!collapsed));
  } }, h('h2', {}, s.title || ''), icon('down'));
  if (s.customizable) {
    // sezione personalizzabile dal giocatore (es. nomi e tagli delle monete)
    sec.append(h('div', { class: 'sec-bar' }, header,
      h('button', { type: 'button', class: 'btn ghost sq small sec-gear', title: 'Personalizza', 'aria-label': `Personalizza ${s.title || 'sezione'}`, onclick: () => customizeSection(s, ctx) }, icon('gear'))), grid);
    ctx.updaters.push(() => {
      const cfg = ctx.values._sezioni?.[s.id] || {};
      const shown = (s.fields || []).filter((f) => !f.hidden && !cfg[f.key]?.hidden).length;
      grid.dataset.cols = String(Math.max(1, Math.min(cols, shown)));
    });
  } else sec.append(header, grid);
  // Titoli con {formule} (es. il nome della classe) e sezioni condizionali.
  if (/\{[^{}]+\}/.test(s.title || '')) {
    const h2 = header.firstChild;
    ctx.updaters.push(() => { h2.textContent = interpolate(s.title, ctx.getEngine().resolver()).trim(); });
  }
  if (s.showIf) ctx.updaters.push(() => { sec.hidden = !ctx.getEngine().visible(s.showIf); });
  // pallini omogenei: tutti i campi a pallini della sezione usano la grandezza del più lungo
  if ((s.fields || []).some((f) => f.type === 'dots')) {
    ctx.updaters.push(() => {
      const ns = [...grid.querySelectorAll('.f-dots:not([hidden]) .dots')].map((b) => Number(b.style.getPropertyValue('--n')) || 0);
      grid.style.setProperty('--dots-n', String(Math.max(1, ...ns)));
    });
  }
  return sec;
}

const WIDE = new Set(['textarea', 'richtext', 'list', 'features']);

function renderField(f, ctx, cols, tiles = false, sid = null) {
  const span = Math.min(cols, Math.max(1, Number(f.span) || (WIDE.has(f.type) ? cols : 1)));
  const wrap = h('div', {
    class: `f f-${f.type}${span >= 2 || WIDE.has(f.type) ? ' wide' : ''}${(f.tile || tiles) && !WIDE.has(f.type) ? ' tile' : ''}`,
    style: { gridColumn: `span ${span}`, gridRow: Number(f.rowSpan) > 1 ? `span ${Math.min(6, Number(f.rowSpan))}` : null },
    dataset: { key: f.key },
  });
  const render = FIELD_RENDERERS[f.type] || FIELD_RENDERERS.text;
  render(f, ctx, wrap);
  // visibilità: condizione del modello e, nelle sezioni personalizzabili, scelta del giocatore
  const custom = () => (sid ? ctx.values._sezioni?.[sid]?.[f.key] : undefined);
  if (f.showIf || sid) ctx.updaters.push(() => { wrap.hidden = !!((f.showIf && !ctx.getEngine().visible(f.showIf)) || custom()?.hidden); });
  // etichette con {formule}, es. "Dadi vita · {@classe}", o rinominate dal giocatore
  const lbl = wrap.querySelector('.lbl');
  if (lbl && /\{[^{}]+\}/.test(f.label || '')) {
    ctx.updaters.push(() => { lbl.textContent = interpolate(f.label, ctx.getEngine().resolver()).trim(); });
  } else if (lbl && sid) {
    ctx.updaters.push(() => { lbl.textContent = custom()?.label || f.label || f.key; });
  }
  return wrap;
}

const raw = (f, ctx) => (ctx.values[f.key] === undefined ? defaultValue(f) : ctx.values[f.key]);
const label = (f, extra) => h('span', { class: 'lbl' }, f.label || f.key, extra);
const parseNum = (s) => (s === '' || s == null ? '' : Number(String(s).replace(',', '.')));

function subLine(f, ctx) {
  if (!f.sub) return null;
  const el = h('span', { class: 'sub' });
  const own = !['computed', 'skill'].includes(f.type);
  ctx.updaters.push(() => { el.textContent = interpolate(f.sub, ctx.getEngine().resolver({ self: f, own })); });
  return el;
}

function valueDisplay(getter, signed, cls = 'val', manualKey) {
  const el = h('output', { class: cls });
  return {
    el,
    update(engine) {
      const r = engine.safe(getter);
      const manual = manualKey && engine.manual(manualKey) !== undefined;
      el.classList.toggle('err', !r.ok);
      el.classList.toggle('manual', !!manual);
      el.textContent = r.ok ? formatValue(r.value, signed) : '⚠';
      el.title = !r.ok ? r.error : manual ? 'Inserito a mano: tocca per cambiarlo o tornare al calcolo' : manualKey ? 'Calcolato: tocca per inserirlo a mano' : '';
    },
  };
}

// Un valore calcolato diventa modificabile: un tocco apre una finestra dove
// scriverlo a mano (o tornare al calcolo automatico).
function makeEditable(el, ctx, { key, label: text, signed, auto }) {
  el.classList.add('editable');
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  const open = async () => {
    const autoEngine = new Engine(ctx.system, { ...ctx.values, _manuale: {} });
    const a = autoEngine.safe(() => auto(autoEngine));
    const current = ctx.getEngine().manual(key);
    const input = h('input', { class: 'input num', type: 'text', inputmode: 'decimal', value: current ?? '', placeholder: a.ok ? formatValue(a.value, signed) : '' });
    const r = await modal({
      title: text,
      body: h('div', { class: 'stack gap' },
        h('p', { class: 'muted small' }, a.ok ? `Calcolato automaticamente: ${formatValue(a.value, signed)}` : 'Il calcolo automatico non è disponibile.'),
        h('label', { class: 'stack' }, h('span', { class: 'lbl' }, 'Valore a mano'), input)),
      actions: [
        current !== undefined ? { label: 'Automatico', value: 'auto' } : null,
        { label: 'Annulla', value: null },
        { label: 'Salva', value: 'save', cls: 'primary' },
      ].filter(Boolean),
    });
    if (!r) return;
    const typed = input.value.trim().replace('−', '-');
    let v;
    if (r === 'save' && typed !== '') v = /^[+-]?\d+([.,]\d+)?$/.test(typed) ? Number(typed.replace(',', '.')) : typed;
    const m = { ...(ctx.values._manuale || {}) };
    if (v === undefined) delete m[key]; else m[key] = v;
    ctx.set('_manuale', Object.keys(m).length ? m : undefined);
  };
  el.addEventListener('click', open);
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  return el;
}

const FIELD_RENDERERS = {
  text(f, ctx, wrap) {
    const input = h('input', { type: 'text', class: 'input', value: raw(f, ctx) ?? '', placeholder: f.placeholder || '', oninput: (e) => ctx.set(f.key, e.target.value) });
    if (Array.isArray(f.suggestions) && f.suggestions.length) {
      wrap.append(h('div', { class: 'stack' }, label(f), combo(f, ctx, input)));
      return;
    }
    wrap.append(h('label', { class: 'stack' }, label(f), h('div', { class: 'row' }, input)));
  },

  textarea(f, ctx, wrap) {
    const ta = h('textarea', { class: 'input', rows: f.rows || 4, placeholder: f.placeholder || '', value: raw(f, ctx) ?? '', oninput: (e) => ctx.set(f.key, e.target.value) });
    wrap.append(h('label', { class: 'stack' }, label(f), ta));
  },

  // Testo formattato: si legge già impaginato, un clic lo apre in modifica.
  // La formattazione si scrive a mano: **grassetto**, *corsivo*, righe "- ".
  richtext(f, ctx, wrap) {
    const rt = inlineRichText({ get: () => String(raw(f, ctx) ?? ''), set: (v) => ctx.set(f.key, v), placeholder: f.placeholder, rows: f.rows, label: f.label || f.key });
    wrap.append(h('div', { class: 'stack' }, f.label ? label(f) : null, ...rt));
  },

  number(f, ctx, wrap) {
    const input = h('input', { type: 'number', inputmode: 'decimal', step: 'any', class: 'input num', value: raw(f, ctx) ?? '', oninput: (e) => ctx.set(f.key, parseNum(e.target.value)) });
    wrap.append(h('label', { class: 'stack' }, label(f), h('div', { class: 'row' }, input), subLine(f, ctx)));
  },

  stat(f, ctx, wrap) {
    const input = h('input', { type: 'number', inputmode: 'numeric', class: 'input stat-score', value: raw(f, ctx) ?? '', 'aria-label': f.label, oninput: (e) => ctx.set(f.key, parseNum(e.target.value)) });
    const mod = valueDisplay(() => ctx.getEngine().mod(f), true, 'stat-mod', `${f.key}_mod`);
    makeEditable(mod.el, ctx, { key: `${f.key}_mod`, label: `Modificatore di ${f.label}`, signed: true, auto: (e) => e.mod(f) });
    ctx.updaters.push(() => mod.update(ctx.getEngine()));
    wrap.append(h('div', { class: 'stat-box' }, h('span', { class: 'lbl' }, f.label), mod.el, input, subLine(f, ctx)));
  },

  computed(f, ctx, wrap) {
    const d = valueDisplay(() => ctx.getEngine().value(f), f.signed, 'val', f.key);
    makeEditable(d.el, ctx, { key: f.key, label: String(f.label || f.key).replace(/\{[^{}]*\}/g, '').trim(), signed: f.signed, auto: (e) => e.value(f) });
    ctx.updaters.push(() => d.update(ctx.getEngine()));
    wrap.append(h('div', { class: 'stack' }, label(f), h('div', { class: 'row computed-row' }, d.el), subLine(f, ctx)));
  },

  skill(f, ctx, wrap) {
    const levels = Math.max(1, Number(f.levels) || 1);
    const pips = h('button', { type: 'button', class: 'pips', title: 'Competenza', onclick: () => {
      const cur = toNum(raw(f, ctx));
      ctx.set(f.key, cur >= levels ? 0 : cur + 1);
    } });
    const d = valueDisplay(() => ctx.getEngine().value(f), f.signed !== false, 'skill-val', f.key);
    makeEditable(d.el, ctx, { key: f.key, label: String(f.label || f.key).replace(/\s*\([^()]*\)$/, ''), signed: f.signed !== false, auto: (e) => e.value(f) });
    const row = h('div', { class: 'skill-row' });
    ctx.updaters.push(() => {
      const cur = toNum(raw(f, ctx));
      pips.replaceChildren(...Array.from({ length: levels }, (_, i) => h('span', { class: `pip${i < cur ? ' on' : ''}` })));
      pips.setAttribute('aria-label', `Livello competenza ${cur} di ${levels}`);
      d.update(ctx.getEngine());
      row.dataset.level = String(Math.min(cur, 2));
      const n = parseFloat(String(d.el.textContent).replace('−', '-').replace(',', '.'));
      d.el.dataset.sign = n > 0 ? 'pos' : n < 0 ? 'neg' : 'zero';
    });
    // "Acrobazia (Des)" → nome + caratteristica in piccolo
    const m = /^(.*?)\s*\(([^()]+)\)$/.exec(f.label || '');
    const name = h('span', { class: 'skill-name' }, m ? m[1] : f.label, m ? h('small', { class: 'skill-stat' }, m[2]) : null);
    row.append(d.el, name, pips);
    wrap.append(row);
  },

  resource(f, ctx, wrap) {
    // emphasis: "primary" (es. punti ferita, in evidenza) o "compact" (es. dadi vita, più piccolo)
    if (f.emphasis) wrap.classList.add(`res-${f.emphasis}`);
    const input = h('input', { type: 'number', inputmode: 'numeric', class: 'input res-cur', 'aria-label': `${f.label} attuali`, oninput: (e) => ctx.set(f.key, parseNum(e.target.value)) });
    // editableMax: se il massimo è un altro campo numerico (es. "@pf_max"), si modifica direttamente qui
    const maxRef = /^@([a-zA-Z_]\w*)$/.exec(String(f.max ?? '').trim())?.[1];
    const maxField = f.editableMax && maxRef ? allFields(ctx.system).find((x) => x.key === maxRef && x.type === 'number') : null;
    const maxInput = maxField ? h('input', {
      type: 'number', inputmode: 'numeric', class: 'input res-max-input', 'aria-label': `${f.label}: massimo`, title: 'Massimo: tocca per cambiarlo',
      oninput: (e) => ctx.set(maxField.key, parseNum(e.target.value)),
    }) : null;
    const max = h('span', { class: `res-max${maxInput ? ' res-max-edit' : ''}` });
    const maxText = maxInput ? null : max;
    if (maxInput) max.append('/', maxInput);
    const bar = h('div', { class: 'bar' }, h('div', { class: 'bar-fill' }));
    // un passo di +1/−1; si ferma a 0 e al massimo (restituisce false)
    const step = (d) => {
      const eng = ctx.getEngine();
      const cur = toNum(eng.value(f));
      const mx = eng.safe(() => toNum(eng.max(f)));
      const next = Math.max(0, mx.ok ? Math.min(mx.value, cur + d) : cur + d);
      if (next === cur) return false;
      ctx.set(f.key, next);
      return true;
    };
    ctx.updaters.push(() => {
      const eng = ctx.getEngine();
      const cur = eng.safe(() => eng.value(f));
      const mx = eng.safe(() => eng.max(f));
      if (document.activeElement !== input) input.value = cur.ok ? cur.value : '';
      if (maxText) {
        maxText.textContent = mx.ok ? `/ ${formatValue(mx.value)}` : '/ ⚠';
        maxText.title = mx.ok ? '' : mx.error;
      } else if (document.activeElement !== maxInput) maxInput.value = mx.ok ? mx.value : '';
      const pct = mx.ok && mx.value > 0 && cur.ok ? Math.max(0, Math.min(100, (cur.value / mx.value) * 100)) : 0;
      bar.firstChild.style.width = `${pct}%`;
      bar.dataset.level = pct <= 25 ? 'low' : pct <= 50 ? 'mid' : 'ok';
    });
    wrap.append(h('div', { class: 'stack' }, label(f),
      h('div', { class: 'res' },
        holdRepeat(h('button', { type: 'button', class: 'btn sq hold', 'aria-label': 'Diminuisci' }, '−'), () => step(-1)),
        input, max,
        holdRepeat(h('button', { type: 'button', class: 'btn sq hold', 'aria-label': 'Aumenta' }, '+'), () => step(1)),
        h('button', { type: 'button', class: 'btn ghost sq small', title: 'Riporta al massimo', onclick: () => ctx.set(f.key, undefined) }, '↺')),
      bar));
  },

  // Tiri contro morte: successi (verdi) e fallimenti (rossi). Con 3 successi il
  // personaggio è stabile e i tiri si azzerano; con 3 fallimenti compare il teschio.
  deathsaves(f, ctx, wrap) {
    const okKey = f.success || 'morte_ok';
    const koKey = f.fail || 'morte_ko';
    const cur = (k) => Math.max(0, Math.min(3, toNum(ctx.values[k] ?? 0)));
    const reset = () => { ctx.set(okKey, undefined); ctx.set(koKey, undefined); };
    const tap = (key, i) => {
      const next = cur(key) === i + 1 ? i : i + 1;
      ctx.set(key, next || undefined);
      if (next < 3 || ctx.print) return;
      if (key === okKey) {
        box.classList.add('ds-stable');
        toast('Stabilizzato: i tiri contro morte si azzerano', 'ok', 3000);
        setTimeout(() => { box.classList.remove('ds-stable'); reset(); }, 900);
      } else deathScreen(reset);
    };
    const line = (key, cls, text) => {
      const dots = [0, 1, 2].map((i) => h('button', { type: 'button', class: `dot ds-${cls}`, 'aria-label': `${text}: ${i + 1}`, onclick: () => tap(key, i) }));
      return { key, dots, el: h('div', { class: 'ds-row' }, h('span', { class: 'ds-lbl' }, text), h('div', { class: 'dots' }, dots)) };
    };
    const ok = line(okKey, 'ok', 'Successi');
    const ko = line(koKey, 'ko', 'Fallimenti');
    const box = h('div', { class: 'ds' }, ok.el, ko.el);
    ctx.updaters.push(() => { for (const r of [ok, ko]) { const c = cur(r.key); r.dots.forEach((d, i) => d.classList.toggle('on', i < c)); } });
    wrap.append(h('div', { class: 'stack' }, label(f), box));
  },

  dots(f, ctx, wrap) {
    // il numero di pallini può dipendere da altri campi (es. slot in base a classe e livello)
    const box = h('div', { class: 'dots', role: 'group', 'aria-label': f.label });
    let buttons = [];
    let shown = -1;
    ctx.updaters.push(() => {
      const eng = ctx.getEngine();
      const r = eng.safe(() => eng.max(f));
      const max = Math.max(0, Math.min(30, r.ok ? r.value : 5));
      if (max !== shown) {
        shown = max;
        box.style.setProperty('--n', String(Math.max(1, max))); // per rimpicciolire i pallini se non c'è spazio
        buttons = Array.from({ length: max }, (_, i) => h('button', {
          type: 'button', class: 'dot', 'aria-label': `${i + 1}`,
          onclick: () => { const cur = Math.min(toNum(raw(f, ctx)), shown); ctx.set(f.key, cur === i + 1 ? i : i + 1); },
        }));
        box.replaceChildren(...buttons);
      }
      const cur = toNum(raw(f, ctx));
      buttons.forEach((b, i) => b.classList.toggle('on', i < cur));
    });
    wrap.append(h('div', { class: 'stack' }, label(f), box));
  },

  checkbox(f, ctx, wrap) {
    // Interruttore a "carta": tutta l'area è cliccabile e lo stato si vede a colpo d'occhio.
    const input = h('input', { type: 'checkbox', class: 'toggle-input', checked: !!raw(f, ctx), onchange: (e) => ctx.set(f.key, e.target.checked) });
    wrap.append(h('label', { class: 'toggle' }, input,
      h('span', { class: 'toggle-box', 'aria-hidden': 'true' }, icon('check')),
      h('span', { class: 'toggle-text' }, f.label || f.key)));
  },

  select(f, ctx, wrap) {
    const sel = h('select', { class: 'input', onchange: (e) => ctx.set(f.key, e.target.value) },
      (f.options || []).map((o) => h('option', { value: o }, o || '—')));
    sel.value = raw(f, ctx) ?? '';
    wrap.append(h('label', { class: 'stack' }, label(f), sel, subLine(f, ctx)));
  },

  image(f, ctx, wrap) {
    const box = h('div', { class: 'img-box' });
    const draw = () => {
      const src = raw(f, ctx);
      box.replaceChildren(
        src ? h('img', { src, alt: f.label || 'Immagine' }) : h('span', { class: 'img-ph' }, icon('upload'), 'Carica immagine'),
        h('div', { class: 'img-actions' },
          h('button', { type: 'button', class: 'btn small', onclick: choose }, src ? 'Cambia' : 'Scegli'),
          src ? h('button', { type: 'button', class: 'btn small ghost', onclick: () => { ctx.set(f.key, undefined); draw(); } }, 'Rimuovi') : null));
    };
    const choose = async () => {
      const file = await pickFile('image/*');
      if (!file) return;
      try { ctx.set(f.key, await readImageResized(file)); draw(); } catch (e) { toast(e.message, 'error'); }
    };
    draw();
    wrap.append(h('div', { class: 'stack' }, label(f), box));
  },

  // Privilegi: voci che si aprono e chiudono, con descrizione formattata,
  // contatore degli usi, tabella di contatori e un livello di sotto-privilegi.
  features(f, ctx, wrap) {
    // variant "journal": voci semplici (titolo + testo), le nuove in cima con la data
    // variant "notebook": schede di appunti col testo modificabile sul posto
    const journal = f.variant === 'journal';
    const notebook = f.variant === 'notebook';
    const simple = journal || notebook;
    const box = h('div', { class: `feats${journal ? ' journal' : ''}${notebook ? ' journal notebook' : ''}` });
    const stored = () => {
      const v = ctx.values[f.key];
      if (Array.isArray(v)) return v;
      // vecchie schede: il testo unico degli appunti diventa la prima scheda
      const old = f.legacyKey ? ctx.values[f.legacyKey] : '';
      return typeof old === 'string' && old.trim() ? [{ nome: 'Appunti', testo: old, aperto: true }] : [];
    };
    const items = () => stored().map((r) => {
      const n = normalizeFeature(r);
      if (ctx.print) { n.aperto = true; n.figli.forEach((c) => { c.aperto = true; }); } // in stampa si legge tutto
      return n;
    });
    const commit = (next) => { ctx.set(f.key, next); draw(); };
    // path = [i] per un privilegio, [i, j] per un sotto-privilegio
    const change = (path, fn) => {
      const next = items();
      const list = path.length === 2 ? next[path[0]].figli : next;
      fn(list[path[path.length - 1]], list, path[path.length - 1]);
      commit(next);
    };

    // valore aggiornato (la lista viene ridisegnata mentre tieni premuto + o −)
    const itemAt = (path) => (path.length === 2 ? items()[path[0]]?.figli[path[1]] : items()[path[0]]);
    const itemUses = (it, path) => (it.usi ? usesControl({
      max: it.usi, used: it.usati, recharge: it.ricarica, label: it.nome,
      getUsed: () => itemAt(path)?.usati ?? 0,
      onChange: (used) => change(path, (x) => { x.usati = used; }),
    }) : null);

    const counters = (it, path) => {
      if (!it.contatori.length) return null;
      const eng = ctx.getEngine();
      return h('div', { class: 'counters' }, it.contatori.map((c, k) => {
        const mx = counterMax(eng, c);
        return h('div', { class: 'counter-row' },
          h('div', { class: 'counter-name' }, h('strong', {}, c.nome || 'Contatore'),
            c.ricarica ? h('small', {}, c.ricarica.toLowerCase()) : null),
          mx.ok
            ? usesControl({ max: mx.value, used: Math.min(c.usati, mx.value), label: c.nome,
              getUsed: () => Math.min(itemAt(path)?.contatori[k]?.usati ?? 0, mx.value),
              onChange: (used) => change(path, (x) => { x.contatori[k].usati = used; }) })
            : h('span', { class: 'val err', title: mx.error }, '⚠'),
          h('div', { class: 'counter-note' }, c.nota ? richText(c.nota) : null));
      }));
    };

    const editBtn = (it, path) => h('button', {
      type: 'button', class: 'btn ghost sq small feat-edit', title: 'Modifica', 'aria-label': `Modifica ${it.nome}`,
      onclick: async () => {
        const r = notebook ? await editNotebookTab(it) : await editFeature(it, { child: path.length === 2, simple: journal });
        if (r === 'delete') change(path, (x, l, j) => l.splice(j, 1));
        else if (r) change(path, (x) => Object.assign(x, r));
      },
    }, icon('edit'));

    const toggleBtn = (it, path, cls) => h('button', {
      type: 'button', class: cls, 'aria-expanded': String(it.aperto),
      onclick: () => change(path, (x) => { x.aperto = !x.aperto; }),
    }, icon('down'), h('span', {}, it.nome || 'Senza nome'),
    !it.aperto && it.figli.length ? h('small', { class: 'feat-count' }, `${it.figli.length}`) : null);

    // nelle schede di appunti il testo si scrive direttamente, senza ridisegnare la lista
    const notebookText = (it, i) => inlineRichText({
      get: () => items()[i]?.testo ?? '',
      set: (v) => { const next = items(); if (next[i]) { next[i].testo = v; ctx.set(f.key, next); } },
      placeholder: f.textPlaceholder || 'Tocca per scrivere…', rows: 4, label: it.nome,
    });
    const body = (it, path) => notebook && !ctx.print ? notebookText(it, path[0]) : [
      counters(it, path),
      it.testo.trim() ? h('div', { class: 'feat-text' }, richText(it.testo, ctx.print ? {} : {
        onImageSize: (id, pct) => change(path, (x) => { x.testo = setImageSize(x.testo, id, pct); }),
      })) : null,
    ];

    const child = (it, path) => h('div', { class: `feat-child${it.aperto ? ' open' : ''}` },
      h('div', { class: 'feat-child-head' }, toggleBtn(it, path, 'feat-toggle feat-toggle-child'), itemUses(it, path), editBtn(it, path)),
      it.aperto ? h('div', { class: 'feat-child-body' }, body(it, path)) : null);

    const item = (it, i) => {
      const path = [i];
      // nel diario, una voce chiusa mostra le prime righe come anteprima
      const preview = simple && !it.aperto && it.testo.trim() ? h('p', { class: 'feat-preview' }, plainText(it.testo)) : null;
      return h('div', { class: `feat${it.aperto ? ' open' : ''}` },
        h('div', { class: 'feat-head' }, toggleBtn(it, path, 'feat-toggle'), itemUses(it, path), editBtn(it, path)),
        preview,
        it.aperto ? h('div', { class: 'feat-body' },
          body(it, path),
          it.figli.map((c, j) => child(c, [i, j])),
          simple ? null : h('button', { type: 'button', class: 'btn ghost small feat-add-child', onclick: async () => {
            const r = await editFeature(normalizeFeature({}, 1), { child: true, isNew: true });
            if (r && r !== 'delete') change(path, (x) => { x.figli.push({ ...r, aperto: true }); });
          } }, icon('plus'), h('span', {}, 'Sotto-privilegio'))) : null);
    };

    const draw = () => {
      const list = items();
      const add = h('button', { type: 'button', class: `btn small add-row${journal ? ' add-top' : ''}`, onclick: async () => {
        const blank = normalizeFeature(journal ? { nome: new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }) } : {});
        const r = notebook ? await editNotebookTab(blank, true) : await editFeature(blank, { isNew: true, simple: journal });
        if (!r || r === 'delete') return;
        const entry = { ...r, aperto: true };
        commit(journal ? [entry, ...items()] : [...items(), entry]);
      } }, icon('plus'), h('span', {}, f.addLabel || (journal ? 'Nuova voce' : notebook ? 'Nuova scheda' : 'Aggiungi privilegio')));
      box.replaceChildren(...[
        journal ? add : null, // nel diario le voci nuove vanno in cima: anche il pulsante
        ...list.map(item),
        list.length ? null : h('p', { class: 'muted small feats-empty' }, f.placeholder || (journal ? 'Nessuna voce.' : notebook ? 'Nessuna scheda.' : 'Nessun privilegio.')),
        journal ? null : add,
      ].filter(Boolean));
    };
    // le formule dei massimi (es. @livello) cambiano con il resto della scheda
    ctx.updaters.push(() => { if (items().some((it) => it.contatori.length || it.figli.some((c) => c.contatori.length))) draw(); });
    draw();
    wrap.append(h('div', { class: 'stack' }, f.label ? label(f) : null, box));
  },

  // Lista/tabella. Opzioni:
  //   groupBy + groups: righe divise in gruppi richiudibili secondo una colonna
  //     (es. incantesimi per livello); la colonna di raggruppamento non si mostra.
  //   scroll: ogni riga resta su una sola linea e la tabella scorre di lato
  //     (anche su telefono), con la prima colonna sempre visibile.
  list(f, ctx, wrap) {
    const groupCol = f.groupBy ? (f.columns || []).find((c) => c.key === f.groupBy) : null;
    // in stampa le colonne "note" (finestre a comparsa) non servono
    const cols = (f.columns || []).filter((c) => (!c.weight || ctx.showWeight) && c !== groupCol && !(ctx.print && c.type === 'notes'));
    const scroll = !!f.scroll;
    const rows = () => {
      const v = raw(f, ctx);
      return Array.isArray(v) ? v : [];
    };
    const rowUpdaters = [];
    // Larghezze minime delle colonne (rem): una serie per desktop e una più
    // stretta per telefono, così il nome non si mangia tutta la riga.
    const narrow = (c) => c.type === 'checkbox' || c.type === 'notes';
    // colonne strette: le caselle sono larghe almeno quanto il loro titolo (es. "Sempre")
    const narrowRem = (c) => (c.type === 'checkbox' ? Math.max(2.4, 0.45 * String(c.label || '').length + 0.9) : 2.4);
    const minRem = (c, m) => (c.type === 'number' || c.type === 'computed' ? (m ? 3.2 : 4) : m ? 3 + 1.5 * (c.width || 1) : 4 + 2.4 * (c.width || 1));
    const track = (c, m) => {
      if (narrow(c)) return `${narrowRem(c)}rem`; // fissa: intestazione e celle restano allineate
      return scroll ? `minmax(${minRem(c, m)}rem, ${c.width || 1}fr)` : `minmax(${c.type === 'number' || c.type === 'computed' ? '3.5rem' : '5rem'}, ${c.width || 1}fr)`;
    };
    const total = (m) => `${cols.reduce((t, c) => t + (narrow(c) ? narrowRem(c) : minRem(c, m)), 2.4) + (m ? 0.25 : 0.4) * cols.length}rem`;
    const vars = {
      '--cols': `${cols.map((c) => track(c, false)).join(' ')} 2.4rem`,
      '--cols-m': `${cols.map((c) => track(c, true)).join(' ')} 2.4rem`,
      '--minw': scroll ? total(false) : '0',
      '--minw-m': scroll ? total(true) : '0',
    };
    const rowName = (row) => String(row?.[cols.find((c) => c.type === 'text')?.key] || '').trim();
    const styleRow = (tr) => {
      for (const [k, v] of Object.entries(vars)) tr.style.setProperty(k, v);
      return tr;
    };

    const commit = (next) => ctx.set(f.key, next);
    const updateCell = (ri, key, v) => {
      const next = structuredClone(rows());
      next[ri] = { ...next[ri], [key]: v };
      commit(next);
    };
    const emptyRow = (extra = {}) => ({
      ...Object.fromEntries((f.columns || []).filter((c) => c.type !== 'computed').map((c) => [c.key, c.type === 'checkbox' ? false : c.type === 'select' ? (c.options?.[0] ?? '') : ''])),
      ...extra,
    });

    // countExclude: righe "speciali" (es. incantesimi sempre preparati) che non contano nei totali
    const flagKey = f.countExclude?.key;
    const rowEl = (row, ri) => {
      const tr = styleRow(h('tr', { class: flagKey && row[flagKey] ? 'row-flag' : null }));
      for (const c of cols) {
        const td = h('td', { dataset: { label: c.label || c.key }, class: `cell-${c.type}` });
        const v = row[c.key];
        if (c.type === 'computed') {
          const out = h('output', { class: 'val small' });
          rowUpdaters.push(() => {
            const cur = rows()[ri];
            if (!cur) return;
            const eng = ctx.getEngine();
            const r = eng.safe(() => eng.rowValue(f, cur, c.key));
            out.textContent = r.ok ? formatValue(r.value, c.signed) : '⚠';
            out.title = r.ok ? '' : r.error;
          });
          td.append(out);
        } else if (c.type === 'checkbox') {
          // se la riga è "sempre preparata", la casella Prep. è spuntata e bloccata
          const locked = flagKey && row[flagKey] && f.countCheck?.key === c.key;
          td.append(h('input', {
            type: 'checkbox', checked: locked || !!v, disabled: locked, title: locked ? 'Sempre preparato' : c.title || null, 'aria-label': c.label,
            onchange: (e) => { updateCell(ri, c.key, e.target.checked); if (c.key === flagKey) rebuild(); else if (groupCol) drawCounts(); },
          }));
        } else if (c.type === 'number') {
          td.append(h('input', { type: 'number', inputmode: 'decimal', step: 'any', class: 'input num', value: v ?? '', 'aria-label': c.label, oninput: (e) => updateCell(ri, c.key, parseNum(e.target.value)) }));
        } else if (c.type === 'select') {
          const sel = h('select', { class: 'input', 'aria-label': c.label, onchange: (e) => updateCell(ri, c.key, e.target.value) },
            (c.options || []).map((o) => h('option', { value: o }, o || '—')));
          sel.value = v ?? (c.options?.[0] ?? '');
          td.append(sel);
        } else if (c.type === 'notes') {
          td.append(notesButton(c, () => rows()[ri], (text) => updateCell(ri, c.key, text), () => rowName(rows()[ri]) || f.label));
        } else {
          const input = h('input', { type: 'text', class: 'input', value: v ?? '', 'aria-label': c.label, oninput: (e) => updateCell(ri, c.key, e.target.value) });
          // ricerca nell'elenco importato (es. incantesimi): sceglierne uno compila la riga
          if (c.lookup?.source === 'incantesimi') attachSpellLookup(input, c.lookup, ctx, (sp) => fillFromSpell(ri, c, sp));
          td.append(input);
        }
        tr.append(td);
      }
      tr.append(h('td', { class: 'cell-actions' }, h('button', {
        type: 'button', class: 'btn ghost sq small', 'aria-label': 'Elimina riga', title: 'Elimina riga',
        onclick: () => { const next = structuredClone(rows()); next.splice(ri, 1); commit(next); rebuild(); },
      }, icon('x'))));
      return tr;
    };

    const fillFromSpell = (ri, c, sp) => {
      const lk = c.lookup;
      const cur = rows()[ri] || {};
      const fill = { [c.key]: sp.name };
      for (const [col, field] of Object.entries(lk.fill || {})) {
        const val = sp[field];
        if (val === undefined || val === null || val === '') continue;
        if ((lk.keep || []).includes(col) && String(cur[col] ?? '').trim()) continue; // non sovrascrive ciò che hai scritto
        fill[col] = val;
      }
      const next = structuredClone(rows());
      next[ri] = { ...next[ri], ...fill };
      commit(next);
      if (groupCol && fill[groupCol.key] !== undefined) setOpen(fill[groupCol.key], true);
      rebuild();
    };

    const table = (entries) => {
      const head = h('thead', {}, styleRow(h('tr', {}, cols.map((c) => (c.type === 'notes'
        ? h('th', { class: 'th-icon', title: c.label, 'aria-label': c.label }, icon('note'))
        : h('th', { title: c.title || null, class: c.type === 'checkbox' ? 'th-check' : null }, c.label || c.key))), h('th', {}, ''))));
      const tbody = h('tbody', {}, entries.map(({ row, ri }) => rowEl(row, ri)));
      return h('div', { class: 'table-wrap' }, h('table', { class: `list${scroll ? ' list-scroll' : ''}` }, entries.length ? head : null, tbody));
    };
    const addButton = (text, extra) => h('button', { type: 'button', class: 'btn small add-row', onclick: () => {
      commit([...structuredClone(rows()), emptyRow(extra)]);
      if (groupCol) setOpen(extra[groupCol.key], true);
      rebuild();
    } }, icon('plus'), h('span', {}, text));

    // ---- gruppi ----------------------------------------------------------
    const openKey = `${f.key}__aperti`;
    const allGroups = groupCol ? (f.groups || []).map((g) => (Array.isArray(g) ? { value: g[0], label: g[1] } : g)) : [];
    // un gruppo con "showIf" si mostra solo se la condizione è vera, oppure se contiene già righe
    // (così niente sparisce se, ad esempio, abbassi il livello del personaggio)
    const visibleGroups = () => {
      const eng = ctx.getEngine();
      const used = new Set(rows().map((r) => groupOf(r)));
      if (ctx.print) return allGroups.filter((g) => used.has(g.value)); // in stampa solo i livelli con incantesimi
      return allGroups.filter((g) => !g.showIf || used.has(g.value) || eng.visible(g.showIf));
    };
    const groups = allGroups;
    const groupOf = (row) => {
      const v = toNum(row?.[groupCol.key]);
      return groups.some((g) => g.value === v) ? v : groups[0]?.value;
    };
    const isOpen = (g, n) => { if (ctx.print) return true; const o = ctx.values[openKey]; return o && g.value in o ? !!o[g.value] : n > 0; };
    const setOpen = (value, open) => ctx.set(openKey, { ...(ctx.values[openKey] || {}), [value]: open });
    const countText = (g, list) => {
      const [one, many] = f.itemLabel || ['voce', 'voci'];
      const always = flagKey ? list.filter(({ row }) => row[flagKey]) : [];
      const normal = flagKey ? list.filter(({ row }) => !row[flagKey]) : list;
      let t = `${normal.length} ${normal.length === 1 ? one : many}`;
      if (f.countCheck && g.value !== 0 && normal.length) t += ` · ${normal.filter(({ row }) => row[f.countCheck.key]).length} ${f.countCheck.label}`;
      if (always.length) t += ` · ${always.length} ${f.countExclude.label}`;
      return t;
    };
    const countEls = new Map();
    const drawCounts = () => {
      const all = rows().map((row, ri) => ({ row, ri }));
      for (const g of groups) countEls.get(g.value)?.replaceChildren(countText(g, all.filter(({ row }) => groupOf(row) === g.value)));
    };
    let groupSig = '';

    const body = h('div', { class: groupCol ? 'lgroups' : 'stack' });
    const draw = () => {
      const all = rows().map((row, ri) => ({ row, ri }));
      if (!groupCol) {
        body.replaceChildren(table(all), addButton('Aggiungi riga', {}));
        return;
      }
      const shownGroups = visibleGroups();
      groupSig = shownGroups.map((g) => g.value).join(',');
      if (!shownGroups.length) {
        body.replaceChildren(h('p', { class: 'muted small feats-empty' }, f.emptyText || 'Niente da mostrare per ora.'));
        return;
      }
      body.replaceChildren(...shownGroups.map((g) => {
        const list = all.filter(({ row }) => groupOf(row) === g.value);
        const open = isOpen(g, list.length);
        const count = h('small', { class: 'lgroup-count' }, countText(g, list));
        countEls.set(g.value, count);
        return h('div', { class: `lgroup${open ? ' open' : ''}${list.length ? '' : ' empty-group'}` },
          h('button', { type: 'button', class: 'lgroup-head', 'aria-expanded': String(open), onclick: () => { setOpen(g.value, !open); rebuild(); } },
            icon('down'), h('span', {}, g.label), count),
          open ? h('div', { class: 'lgroup-body' },
            list.length ? table(list) : null,
            addButton(f.addLabel ? `${f.addLabel} · ${g.label.toLowerCase()}` : 'Aggiungi riga', { [groupCol.key]: g.value })) : null);
      }));
    };

    // Gli aggiornamenti delle celle calcolate sono raccolti qui: a ogni
    // aggiunta/rimozione di righe la tabella viene ridisegnata da capo.
    const rebuild = () => { rowUpdaters.length = 0; draw(); rowUpdaters.forEach((u) => u()); };
    ctx.updaters.push(() => {
      // se cambiano classe o livello, cambiano i gruppi da mostrare
      if (groupCol && visibleGroups().map((g) => g.value).join(',') !== groupSig) rebuild();
      else rowUpdaters.forEach((u) => u());
    });
    draw();
    // se la lista usa l'elenco incantesimi, un pulsante lo apre per vederlo e modificarlo
    let spellBtn = null;
    if (!ctx.print && (f.columns || []).some((c) => c.lookup?.source === 'incantesimi')) {
      const text = h('span');
      const setText = () => { const n = loadSpells()?.length; text.textContent = n ? `Elenco incantesimi (${n})` : 'Elenco incantesimi: importa o aggiungi'; };
      setText();
      spellBtn = h('div', { class: 'list-tools' }, h('button', { type: 'button', class: 'btn small ghost', onclick: async () => { await openSpellList(); setText(); } }, icon('book'), text));
    }
    wrap.append(h('div', { class: 'stack' }, f.label ? label(f) : null, spellBtn, body));
  },
};

// Pulsante "note" di una riga: il testo si legge e si modifica in una finestra
// a comparsa, così la tabella resta compatta.
function notesButton(c, getRow, save, getTitle) {
  const b = h('button', { type: 'button', class: 'note-btn' });
  const draw = () => {
    const text = String(getRow()?.[c.key] || '');
    b.classList.toggle('has', !!text.trim());
    b.replaceChildren(icon('note'));
    b.title = text.trim() ? text.slice(0, 200) : `${c.label || 'Note'}: vuoto`;
    b.setAttribute('aria-label', `${c.label || 'Note'}${text.trim() ? '' : ' (vuoto)'}`);
  };
  b.addEventListener('click', async () => {
    const ta = h('textarea', { class: 'input note-area', rows: 10, value: String(getRow()?.[c.key] || ''), placeholder: 'Scrivi qui…', oninput: (e) => { save(e.target.value); } });
    await modal({ title: `${getTitle()} · ${c.label || 'Note'}`, body: ta, actions: [{ label: 'Fatto', value: true, cls: 'primary' }] });
    draw();
  });
  draw();
  return b;
}

// Contatore degli usi: − [rotellina] rimasti/massimo +. La rotellina si
// svuota man mano che gli usi vengono spesi.
function usesControl({ max, used, recharge, label = '', onChange, getUsed = () => used }) {
  const left = Math.max(0, max - used);
  const pct = max > 0 ? left / max : 0;
  const R = 9;
  const C = 2 * Math.PI * R;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', `ring${left === 0 ? ' ring-empty' : ''}`);
  svg.setAttribute('aria-hidden', 'true');
  const circle = (cls, extra = {}) => {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    Object.entries({ cx: 12, cy: 12, r: R, class: cls, ...extra }).forEach(([k, v]) => c.setAttribute(k, v));
    return c;
  };
  svg.append(circle('ring-track'), circle('ring-fill', { 'stroke-dasharray': `${C * pct} ${C}`, transform: 'rotate(-90 12 12)' }));
  return h('div', { class: 'uses', title: `${left} di ${max} rimasti${recharge ? ` · si recupera: ${recharge.toLowerCase()}` : ''}` },
    holdRepeat(h('button', { type: 'button', class: 'uses-btn hold', 'aria-label': `Usa ${label}`, disabled: left === 0 }, '−'),
      () => { const u = getUsed(); if (u >= max) return false; onChange(u + 1); return u + 1 < max; }),
    svg,
    h('span', { class: 'uses-num' }, h('b', {}, left), `/${max}`),
    holdRepeat(h('button', { type: 'button', class: 'uses-btn hold', 'aria-label': `Recupera ${label}`, disabled: used === 0 }, '+'),
      () => { const u = getUsed(); if (u <= 0) return false; onChange(u - 1); return u - 1 > 0; }),
    recharge ? h('small', { class: 'uses-recharge' }, recharge.toLowerCase()) : null);
}

// Finestra di modifica di un privilegio. Restituisce i dati, 'delete' o null.
/** Nome di una scheda di appunti (nuova o esistente), con l'eliminazione. */
async function editNotebookTab(it, isNew = false) {
  const nome = h('input', { class: 'input', type: 'text', value: it.nome, placeholder: 'es. PNG incontrati, Luoghi, Indizi…' });
  const r = await modal({
    title: isNew ? 'Nuova scheda' : 'Modifica scheda',
    body: h('label', { class: 'stack' }, h('span', { class: 'lbl' }, 'Nome della scheda'), nome),
    actions: [
      isNew ? null : { label: 'Elimina', value: 'delete', cls: 'danger' },
      { label: 'Annulla', value: null },
      { label: isNew ? 'Crea' : 'Salva', value: 'save', cls: 'primary' },
    ].filter(Boolean),
  });
  if (r === 'delete') {
    const words = it.testo.trim() ? ' con tutto il suo contenuto' : '';
    return (await confirmDialog('Eliminare la scheda?', `"${it.nome || 'Senza nome'}"${words} verrà eliminata.`, 'Elimina', true)) ? 'delete' : null;
  }
  if (r !== 'save') return null;
  return { nome: nome.value.trim() || 'Senza nome', testo: it.testo, usi: 0, usati: 0, ricarica: '', contatori: [] };
}

async function editFeature(it, { child = false, isNew = false, simple = false } = {}) {
  const nome = h('input', { class: 'input', type: 'text', value: it.nome, placeholder: simple ? 'es. Sessione 4 · La cripta' : child ? 'es. Metamagia' : 'es. Sorgente di Magia' });
  const testo = autoGrow(h('textarea', { class: 'input note-area', rows: 8, value: it.testo, placeholder: simple ? 'Cosa è successo…' : 'Descrizione…' }), 8);
  const usi = h('input', { class: 'input num', type: 'number', min: 0, max: MAX_USES, inputmode: 'numeric', value: it.usi || '', placeholder: '0' });
  const ricarica = rechargeSelect(it.ricarica);
  const field = (text, el, hint) => h('label', { class: 'stack' }, h('span', { class: 'lbl' }, text), el, hint ? h('small', { class: 'hint' }, hint) : null);

  // tabella dei contatori (es. Punti Stregoneria)
  const rows = it.contatori.map((c) => ({ ...c }));
  const countersBox = h('div', { class: 'counters-edit' });
  const drawCounters = () => countersBox.replaceChildren(...[
    rows.length ? h('div', { class: 'counter-edit-row head' }, ['Nome', 'Massimo', 'Si recupera con', 'Nota', ''].map((t) => h('span', { class: 'lbl' }, t))) : null,
    ...rows.map((c, k) => h('div', { class: 'counter-edit-row' },
      h('input', { class: 'input', value: c.nome, placeholder: 'es. Punti Stregoneria', 'aria-label': 'Nome contatore', oninput: (e) => { c.nome = e.target.value; } }),
      h('input', { class: 'input mono', value: c.max, placeholder: '4 o @livello', 'aria-label': 'Massimo', title: 'Un numero oppure una formula, es. @livello', oninput: (e) => { c.max = e.target.value.trim(); } }),
      (() => { const sel = rechargeSelect(c.ricarica); sel.setAttribute('aria-label', 'Si recupera con'); sel.addEventListener('change', () => { c.ricarica = sel.value; }); return sel; })(),
      h('input', { class: 'input', value: c.nota, placeholder: 'es. 2 punti in più', 'aria-label': 'Nota', oninput: (e) => { c.nota = e.target.value; } }),
      h('button', { type: 'button', class: 'btn ghost sq small danger', title: 'Elimina contatore', 'aria-label': 'Elimina contatore', onclick: () => { rows.splice(k, 1); drawCounters(); } }, icon('x')))),
    h('button', { type: 'button', class: 'btn ghost small', onclick: () => { rows.push(normalizeCounter({})); drawCounters(); countersBox.querySelector('.counter-edit-row:last-of-type input')?.focus(); } },
      icon('plus'), h('span', {}, 'Aggiungi contatore')),
  ].filter(Boolean));
  drawCounters();

  const r = await modal({
    title: simple ? (isNew ? 'Nuova voce' : 'Modifica voce') : isNew ? (child ? 'Nuovo sotto-privilegio' : 'Nuovo privilegio') : `Modifica: ${it.nome || 'privilegio'}`,
    wide: true,
    body: h('div', { class: 'stack gap' },
      field(simple ? 'Titolo' : 'Nome', nome),
      h('div', { class: 'stack' }, h('span', { class: 'lbl' }, simple ? 'Testo' : 'Descrizione'), testo,
        h('div', { class: 'rt-actions start' }, imageButton(testo)), h('small', { class: 'hint' }, FORMAT_HINT)),
      simple ? null : h('div', { class: 'feat-form-row' },
        field('Usi del privilegio (0 = nessuno)', usi),
        field('Si recupera con', ricarica)),
      simple ? null : h('div', { class: 'stack' },
        h('span', { class: 'lbl' }, 'Contatori'),
        h('small', { class: 'hint' }, 'Risorse con un proprio massimo, mostrate come tabella dentro il privilegio (es. Punti Stregoneria). Il massimo può essere una formula come @livello.'),
        countersBox)),
    actions: [
      isNew ? null : { label: 'Elimina', value: 'delete', cls: 'danger' },
      { label: 'Annulla', value: null },
      { label: 'Salva', value: 'save', cls: 'primary' },
    ].filter(Boolean),
  });
  if (r === 'delete') {
    if (simple) return (await confirmDialog('Eliminare la voce?', `"${it.nome || 'Senza titolo'}" verrà eliminata.`, 'Elimina', true)) ? 'delete' : null;
    return (await confirmDialog('Eliminare il privilegio?', `"${it.nome || 'Senza nome'}"${it.figli?.length ? ` e i suoi ${it.figli.length} sotto-privilegi` : ''} verrà eliminato.`, 'Elimina', true)) ? 'delete' : null;
  }
  if (r !== 'save') return null;
  const n = Math.max(0, Math.min(MAX_USES, Math.floor(Number(usi.value) || 0)));
  return {
    nome: nome.value.trim() || 'Senza nome', testo: testo.value, usi: n, usati: Math.min(it.usati, n), ricarica: ricarica.value,
    contatori: rows.filter((c) => c.nome.trim() || c.max).map((c) => normalizeCounter({ ...c, nome: c.nome.trim() || 'Contatore' })),
  };
}

function rechargeSelect(value) {
  const sel = h('select', { class: 'input' }, RECHARGE.map((o) => h('option', { value: o }, o || '—')));
  sel.value = value || '';
  return sel;
}

// "Scegli o scrivi": campo di testo con un elenco di proposte che si apre al
// tocco. Si può scegliere una voce oppure scrivere liberamente (es. classi homebrew).
function combo(f, ctx, input) {
  const list = h('div', { class: 'combo-list', role: 'listbox', hidden: true });
  const box = h('div', { class: 'combo' });
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('autocomplete', 'off');
  if (!f.placeholder) input.placeholder = 'Scegli o scrivi…';
  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); };
  const open = (all = false) => {
    const q = input.value.trim().toLowerCase();
    const exact = f.suggestions.some((o) => o.toLowerCase() === q);
    const items = all || exact || !q ? f.suggestions : f.suggestions.filter((o) => o.toLowerCase().includes(q));
    list.replaceChildren(...items.map((o) => h('button', {
      type: 'button', class: `combo-item${o.toLowerCase() === q ? ' on' : ''}`, role: 'option', 'aria-selected': String(o.toLowerCase() === q),
      onmousedown: (e) => e.preventDefault(), // il fuoco resta nel campo
      onclick: () => { input.value = o; ctx.set(f.key, o); close(); input.blur(); },
    }, o)));
    if (q && !exact) list.append(h('div', { class: 'combo-free' }, `Userai "${input.value.trim()}" come testo libero`));
    list.hidden = !list.children.length;
    input.setAttribute('aria-expanded', String(!list.hidden));
  };
  input.addEventListener('focus', () => open(true));
  input.addEventListener('input', () => open());
  input.addEventListener('blur', () => setTimeout(close, 120));
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  const toggle = h('button', { type: 'button', class: 'combo-toggle', tabindex: '-1', 'aria-label': 'Mostra le proposte',
    onmousedown: (e) => e.preventDefault(),
    onclick: () => { if (list.hidden) { input.focus(); open(true); } else close(); } }, icon('down'));
  box.append(input, toggle, list);
  return box;
}

// Suggerimenti dall'elenco di incantesimi importato. La tendina "galleggia"
// sopra la pagina (la tabella scorre di lato e la taglierebbe).
function attachSpellLookup(input, lookup, ctx, onPick) {
  let box = null;
  let items = [];
  let active = -1;
  const place = () => {
    if (!box) return;
    const r = input.getBoundingClientRect();
    const vh = window.visualViewport?.height || innerHeight;
    const width = Math.min(Math.max(r.width, 280), innerWidth - 16);
    box.style.width = `${width}px`;
    box.style.left = `${Math.max(8, Math.min(r.left, innerWidth - width - 8))}px`;
    const height = Math.min(box.scrollHeight, 300);
    const above = vh - r.bottom < height + 12 && r.top > height + 12;
    box.style.top = `${above ? r.top - height - 4 : r.bottom + 4}px`;
  };
  const close = () => {
    box?.remove();
    box = null;
    removeEventListener('scroll', place, true);
    removeEventListener('resize', place);
  };
  const pick = (i) => { const sp = items[i]; close(); if (sp) onPick(sp); };
  const open = () => {
    const list = loadSpells();
    if (!list?.length) return close();
    const eng = ctx.getEngine();
    const classes = (lookup.classes || []).map((k) => eng.safe(() => eng.resolve(k))).filter((r) => r.ok && r.value).map((r) => r.value);
    items = searchSpells(list, input.value, classes);
    if (!items.length) return close();
    if (!box) {
      box = h('div', { class: 'suggest', role: 'listbox' });
      document.body.append(box);
      addEventListener('scroll', place, true);
      addEventListener('resize', place);
    }
    active = -1;
    box.replaceChildren(...items.map((sp, i) => h('button', {
      type: 'button', class: 'suggest-item', role: 'option',
      onmousedown: (e) => e.preventDefault(), // il fuoco resta nel campo
      onclick: () => pick(i),
    }, h('span', { class: 'suggest-name' }, sp.name),
    h('small', {}, `${sp.level === 0 ? 'Trucchetto' : `${sp.level}° livello`}${sp.school ? ` · ${sp.school}` : ''}`))));
    place();
  };
  input.setAttribute('autocomplete', 'off');
  input.addEventListener('input', open);
  input.addEventListener('focus', () => { if (input.value.trim().length >= 2) open(); });
  input.addEventListener('blur', () => setTimeout(close, 150));
  input.addEventListener('keydown', (e) => {
    if (!box) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      [...box.children].forEach((b, j) => b.classList.toggle('on', j === active));
    } else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(active); }
    else if (e.key === 'Escape') close();
  });
}

// Finestra "Personalizza": rinominare i campi della sezione e scegliere quali usare.
async function customizeSection(s, ctx) {
  const fields = (s.fields || []).filter((f) => !f.hidden);
  const cur = ctx.values._sezioni?.[s.id] || {};
  const rows = fields.map((f) => {
    const on = h('input', { type: 'checkbox', checked: !cur[f.key]?.hidden, 'aria-label': `Usa ${f.label}` });
    const name = h('input', { class: 'input', type: 'text', value: cur[f.key]?.label || '', placeholder: f.label, 'aria-label': `Nome per ${f.label}` });
    return { f, on, name };
  });
  const r = await modal({
    title: `Personalizza: ${s.title || 'sezione'}`,
    body: h('div', { class: 'stack gap' },
      h('p', { class: 'muted small' }, `Rinomina e scegli quali usare (fino a ${fields.length}, almeno uno). Vale solo per questo personaggio.`),
      h('div', { class: 'custom-rows' }, rows.map(({ on, name }) => h('div', { class: 'custom-row' }, on, name)))),
    actions: [
      { label: 'Predefiniti', value: 'reset' },
      { label: 'Annulla', value: null },
      { label: 'Salva', value: 'save', cls: 'primary' },
    ],
  });
  if (!r) return;
  const all = { ...(ctx.values._sezioni || {}) };
  if (r === 'reset') delete all[s.id];
  else {
    if (!rows.some((x) => x.on.checked)) { toast('Tienine attivo almeno uno', 'error'); return; }
    const cfg = {};
    for (const { f, on, name } of rows) {
      const c = {};
      if (name.value.trim() && name.value.trim() !== f.label) c.label = name.value.trim();
      if (!on.checked) c.hidden = true;
      if (Object.keys(c).length) cfg[f.key] = c;
    }
    if (Object.keys(cfg).length) all[s.id] = cfg; else delete all[s.id];
  }
  ctx.set('_sezioni', Object.keys(all).length ? all : undefined);
}

// Schermata della morte (3 fallimenti nei tiri contro morte).
function deathScreen(reset) {
  document.querySelector('.death')?.remove();
  const ns = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs) => { const n = document.createElementNS(ns, tag); Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v)); return n; };
  const skull = el('svg', { viewBox: '0 0 64 64', class: 'death-skull', 'aria-hidden': 'true' });
  skull.append(
    el('path', { d: 'M32 5C17.6 5 7 15.4 7 29c0 8.2 4.1 13.6 9 16.6V52a5 5 0 005 5h22a5 5 0 005-5v-6.4c4.9-3 9-8.4 9-16.6C57 15.4 46.4 5 32 5z', fill: 'currentColor' }),
    el('circle', { cx: '22', cy: '30', r: '6.5', class: 'death-hole' }),
    el('circle', { cx: '42', cy: '30', r: '6.5', class: 'death-hole' }),
    el('path', { d: 'M32 37l-4.5 8h9z', class: 'death-hole' }),
    el('path', { d: 'M25 50v6M32 50v6M39 50v6', class: 'death-teeth' }));
  const close = () => { overlay.classList.add('out'); setTimeout(() => overlay.remove(), 300); };
  const overlay = h('div', { class: 'death', role: 'alertdialog', 'aria-label': 'Morto' },
    h('div', { class: 'death-inner' }, skull,
      h('h2', {}, 'Morto'),
      h('p', {}, 'Tre fallimenti nei tiri contro morte.'),
      h('div', { class: 'death-actions' },
        h('button', { type: 'button', class: 'btn', onclick: () => { reset(); close(); } }, 'Azzera i tiri'),
        h('button', { type: 'button', class: 'btn ghost', onclick: close }, 'Chiudi'))));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } });
  document.body.append(overlay);
  overlay.querySelector('.btn')?.focus();
}

// Pulsante "Aggiungi immagine" per una textarea di testo formattato: sceglie un
// file, lo riduce, lo salva e inserisce la riga dell'immagine dove c'è il cursore.
/** Testo formattato che si legge impaginato e si modifica con un tocco: [vista, editor]. */
function inlineRichText({ get, set, placeholder, rows = 3, label: name = '' }) {
  const view = h('div', { class: 'rt-view', tabindex: '0', role: 'button', 'aria-label': `Modifica ${name}`, style: { minHeight: `${1.6 * rows + 1.3}em` } });
  const ta = autoGrow(h('textarea', { class: 'input rt-input', placeholder: placeholder || 'Scrivi qui…', oninput: (e) => set(e.target.value) }), Math.max(rows, 4));
  const editor = h('div', { class: 'rt-editor', hidden: true });
  const onImageSize = (id, pct) => { set(setImageSize(get(), id, pct)); drawView(); };
  const drawView = () => view.replaceChildren(...(get().trim()
    ? richText(get(), { onImageSize })
    : [h('span', { class: 'rt-empty' }, placeholder || 'Tocca per scrivere…')]));
  const open = () => {
    ta.value = get();
    view.hidden = true;
    editor.hidden = false;
    ta.fit();
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  };
  const close = () => { editor.hidden = true; view.hidden = false; drawView(); };
  view.addEventListener('click', (e) => { if (!e.target.closest('a')) open(); });
  view.addEventListener('keydown', (e) => { if (e.target === view && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(); } });
  let picking = false; // mentre si sceglie un'immagine l'editor non si chiude
  editor.addEventListener('focusout', (e) => { if (!picking && !editor.contains(e.relatedTarget)) close(); });
  ta.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } });
  const addImage = imageButton(ta, (on) => { picking = on; });
  editor.append(ta,
    h('div', { class: 'rt-actions' }, addImage, h('button', { type: 'button', class: 'btn small primary', onclick: close }, 'Fatto')));
  drawView();
  return [view, editor];
}

function imageButton(ta, setPicking = () => {}) {
  return h('button', {
    type: 'button', class: 'btn small ghost',
    onmousedown: (e) => e.preventDefault(),
    onclick: async () => {
      const at = [ta.selectionStart ?? ta.value.length, ta.selectionEnd ?? ta.value.length];
      setPicking(true);
      try {
        const file = await pickFile('image/*');
        if (!file) return;
        const line = await addImageFromFile(file);
        const before = ta.value.slice(0, at[0]);
        const after = ta.value.slice(at[1]);
        const pre = before && !before.endsWith('\n') ? '\n' : '';
        const post = after.startsWith('\n') ? '' : '\n';
        ta.value = `${before}${pre}${line}${post}${after}`;
        const caret = (before + pre + line + post).length;
        ta.focus();
        ta.setSelectionRange(caret, caret);
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        toast('Immagine aggiunta: tra le [ ] puoi scrivere una didascalia', 'ok', 3500);
      } catch (e) {
        toast(`Immagine non aggiunta: ${e.message}`, 'error', 5000);
      } finally {
        setPicking(false);
        if (document.activeElement !== ta) ta.focus();
      }
    },
  }, icon('upload'), h('span', {}, 'Aggiungi immagine'));
}
